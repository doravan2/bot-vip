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
  registerTelegramIncomingHandler,
} from './telegramService.ts';
import { isWatermarkActiveForGroup } from './watermarkAiService.ts';
import { applyChatFilter } from './chatFilterService.ts';

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
 * Utiliza Raw Query de baixo nível direto aos servidores da Meta (IQ Newsletter) + fallbacks
 */
export async function getWhatsAppChannels(): Promise<RealGroupInfo[]> {
  if (!currentSocket || !state.isConnected) {
    console.warn('[Baileys] Socket não conectado. Impossível buscar canais.');
    return [];
  }

  const channelsResult: RealGroupInfo[] = [];
  const processedJids = new Set<string>();

  // Helper para adicionar canal sem duplicatas e padronizar
  const addChannel = (jid: string, rawName?: string, subscribersCount?: number) => {
    if (!jid) return;
    let cleanJid = jid;
    if (!cleanJid.includes('@')) cleanJid = `${cleanJid}@newsletter`;
    if (cleanJid.includes('@g.us')) cleanJid = cleanJid.replace('@g.us', '@newsletter');
    if (!cleanJid.endsWith('@newsletter') || processedJids.has(cleanJid)) return;

    processedJids.add(cleanJid);
    const name = rawName && rawName.trim() && rawName !== 'undefined' ? rawName.trim() : 'Canal do WhatsApp';
    cachedParticipatingGroups.set(cleanJid, name);

    channelsResult.push({
      id: cleanJid,
      name,
      membersCount: subscribersCount || 1000,
      maxCapacity: 1000000,
      inviteLink: `https://whatsapp.com/channel/`,
    });
  };

  console.log('--- FORÇANDO BUSCA DE CANAIS (RAW QUERY) ---');

  // 1. RAW QUERY de baixo nível direto aos servidores do WhatsApp
  try {
    const result = await currentSocket.query({
      tag: 'iq',
      attrs: {
        type: 'get',
        xmlns: 'newsletter',
        to: '@s.whatsapp.net',
      },
      content: [
        { tag: 'subscriptions', attrs: {} }
      ]
    });

    console.log('[Baileys-Raw] Resposta bruta recebida da Meta!');

    if (result && result.content && Array.isArray(result.content)) {
      const subscriptions = result.content.find((c: any) => c.tag === 'subscriptions');

      if (subscriptions && subscriptions.content && Array.isArray(subscriptions.content)) {
        for (const node of subscriptions.content) {
          if (node.tag === 'newsletter') {
            let id = node.attrs?.id || node.attrs?.jid;
            let name = 'Canal Desconhecido';

            if (node.content && Array.isArray(node.content)) {
              const nameNode = node.content.find((c: any) => c.tag === 'name' || c.tag === 'subject');
              if (nameNode && nameNode.content) {
                if (Buffer.isBuffer(nameNode.content)) {
                  name = nameNode.content.toString('utf-8');
                } else if (typeof nameNode.content === 'string') {
                  name = nameNode.content;
                } else if (Array.isArray(nameNode.content)) {
                  name = nameNode.content.map((item: any) => item?.content || item).join('');
                } else {
                  name = String(nameNode.content);
                }
              }
            }

            if (id) {
              addChannel(id, name);
            }
          }
        }
      }
    }
    console.log(`[Baileys-Raw] SUCESSO! Encontrados ${channelsResult.length} canais via Raw Query!`);
  } catch (error: any) {
    console.error('[Baileys-Erro] Falha na Raw Query de Canais:', error?.message || error);
  }

  // 2. FETCH ATIVO COMPLEMENTAR: sock.newsletterSubscribed()
  if (typeof (currentSocket as any).newsletterSubscribed === 'function') {
    try {
      const rawNewsletters = await (currentSocket as any).newsletterSubscribed();
      if (Array.isArray(rawNewsletters)) {
        for (const nl of rawNewsletters) {
          const jid = nl?.id || nl?.jid || nl?.newsletterJid || nl?.key?.remoteJid;
          const name =
            nl?.name ||
            nl?.subject ||
            nl?.thread_metadata?.name?.text ||
            nl?.thread_meta?.name?.text ||
            nl?.viewer_metadata?.title ||
            nl?.viewer_meta?.title;
          const subscribers =
            nl?.subscribers ||
            nl?.subscribers_count ||
            nl?.thread_metadata?.subscribers_count;

          if (jid) {
            addChannel(jid, name, Number(subscribers));
          }
        }
      }
    } catch (err: any) {
      console.warn('[Baileys Newsletter] Erro complementar ao chamar newsletterSubscribed():', err?.message || err);
    }
  }

  // 3. FALLBACK DE PROTOCOLO: Caches locais de chats
  try {
    const groupsMap = await refreshGroupCache(currentSocket);
    for (const [id, name] of groupsMap.entries()) {
      if (id.endsWith('@newsletter')) {
        addChannel(id, name);
      }
    }

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
    console.warn('[Baileys Newsletter] Exceção no fallback de chats:', fallbackErr?.message || fallbackErr);
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
 * Safely downloads media from a WhatsApp message without throwing 'Cannot derive from empty media key'
 * Handles both encrypted group messages and unencrypted channels/newsletters CDN URLs.
 */
async function downloadWhatsAppMediaSafe(
  imageMsg: any,
  downloadContentFromMessage: any,
  isChannel: boolean
): Promise<Buffer | null> {
  if (!imageMsg) return null;

  // Check if mediaKey is valid
  const rawKey = imageMsg.mediaKey;
  const hasValidMediaKey =
    rawKey !== null &&
    rawKey !== undefined &&
    ((Buffer.isBuffer(rawKey) || rawKey instanceof Uint8Array) ? rawKey.length > 0 : typeof rawKey === 'string' ? rawKey.trim().length > 0 : false);

  // 1. If it's a channel/newsletter or has no valid media key, attempt direct CDN URL fetch if available
  if (isChannel || !hasValidMediaKey) {
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
            console.log(`[Replica Zap] 📸 Imagem pública de canal/newsletter baixada via CDN direta (${ab.byteLength} bytes)!`);
            return Buffer.from(ab);
          }
        }
      } catch (directErr) {
        console.log('[Replica Zap] Aviso ao tentar download direto via URL CDN:', directErr);
      }
    }

    if (!hasValidMediaKey) {
      console.log('[Replica Zap] ℹ️ Mídia sem chave de criptografia (mediaKey vazia, ex: canal ou newsletter pública). A foto do produto será obtida automaticamente do link oficial.');
      return null;
    }
  }

  // 2. Encrypted stream download via Baileys if mediaKey is valid
  if (downloadContentFromMessage && hasValidMediaKey) {
    try {
      const stream = await downloadContentFromMessage(imageMsg, 'image');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const finalBuffer = Buffer.concat(chunks);
      if (finalBuffer.length > 0) {
        console.log(`[Replica Zap] 📸 Imagem do produto baixada e decodificada (${finalBuffer.length} bytes)!`);
        return finalBuffer;
      }
    } catch (dlErr: any) {
      const errMsg = String(dlErr?.message || dlErr);
      if (errMsg.includes('Cannot derive from empty media key') || errMsg.includes('empty media key')) {
        console.log('[Replica Zap] ℹ️ MediaKey vazio no cabeçalho. A foto do produto será gerada automaticamente pelo link da oferta.');
      } else {
        console.warn('[Replica Zap] Aviso ao decodificar imagem da mensagem:', errMsg);
      }
    }
  }

  // 3. Fallback: Check if thumbnail exists or direct URL can be used
  if (imageMsg.url && typeof imageMsg.url === 'string' && imageMsg.url.startsWith('http')) {
    try {
      const res = await fetch(imageMsg.url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 100) {
          return Buffer.from(ab);
        }
      }
    } catch {}
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
  matchedRule: ActiveSourceRule;
  rawCaption: string;
  imageBuffer: Buffer | null;
  sourceDisplayTitle: string;
  sourcePlatform: 'WhatsApp' | 'Telegram';
  remoteJid?: string;
}): Promise<{ success: boolean; sendResults: string[]; message?: string }> {
  const { matchedRule, rawCaption, sourceDisplayTitle, sourcePlatform, remoteJid } = params;
  let imageBuffer = params.imageBuffer;

  try {
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
    // 4.1 APLICAR FILTRO DE CHAT (Remover frases, chamadas e linhas indesejadas)
    // =========================================================
    finalCleanedCopy = applyChatFilter(
      finalCleanedCopy,
      sourceDisplayTitle,
      matchedRule.sourceName,
      matchedRule.targetGroup,
      ...(Array.isArray(matchedRule.targetGroups) ? matchedRule.targetGroups : [])
    );

    // =========================================================
    // =========================================================
    // 5. REGRA DE IMAGEM & FILTRO ANTI-MARCA D'ÁGUA (Substituir por Foto Limpa HD Oficial)
    // =========================================================
    let imageSource: 'source-media' | 'auto-link-photo' | 'none' = imageBuffer ? 'source-media' : 'none';

    // Checa se o Filtro Anti-Marca d'Água está ativo especificamente para este grupo de atuação
    const isFilterActiveForThisGroup =
      isWatermarkActiveForGroup(sourceDisplayTitle) ||
      isWatermarkActiveForGroup(matchedRule.sourceName || '') ||
      isWatermarkActiveForGroup(matchedRule.targetGroup || '') ||
      (Array.isArray(matchedRule.targetGroups) && matchedRule.targetGroups.some((g) => isWatermarkActiveForGroup(g)));

    if (mensagem_veio_com_foto && imageBuffer && isFilterActiveForThisGroup) {
      console.log(`[Filtro Anti-Marca d'Água] 🛡️ Filtro ativo para o grupo [${sourceDisplayTitle}]! Buscando Foto Limpa HD Oficial do marketplace...`);
      const candidateUrl = finalMonetizedUrl || pureProductUrl || originalUrl || monetizedUrl;
      let cleanPhotoFound = false;

      // 1. Tentar foto original da API do produto Mercado Livre
      if (foto_capturada_meli) {
        try {
          const photoRes = await fetch(foto_capturada_meli, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (photoRes.ok) {
            const ab = await photoRes.arrayBuffer();
            imageBuffer = Buffer.from(ab);
            imageSource = 'auto-link-photo';
            cleanPhotoFound = true;
            console.log(`[Filtro Anti-Marca d'Água] ✅ Foto substituída pela Foto Limpa HD Oficial da API (${imageBuffer.length} bytes)!`);
          }
        } catch (apiPhotoErr) {
          console.warn("[Filtro Anti-Marca d'Água] Erro ao baixar foto limpa da API:", apiPhotoErr);
        }
      }

      // 2. Se não achou na API do ML, busca a foto oficial direto da página do marketplace
      if (!cleanPhotoFound && candidateUrl) {
        try {
          const photoData = await fetchProductImageBuffer(candidateUrl);
          if (photoData?.buffer) {
            imageBuffer = photoData.buffer;
            imageSource = 'auto-link-photo';
            cleanPhotoFound = true;
            console.log(`[Filtro Anti-Marca d'Água] ✅ Foto substituída pela Foto Limpa HD Oficial direto da página do marketplace (${imageBuffer.length} bytes)!`);
          }
        } catch (pagePhotoErr) {
          console.warn("[Filtro Anti-Marca d'Água] Erro ao extrair foto limpa da página:", pagePhotoErr);
        }
      }

      if (!cleanPhotoFound) {
        console.log(`[Filtro Anti-Marca d'Água] ℹ️ Foto limpa não encontrada no link; mantendo mídia original.`);
      }
    } else if (mensagem_veio_com_foto && imageBuffer) {
      imageSource = 'source-media';
    } else {
      // 1. Foto capturada da API do Mercado Livre
      if (foto_capturada_meli && matchedRule.autoFetchProductImage !== false) {
        try {
          const photoRes = await fetch(foto_capturada_meli, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (photoRes.ok) {
            const ab = await photoRes.arrayBuffer();
            imageBuffer = Buffer.from(ab);
            imageSource = 'auto-link-photo';
            console.log(`[Replica Pipeline] 📸 Imagem da API do produto carregada (${imageBuffer.length} bytes)!`);
          }
        } catch (photoErr) {
          console.warn('[Replica Pipeline] Falha ao baixar foto da API do ML, tentando via link...', photoErr);
        }
      }

      // 2. Foto extraída por metatags OpenGraph do produto
      if (!imageBuffer && matchedRule.autoFetchProductImage !== false) {
        const candidateUrl = finalMonetizedUrl || pureProductUrl || originalUrl || monetizedUrl;
        if (candidateUrl) {
          console.log(`[Replica Pipeline] ⏳ Extraindo foto do produto do link: "${candidateUrl}"...`);
          try {
            const photoData = await fetchProductImageBuffer(candidateUrl);
            if (photoData?.buffer) {
              imageBuffer = photoData.buffer;
              imageSource = 'auto-link-photo';
              console.log(`[Replica Pipeline] ✅ Foto do produto extraída com sucesso (${imageBuffer.length} bytes)!`);
            }
          } catch (imgErr) {
            console.warn('[Replica Pipeline] Aviso ao extrair imagem do link:', imgErr);
          }
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

      let thisTargetJid = matchedRule.targetJid;
      const cleanTgt = tgt.replace(/^\[WhatsApp\]\s*/i, '').replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();

      // Buscar JID correspondente nos grupos participando
      for (const [jid, subj] of cachedParticipatingGroups.entries()) {
        const cleanSubj = subj.replace(/[^\p{L}\p{N}]/gu, '').trim().toLowerCase();
        if (cleanSubj && (cleanSubj === cleanTgt || cleanSubj.includes(cleanTgt) || cleanTgt.includes(cleanSubj))) {
          thisTargetJid = jid;
          break;
        }
      }

      // Fallback: atualizar cache de grupos
      if (!thisTargetJid) {
        try {
          const freshMap = await refreshGroupCache(sendSock, true);
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

      // Se ainda não encontrou, usa qualquer grupo de destino conectado
      if (!thisTargetJid && cachedParticipatingGroups.size > 0) {
        for (const [jid] of cachedParticipatingGroups.entries()) {
          if (!remoteJid || jid !== remoteJid) {
            thisTargetJid = jid;
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
          console.log(`[Replica Pipeline] ✅ Mensagem entregue no WhatsApp com sucesso (${tgt} -> ${thisTargetJid})!`);
        } catch (waErr: any) {
          sendResults.push(`WhatsApp (${tgt}) erro: ${waErr?.message || waErr}`);
          console.warn(`[Replica Pipeline] Erro ao enviar no WhatsApp (${tgt}):`, waErr?.message || waErr);
        }
      } else {
        sendResults.push(`WhatsApp (${tgt}): JID não encontrado`);
      }
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
    const activeRules = allAvailable.filter((r) => r.status === 'monitoring' && r.autoForward);
    const candidateRules = activeRules.length > 0 ? activeRules : allAvailable;

    if (candidateRules.length === 0) {
      console.log('[Telegram -> WhatsApp] ℹ️ Nenhuma regra cadastrada nas Fontes.');
      return { success: false, error: 'Nenhuma regra cadastrada nas Fontes.' };
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

        if (
          (cleanChatTitle && (cleanChatTitle === cleanSrc || cleanChatTitle.includes(cleanSrc) || cleanSrc.includes(cleanChatTitle))) ||
          (cleanUsername && (cleanUsername === cleanSrc || cleanUsername.includes(cleanSrc) || cleanSrc.includes(cleanUsername))) ||
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

    // Fallback: If only 1 rule exists and involves Telegram or is the only rule, match it!
    if (!matchedRule && candidateRules.length === 1) {
      const single = candidateRules[0];
      const isTg =
        single.platform === 'Telegram' ||
        single.platform === 'Misto' ||
        single.sourcePlatforms?.includes('Telegram') ||
        single.sourceName.toLowerCase().includes('telegram') ||
        single.sourceName.includes('@');

      if (isTg) {
        matchedRule = single;
        console.log(`[Telegram -> WhatsApp] 🎯 Regra única com Telegram combinada automaticamente: "${matchedRule.sourceName}"`);
      }
    }

    if (!matchedRule) {
      console.log(`[Telegram -> WhatsApp] ℹ️ Mensagem recebida de "${params.chatTitle}" (${params.chatId}), mas não há regra fonte configurada com esse canal/grupo.`);
      return { success: false, error: `Nenhuma regra configurada para a fonte do Telegram: ${params.chatTitle || params.chatId}` };
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


