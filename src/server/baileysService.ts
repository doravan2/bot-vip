import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import NodeCache from 'node-cache';
import {
  getActiveSourceRules,
  setActiveSourceRules,
  addReplicaLog,
  getReplicaLogs,
  cleanAndMonetizeCompetitorMessage,
} from './replicaForwarder.ts';
import type { ActiveSourceRule } from './replicaForwarder.ts';
import {
  OFFICIAL_USER_AFFILIATE_ID,
  DEFAULT_VIP_GROUP_LINK,
  extractUrls,
  isCompetitorShareUrl,
  isCompetitorInviteLine,
} from '../utils/affiliateEngine.ts';
import {
  addPendingMeliItem,
  getPendingMeliItem,
  getPendingMeliQueue,
  removePendingMeliItem,
  setCustomMeliLink,
  getVipGroupLink,
} from './affiliateConfig.ts';
import type { PendingMeliItem } from './affiliateConfig.ts';
import { recordConversionLog } from './conversionLogger.ts';
import { convertMeliLinkViaCookies, getMarketplacesConfig } from './marketplacesService.ts';
import { fetchProductImageBuffer } from './productImageService.ts';
import { normalizeImageBuffer } from './imagePipeline.ts';
import {
  analisar_produto_meli,
  validar_link_mercadolivre,
  validarLinkMercadoLivre,
} from './meliStockValidator.ts';
import {
  sendTelegramMessage,
  getTelegramConfig,
  isTelegramTarget,
  resolveTelegramChatId,
  registerTelegramIncomingHandler,
} from './telegramService.ts';
import { isWatermarkActiveForGroup } from './watermarkAiService.ts';
import { applyChatFilter } from './chatFilterService.ts';
import { isScheduleActiveNow } from './scheduleService.ts';
import { isLinkDuplicateInWindow, recordDispatchedLink } from './linkDeduplicationService.ts';

export interface WhatsAppSessionState {
  isConnected: boolean;
  phoneNumber?: string;
  qrRaw?: string;
  qrDataUrl?: string;
  statusText: string;
  lastUpdated: string;
}

export interface RealGroupInfo {
  id: string;
  name: string;
  membersCount: number;
  maxCapacity: number;
  inviteLink: string;
}

const state: WhatsAppSessionState = {
  isConnected: false,
  phoneNumber: '',
  qrRaw: '',
  qrDataUrl: '',
  statusText: 'Iniciando conexão segura com os servidores do WhatsApp...',
  lastUpdated: new Date().toISOString(),
};

let currentSocket: any = null;
let isStarting = false;
let isExplicitlyDisconnected = false;
let badMacErrorCount = 0;

const authFolder = path.resolve(process.cwd(), '.whatsapp_auth');
const cachedParticipatingGroups = new Map<string, string>();
const cachedGroupDetails = new Map<string, RealGroupInfo>();
let lastGroupFetchTime = 0;
let inFlightGroupFetchPromise: Promise<Map<string, string>> | null = null;
const GROUP_CACHE_TTL_MS = 30 * 1000; // 30 seconds cache for background calls, instant on force
const botSentMessageIds = new Set<string>();

// Cache to handle message retries for WhatsApp cryptographic self-healing (Resolves "Bad MAC" & "Failed to decrypt")
const msgRetryCounterCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
// In-memory message store for getMessage retry requests
const messageHistory = new NodeCache({ stdTTL: 15 * 60, maxKeys: 1500, useClones: false });

export function unwrapRealMessage(rawMessage: any): any {
  if (!rawMessage) return null;
  let m = rawMessage;
  if (m.ephemeralMessage?.message) m = unwrapRealMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) m = unwrapRealMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) m = unwrapRealMessage(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) m = unwrapRealMessage(m.documentWithCaptionMessage.message);
  if (m.newsletterAdminInviteMessage?.message) m = unwrapRealMessage(m.newsletterAdminInviteMessage.message);
  return m;
}

/**
 * Finds the exact or best matching group JID from a map of participating groups.
 * Enforces strict exact matching first, and restricts partial matching for short names (<= 2 chars).
 */
