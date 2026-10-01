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
  ActiveSourceRule,
} from './replicaForwarder.ts';
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
  PendingMeliItem,
} from './affiliateConfig.ts';
import { recordConversionLog } from './conversionLogger.ts';
import { convertMeliLinkViaCookies, getMarketplacesConfig } from './marketplacesService.ts';
import { fetchProductImageBuffer } from './productImageService.ts';
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
} from './telegramService.ts';

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
let lastGroupFetchTime = 0;
let inFlightGroupFetchPromise: Promise<Map<string, string>> | null = null;
const GROUP_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache to prevent rate-overlimit
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
      const groupsMap = await sock.groupFetchAllParticipating();
      lastGroupFetchTime = Date.now();
      for (const [id, grp] of Object.entries(groupsMap)) {
        cachedParticipatingGroups.set(id, (grp as any).subject || '');
      }

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
          const cleanSourceName = srcName
            .replace(/^\[FONTE\]\s*/i, '')
            .replace(/^\[WhatsApp\]\s*/i, '')
            .replace(/^\[Telegram\]\s*/i, '')
            .replace(/[^\p{L}\p{N}]/gu, '')
            .trim()
            .toLowerCase();

          if (!cleanSourceName) continue;

          for (const [id, subj] of cachedParticipatingGroups.entries()) {
            const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
            if (
              cleanSubj &&
              (cleanSubj === cleanSourceName ||
                cleanSubj.includes(cleanSourceName) ||
                cleanSourceName.includes(cleanSubj))
            ) {
              if (!rule.sourceJids) rule.sourceJids = [];
              if (!rule.sourceJids.includes(id)) {
                rule.sourceJids.push(id);
                rulesUpdated = true;
              }
              if (!rule.sourceJid) {
                rule.sourceJid = id;
                rulesUpdated = true;
              }
            }
          }
        }

        // Target group JID resolution
        const allTargetCandidates = [
          rule.targetGroup,
          ...(Array.isArray(rule.targetGroups) ? rule.targetGroups : []),
        ].flatMap((t) => (t ? t.split(',') : [])).map((t) => t.trim()).filter(Boolean);

        for (const tgtName of allTargetCandidates) {
          const cleanTargetName = tgtName
            .replace(/^\[WhatsApp\]\s*/i, '')
            .replace(/[^\p{L}\p{N}]/gu, '')
            .trim()
            .toLowerCase();

          if (!cleanTargetName) continue;

          for (const [id, subj] of cachedParticipatingGroups.entries()) {
            const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
            if (
              cleanSubj &&
              (cleanSubj === cleanTargetName ||
                cleanSubj.includes(cleanTargetName) ||
                cleanTargetName.includes(cleanSubj))
            ) {
              if (!rule.targetJids) rule.targetJids = [];
              if (!rule.targetJids.includes(id)) {
                rule.targetJids.push(id);
                rulesUpdated = true;
              }
              if (!rule.targetJid) {
                rule.targetJid = id;
                rulesUpdated = true;
              }
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
        // Temporarily back off for 3 minutes to respect WhatsApp limits
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

export async function getRealWhatsAppGroups(): Promise<RealGroupInfo[]> {
  if (!currentSocket || !state.isConnected) {
    return [];
  }
  try {
    const groupsMap = await refreshGroupCache(currentSocket);
    const result: RealGroupInfo[] = [];
    for (const [id, name] of groupsMap.entries()) {
      if (!id.endsWith('@newsletter')) {
        result.push({
          id,
          name,
          membersCount: 1,
          maxCapacity: 1024,
          inviteLink: `https://chat.whatsapp.com/`,
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

    // Get group subject from cache or WhatsApp
    let groupSubject = cachedParticipatingGroups.get(remoteJid) || '';
    if (!groupSubject) {
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

    // Match strictly with configured source rules (supports multiple source names)
    let matchedRule = rules.find((r) => {
      // 1. Direct JID match
      if (r.sourceJid && r.sourceJid === remoteJid) return true;
      if (r.sourceJids && Array.isArray(r.sourceJids) && r.sourceJids.includes(remoteJid)) return true;

      // 2. Name matching with fuzzy cleaning across all sourceNames
      const allCandidateSources = [
        r.sourceName,
        ...(Array.isArray(r.sourceNames) ? r.sourceNames : []),
      ].flatMap((s) => (s ? s.split(',') : [])).map((s) => s.trim()).filter(Boolean);

      const cleanSubject = groupSubject
        .replace(/[^\p{L}\p{N}]/gu, '')
        .trim()
        .toLowerCase();

      if (cleanSubject) {
        for (const src of allCandidateSources) {
          const cleanRuleName = src
            .replace(/^\[FONTE\]\s*/i, '')
            .replace(/^\[WhatsApp\]\s*/i, '')
            .replace(/^\[Telegram\]\s*/i, '')
            .replace(/[^\p{L}\p{N}]/gu, '')
            .trim()
            .toLowerCase();

          if (
            cleanRuleName &&
            (cleanSubject === cleanRuleName ||
              cleanSubject.includes(cleanRuleName) ||
              cleanRuleName.includes(cleanSubject))
          ) {
            // Auto-bind JID for instant future matching
            r.sourceJid = remoteJid;
            if (!r.sourceJids) r.sourceJids = [];
            if (!r.sourceJids.includes(remoteJid)) r.sourceJids.push(remoteJid);
            setActiveSourceRules(getActiveSourceRules());
            return true;
          }
        }
      }

      return false;
    });

    // Fallback: If there is only 1 active rule and the message comes from a WhatsApp group that is NOT the target group, match it!
    if (!matchedRule && rules.length === 1) {
      const singleRule = rules[0];
      const isTarget = singleRule.targetJid === remoteJid ||
        (singleRule.targetGroup && groupSubject.toLowerCase().includes(singleRule.targetGroup.toLowerCase()));
      if (!isTarget) {
        matchedRule = singleRule;
        matchedRule.sourceJid = remoteJid;
        if (!matchedRule.sourceJids) matchedRule.sourceJids = [];
        if (!matchedRule.sourceJids.includes(remoteJid)) matchedRule.sourceJids.push(remoteJid);
        setActiveSourceRules(getActiveSourceRules());
        console.log(`[Replica Zap] 🎯 Regra única combinada automaticamente com o grupo fonte (${groupSubject || remoteJid})!`);
      }
    }

    if (!matchedRule) {
      console.log(`[Listener WhatsApp] ℹ️ Mensagem ignorada: grupo "${groupSubject || remoteJid}" não é uma fonte monitorada ativa.`);
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

    // =========================================================================
    // FILTRO PRECOCE DE INSTÂNCIAS / MARKETPLACES ATIVOS (STOP INSTANTÂNEO)
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
      console.log(`[Replica Zap] 🚫 Mensagem descartada: Não contém links de produtos dos marketplaces suportados (apenas links concorrentes ou texto sem produto).`);
      return;
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
      } else if (lowerU.includes('amazon.') || lowerU.includes('amzn.to') || lowerU.includes('a.co')) {
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
        `[Replica Zap] 🚫 MENSAGEM BLOQUEADA: Todos os marketplaces detectados (${disabledListStr}) estão DESATIVADOS nas configurações.`
      );
      addReplicaLog({
        id: `log-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: groupSubject || matchedRule.sourceName,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawCaption,
        finalCaption: '',
        hasImage: !!imageMsg,
        imageSource: 'none',
        originalUrl: productCandidates[0],
        monetizedUrl: '',
        marketplace: disabledListStr,
        methodUsed: 'Filtro Precoce de Instâncias Ativas',
        status: 'skipped',
        errorMessage: `Marketplace ${disabledListStr} desativado. Mensagem bloqueada instantaneamente.`,
      });
      return;
    }

    // =========================================================
    // CHECAGEM ÚNICA (ESTOQUE + FOTO) - analisar_produto_meli
    // =========================================================
    const mensagem_veio_com_foto = !!imageMsg;
    let foto_capturada_meli: string | null = null;

    const isMeliMessage =
      /MLB[-]?\d+/i.test(rawCaption) ||
      /meli\.la/i.test(rawCaption) ||
      /mercadolivre\.com\.br/i.test(rawCaption);

    if (matchedRule.validateMeliStock !== false && (isMeliMessage || matchedRule.onlyMeliDeals)) {
      // 1. Fazemos a checagem única (Estoque + Foto)
      const dados_produto = await analisar_produto_meli(rawCaption);

      // 2. Verifica se é lixo/esgotado
      if (!dados_produto.valido) {
        console.log("Produto esgotado ou pausado. Ignorando...");
        addReplicaLog({
          id: `log-skip-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          sourceGroupName: groupSubject || matchedRule.sourceName,
          targetGroupName: matchedRule.targetGroup,
          originalText: rawCaption,
          finalCaption: '',
          hasImage: !!imageMsg,
          imageSource: 'none',
          status: 'error',
          errorMessage: dados_produto.motivo || 'Produto esgotado ou pausado. Ignorando...',
        });
        // continue (ignora o resto e pula para a próxima mensagem do grupo)
        return;
      }

      foto_capturada_meli = dados_produto.foto_url;
      console.log(`[Replica Zap] ✅ Produto válido e em estoque! Foto da API capturada: ${foto_capturada_meli || 'nenhuma'}`);
    }

    // 4. Download image buffer if image present
    let imageBuffer: Buffer | null = null;
    if (imageMsg && downloadContentFromMessage) {
      try {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        imageBuffer = Buffer.concat(chunks);
        console.log(`[Replica Zap] 📸 Imagem do produto baixada (${imageBuffer.length} bytes)!`);
      } catch (dlErr) {
        console.error('[Replica Zap] Falha ao baixar mídia da mensagem:', dlErr);
      }
    }

    // 5. Resolve target group JID
    let targetJid = matchedRule.targetJid;
    let targetSubject = matchedRule.targetGroup;

    if (!targetJid) {
      const cleanTargetName = matchedRule.targetGroup
        .replace(/[^\p{L}\p{N}]/gu, '')
        .trim()
        .toLowerCase();

      // Check cached groups first
      for (const [jid, subj] of cachedParticipatingGroups.entries()) {
        const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
        if (
          cleanSubj &&
          (cleanSubj === cleanTargetName ||
            cleanSubj.includes(cleanTargetName) ||
            cleanTargetName.includes(cleanSubj))
        ) {
          targetJid = jid;
          targetSubject = subj;
          matchedRule.targetJid = jid;
          break;
        }
      }

      // If not in cache, fetch fresh
      if (!targetJid) {
        const groupsMap = await refreshGroupCache(sock);
        for (const [jid, subj] of groupsMap.entries()) {
          const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
          if (
            cleanSubj &&
            (cleanSubj === cleanTargetName ||
              cleanSubj.includes(cleanTargetName) ||
              cleanTargetName.includes(cleanSubj))
          ) {
            targetJid = jid;
            targetSubject = subj;
            matchedRule.targetJid = jid;
            break;
          }
        }
      }

      if (targetJid) {
        matchedRule.sourceJid = remoteJid;
        setActiveSourceRules(getActiveSourceRules());
      }
    }

    // 6. Obtain official invite link of the destination group
    const customConfiguredLink = getVipGroupLink();
    let targetInviteLink = customConfiguredLink && customConfiguredLink !== DEFAULT_VIP_GROUP_LINK
      ? customConfiguredLink
      : '';

    if (!targetInviteLink) {
      const activeSock = currentSocket || sock;
      if (targetJid && activeSock && state.isConnected && typeof activeSock.groupInviteCode === 'function') {
        try {
          const inviteCode = await activeSock.groupInviteCode(targetJid);
          if (inviteCode) {
            targetInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            console.log(`[Replica Zap] 🔗 Link de convite oficial obtido para "${targetSubject}": ${targetInviteLink}`);
          }
        } catch (invErr: any) {
          console.warn(`[Replica Zap] Aviso ao obter groupInviteCode de ${targetJid}:`, invErr?.message);
        }
      }
    }

    if (!targetInviteLink) {
      targetInviteLink = customConfiguredLink || DEFAULT_VIP_GROUP_LINK;
    }

    // 7. Clean copy, monetize all product links and inject the destination group link
    const processed = await cleanAndMonetizeCompetitorMessage(
      rawCaption,
      OFFICIAL_USER_AFFILIATE_ID,
      targetInviteLink
    );

    // Strict Marketplace Connections Filter:
    // If the message has no product links or all detected marketplaces are disabled, STOP immediately!
    if (!processed.shouldForward) {
      console.log(
        `[Replica Zap] 🚫 MENSAGEM FILTRADA E NÃO REPLICADA: ${processed.blockReason || 'Marketplace desativado nas conexões.'}`
      );
      addReplicaLog({
        id: `log-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: groupSubject || matchedRule.sourceName,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawCaption,
        finalCaption: '',
        hasImage: !!imageMsg,
        imageSource: 'none',
        originalUrl: processed.originalUrl,
        monetizedUrl: '',
        marketplace: processed.marketplace || 'Desconhecido',
        methodUsed: 'Filtro de Conexões Ativas',
        status: 'skipped',
        errorMessage: processed.blockReason || 'Marketplace desativado nas conexões.',
      });
      return;
    }

    const {
      cleanedCopy,
      originalUrl,
      monetizedUrl,
      marketplace,
      methodUsed,
      isMeli,
      isOfficialMeliShort,
      requiresConversion,
      mlbId,
      pureProductUrl,
    } = processed;

    let finalCleanedCopy = cleanedCopy;
    let finalMonetizedUrl = monetizedUrl;

    // Automatic Direct Conversion for Mercado Livre:
    // If it's a Mercado Livre link and DOES NOT yet have an official meli.la short link:
    // Try instant background conversion via Python Cookies API.
    // If not yet converted, use the clean canonical product URL so copying NEVER stops!
    if (requiresConversion && pureProductUrl) {
      console.log(
        `[Conversor Meli Direct] 🔄 Tentando conversão instantânea via Cookies API para MLB: ${mlbId || 'MLB'}...`
      );

      try {
        const directConv = await convertMeliLinkViaCookies(pureProductUrl);
        if (directConv?.monetized_url && directConv.monetized_url.includes('meli.la')) {
          finalMonetizedUrl = directConv.monetized_url;
          finalCleanedCopy = finalCleanedCopy.replace(pureProductUrl, finalMonetizedUrl);
          if (mlbId) {
            setCustomMeliLink(mlbId, finalMonetizedUrl);
          }
          console.log(`[Conversor Meli Direct] 🎯 Link Oficial meli.la gerado em background: ${finalMonetizedUrl}`);
        } else {
          console.log(`[Conversor Meli Direct] 🚀 Usando URL canônica limpa do produto: ${pureProductUrl}`);
          finalMonetizedUrl = pureProductUrl;
        }
      } catch (convErr) {
        console.warn('[Conversor Meli Direct] Falha na chamada da Cookies API, utilizando URL canônica limpa:', convErr);
        finalMonetizedUrl = pureProductUrl;
      }
    }

    // 8. REGRA DE IMAGEM:
    // Se o grupo já mandou com foto -> usamos a foto original deles.
    // Quando o produto NÃO tiver imagem, faz toda a conversão e antes de enviar a mensagem espera ele carregar por si só a imagem que o próprio link gera!
    let imageSource: 'source-media' | 'auto-link-photo' | 'none' = imageBuffer ? 'source-media' : 'none';

    if (mensagem_veio_com_foto && imageBuffer) {
      console.log("O grupo já mandou com foto. Vamos usar a foto original deles.");
      imageSource = 'source-media';
    } else {
      console.log("O produto não tem imagem original. Conversão concluída! Aguardando o próprio link gerar e carregar a imagem antes de enviar...");

      // 1. Se capturou a foto direta da API oficial do ML (pictures[0])
      if (foto_capturada_meli && matchedRule.autoFetchProductImage !== false) {
        try {
          const photoRes = await fetch(foto_capturada_meli, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (photoRes.ok) {
            const ab = await photoRes.arrayBuffer();
            imageBuffer = Buffer.from(ab);
            imageSource = 'auto-link-photo';
            console.log(`[Replica Zap] 📸 Imagem principal da API do produto carregada (${imageBuffer.length} bytes)!`);
          }
        } catch (photoErr) {
          console.warn('[Replica Zap] Falha ao baixar foto da API do ML, aguardando imagem do link...', photoErr);
        }
      }

      // 2. Se ainda não carregou imagem, espera o próprio link (Mercado Livre, Shopee, Amazon, Magalu) carregar sua imagem por si só
      if (!imageBuffer && matchedRule.autoFetchProductImage !== false) {
        const candidateUrl = finalMonetizedUrl || pureProductUrl || originalUrl || monetizedUrl;
        if (candidateUrl) {
          console.log(`[Replica Zap] ⏳ Aguardando o link gerar a imagem do produto: "${candidateUrl}"...`);
          // Espera o link carregar e responder com sua imagem antes de enviar
          await new Promise((resolve) => setTimeout(resolve, 1800));

          try {
            const photoData = await fetchProductImageBuffer(candidateUrl);
            if (photoData?.buffer) {
              imageBuffer = photoData.buffer;
              imageSource = 'auto-link-photo';
              console.log(`[Replica Zap] ✅ Imagem gerada pelo próprio link carregada com sucesso (${imageBuffer.length} bytes)!`);
            }
          } catch (imgErr) {
            console.warn('[Replica Zap] Aviso ao extrair imagem do link:', imgErr);
          }
        }
      }
    }

    const foto_para_enviar = imageBuffer
      ? (mensagem_veio_com_foto ? 'usar_foto_do_whatsapp' : 'imagem_gerada_pelo_link')
      : 'sem_imagem';
    console.log(`[Replica Zap] Pronto para postar! Foto a ser usada: ${foto_para_enviar}`);

    // 9. Automatically dispatch to ALL Destination Groups (WhatsApp + Telegram)!
    const sendSock = currentSocket || sock;
    let allTargets: string[] = [];
    if (Array.isArray(matchedRule.targetGroups) && matchedRule.targetGroups.length > 0) {
      allTargets = matchedRule.targetGroups;
    } else if (matchedRule.targetGroup) {
      allTargets = matchedRule.targetGroup.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (targetSubject) {
      allTargets = [targetSubject];
    }

    let atLeastOneSent = false;
    const sendResults: string[] = [];

    for (let i = 0; i < allTargets.length; i++) {
      const tgt = allTargets[i];
      if (!tgt) continue;
      const platformHint = matchedRule.targetPlatforms?.[i];
      const isTg = isTelegramTarget(tgt, platformHint);

      if (isTg) {
        try {
          const directChatId = matchedRule.targetChatIds?.[i];
          const resolvedChatId = directChatId || resolveTelegramChatId(tgt);
          console.log(`[Replica Zap] ✈️ Enviando oferta para canal/grupo Telegram: "${tgt}" -> Chat ID: ${resolvedChatId}`);
          const tgRes = await sendTelegramMessage(
            resolvedChatId,
            finalCleanedCopy,
            imageBuffer
          );
          if (tgRes.success) {
            atLeastOneSent = true;
            sendResults.push(`Telegram: ${tgt} (${resolvedChatId})`);
            console.log(`[Replica Zap] ✅ Mensagem entregue no Telegram com sucesso (${tgt} -> ${resolvedChatId})!`);
          } else {
            sendResults.push(`Telegram (${tgt} -> ${resolvedChatId}) erro: ${tgRes.error}`);
            console.warn(`[Replica Zap] ❌ Telegram recusou envio (${tgt} -> ${resolvedChatId}):`, tgRes.error);
          }
        } catch (tgErr: any) {
          sendResults.push(`Telegram (${tgt}) erro: ${tgErr?.message}`);
          console.warn(`[Replica Zap] Erro ao enviar para Telegram (${tgt}):`, tgErr);
        }
        continue;
      }

      // WhatsApp target
      if (!sendSock || !state.isConnected) {
        console.warn(`[Replica Zap] WhatsApp desconectado ao tentar enviar mensagem para "${tgt}".`);
        sendResults.push(`WhatsApp (${tgt}) falha: Sessão desconectada`);
        continue;
      }

      let thisTargetJid = targetJid;
      if (!thisTargetJid || tgt !== matchedRule.targetGroup) {
        const cleanTgt = tgt.replace(/^\[WhatsApp\]\s*/i, '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
        for (const [jid, subj] of cachedParticipatingGroups.entries()) {
          const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
          if (cleanSubj && (cleanSubj === cleanTgt || cleanSubj.includes(cleanTgt) || cleanTgt.includes(cleanSubj))) {
            thisTargetJid = jid;
            break;
          }
        }
      }

      // Fallback 1: Fresh cache refresh from socket
      if (!thisTargetJid) {
        try {
          const freshMap = await refreshGroupCache(sendSock, true);
          const cleanTgt = tgt.replace(/^\[WhatsApp\]\s*/i, '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
          for (const [jid, subj] of freshMap.entries()) {
            const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
            if (cleanSubj && (cleanSubj === cleanTgt || cleanSubj.includes(cleanTgt) || cleanTgt.includes(cleanSubj))) {
              thisTargetJid = jid;
              matchedRule.targetJid = jid;
              setActiveSourceRules(getActiveSourceRules());
              break;
            }
          }
        } catch {}
      }

      // Fallback 2: If still not found by string, pick any participating group that is NOT the source group
      if (!thisTargetJid && cachedParticipatingGroups.size > 0) {
        for (const [jid, subj] of cachedParticipatingGroups.entries()) {
          if (jid !== remoteJid) {
            thisTargetJid = jid;
            console.log(`[Replica Zap] 🔄 Fallback de grupo de destino ativado: Usando grupo "${subj}" (${jid})`);
            break;
          }
        }
      }

      if (thisTargetJid) {
        try {
          let sentMsg: any;
          if (imageBuffer) {
            sentMsg = await sendSock.sendMessage(thisTargetJid, {
              image: imageBuffer,
              caption: finalCleanedCopy,
            });
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
          console.log(`[Replica Zap] ✅ Mensagem entregue no WhatsApp com sucesso (${tgt})!`);
        } catch (waErr: any) {
          sendResults.push(`WhatsApp (${tgt}) erro: ${waErr?.message || waErr}`);
          console.warn(`[Replica Zap] Erro ao enviar no WhatsApp (${tgt}):`, waErr?.message || waErr);
        }
      } else {
        sendResults.push(`WhatsApp (${tgt}): JID não encontrado`);
      }
    }

    // 10. Update counter & store event in log
    matchedRule.dealsCapturedToday = (matchedRule.dealsCapturedToday || 0) + 1;
    setActiveSourceRules(getActiveSourceRules());

    addReplicaLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      sourceGroupName: groupSubject || matchedRule.sourceName,
      targetGroupName: allTargets.join(', '),
      originalText: rawCaption,
      finalCaption: finalCleanedCopy,
      hasImage: !!imageBuffer,
      imageSource,
      originalUrl,
      monetizedUrl: finalMonetizedUrl,
      marketplace: marketplace || 'Mercado Livre',
      methodUsed: methodUsed || `Multi-Destino (${sendResults.join(' | ')})`,
      status: atLeastOneSent ? 'success' : 'error',
      errorMessage: atLeastOneSent ? undefined : sendResults.join(' | '),
    });

    console.log(
      `[Replica Zap] 🚀 SUCESSO: Oferta clonada e distribuída para ${allTargets.length} destino(s): [${allTargets.join(', ')}] (Foto: ${imageSource})!`
    );

    console.log(
      `[Replica Zap Automático] 🚀 Oferta clonada e enviada com sucesso para "${targetSubject}" com imagem: ${!!imageBuffer}!`
    );
  } catch (err: any) {
    console.error('[Replica Zap Automático] Erro no processamento e envio:', err);
  }
}

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
      const cleanSearch = params.targetGroupNameOrJid.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
      let foundJid: string | undefined;
      let foundSubj: string | undefined;
      for (const [jid, subj] of groupsMap.entries()) {
        const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
        if (cleanSubj && (cleanSubj === cleanSearch || cleanSubj.includes(cleanSearch) || cleanSearch.includes(cleanSubj))) {
          foundJid = jid;
          foundSubj = subj;
          break;
        }
      }
      if (foundJid) {
        targetJid = foundJid;
        targetSubject = foundSubj || params.targetGroupNameOrJid;
      } else {
        return {
          success: false,
          message: `Grupo de destino "${params.targetGroupNameOrJid}" não encontrado na sua conta.`,
        };
      }
    }

    let finalBuffer = params.imageBuffer;
    if (!finalBuffer && params.imageUrl) {
      try {
        const imgRes = await fetch(params.imageUrl);
        const arrayBuf = await imgRes.arrayBuffer();
        finalBuffer = Buffer.from(arrayBuf);
      } catch (imgErr) {
        console.warn('Falha ao baixar imagem por URL:', imgErr);
      }
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
            finalBuffer = photoData.buffer;
            console.log(`[Replica Zap] 📸 Imagem gerada pelo link anexada ao disparo direto: ${photoData.url}`);
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
 * Executa a Varredura Inteligente (Sweep) selecionando todos os produtos
 * e ofertas capturadas dos grupos fonte que ainda não foram enviados e enviando-os.
 */
export async function triggerFullSourceSweep(): Promise<{
  success: boolean;
  message: string;
  scannedRulesCount: number;
  productsFoundCount: number;
  forwardedCount: number;
  items: any[];
}> {
  console.log('[Sweep Motor] 🔍 Iniciando Varredura de Produtos nos Grupos Fonte...');
  const activeRules = getActiveSourceRules().filter((r) => r.status === 'monitoring');
  const pendingQueue = getPendingMeliQueue();
  const existingLogs = getReplicaLogs();

  let forwardedCount = 0;
  const processedItems: any[] = [];

  // 1. Process all pending queue offers (Mercado Livre deals waiting for approval or queue)
  if (pendingQueue.length > 0) {
    console.log(`[Sweep Motor] 📦 Encontrados ${pendingQueue.length} produtos em fila pendente. Disparando varredura...`);
    for (const pendingItem of [...pendingQueue]) {
      const res = await dispatchPendingMeliOffer(pendingItem.id, pendingItem.pureProductUrl);
      if (res.success) {
        forwardedCount++;
        processedItems.push({
          id: pendingItem.id,
          title: pendingItem.rawCaption.slice(0, 80) || 'Oferta em Destaque',
          marketplace: 'Mercado Livre',
          sourceGroup: pendingItem.sourceGroupName,
          targetGroup: pendingItem.targetGroupName,
          originalUrl: pendingItem.pureProductUrl,
          monetizedUrl: pendingItem.pureProductUrl,
          status: 'Enviado',
          timestamp: new Date().toLocaleTimeString('pt-BR'),
        });
      }
    }
  }

  // 2. Scan recent messages stored in messageHistory for any unforwarded offers from active source groups
  const keys = messageHistory.keys();
  console.log(`[Sweep Motor] 📜 Analisando ${keys.length} mensagens recentes em memória...`);

  for (const keyId of keys) {
    const rawMsg: any = messageHistory.get(keyId);
    if (!rawMsg || !rawMsg.key || !rawMsg.message) continue;

    const remoteJid = rawMsg.key.remoteJid;
    if (!remoteJid) continue;

    // Match against active source rules
    const matchedRules = activeRules.filter((rule) => {
      const sources = rule.sourceJids && rule.sourceJids.length > 0 ? rule.sourceJids : [rule.sourceJid || ''];
      const names = rule.sourceNames && rule.sourceNames.length > 0 ? rule.sourceNames : [rule.sourceName || ''];
      return sources.includes(remoteJid) || names.some((n) => remoteJid.includes(n));
    });

    if (matchedRules.length > 0) {
      // Check if this message was already logged as forwarded
      const isAlreadyForwarded = existingLogs.some(
        (log: any) => log.originalText && rawMsg.message?.conversation?.includes(log.originalText.slice(0, 30))
      );

      if (!isAlreadyForwarded) {
        // Trigger forward processing for this message
        try {
          const downloadContent = (await import('@whiskeysockets/baileys')).downloadContentFromMessage;
          await handleAutomaticReplicaMessage(rawMsg, remoteJid, currentSocket, downloadContent);
          forwardedCount++;
          processedItems.push({
            id: keyId,
            title: rawMsg.message?.conversation?.slice(0, 80) || 'Produto Varredura',
            marketplace: 'E-commerce',
            sourceGroup: matchedRules[0]?.sourceName || 'Grupo Fonte',
            targetGroup: matchedRules[0]?.targetGroup || 'Grupo Destino',
            status: 'Enviado',
            timestamp: new Date().toLocaleTimeString('pt-BR'),
          });
        } catch (e) {
          console.warn('[Sweep Motor] Erro ao processar mensagem na varredura:', e);
        }
      }
    }
  }

  // 3. Return summary of items
  const allLogs = getReplicaLogs();
  const summaryItems = processedItems.length > 0 ? processedItems : allLogs.slice(0, 50).map((l: any) => ({
    id: l.id,
    title: l.originalText ? l.originalText.slice(0, 90) : 'Oferta de Produto',
    marketplace: l.marketplace || 'Mercado Livre',
    sourceGroup: l.sourceGroupName,
    targetGroup: l.targetGroupName,
    originalUrl: l.originalUrl,
    monetizedUrl: l.monetizedUrl,
    status: l.status === 'success' ? 'Enviado' : 'Pendente',
    timestamp: l.timestamp,
  }));

  console.log(`[Sweep Motor] ✅ Varredura finalizada. ${forwardedCount} novos produtos enviados.`);

  return {
    success: true,
    message: forwardedCount > 0
      ? `Varredura concluída! ${forwardedCount} produtos foram selecionados e enviados para os grupos de destino.`
      : `Varredura concluída! Todos os produtos dos grupos fonte foram analisados e sincronizados com sucesso.`,
    scannedRulesCount: activeRules.length,
    productsFoundCount: summaryItems.length,
    forwardedCount,
    items: summaryItems,
  };
}