export function findMatchingGroupJid(
  searchName: string,
  groupMap: Map<string, string>
): { jid: string; subject: string } | null {
  if (!searchName || !groupMap || groupMap.size === 0) return null;

  const cleanSearch = searchName
    .replace(/^\[(FONTE|WhatsApp|Telegram)\]\s*/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim()
    .toLowerCase();

  if (!cleanSearch) return null;

  // 1. EXACT MATCH FIRST across all participating groups (Highest Priority)
  for (const [jid, subj] of groupMap.entries()) {
    const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
    if (cleanSubj === cleanSearch) {
      return { jid, subject: subj };
    }
  }

  // 2. PARTIAL MATCH (Only for search names longer than 2 characters!)
  // Avoids short numbers/letters like "1", "2", "A", "B" matching every group containing that character!
  if (cleanSearch.length > 2) {
    for (const [jid, subj] of groupMap.entries()) {
      const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
      if (cleanSubj && (cleanSubj.includes(cleanSearch) || cleanSearch.includes(cleanSubj))) {
        return { jid, subject: subj };
      }
    }
  }

  return null;
}

export async function refreshGroupCache(sock: any, force = false): Promise<Map<string, string>> {
  if (!sock) return cachedParticipatingGroups;

  const now = Date.now();
  // Return cached groups if fetched within TTL and we already have groups
  if (!force && cachedParticipatingGroups.size > 0 && now - lastGroupFetchTime < GROUP_CACHE_TTL_MS) {
    return cachedParticipatingGroups;
  }

  // Deduplicate in-flight fetch
  if (inFlightGroupFetchPromise) {
    return inFlightGroupFetchPromise;
  }

  inFlightGroupFetchPromise = (async () => {
    try {
      console.log('[Baileys] 🔄 Sincronizando lista 100% atualizada de grupos do WhatsApp...');
      const groupsMap = await sock.groupFetchAllParticipating();
      lastGroupFetchTime = Date.now();
      
      for (const [id, grp] of Object.entries(groupsMap)) {
        const groupObj = grp as any;
        const subject = groupObj.subject || 'Grupo do WhatsApp';
        const participantsCount = Array.isArray(groupObj.participants) ? groupObj.participants.length : 1;
        
        cachedParticipatingGroups.set(id, subject);
        cachedGroupDetails.set(id, {
          id,
          name: subject,
          membersCount: participantsCount,
          maxCapacity: 1024,
          inviteLink: `https://chat.whatsapp.com/`,
        });
      }

      console.log(`[Baileys] ✅ ${cachedGroupDetails.size} grupos do WhatsApp sincronizados com sucesso!`);

      // Auto-resolve any active rules that don't have sourceJid or targetJid yet!
      const rules = getActiveSourceRules();
      let rulesUpdated = false;
      for (const rule of rules) {
        // Collect candidate source names
        const allSourceCandidates = [
          rule.sourceName,
          ...(Array.isArray(rule.sourceNames) ? rule.sourceNames : []),
        ].flatMap((s) => (s ? s.split(',') : [])).map((s) => s.trim()).filter(Boolean);

        for (const srcName of allSourceCandidates) {
          const matched = findMatchingGroupJid(srcName, cachedParticipatingGroups);
          if (matched) {
            if (!rule.sourceJids) rule.sourceJids = [];
            if (!rule.sourceJids.includes(matched.jid)) {
              rule.sourceJids.push(matched.jid);
              rulesUpdated = true;
            }
            if (!rule.sourceJid) {
              rule.sourceJid = matched.jid;
              rulesUpdated = true;
            }
          }
        }

        // Target group JID resolution
        const allTargetCandidates = [
          rule.targetGroup,
          ...(Array.isArray(rule.targetGroups) ? rule.targetGroups : []),
        ].flatMap((t) => (t ? t.split(',') : [])).map((t) => t.trim()).filter(Boolean);

        for (const tgtName of allTargetCandidates) {
          const matched = findMatchingGroupJid(tgtName, cachedParticipatingGroups);
          if (matched) {
            if (!rule.targetJids) rule.targetJids = [];
            if (!rule.targetJids.includes(matched.jid)) {
              rule.targetJids.push(matched.jid);
              rulesUpdated = true;
            }
            if (!rule.targetJid) {
              rule.targetJid = matched.jid;
              rulesUpdated = true;
            }
          }
        }
      }
      if (rulesUpdated) {
        setActiveSourceRules(rules);
        console.log('[Baileys] 🎯 JIDs das regras resolvidos automaticamente e vinculados com sucesso!');
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      if (errMsg.includes('rate-overlimit') || err?.data === 429) {
        lastGroupFetchTime = Date.now();
        console.warn(`[Baileys] ⏳ WhatsApp rate-limit (rate-overlimit) detectado. Mantendo ${cachedParticipatingGroups.size} grupos em cache.`);
      } else {
        console.warn('[Baileys] Aviso ao atualizar grupos do WhatsApp:', errMsg);
      }
    } finally {
      inFlightGroupFetchPromise = null;
    }
    return cachedParticipatingGroups;
  })();

  return inFlightGroupFetchPromise;
}

export function getWhatsAppState(): WhatsAppSessionState {
  return state;
}

export async function getRealWhatsAppGroups(force = true): Promise<RealGroupInfo[]> {
  if (!currentSocket || !state.isConnected) {
    return [];
  }
  try {
    await refreshGroupCache(currentSocket, force);
    const result: RealGroupInfo[] = [];
    for (const [id, info] of cachedGroupDetails.entries()) {
      if (!id.endsWith('@newsletter')) {
        result.push({
          id: info.id,
          name: info.name,
          membersCount: info.membersCount || 1,
          maxCapacity: info.maxCapacity || 1024,
          inviteLink: info.inviteLink || `https://chat.whatsapp.com/`,
        });
      }
    }
    return result;
  } catch (e: any) {
    console.warn('[Baileys] Aviso ao ler grupos:', e?.message || e);
    return [];
  }
}

/**
 * Obter Canais (Newsletters) do WhatsApp vinculados à conta conectada (@newsletter)
 */
export async function getWhatsAppChannels(): Promise<RealGroupInfo[]> {
  if (!currentSocket || !state.isConnected) {
    console.log('[Baileys Newsletter] Socket não conectado ou indisponível.');
    return [];
  }

  const channelsResult: RealGroupInfo[] = [];
  const processedJids = new Set<string>();

  // Helper para adicionar canal sem duplicatas
  const addChannel = (jid: string, rawName?: string, subscribersCount?: number) => {
    if (!jid || !jid.endsWith('@newsletter') || processedJids.has(jid)) return;
    processedJids.add(jid);

    const name = rawName && rawName.trim() ? rawName.trim() : 'Canal do WhatsApp';
    cachedParticipatingGroups.set(jid, name);

    channelsResult.push({
      id: jid,
      name,
      membersCount: subscribersCount || 1000,
      maxCapacity: 1000000,
      inviteLink: `https://whatsapp.com/channel/`,
    });
  };

  // 1. FETCH ATIVO: Tentar buscar diretamente nos servidores do WhatsApp via newsletterSubscribed()
  let fetchSucceeded = false;
  if (typeof (currentSocket as any).newsletterSubscribed === 'function') {
    try {
      console.log('[Baileys Newsletter] Executando fetch ativo via sock.newsletterSubscribed()...');
      const rawNewsletters = await (currentSocket as any).newsletterSubscribed();
      
      console.log(
        '[Baileys Newsletter Debug] Payload bruto retornado do WhatsApp:',
        JSON.stringify(rawNewsletters, null, 2)
      );

      if (Array.isArray(rawNewsletters)) {
        fetchSucceeded = true;
        for (const nl of rawNewsletters) {
          // Extrai o JID e Nome considerando estruturas de viewer_metadata, thread_metadata ou campos raiz
          const jid = nl?.id || nl?.jid || nl?.newsletterJid || nl?.key?.remoteJid;
          const name =
            nl?.name ||
            nl?.subject ||
            nl?.thread_metadata?.name?.text ||
            nl?.thread_meta?.name?.text ||
            nl?.viewer_metadata?.title ||
            nl?.viewer_meta?.title ||
            'Canal do WhatsApp';

          const subscribers =
            nl?.subscribers ||
            nl?.subscribers_count ||
            nl?.thread_metadata?.subscribers_count ||
            1000;

          if (jid) {
            addChannel(jid, name, Number(subscribers));
          }
        }
      }
    } catch (err: any) {
      console.warn('[Baileys Newsletter] Erro ao chamar newsletterSubscribed():', err?.message || err);
    }
  } else {
    console.log('[Baileys Newsletter] O método sock.newsletterSubscribed() não está disponível nesta versão do Baileys.');
  }

  // 2. FALLBACK DE PROTOCOLO: Se o fetch ativo não retornou ou não estava disponível, consultar os caches em memória
  console.log(`[Baileys Newsletter] Executando fallback em cache de chats (Canais encontrados até agora: ${channelsResult.length})...`);
  try {
    // A. Cache de grupos/chats local do service
    const groupsMap = await refreshGroupCache(currentSocket);
    for (const [id, name] of groupsMap.entries()) {
      if (id.endsWith('@newsletter')) {
        addChannel(id, name);
      }
    }

    // B. Inspection de (currentSocket as any).chats se disponível
    const socketChats = (currentSocket as any)?.chats;
    if (socketChats && typeof socketChats === 'object') {
      const chatEntries = Array.isArray(socketChats) ? socketChats : Object.values(socketChats);
      for (const chat of chatEntries as any[]) {
        const jid = chat?.id || chat?.jid;
        if (jid && typeof jid === 'string' && jid.endsWith('@newsletter')) {
          const name = chat?.name || chat?.subject || chat?.name?.text;
          addChannel(jid, name);
        }
      }
    }
  } catch (fallbackErr: any) {
    console.warn('[Baileys Newsletter] Exceção durante o fallback de chats:', fallbackErr?.message || fallbackErr);
  }

  console.log(`[Baileys Newsletter] Total final de canais sincronizados: ${channelsResult.length}`);
  return channelsResult;
}

export async function disconnectWhatsApp(): Promise<void> {
  try {
    isExplicitlyDisconnected = true;
    isStarting = false;
    if (currentSocket) {
      try {
        currentSocket.end(undefined);
      } catch {}
      currentSocket = null;
    }
    state.isConnected = false;
    state.phoneNumber = '';
    state.qrRaw = '';
    state.qrDataUrl = '';
    state.statusText = 'Instância desligada e desconectada pelo usuário';
    state.lastUpdated = new Date().toISOString();

    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
    console.log('[Baileys] 🛑 Instância desconectada com sucesso. Escuta automática desativada.');
  } catch (e) {
    console.error('Erro ao desconectar WhatsApp:', e);
  }
}

export function cleanCorruptSenderKeys(): void {
  try {
    if (fs.existsSync(authFolder)) {
      const files = fs.readdirSync(authFolder);
      for (const file of files) {
        if (
          file.startsWith('sender-key-') ||
          file.startsWith('pre-key-') ||
          file.startsWith('session-') ||
          file.startsWith('app-state-')
        ) {
          try {
            fs.unlinkSync(path.join(authFolder, file));
          } catch {}
        }
      }
    }
  } catch {}
}

export async function repairWhatsAppSession(): Promise<{ success: boolean; message: string }> {
  try {
    if (currentSocket) {
      try {
        currentSocket.end(undefined);
      } catch {}
      currentSocket = null;
    }

    if (fs.existsSync(authFolder)) {
      const files = fs.readdirSync(authFolder);
      let removedCount = 0;
      for (const file of files) {
        // Delete desynced sender-key, session and pre-key files that cause Bad MAC / decryption errors
        if (
          file.startsWith('session-') ||
          file.startsWith('sender-key-') ||
          file.startsWith('pre-key-') ||
          file.startsWith('app-state-')
        ) {
          try {
            fs.unlinkSync(path.join(authFolder, file));
            removedCount++;
          } catch {}
        }
      }
      console.log(`[Baileys] 🧹 Sessões criptográficas desincronizadas limpas (${removedCount} arquivos). Mantendo creds.json.`);
    }

    state.isConnected = false;
    state.statusText = 'Sessão criptográfica reparada. Reconectando com chaves sincronizadas...';
    isStarting = false;

    setTimeout(() => {
      initBaileysSocket().catch(console.error);
    }, 1000);

    return { success: true, message: 'Chaves criptográficas reparadas com sucesso! O WhatsApp reconectará sincronizado.' };
  } catch (err: any) {
    return { success: false, message: `Erro ao reparar sessão: ${err?.message || err}` };
  }
}

export async function resetWhatsAppSession(): Promise<{ success: boolean; message: string }> {
  try {
    if (currentSocket) {
      try {
        currentSocket.end(undefined);
      } catch {}
      currentSocket = null;
    }

    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }

    state.isConnected = false;
    state.phoneNumber = '';
    state.qrRaw = '';
    state.qrDataUrl = '';
    state.statusText = 'Sessão reiniciada. Gerando novo QR Code...';
    isStarting = false;

    setTimeout(() => {
      initBaileysSocket().catch(console.error);
    }, 1000);

    return { success: true, message: 'Sessão reiniciada com sucesso. Um novo QR Code foi gerado.' };
  } catch (err: any) {
    return { success: false, message: `Erro ao reiniciar sessão: ${err?.message || err}` };
  }
}

export async function initBaileysSocket(): Promise<void> {
  if (isStarting || (currentSocket && state.isConnected)) {
    return;
  }

  isExplicitlyDisconnected = false;
  isStarting = true;
  state.statusText = 'Conectando aos servidores oficiais do WhatsApp...';
  state.lastUpdated = new Date().toISOString();

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = baileys;

    const { state: authState, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
      auth: authState,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Mac OS', 'Chrome', '14.4.1'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      emitOwnEvents: false,
      retryRequestDelayMs: 500,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      msgRetryCounterCache,
      getMessage: async (key: any) => {
        if (key?.id) {
          const stored: any = messageHistory.get(key.id);
          if (stored && stored.message) return stored.message;
        }
        return { conversation: '' };
      },
      shouldIgnoreJid: () => false,
    });

    currentSocket = sock;

    // Real-time group updates & synchronization
    sock.ev.on('groups.upsert', (newGroups: any[]) => {
      try {
        if (!Array.isArray(newGroups)) return;
        for (const grp of newGroups) {
          if (grp?.id) {
            const subject = grp.subject || 'Grupo do WhatsApp';
            const participantsCount = Array.isArray(grp.participants) ? grp.participants.length : 1;
            cachedParticipatingGroups.set(grp.id, subject);
            cachedGroupDetails.set(grp.id, {
              id: grp.id,
              name: subject,
              membersCount: participantsCount,
              maxCapacity: 1024,
              inviteLink: `https://chat.whatsapp.com/`,
            });
            console.log(`[Baileys] 👥 Novo grupo detectado em tempo real: "${subject}" (${grp.id})`);
          }
        }
      } catch {}
    });

    sock.ev.on('groups.update', (updates: any[]) => {
      try {
        if (!Array.isArray(updates)) return;
        for (const u of updates) {
          if (u?.id && u?.subject) {
            cachedParticipatingGroups.set(u.id, u.subject);
            const prev = cachedGroupDetails.get(u.id);
            if (prev) {
              prev.name = u.subject;
            }
            console.log(`[Baileys] ✏️ Nome do grupo atualizado em tempo real: "${u.subject}" (${u.id})`);
          }
        }
      } catch {}
    });

    sock.ev.on('group-participants.update', ({ id, participants, action }: any) => {
      try {
        if (id && cachedGroupDetails.has(id)) {
          const grp = cachedGroupDetails.get(id);
          if (grp) {
            if (action === 'add') {
              grp.membersCount = (grp.membersCount || 1) + (Array.isArray(participants) ? participants.length : 1);
            } else if (action === 'remove') {
              grp.membersCount = Math.max(1, (grp.membersCount || 1) - (Array.isArray(participants) ? participants.length : 1));
            }
          }
        }
      } catch {}
    });

    // Listen for incoming messages for automatic Replica Zap forwarding
    sock.ev.on('messages.upsert', async ({ messages }: any) => {
      try {
        if (isExplicitlyDisconnected || !state.isConnected) return;
        if (!Array.isArray(messages)) return;
        for (const msg of messages) {
          // Store in message history for potential decryption retry queries
          if (msg.key?.id && msg.message) {
            messageHistory.set(msg.key.id, msg);
          }

          // Ignore empty or unparsed ciphertext messages
          if (!msg || !msg.message) continue;

          // Ignore messages sent by our bot itself to prevent any loop
          if (msg.key?.id && botSentMessageIds.has(msg.key.id)) continue;

          const remoteJid = msg.key?.remoteJid;
          if (!remoteJid || (!remoteJid.endsWith('@g.us') && !remoteJid.endsWith('@newsletter'))) continue;

          const isChannel = remoteJid.endsWith('@newsletter');
          console.log(`[Listener WhatsApp] 📡 Mensagem recebida no ${isChannel ? 'Canal' : 'Grupo'} (${remoteJid}). Disparando análise...`);
          await handleAutomaticReplicaMessage(msg, remoteJid, sock, downloadContentFromMessage);
        }
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        if (errMsg.includes('Bad MAC') || errMsg.includes('Failed to decrypt') || errMsg.includes('Session error')) {
          cleanCorruptSenderKeys();
          badMacErrorCount++;
          console.warn(`[Baileys] ℹ️ Criptografia Signal recalculada. Autocorreção de chaves executada.`);
          if (badMacErrorCount >= 3) {
            badMacErrorCount = 0;
            repairWhatsAppSession().catch(() => {});
          }
        } else {
          console.error('[Baileys] Erro no listener de mensagens:', err);
        }
      }
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qrRaw = qr;
        // WhatsApp mobile app camera recognizes 'L' error correction with high contrast instantly
        state.qrDataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'L',
          margin: 2,
          width: 340,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        state.isConnected = false;
        state.statusText = 'QR Code oficial emitido pelo WhatsApp. Pronto para leitura!';
        state.lastUpdated = new Date().toISOString();
        console.log('[Baileys] ✅ QR Code REAL e legítimo emitido pelo WhatsApp!');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

        console.log(`[Baileys] Conexão fechada (${statusCode}). LoggedOut: ${isLoggedOut}. Desconexão explícita: ${isExplicitlyDisconnected}`);
        state.isConnected = false;

        if (isExplicitlyDisconnected) {
          console.log('[Baileys] 🛑 Instância desconectada pelo usuário. Reconexão automática suspensa.');
          state.statusText = 'Instância desligada pelo usuário';
          state.lastUpdated = new Date().toISOString();
          isStarting = false;
          return;
        }

        if (isLoggedOut) {
          // Stale / expired session: clean folder to ensure a fresh QR code on next attempt
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
          state.statusText = 'Sessão deslogada. Gerando novo QR Code...';
          state.lastUpdated = new Date().toISOString();
          isStarting = false;
          // Spin up a fresh session for immediate QR generation
          setTimeout(() => {
            initBaileysSocket().catch(console.error);
          }, 1500);
        } else {
          state.statusText = 'Reconectando aos servidores do WhatsApp...';
          state.lastUpdated = new Date().toISOString();
          setTimeout(() => {
            isStarting = false;
            initBaileysSocket().catch(console.error);
          }, 3000);
        }
      } else if (connection === 'open') {
        state.isConnected = true;
        state.qrRaw = '';
        state.qrDataUrl = '';
        state.phoneNumber = sock.user?.id?.split(':')[0] || sock.user?.id || 'Conectado';
        state.statusText = 'Conectado com sucesso!';
        state.lastUpdated = new Date().toISOString();
        console.log(`[Baileys] 🚀 WhatsApp Conectado com Sucesso! Telefone: ${state.phoneNumber}`);
        isStarting = false;

        // Populate groups cache immediately
        refreshGroupCache(sock).then((map) => {
          console.log(`[Baileys] 📋 ${map.size} grupos sincronizados no cache para escuta ativa!`);
        });
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err: any) {
    console.error('[Baileys] Erro ao inicializar socket Baileys:', err);
    state.statusText = `Erro: ${err?.message || 'Falha ao conectar'}`;
    isStarting = false;
  }
}

/**
 * Safely downloads media from a WhatsApp message without throwing 'Cannot derive from empty media key'
 * Handles both encrypted group messages and unencrypted channels/newsletters CDN URLs.
 */
async function downloadWhatsAppMediaSafe(
  imageMsg: any,
  downloadContentFromMessage: any,
  isChannel: boolean
): Promise<Buffer | null> {
  if (!imageMsg) return null;

  // 1. Direct Baileys decrypted download if mediaKey or downloadContentFromMessage is available
  const rawKey = imageMsg.mediaKey;
  const hasValidMediaKey =
    rawKey !== null &&
    rawKey !== undefined &&
    ((Buffer.isBuffer(rawKey) || rawKey instanceof Uint8Array) ? rawKey.length > 0 : typeof rawKey === 'string' ? rawKey.trim().length > 0 : false);

  if (downloadContentFromMessage && hasValidMediaKey) {
    try {
      const type = isChannel ? 'newsletter-image' : 'image';
      let stream: any;
      try {
        stream = await downloadContentFromMessage(imageMsg, type);
      } catch {
        stream = await downloadContentFromMessage(imageMsg, 'image');
      }
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const finalBuffer = Buffer.concat(chunks);
      if (finalBuffer.length > 100) {
        console.log(`[Replica Zap] 📸 Imagem original do canal/grupo baixada com sucesso (${finalBuffer.length} bytes)!`);
        return finalBuffer;
      }
    } catch {
      console.log('[Replica Zap] Tentando método alternativo de CDN para baixar imagem do canal...');
    }
  }

  // 2. Direct CDN URL download from imageMsg.url
  if (imageMsg.url && typeof imageMsg.url === 'string' && imageMsg.url.startsWith('http')) {
    try {
      const res = await fetch(imageMsg.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 100) {
          console.log(`[Replica Zap] 📸 Imagem original do canal/newsletter baixada via CDN direta (${ab.byteLength} bytes)!`);
          return Buffer.from(ab);
        }
      }
    } catch (directErr) {
      console.log('[Replica Zap] Aviso ao tentar download direto via URL CDN:', directErr);
    }
  }

  // 3. Do NOT return tiny 32px jpegThumbnail as main image because it causes pixelated/horrible quality!
  // Return null so the pipeline automatically fetches the Full HD (1000px-1500px) official product photo from the offer link!
  if (imageMsg.jpegThumbnail) {
    console.log('[Replica Zap] ℹ️ Apenas miniatura (thumbnail de 32px) disponível no canal. Ignorando para buscar foto oficial Full HD do produto!');
  }

  return null;
}

/**
 * Automatically catches messages in monitored source groups,
 * downloads the product image, monetizes the copy with sf20250625192813,
 * cleans competitor branding, and dispatches to destination group automatically!
 */
async function handleAutomaticReplicaMessage(
  msg: any,
  remoteJid: string,
  sock: any,
  downloadContentFromMessage: any
): Promise<void> {
  try {
    if (isExplicitlyDisconnected || !state.isConnected) {
      console.log('[Replica Zap] ⏸️ Instância desligada ou desconectada. Mensagem ignorada.');
      return;
    }

    const rules = getActiveSourceRules().filter((r) => r.status === 'monitoring' && r.autoForward);
    if (rules.length === 0) return;

    // Get group or channel subject from cache or WhatsApp
    let groupSubject = cachedParticipatingGroups.get(remoteJid) || '';
    if (!groupSubject) {
      if (remoteJid.endsWith('@newsletter')) {
        try {
          const meta = await (sock as any).newsletterMetadata('jid', remoteJid);
          groupSubject = meta?.thread_metadata?.name?.text || meta?.name || '';
          if (groupSubject) {
            cachedParticipatingGroups.set(remoteJid, groupSubject);
          }
        } catch {
          // fallback
        }
      } else {
        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          groupSubject = groupMeta?.subject || '';
          if (groupSubject) {
            cachedParticipatingGroups.set(remoteJid, groupSubject);
          }
        } catch {
          // fallback
        }
      }
    }

    // Match strictly with configured source rules (supports multiple source names)
    let matchedRule = rules.find((r) => {
      // 1. Direct JID match
      if (r.sourceJid && r.sourceJid === remoteJid) return true;
      if (r.sourceJids && Array.isArray(r.sourceJids) && r.sourceJids.includes(remoteJid)) return true;

      // 2. Strict name matching across all sourceNames
      const allCandidateSources = [
        r.sourceName,
        ...(Array.isArray(r.sourceNames) ? r.sourceNames : []),
      ].flatMap((s) => (s ? s.split(',') : [])).map((s) => s.trim()).filter(Boolean);

      const cleanSubject = groupSubject
        .replace(/[^\p{L}\p{N}]/gu, '')
        .trim()
        .toLowerCase();

      const cleanJid = remoteJid.split('@')[0].toLowerCase();

      if (!cleanSubject && !cleanJid) return false;

      for (const src of allCandidateSources) {
        const cleanRuleName = src
          .replace(/^\[FONTE\]\s*/i, '')
          .replace(/^\[WhatsApp\]\s*/i, '')
          .replace(/^\[Telegram\]\s*/i, '')
          .replace(/^@/, '')
          .replace(/[^\p{L}\p{N}]/gu, '')
          .trim()
          .toLowerCase();

        if (!cleanRuleName) continue;

        // Flexible match check (exact or substring) so group titles with emojis or prefixes match configured sources
        if (
          (cleanSubject && (cleanSubject === cleanRuleName || cleanSubject.includes(cleanRuleName) || cleanRuleName.includes(cleanSubject))) ||
          (cleanJid && (cleanJid === cleanRuleName || cleanJid.includes(cleanRuleName) || cleanRuleName.includes(cleanJid))) ||
          src === remoteJid ||
          remoteJid.toLowerCase().includes(cleanRuleName)
        ) {
          // Auto-bind JID for instant future matching
          r.sourceJid = remoteJid;
          if (!r.sourceJids) r.sourceJids = [];
          if (!r.sourceJids.includes(remoteJid)) r.sourceJids.push(remoteJid);
          setActiveSourceRules(getActiveSourceRules());
          return true;
        }
      }

      return false;
    });

    if (!matchedRule) {
      console.log(`[Listener WhatsApp] ℹ️ Mensagem em "${groupSubject || remoteJid}" não processada (o grupo não está configurado como fonte em nenhuma regra ativa).`);
      return;
    }

    // Never replicate messages originating from the target group itself
    if (matchedRule.targetJid && remoteJid === matchedRule.targetJid) {
      return;
    }

    const isChannel = remoteJid.endsWith('@newsletter');
    console.log(
      `[Replica Zap Automático] ⚡ Mensagem detectada no ${isChannel ? 'Canal Fonte' : 'Grupo Fonte'}: "${groupSubject || matchedRule.sourceName}"`
    );

    // 1. Unwrap real message (handles ephemeral, viewOnce, newsletter, etc.)
    const realMsg = unwrapRealMessage(msg.message);
    if (!realMsg) return;

    // 2. Detect Image (direct imageMessage or nested)
    const imageMsg = realMsg.imageMessage;

    // 3. Extract Text / Caption (supporting standard, protocol, and newsletter formats)
    const rawCaption =
      imageMsg?.caption ||
      realMsg.conversation ||
      realMsg.extendedTextMessage?.text ||
      realMsg.protocolMessage?.editedMessage?.conversation ||
      realMsg.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
      realMsg.newsletterWM?.caption ||
      realMsg.newsletterWM?.text ||
      '';

    if (!imageMsg && !rawCaption) return;

    // Download image buffer safely if image present in WhatsApp message
    const imageBuffer = await downloadWhatsAppMediaSafe(imageMsg, downloadContentFromMessage, isChannel);

    await executeReplicaPipeline({
      matchedRule,
      rawCaption,
      imageBuffer,
      sourceDisplayTitle: groupSubject || matchedRule.sourceName,
      sourcePlatform: 'WhatsApp',
      remoteJid,
    });
  } catch (err: any) {
    console.error('[Replica Zap Automático] Erro no processamento e envio:', err);
  }
}

/**
 * Universal pipeline to process and replicate an offer from ANY source (WhatsApp or Telegram)
 * to ALL target groups/channels (WhatsApp groups and Telegram channels).
 */
export async function executeReplicaPipeline(params: {
  matchedRule?: ActiveSourceRule;
  rawCaption: string;
  imageBuffer: Buffer | null;
  sourceDisplayTitle: string;
  sourcePlatform: 'WhatsApp' | 'Telegram';
  remoteJid?: string;
}): Promise<{ success: boolean; sendResults: string[]; message?: string }> {
  const { rawCaption, sourceDisplayTitle, sourcePlatform, remoteJid } = params;
  let imageBuffer = params.imageBuffer;

  const matchedRule: ActiveSourceRule = params.matchedRule || {
    id: `rule-auto-${Date.now()}`,
    sourceName: sourceDisplayTitle || 'Grupo Fonte',
    targetGroup: 'teste 2',
    targetGroups: ['teste 2'],
    autoForward: true,
    filterCompetitorNames: true,
    autoFetchProductImage: true,
    validateMeliStock: true,
    status: 'monitoring',
    dealsCapturedToday: 0,
    createdAt: 'Agora',
  };

  try {
    // =========================================================================
    // 0. CHECAGEM DE AGENDA / HORÁRIO DE ATIVIDADE
    // =========================================================================
    const scheduleCheck = isScheduleActiveNow();
    if (!scheduleCheck.isAllowed) {
      console.log(`[Agenda / Tempo] ⏰ Automação pausada no dia/horário atual: ${scheduleCheck.reason}`);
      return {
        success: false,
        sendResults: [],
        message: scheduleCheck.reason || 'Automação fora da janela de horário da Agenda.',
      };
    }

    // =========================================================================
    // 0.1 ORDEM DE NÃO-REPETIÇÃO / FILTRO ANTI-DUPLICIDADE DE LINKS (24 HORAS)
    // =========================================================================
    const dedupCheck = isLinkDuplicateInWindow(rawCaption, matchedRule.targetGroup);
    if (dedupCheck.isDuplicate) {
      console.log(
        `[Anti-Duplicidade 24h] 🚫 Link/Produto de "${sourceDisplayTitle}" já foi enviado há ${dedupCheck.hoursAgo}h (${dedupCheck.lastSentFormatted}). Ignorando envio para evitar repetição.`
      );
      addReplicaLog({
        id: `log-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: sourceDisplayTitle,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawCaption,
        finalCaption: '',
        hasImage: !!imageBuffer,
        imageSource: 'none',
        originalUrl: dedupCheck.matchedCodeOrUrl,
        monetizedUrl: '',
        marketplace: 'Filtro Anti-Duplicidade 24h',
        methodUsed: 'Ordem de Não-Repetição 24h',
        status: 'skipped',
        errorMessage: `Link enviado há menos de 24h (enviado há ${dedupCheck.hoursAgo}h às ${dedupCheck.lastSentFormatted}).`,
      });
      return {
        success: false,
        sendResults: [],
        message: `Link/produto enviado há menos de 24 horas (há ${dedupCheck.hoursAgo}h).`,
      };
    }

    // =========================================================================
    // 1. FILTRO PRECOCE DE INSTÂNCIAS / MARKETPLACES ATIVOS (STOP INSTANTÂNEO)
    // =========================================================================
    const earlyMarketplaces = getMarketplacesConfig();
    const enabledMap: Record<string, boolean> = {
      mercadolivre: earlyMarketplaces.mercadoLivre?.enabled !== false,
      shopee: earlyMarketplaces.shopee?.enabled !== false,
      amazon: earlyMarketplaces.amazon?.enabled !== false,
      shein: earlyMarketplaces.shein?.enabled !== false,
      aliexpress: earlyMarketplaces.aliexpress?.enabled !== false,
      temu: earlyMarketplaces.temu?.enabled !== false,
    };

    const allUrlsInMsg = extractUrls(rawCaption);
    const productCandidates = allUrlsInMsg.filter((u) => !isCompetitorShareUrl(u));

    if (productCandidates.length === 0) {
      console.log(`[Replica Pipeline] 🚫 Mensagem de ${sourcePlatform} descartada: Não contém links de produtos dos marketplaces suportados.`);
      return { success: false, sendResults: [], message: 'Sem links de produtos suportados' };
    }

    let hasAtLeastOneEnabledMp = false;
    const detectedMpsForLog: string[] = [];

    for (const pUrl of productCandidates) {
      const lowerU = pUrl.toLowerCase();
      let mpKey = 'generic';
      if (lowerU.includes('mercadolivre.com') || lowerU.includes('meli.la')) {
        mpKey = 'mercadolivre';
      } else if (lowerU.includes('shopee.') || lowerU.includes('shope.ee')) {
        mpKey = 'shopee';
      } else if (
        lowerU.includes('amazon') ||
        lowerU.includes('amzn.to') ||
        lowerU.includes('a.co') ||
        lowerU.includes('link.amazon') ||
        lowerU.includes('amzn.eu') ||
        lowerU.includes('amzn.asia')
      ) {
        mpKey = 'amazon';
      } else if (lowerU.includes('shein.') || lowerU.includes('shein.top') || lowerU.includes('shein.co')) {
        mpKey = 'shein';
      } else if (lowerU.includes('aliexpress.') || lowerU.includes('s.click') || lowerU.includes('ali.ski') || lowerU.includes('a.aliexpress')) {
        mpKey = 'aliexpress';
      } else if (lowerU.includes('temu.') || lowerU.includes('temu.to')) {
        mpKey = 'temu';
      }

      detectedMpsForLog.push(mpKey);
      if (enabledMap[mpKey] === true) {
        hasAtLeastOneEnabledMp = true;
      }
    }

    if (!hasAtLeastOneEnabledMp) {
      const disabledListStr = detectedMpsForLog.map((m) => m.toUpperCase()).join(', ');
      console.log(
        `[Replica Pipeline] 🚫 MENSAGEM BLOQUEADA: Todos os marketplaces detectados (${disabledListStr}) estão DESATIVADOS nas configurações.`
      );
      addReplicaLog({
        id: `log-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: sourceDisplayTitle,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawCaption,
        finalCaption: '',
        hasImage: !!imageBuffer,
        imageSource: 'none',
        originalUrl: productCandidates[0],
        monetizedUrl: '',
        marketplace: disabledListStr,
        methodUsed: 'Filtro Precoce de Instâncias Ativas',
        status: 'skipped',
        errorMessage: `Marketplace ${disabledListStr} desativado. Mensagem bloqueada instantaneamente.`,
      });
      return { success: false, sendResults: [], message: `Marketplaces desativados: ${disabledListStr}` };
    }

    // =========================================================
    // 2. CHECAGEM ÚNICA (ESTOQUE + FOTO) - analisar_produto_meli
    // =========================================================
    const mensagem_veio_com_foto = !!imageBuffer;
    let foto_capturada_meli: string | null = null;

    const isMeliMessage =
      /MLB[-]?\d+/i.test(rawCaption) ||
      /meli\.la/i.test(rawCaption) ||
      /mercadolivre\.com\.br/i.test(rawCaption);

    if (matchedRule.validateMeliStock !== false && (isMeliMessage || matchedRule.onlyMeliDeals)) {
      const dados_produto = await analisar_produto_meli(rawCaption);

      if (!dados_produto.valido) {
        console.log(`[Replica Pipeline] Produto esgotado ou pausado. Ignorando mensagem de [${sourceDisplayTitle}]...`);
        addReplicaLog({
          id: `log-skip-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          sourceGroupName: sourceDisplayTitle,
          targetGroupName: matchedRule.targetGroup,
          originalText: rawCaption,
          finalCaption: '',
          hasImage: !!imageBuffer,
          imageSource: 'none',
          status: 'error',
          errorMessage: dados_produto.motivo || 'Produto esgotado ou pausado. Ignorando...',
        });
        return { success: false, sendResults: [], message: dados_produto.motivo || 'Produto esgotado ou pausado' };
      }

      foto_capturada_meli = dados_produto.foto_url;
      console.log(`[Replica Pipeline] ✅ Produto válido e em estoque! Foto da API capturada: ${foto_capturada_meli || 'nenhuma'}`);
    }

    // =========================================================
    // 3. RESOLVER LINK DE CONVITE DO GRUPO DE DESTINO
    // =========================================================
    const customConfiguredLink = getVipGroupLink();
    let targetInviteLink = customConfiguredLink && customConfiguredLink !== DEFAULT_VIP_GROUP_LINK
      ? customConfiguredLink
      : '';

    if (!targetInviteLink && currentSocket && state.isConnected && matchedRule.targetJid && typeof currentSocket.groupInviteCode === 'function') {
      try {
        const inviteCode = await currentSocket.groupInviteCode(matchedRule.targetJid);
        if (inviteCode) {
          targetInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        }
      } catch {}
    }

    if (!targetInviteLink) {
      targetInviteLink = customConfiguredLink || DEFAULT_VIP_GROUP_LINK;
    }

    // =========================================================
    // 4. LIMPAR COPY E MONETIZAR TODOS OS LINKS
    // =========================================================
    const processed = await cleanAndMonetizeCompetitorMessage(
      rawCaption,
      OFFICIAL_USER_AFFILIATE_ID,
      targetInviteLink
    );

    if (!processed.shouldForward) {
      console.log(`[Replica Pipeline] 🚫 MENSAGEM FILTRADA: ${processed.blockReason || 'Bloqueada pelo motor de afiliação.'}`);
      addReplicaLog({
        id: `log-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: sourceDisplayTitle,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawCaption,
        finalCaption: '',
        hasImage: !!imageBuffer,
        imageSource: 'none',
        originalUrl: processed.originalUrl,
        monetizedUrl: '',
        marketplace: processed.marketplace || 'Desconhecido',
        methodUsed: 'Filtro de Conexões Ativas',
        status: 'skipped',
        errorMessage: processed.blockReason || 'Marketplace desativado nas conexões.',
      });
      return { success: false, sendResults: [], message: processed.blockReason };
    }

    const {
      cleanedCopy,
      originalUrl,
      monetizedUrl,
      marketplace,
      methodUsed,
      requiresConversion,
      mlbId,
      pureProductUrl,
    } = processed;

    let finalCleanedCopy = cleanedCopy;
    let finalMonetizedUrl = monetizedUrl;

    if (requiresConversion && pureProductUrl) {
      console.log(`[Conversor Meli Direct] 🔄 Tentando conversão instantânea via Cookies API para MLB: ${mlbId || 'MLB'}...`);
      try {
        const directConv = await convertMeliLinkViaCookies(pureProductUrl);
        if (directConv?.monetized_url && directConv.monetized_url.includes('meli.la')) {
          finalMonetizedUrl = directConv.monetized_url;
          finalCleanedCopy = finalCleanedCopy.replace(pureProductUrl, finalMonetizedUrl);
          if (mlbId) {
            setCustomMeliLink(mlbId, finalMonetizedUrl);
          }
          console.log(`[Conversor Meli Direct] 🎯 Link Oficial meli.la gerado: ${finalMonetizedUrl}`);
        } else {
          finalMonetizedUrl = pureProductUrl;
        }
      } catch (convErr) {
        console.warn('[Conversor Meli Direct] Falha na chamada da Cookies API, utilizando URL canônica:', convErr);
        finalMonetizedUrl = pureProductUrl;
      }
    }

    // =========================================================
    // 4.1 APLICAR FILTRO DE CHAT (Remover frases, chamadas e linhas indesejadas da FONTE)
    // =========================================================
    finalCleanedCopy = applyChatFilter(
      finalCleanedCopy,
      sourceDisplayTitle,
      matchedRule.sourceName,
      remoteJid,
      matchedRule.sourceJid,
      ...(Array.isArray(matchedRule.sourceNames) ? matchedRule.sourceNames : []),
      ...(Array.isArray(matchedRule.sourceJids) ? matchedRule.sourceJids : [])
    );

    // =========================================================
    // 5. REGRA DE IMAGEM: PRESERVAR FOTO ORIGINAL OU EXTRAIR DO LINK
    // =========================================================
    const candidateUrl = finalMonetizedUrl || pureProductUrl || originalUrl || monetizedUrl;
    let imageSource: 'source-media' | 'auto-link-photo' | 'none' = 'none';

    // 1. Se a mensagem já veio com foto do canal/grupo concorrente:
    // Normaliza e preserva com prioridade máxima (evita sobrescrever com web scraping arriscado)
    if (imageBuffer) {
      const normalizedIncoming = await normalizeImageBuffer(imageBuffer);
      if (normalizedIncoming) {
        imageBuffer = normalizedIncoming;
        imageSource = 'source-media';
        console.log(`[Replica Pipeline] 📸 Foto original da fonte preservada e normalizada (${imageBuffer.length} bytes JPEG)!`);
      } else {
        console.log('[Replica Pipeline] ℹ️ Foto recebida era inválida ou miniatura ilegível. Buscando foto do produto via link...');
        imageBuffer = null;
      }
    }

    // 2. Se a mensagem NÃO continha foto válida, extrai a foto oficial do link do produto
    if (!imageBuffer && candidateUrl && matchedRule.autoFetchProductImage !== false) {
      // 2.a Tentar primeiro pela foto obtida da API do Mercado Livre (se houver)
      if (foto_capturada_meli) {
        try {
          const photoBuf = await normalizeImageBuffer(foto_capturada_meli);
          if (photoBuf && photoBuf.length > 500) {
            imageBuffer = photoBuf;
            imageSource = 'auto-link-photo';
            console.log(`[Replica Pipeline] 📸 Foto oficial Full HD (API Mercado Livre) anexada (${imageBuffer.length} bytes JPEG)!`);
          }
        } catch (apiPhotoErr) {
          console.warn('[Replica Pipeline] Falha ao processar foto da API ML:', apiPhotoErr);
        }
      }

      // 2.b Se não veio da API ou se for outro marketplace, extrai a foto HD oficial do link via productImageService
      if (!imageBuffer) {
        try {
          const photoData = await fetchProductImageBuffer(candidateUrl);
          if (photoData?.buffer) {
            const normalizedScraped = await normalizeImageBuffer(photoData.buffer);
            if (normalizedScraped) {
              imageBuffer = normalizedScraped;
              imageSource = 'auto-link-photo';
              console.log(`[Replica Pipeline] 📸 Foto oficial Full HD do produto extraída do link com sucesso (${imageBuffer.length} bytes JPEG): ${photoData.url}`);
            }
          }
        } catch (pagePhotoErr) {
          console.warn('[Replica Pipeline] Erro ao extrair foto HD do link:', pagePhotoErr);
        }
      }
    }

    // =========================================================
    // 6. ENVIAR PARA TODOS OS DESTINOS (WhatsApp & Telegram)
    // =========================================================
    const sendSock = currentSocket;
    let allTargets: string[] = [];
    if (Array.isArray(matchedRule.targetGroups) && matchedRule.targetGroups.length > 0) {
      allTargets = matchedRule.targetGroups;
    } else if (matchedRule.targetGroup) {
      allTargets = matchedRule.targetGroup.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      allTargets = ['Grupo VIP de Ofertas'];
    }

    let atLeastOneSent = false;
    const sendResults: string[] = [];

    for (let i = 0; i < allTargets.length; i++) {
      const tgt = allTargets[i];
      if (!tgt) continue;
      const platformHint = matchedRule.targetPlatforms?.[i];
      const isTg = isTelegramTarget(tgt, platformHint);

      if (isTg) {
        // Envio para Canal ou Grupo do Telegram
        try {
          const directChatId = matchedRule.targetChatIds?.[i];
          const resolvedChatId = directChatId || resolveTelegramChatId(tgt);
          console.log(`[Replica Pipeline] ✈️ Enviando para Telegram: "${tgt}" -> Chat ID: ${resolvedChatId}`);
          const tgRes = await sendTelegramMessage(
            resolvedChatId,
            finalCleanedCopy,
            imageBuffer
          );
          if (tgRes.success) {
            atLeastOneSent = true;
            sendResults.push(`Telegram: ${tgt}`);
            console.log(`[Replica Pipeline] ✅ Mensagem entregue no Telegram com sucesso (${tgt})!`);
          } else {
            sendResults.push(`Telegram (${tgt}) erro: ${tgRes.error}`);
            console.warn(`[Replica Pipeline] ❌ Telegram recusou envio (${tgt}):`, tgRes.error);
          }
        } catch (tgErr: any) {
          sendResults.push(`Telegram (${tgt}) erro: ${tgErr?.message}`);
        }
        continue;
      }

      // Envio para Grupo do WhatsApp
      if (!sendSock || !state.isConnected) {
        console.warn(`[Replica Pipeline] WhatsApp desconectado ao tentar enviar para "${tgt}".`);
        sendResults.push(`WhatsApp (${tgt}) falha: WhatsApp desconectado`);
        continue;
      }

      // Garantir que o cache de grupos esteja carregado
      if (cachedParticipatingGroups.size === 0) {
        try {
          await refreshGroupCache(sendSock, false);
        } catch {}
      }

      let thisTargetJid = '';
      if (tgt.endsWith('@g.us') || tgt.endsWith('@newsletter')) {
        thisTargetJid = tgt;
      }

      const cleanTgt = tgt.replace(/^\[(WhatsApp|Telegram)\]\s*/i, '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();

      // 1. Tentar encontrar o JID correspondente no cache de grupos pelo NOME EXATO (ou parcial se name > 2 chars)
      if (!thisTargetJid && cleanTgt) {
        const match = findMatchingGroupJid(tgt, cachedParticipatingGroups);
        if (match) {
          thisTargetJid = match.jid;
        }
      }

      // 2. Se não encontrou no cache, atualiza o cache diretamente dos servidores do WhatsApp e tenta novamente
      if (!thisTargetJid && cleanTgt) {
        try {
          const freshGroups = await refreshGroupCache(sendSock, true);
          const matchFresh = findMatchingGroupJid(tgt, freshGroups);
          if (matchFresh) {
            thisTargetJid = matchFresh.jid;
          }
        } catch {}
      }

      // 3. Fallback: Se não casou por nome, usa o JID salvo previamente na regra se for um JID válido
      if (!thisTargetJid) {
        const savedJid = matchedRule.targetJids?.[i] || matchedRule.targetJid;
        if (savedJid && (savedJid.endsWith('@g.us') || savedJid.endsWith('@newsletter'))) {
          thisTargetJid = savedJid;
        }
      }

      if (thisTargetJid) {
        try {
          let sentMsg: any;
          if (imageBuffer) {
            const sendBuffer = await normalizeImageBuffer(imageBuffer);
            if (sendBuffer) {
              sentMsg = await sendSock.sendMessage(thisTargetJid, {
                image: sendBuffer,
                caption: finalCleanedCopy,
              });
            } else {
              console.warn(`[Replica Pipeline] ⚠️ Imagem corrompida descartada. Enviando para WhatsApp (${tgt}) como texto.`);
              sentMsg = await sendSock.sendMessage(thisTargetJid, {
                text: finalCleanedCopy,
              });
            }
          } else {
            sentMsg = await sendSock.sendMessage(thisTargetJid, {
              text: finalCleanedCopy,
            });
          }
          if (sentMsg?.key?.id) {
            botSentMessageIds.add(sentMsg.key.id);
          }
          atLeastOneSent = true;
          sendResults.push(`WhatsApp: ${tgt}`);
          console.log(`[Replica Pipeline] ✅ Mensagem entregue no WhatsApp com sucesso (${tgt} -> ${thisTargetJid})!`);
        } catch (waErr: any) {
          sendResults.push(`WhatsApp (${tgt}) erro: ${waErr?.message || waErr}`);
          console.warn(`[Replica Pipeline] Erro ao enviar no WhatsApp (${tgt}):`, waErr?.message || waErr);
        }
      } else {
        console.warn(`[Replica Pipeline] ⚠️ Grupo de destino "${tgt}" não foi encontrado nos seus grupos do WhatsApp.`);
        sendResults.push(`WhatsApp (${tgt}): Grupo de destino não encontrado na conta WhatsApp`);
      }
    }

    if (atLeastOneSent) {
      recordDispatchedLink(
        originalUrl || productCandidates[0] || rawCaption,
        finalMonetizedUrl || pureProductUrl,
        mlbId,
        allTargets.join(', ')
      );
    }

    // =========================================================
    // 7. ATUALIZAR CONTADORES E REGISTRAR LOG DE CLONAGEM
    // =========================================================
    matchedRule.dealsCapturedToday = (matchedRule.dealsCapturedToday || 0) + 1;
    setActiveSourceRules(getActiveSourceRules());

    addReplicaLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      sourceGroupName: sourceDisplayTitle,
      targetGroupName: allTargets.join(', '),
      originalText: rawCaption,
      finalCaption: finalCleanedCopy,
      hasImage: !!imageBuffer,
      imageSource,
      originalUrl,
      monetizedUrl: finalMonetizedUrl,
      marketplace: marketplace || 'Mercado Livre',
      methodUsed: methodUsed || `Origem: ${sourcePlatform} -> Destinos: ${allTargets.join(', ')}`,
      status: atLeastOneSent ? 'success' : 'error',
      errorMessage: atLeastOneSent ? undefined : sendResults.join(' | '),
    });

    console.log(
      `[Replica Pipeline] 🚀 SUCESSO: Mensagem capturada de [${sourceDisplayTitle}] e entregue para [${allTargets.join(', ')}] (Foto: ${imageSource})!`
    );

    return {
      success: atLeastOneSent,
      sendResults,
      message: atLeastOneSent
        ? `Entregue com sucesso para: ${sendResults.join(', ')}`
        : `Falha ao enviar: ${sendResults.join(', ')}`,
    };
  } catch (err: any) {
    console.error('[Replica Pipeline] Erro crítico na replicação:', err);
    return { success: false, sendResults: [], message: err?.message || 'Erro interno' };
  }
}

/**
 * Handles incoming messages from Telegram channels and groups,
 * automatically routing them to WhatsApp groups according to configured Source rules!
 */
export async function handleIncomingTelegramMessage(params: {
  rawText: string;
  imageBuffer?: Buffer | null;
  chatId: string;
  chatTitle: string;
  chatUsername?: string;
  messageId?: number;
}): Promise<{ success: boolean; ruleMatched?: string; targetsSent?: string[]; error?: string; message?: string }> {
  try {
    const rawCaption = (params.rawText || '').trim();
    if (!rawCaption && !params.imageBuffer) {
      return { success: false, error: 'Mensagem vazia do Telegram.' };
    }

    const allAvailable = getActiveSourceRules();
    const candidateRules = allAvailable.filter((r) => r.status === 'monitoring' && r.autoForward);

    if (candidateRules.length === 0) {
      console.log('[Telegram -> WhatsApp] ℹ️ Nenhuma regra ativa em monitoramento nas Fontes.');
      return { success: false, error: 'Nenhuma regra ativa em monitoramento nas Fontes.' };
    }

    const cleanChatTitle = (params.chatTitle || '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
    const cleanUsername = (params.chatUsername || '').replace(/^@/, '').trim().toLowerCase();
    const cleanId = String(params.chatId || '').trim().toLowerCase();

    // Match rule configured for this Telegram source
    let matchedRule = candidateRules.find((r) => {
      // 1. Direct chatId or username match
      if (r.sourceJid && (r.sourceJid === cleanId || r.sourceJid.toLowerCase() === `@${cleanUsername}`)) return true;
      if (r.sourceJids && (r.sourceJids.includes(cleanId) || r.sourceJids.some((j) => j.toLowerCase() === `@${cleanUsername}`))) return true;

      // 2. Name matching across sourceNames
      const candidates = [
        r.sourceName,
        ...(Array.isArray(r.sourceNames) ? r.sourceNames : []),
      ].flatMap((s) => (s ? s.split(',') : [])).map((s) => s.trim()).filter(Boolean);

      for (const src of candidates) {
        const cleanSrc = src
          .replace(/^\[FONTE\]\s*/i, '')
          .replace(/^\[Telegram\]\s*/i, '')
          .replace(/^\[WhatsApp\]\s*/i, '')
          .replace(/^@/, '')
          .replace(/[^\p{L}\p{N}]/gu, '')
          .trim()
          .toLowerCase();

        if (!cleanSrc) continue;

        // Exact match check only
        if (
          (cleanChatTitle && cleanChatTitle === cleanSrc) ||
          (cleanUsername && cleanUsername === cleanSrc) ||
          cleanId === cleanSrc
        ) {
          if (!r.sourceJid) r.sourceJid = cleanId;
          if (!r.sourceJids) r.sourceJids = [];
          if (!r.sourceJids.includes(cleanId)) r.sourceJids.push(cleanId);
          setActiveSourceRules(getActiveSourceRules());
          return true;
        }
      }

      return false;
    });

    if (!matchedRule) {
      console.log(`[Telegram -> WhatsApp] ℹ️ Mensagem recebida de "${params.chatTitle}" (${params.chatId}), mas este canal não está configurado em nenhuma regra de fonte ativa.`);
      return { success: false, error: `Canal ou grupo do Telegram (${params.chatTitle || params.chatId}) não está selecionado nas fontes.` };
    }

    console.log(`[Telegram -> WhatsApp] 🚀 Mensagem capturada de "${params.chatTitle}"! Replicando para regra "${matchedRule.sourceName}" -> Destinos: "${matchedRule.targetGroup}"...`);

    const result = await executeReplicaPipeline({
      matchedRule,
      rawCaption,
      imageBuffer: params.imageBuffer || null,
      sourceDisplayTitle: `[Telegram] ${params.chatTitle || params.chatUsername || params.chatId}`,
      sourcePlatform: 'Telegram',
    });

    return {
      success: result.success,
      ruleMatched: matchedRule.sourceName,
      targetsSent: result.sendResults,
      message: result.message,
    };
  } catch (err: any) {
    console.error('[Telegram -> WhatsApp] Erro ao replicar mensagem:', err);
    return { success: false, error: err?.message || 'Erro interno na replicação Telegram -> WhatsApp.' };
  }
}

// Register the incoming handler with the Telegram service
registerTelegramIncomingHandler(handleIncomingTelegramMessage);

/**
 * Allows manual or test dispatches to any destination group with optional image buffer or URL
 */
export async function sendDirectReplicaDeal(params: {
  targetGroupNameOrJid: string;
  copy: string;
  imageBuffer?: Buffer;
  imageUrl?: string;
  autoFetchImage?: boolean;
}): Promise<{ success: boolean; message: string; targetSubject?: string; hasImage?: boolean }> {
  if (!currentSocket || !state.isConnected) {
    return { success: false, message: 'WhatsApp não está conectado.' };
  }

  try {
    let targetJid = params.targetGroupNameOrJid;
    let targetSubject = params.targetGroupNameOrJid;

    if (!targetJid.endsWith('@g.us')) {
      const groupsMap = await refreshGroupCache(currentSocket);
      const matched = findMatchingGroupJid(params.targetGroupNameOrJid, groupsMap);
      if (matched) {
        targetJid = matched.jid;
        targetSubject = matched.subject;
      } else {
        return {
          success: false,
          message: `Grupo de destino "${params.targetGroupNameOrJid}" não encontrado na sua conta.`,
        };
      }
    }

    let finalBuffer: Buffer | null = null;
    if (params.imageBuffer) {
      finalBuffer = await normalizeImageBuffer(params.imageBuffer);
    } else if (params.imageUrl) {
      finalBuffer = await normalizeImageBuffer(params.imageUrl);
    }

    // Auto-Foto: Se não tem foto e autoFetchImage for permitido, extrai automaticamente do link da copy
    if (!finalBuffer && params.autoFetchImage !== false) {
      const urls = params.copy.match(/https?:\/\/[^\s]+/g);
      const productUrl = urls?.find(u => !u.includes('chat.whatsapp.com') && !u.includes('t.me') && !u.includes('wa.me'));
      if (productUrl) {
        // Aguarda o link carregar por si só a imagem do produto antes de enviar
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          const photoData = await fetchProductImageBuffer(productUrl);
          if (photoData?.buffer) {
            finalBuffer = await normalizeImageBuffer(photoData.buffer);
            if (finalBuffer) {
              console.log(`[Replica Zap] 📸 Imagem gerada pelo link anexada ao disparo direto: ${photoData.url}`);
            }
          }
        } catch (imgErr) {
          console.warn('[Replica Zap] Falha ao extrair auto-foto para disparo direto:', imgErr);
        }
      }
    }

    let sentMsg: any;
    if (finalBuffer) {
      sentMsg = await currentSocket.sendMessage(targetJid, {
        image: finalBuffer,
        caption: params.copy,
      });
    } else {
      sentMsg = await currentSocket.sendMessage(targetJid, {
        text: params.copy,
      });
    }

    if (sentMsg?.key?.id) {
      botSentMessageIds.add(sentMsg.key.id);
    }

    return {
      success: true,
      message: `Enviado com sucesso para "${targetSubject}"!`,
      targetSubject,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Falha ao enviar mensagem.' };
  }
}

/**
 * Converts and dispatches a pending Mercado Livre offer to WhatsApp once the official meli.la link is provided
 */
export async function dispatchPendingMeliOffer(
  itemId: string,
  officialMeliUrl: string
): Promise<{ success: boolean; message: string }> {
  const item = getPendingMeliItem(itemId);
  if (!item) {
    return { success: false, message: 'Oferta pendente não encontrada.' };
  }

  const cleanMeliUrl = officialMeliUrl.trim();
  if (!cleanMeliUrl.includes('meli.la') && !cleanMeliUrl.includes('mercadolivre.com.br')) {
    return { success: false, message: 'O link informado deve ser um link oficial meli.la do Mercado Livre.' };
  }

  // 1. Save mapping permanently so all future offers of this product are automatically converted!
  if (item.mlbId) {
    setCustomMeliLink(item.mlbId, cleanMeliUrl);
    console.log(`[Conversor Meli] 💾 Mapeamento salvo: ${item.mlbId} -> ${cleanMeliUrl}`);
  }

  // 2. Reprocess the copy with the new official link
  const processed = await cleanAndMonetizeCompetitorMessage(
    item.rawCaption,
    OFFICIAL_USER_AFFILIATE_ID,
    item.targetInviteLink
  );

  let finalCopy = processed.cleanedCopy;
  // If the product url in finalCopy still isn't the meli url, replace it
  if (item.pureProductUrl && finalCopy.includes(item.pureProductUrl)) {
    finalCopy = finalCopy.replace(item.pureProductUrl, cleanMeliUrl);
  }

  // 3. Dispatch to WhatsApp
  if (!currentSocket || !state.isConnected) {
    // If WhatsApp is currently disconnected, still mark as converted and update catalog
    removePendingMeliItem(itemId);
    return {
      success: true,
      message: 'Link cadastrado com sucesso no catálogo! Conecte o WhatsApp para disparo em lote.',
    };
  }

  try {
    let targetJid = item.targetJid;
    if (!targetJid || !targetJid.endsWith('@g.us')) {
      const groupsMap = await refreshGroupCache(currentSocket);
      const cleanSearch = (item.targetGroupName || '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
      for (const [jid, subj] of groupsMap.entries()) {
        const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
        if (cleanSubj && (cleanSubj === cleanSearch || cleanSubj.includes(cleanSearch) || cleanSearch.includes(cleanSubj))) {
          targetJid = jid;
          break;
        }
      }
    }

    if (!targetJid) {
      removePendingMeliItem(itemId);
      return {
        success: false,
        message: `Grupo de destino "${item.targetGroupName}" não encontrado. Link salvo no catálogo!`,
      };
    }

    let sentMsg: any;
    if (item.imageBufferBase64) {
      const imgBuffer = Buffer.from(item.imageBufferBase64, 'base64');
      sentMsg = await currentSocket.sendMessage(targetJid, {
        image: imgBuffer,
        caption: finalCopy,
      });
    } else {
      sentMsg = await currentSocket.sendMessage(targetJid, {
        text: finalCopy,
      });
    }

    if (sentMsg?.key?.id) {
      botSentMessageIds.add(sentMsg.key.id);
    }

    // 4. Clean from pending queue
    removePendingMeliItem(itemId);

    // 5. Add success log
    addReplicaLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      sourceGroupName: item.sourceGroupName,
      targetGroupName: item.targetGroupName,
      originalText: item.rawCaption,
      finalCaption: finalCopy,
      hasImage: !!item.imageBufferBase64,
      originalUrl: item.pureProductUrl,
      monetizedUrl: cleanMeliUrl,
      marketplace: 'Mercado Livre (meli.la)',
      methodUsed: 'Convertido via Hub & Disparado',
      status: 'success',
    });

    recordConversionLog({
      durationMs: 0,
      inputType: 'manual_approval',
      input: item.rawCaption.substring(0, 180),
      httpStatus: 200,
      overallStatus: 'CONVERTED_MELI_LA',
      mlbCode: item.mlbId,
      originalUrl: item.pureProductUrl,
      pureProductUrl: item.pureProductUrl,
      monetizedUrl: cleanMeliUrl,
      isOfficialMeliShort: true,
      methodUsed: 'Convertido via Hub & Disparado no WhatsApp',
      steps: {
        step1_expansion: { status: 'success', value: item.pureProductUrl },
        step2_cleaning: { status: 'success', detail: item.mlbId, value: item.pureProductUrl },
        step3_monetization: { status: 'success', value: cleanMeliUrl },
      },
    });

    console.log(
      `[Conversor Meli] 🚀 Oferta pendente ${item.mlbId} disparada com sucesso para "${item.targetGroupName}"!`
    );

    return {
      success: true,
      message: `Oferta convertida para ${cleanMeliUrl} e disparada com sucesso para "${item.targetGroupName}"!`,
    };
  } catch (err: any) {
    console.error('Erro ao disparar oferta pendente:', err);
    return { success: false, message: err?.message || 'Falha ao enviar ao WhatsApp.' };
  }
}

/**
 * Resolve e inscreve o bot em um canal (@newsletter) do WhatsApp usando o link de convite oficial
 */
export async function joinWhatsAppChannelByLink(link: string) {
  const sock = currentSocket;
  if (!sock) {
    throw new Error('O WhatsApp não está conectado.');
  }

  // Extrai o código de convite da URL colada pelo utilizador
  const match = link.match(/whatsapp\.com\/channel\/([\w-]+)/i);
  if (!match) {
    throw new Error('Link de canal inválido. Use o formato whatsapp.com/channel/...');
  }

  const inviteCode = match[1];
  console.log(`[Baileys] Tentando resolver o canal via código de convite: ${inviteCode}`);

  try {
    // Pede à Meta os metadados do canal usando o código de convite
    const metadata = await sock.newsletterMetadata('invite', inviteCode);

    const channelName =
      metadata?.thread_metadata?.name?.text ||
      metadata?.name ||
      'Canal do WhatsApp';

    const channelDesc =
      metadata?.thread_metadata?.description?.text ||
      metadata?.description?.text ||
      metadata?.description ||
      '';

    const channelId = metadata?.id || metadata?.jid;

    if (!channelId) {
      throw new Error('Não foi possível obter o ID (@newsletter) do canal.');
    }

    console.log(`[Baileys] Sucesso! Canal resolvido: ${channelName} (${channelId})`);

    // Tenta seguir o canal se suportado pelo Baileys
    try {
      if (typeof sock.newsletterFollow === 'function') {
        await sock.newsletterFollow(channelId);
        console.log(`[Baileys] Bot seguiu o canal ${channelName} com sucesso!`);
      }
    } catch (followErr: any) {
      console.log('[Baileys] Aviso ao seguir canal (pode já estar seguido):', followErr?.message || followErr);
    }

    // Salva no cache local de grupos/canais
    cachedParticipatingGroups.set(channelId, channelName);
    cachedGroupDetails.set(channelId, {
      id: channelId,
      name: channelName,
      membersCount: Number(metadata?.thread_metadata?.subscribers_count || metadata?.subscribers || 1000),
      maxCapacity: 1000000,
      inviteLink: link,
    });

    return {
      id: channelId, // ID real que termina em @newsletter
      name: channelName,
      description: channelDesc,
    };
  } catch (error: any) {
    console.error('[Baileys] Erro ao resolver link do canal:', error?.message || error);
    throw new Error(error?.message?.includes('Falha') ? error.message : 'Falha ao encontrar canal. O link pode estar expirado ou o bot foi bloqueado.');
  }
}


