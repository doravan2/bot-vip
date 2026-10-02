import path from 'path';
import fs from 'fs';
import { normalizeImageBuffer } from './imagePipeline.ts';

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export interface TelegramBotAccount {
  id: string; // Bot ID as string
  botToken: string;
  botInfo: TelegramBotInfo;
  status: 'connected' | 'disconnected';
  createdAt: string;
}

export interface TelegramChannelItem {
  id: string;
  name: string;       // e.g. "Atacado Game Ofertas"
  chatId: string;     // e.g. "@atacadogameofertas" or "-1001234567890"
  username?: string;  // e.g. "atacadogameofertas"
  type?: 'channel' | 'group' | 'supergroup' | 'chat';
  inviteLink?: string;
  createdAt: string;
}

export interface TelegramConfig {
  botToken: string;
  status: 'connected' | 'disconnected' | 'unconfigured';
  botInfo?: TelegramBotInfo | null;
  defaultChatId?: string;
  bots?: TelegramBotAccount[];
  activeBotId?: string;
  lastTested?: string;
  lastError?: string;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const configFile = path.resolve(storageDir, 'telegram_config.json');
const channelsFile = path.resolve(storageDir, 'telegram_channels.json');

const DEFAULT_CONFIG: TelegramConfig = {
  botToken: '',
  status: 'disconnected',
  botInfo: null,
  defaultChatId: '',
  bots: [],
};

export function cleanTelegramChatId(input: string): string {
  let cleaned = (input || '').trim();
  // Remove wrapping quotes, brackets or whitespace
  cleaned = cleaned.replace(/^['"]|['"]$/g, '').trim();

  // If URL like https://t.me/atacadogameofertas or t.me/atacadogameofertas
  if (/^https?:\/\/t\.me\//i.test(cleaned) || /^t\.me\//i.test(cleaned)) {
    cleaned = cleaned
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^t\.me\//i, '')
      .split('/')[0]
      .split('?')[0];
    if (cleaned && !cleaned.startsWith('@') && !/^-?\d+$/.test(cleaned)) {
      cleaned = '@' + cleaned;
    }
  } else if (!cleaned.startsWith('@') && !/^-?\d+$/.test(cleaned) && !cleaned.startsWith('-100')) {
    cleaned = '@' + cleaned;
  }
  return cleaned;
}

/**
 * Resolves any target name, @username, or chat ID to the valid Telegram Chat ID
 */
export function resolveTelegramChatId(input: string): string {
  if (!input) return '';
  let raw = input.trim();
  raw = raw.replace(/^\[Telegram\]\s*/i, '').trim();

  // 1. If text contains a parenthesized @chatId, e.g. "Atacado Game Ofertas (@atacadogameofertas)"
  const parenMatch = raw.match(/\((@[A-Za-z0-9_]+|-100\d+)\)/);
  if (parenMatch) {
    return cleanTelegramChatId(parenMatch[1]);
  }

  // 2. Check if already starts with @ or -100 or numeric
  if (raw.startsWith('@') || raw.startsWith('-100') || /^-?\d+$/.test(raw) || /^https?:\/\/t\.me\//i.test(raw) || /^t\.me\//i.test(raw)) {
    return cleanTelegramChatId(raw);
  }

  // 3. Search in registered channels by name, chatId or username
  const channels = getTelegramChannels();
  const cleanInput = raw.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const c of channels) {
    if (c.chatId && c.chatId.toLowerCase() === raw.toLowerCase()) {
      return cleanTelegramChatId(c.chatId);
    }
    if (c.name && c.name.toLowerCase() === raw.toLowerCase()) {
      return cleanTelegramChatId(c.chatId);
    }
    if (c.username && c.username.toLowerCase() === raw.toLowerCase()) {
      return cleanTelegramChatId(c.chatId);
    }
    const cleanChanName = (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanChanName && (cleanChanName === cleanInput || cleanChanName.includes(cleanInput) || cleanInput.includes(cleanChanName))) {
      return cleanTelegramChatId(c.chatId);
    }
    const cleanChanUser = (c.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanChanUser && (cleanChanUser === cleanInput || cleanChanUser.includes(cleanInput) || cleanInput.includes(cleanChanUser))) {
      return cleanTelegramChatId(c.chatId);
    }
  }

  // 4. Fallback to defaultChatId if configured
  const config = getTelegramConfig();
  if (config.defaultChatId) {
    return cleanTelegramChatId(config.defaultChatId);
  }

  return cleanTelegramChatId(raw);
}

/**
 * Checks if a target string corresponds to a Telegram channel or group
 */
export function isTelegramTarget(tgt: string, platformHint?: string): boolean {
  if (!tgt) return false;
  if (platformHint && platformHint.toLowerCase() === 'whatsapp') return false;
  if (platformHint && platformHint.toLowerCase() === 'telegram') return true;
  // WhatsApp JIDs, prefixes or newsletters are always WhatsApp
  if (
    tgt.endsWith('@g.us') ||
    tgt.endsWith('@newsletter') ||
    tgt.startsWith('[WhatsApp]') ||
    tgt.startsWith('[WA]')
  ) {
    return false;
  }

  if (tgt.startsWith('[Telegram]')) {
    return true;
  }

  const raw = tgt.replace(/^\[(WhatsApp|Telegram)\]\s*/i, '').trim();

  // Telegram direct formats (-100... ID, t.me link, or @username)
  if (
    raw.startsWith('-100') ||
    raw.includes('t.me/') ||
    (raw.startsWith('@') && !raw.endsWith('@newsletter') && !raw.endsWith('@g.us'))
  ) {
    return true;
  }

  const channels = getTelegramChannels();
  const cleanTgt = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanTgt) return false;

  return channels.some((c) => {
    const cleanName = (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanId = (c.chatId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanUser = (c.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      (cleanName && cleanName === cleanTgt) ||
      (cleanId && (cleanId === cleanTgt || cleanId === `@${cleanTgt}`)) ||
      (cleanUser && (cleanUser === cleanTgt || cleanUser === `@${cleanTgt}`))
    );
  });
}

export function getTelegramConfig(): TelegramConfig {
  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        bots: parsed.bots || [],
      };
    }
  } catch (err) {
    console.error('[TelegramService] Erro ao ler telegram_config.json:', err);
  }
  return DEFAULT_CONFIG;
}

export function saveTelegramConfig(config: Partial<TelegramConfig>): TelegramConfig {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const current = getTelegramConfig();
    const updated: TelegramConfig = {
      ...current,
      ...config,
    };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('[TelegramService] Erro ao salvar telegram_config.json:', err);
    throw err;
  }
}

/**
 * Validates the bot token with Telegram official API (getMe)
 */
export async function validateTelegramToken(botToken: string): Promise<{ success: boolean; botInfo?: TelegramBotInfo; error?: string }> {
  const token = botToken.trim();
  if (!token) {
    return { success: false, error: 'Token do BotFather não pode estar vazio.' };
  }

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return {
      success: false,
      error: 'Formato de token inválido. O token deve seguir o padrão: 1234567890:ABCDEFGhijklmnopqrstuvwxyz fornecido pelo @BotFather.',
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      headers: {
        'User-Agent': 'BOT-VIP-OFERTAS/1.0',
      },
    });

    const data: any = await res.json();
    if (data.ok && data.result) {
      return {
        success: true,
        botInfo: data.result as TelegramBotInfo,
      };
    } else {
      return {
        success: false,
        error: data.description || 'Token inválido ou recusado pelos servidores do Telegram.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Erro ao conectar aos servidores do Telegram: ${err.message || err}`,
    };
  }
}

/**
 * Connects and verifies a Telegram Bot token, supports multiple bots in config
 */
export async function connectTelegramBot(botToken: string, defaultChatId?: string): Promise<{ success: boolean; config: TelegramConfig; message: string }> {
  const validation = await validateTelegramToken(botToken);

  if (!validation.success || !validation.botInfo) {
    const updated = saveTelegramConfig({
      status: 'disconnected',
      lastError: validation.error,
    });
    return {
      success: false,
      config: updated,
      message: validation.error || 'Falha ao validar token do Telegram.',
    };
  }

  const current = getTelegramConfig();
  const botInfo = validation.botInfo;
  const botIdStr = String(botInfo.id);

  // Manage multiple bots list
  const existingBots = current.bots || [];
  const updatedBots: TelegramBotAccount[] = existingBots.filter(b => b.id !== botIdStr);
  updatedBots.push({
    id: botIdStr,
    botToken: botToken.trim(),
    botInfo,
    status: 'connected',
    createdAt: new Date().toLocaleTimeString('pt-BR'),
  });

  const updated = saveTelegramConfig({
    botToken: botToken.trim(),
    status: 'connected',
    botInfo,
    defaultChatId: defaultChatId !== undefined ? cleanTelegramChatId(defaultChatId) : current.defaultChatId,
    bots: updatedBots,
    activeBotId: botIdStr,
    lastTested: new Date().toLocaleTimeString('pt-BR'),
    lastError: undefined,
  });

  console.log(`[TelegramService] 🚀 Bot Telegram @${validation.botInfo.username} conectado com sucesso!`);

  // Start message listening polling immediately
  startTelegramPolling().catch((e) => console.warn('[TelegramService] Erro ao iniciar polling:', e));

  return {
    success: true,
    config: updated,
    message: `Bot @${validation.botInfo.username} (${validation.botInfo.first_name}) conectado com sucesso! Escuta de mensagens iniciada.`,
  };
}

/**
 * Disconnects a specific Telegram bot or all bots
 */
export function disconnectTelegramBot(botId?: string): TelegramConfig {
  const current = getTelegramConfig();
  let updatedBots = current.bots || [];

  if (botId) {
    updatedBots = updatedBots.filter(b => b.id !== botId);
  } else {
    updatedBots = [];
  }

  const nextActive = updatedBots.find(b => b.status === 'connected');

  const updated = saveTelegramConfig({
    botToken: nextActive ? nextActive.botToken : '',
    status: nextActive ? 'connected' : 'disconnected',
    botInfo: nextActive ? nextActive.botInfo : null,
    bots: updatedBots,
    activeBotId: nextActive ? nextActive.id : undefined,
    lastTested: new Date().toLocaleTimeString('pt-BR'),
  });

  if (!nextActive) {
    stopTelegramPolling();
  }

  console.log(`[TelegramService] 🛑 Bot Telegram ${botId || 'todos'} desconectado.`);
  return updated;
}

/**
 * Sets a specific connected bot as active
 */
export function setActiveTelegramBot(botId: string): TelegramConfig {
  const current = getTelegramConfig();
  const bot = (current.bots || []).find(b => b.id === botId);
  if (!bot) {
    throw new Error('Bot não encontrado.');
  }

  const updated = saveTelegramConfig({
    botToken: bot.botToken,
    status: 'connected',
    botInfo: bot.botInfo,
    activeBotId: bot.id,
    lastTested: new Date().toLocaleTimeString('pt-BR'),
  });

  console.log(`[TelegramService] 🔄 Bot ativo alterado para @${bot.botInfo.username}`);
  // Restart polling with new active token
  stopTelegramPolling();
  startTelegramPolling().catch(() => {});
  return updated;
}

// ============================================================================
// TELEGRAM CHANNELS & GROUPS STORAGE (Matches Image 2)
// ============================================================================

export function getTelegramChannels(): TelegramChannelItem[] {
  try {
    if (fs.existsSync(channelsFile)) {
      const raw = fs.readFileSync(channelsFile, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.error('[TelegramService] Erro ao ler telegram_channels.json:', err);
  }
  return [
    {
      id: 'tg-1',
      name: 'Atacado Game Ofertas',
      chatId: '@atacadogameofertas',
      username: 'atacadogameofertas',
      createdAt: 'Hoje',
    },
    {
      id: 'tg-2',
      name: 'Atacado Vip Ofertas',
      chatId: '@atacadovipofertas1',
      username: 'atacadovipofertas1',
      createdAt: 'Hoje',
    },
  ];
}

export function saveTelegramChannels(channels: TelegramChannelItem[]): TelegramChannelItem[] {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2), 'utf-8');
    return channels;
  } catch (err) {
    console.error('[TelegramService] Erro ao salvar telegram_channels.json:', err);
    throw err;
  }
}

/**
 * Resolves title & details of a Telegram chat using getChat API if bot connected
 */
export async function resolveTelegramChatInfo(chatIdInput: string): Promise<{ title: string; username?: string; id?: number; type?: string }> {
  const cleanId = cleanTelegramChatId(chatIdInput);
  const config = getTelegramConfig();

  if (config.botToken && config.status === 'connected') {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getChat?chat_id=${encodeURIComponent(cleanId)}`);
      const data: any = await res.json();
      if (data.ok && data.result) {
        return {
          title: data.result.title || data.result.username || cleanId,
          username: data.result.username,
          id: data.result.id,
          type: data.result.type,
        };
      }
    } catch {}
  }

  // Fallback if bot API couldn't resolve or chat is pending admin
  const derivedTitle = cleanId
    .replace(/^@/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  return {
    title: derivedTitle || cleanId,
    username: cleanId.startsWith('@') ? cleanId.replace(/^@/, '') : undefined,
  };
}

export async function addTelegramChannel(rawInput: string, customName?: string): Promise<{ success: boolean; channel?: TelegramChannelItem; error?: string }> {
  const cleanId = cleanTelegramChatId(rawInput);
  if (!cleanId) {
    return { success: false, error: 'Chat ID ou @username inválido.' };
  }

  const channels = getTelegramChannels();
  if (channels.some(c => c.chatId.toLowerCase() === cleanId.toLowerCase())) {
    return { success: false, error: 'Este grupo/canal do Telegram já está cadastrado.' };
  }

  const resolved = await resolveTelegramChatInfo(cleanId);
  const newChannel: TelegramChannelItem = {
    id: `tg-chan-${Date.now()}`,
    name: customName?.trim() || resolved.title,
    chatId: cleanId,
    username: resolved.username || (cleanId.startsWith('@') ? cleanId.replace(/^@/, '') : undefined),
    type: (resolved.type as any) || 'channel',
    inviteLink: cleanId.startsWith('@') ? `https://t.me/${cleanId.replace(/^@/, '')}` : undefined,
    createdAt: new Date().toLocaleTimeString('pt-BR'),
  };

  channels.push(newChannel);
  saveTelegramChannels(channels);

  return { success: true, channel: newChannel };
}

export function removeTelegramChannel(id: string): TelegramChannelItem[] {
  const channels = getTelegramChannels().filter(c => c.id !== id && c.chatId !== id);
  return saveTelegramChannels(channels);
}

/**
 * Detects actual image MIME type and file extension from buffer magic bytes
 */
function detectImageMime(buffer: Buffer): { mime: string; ext: string; isValid: boolean } {
  if (!buffer || buffer.length < 16) {
    return { mime: 'application/octet-stream', ext: 'bin', isValid: false };
  }
  // Check if buffer is HTML/text error page (Cloudflare / 403 / 503)
  const headerSlice = buffer.subarray(0, 80).toString('utf-8').trim().toLowerCase();
  if (
    headerSlice.startsWith('<!doctype') ||
    headerSlice.startsWith('<html') ||
    headerSlice.startsWith('<?xml') ||
    headerSlice.startsWith('{') ||
    headerSlice.includes('<title>403') ||
    headerSlice.includes('<title>503') ||
    headerSlice.includes('<title>access denied')
  ) {
    return { mime: 'text/html', ext: 'html', isValid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg', isValid: true };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png', isValid: true };
  }
  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp', isValid: true };
  }
  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif', isValid: true };
  }

  return { mime: 'image/jpeg', ext: 'jpg', isValid: true };
}

/**
 * Normalizes any image buffer (WebP, PNG, AVIF, TIFF, or non-standard JPEG) into a
 * clean, 100% compliant baseline JPEG that Telegram Bot API sendPhoto will process successfully.
 */
async function ensureTelegramPhotoBuffer(rawBuffer: Buffer): Promise<{ buffer: Buffer; mime: string; ext: string } | null> {
  if (!rawBuffer || rawBuffer.length < 16) return null;

  // Check for HTML/text error response from CDN or proxy
  const headerSlice = rawBuffer.subarray(0, 80).toString('utf-8').trim().toLowerCase();
  if (
    headerSlice.startsWith('<!doctype') ||
    headerSlice.startsWith('<html') ||
    headerSlice.startsWith('<?xml') ||
    headerSlice.startsWith('{') ||
    headerSlice.includes('<title>403') ||
    headerSlice.includes('<title>503') ||
    headerSlice.includes('access denied')
  ) {
    return null;
  }

  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;
    const normalized = await sharp(rawBuffer)
      .rotate() // Auto-orient based on EXIF
      .flatten({ background: '#ffffff' }) // Ensure transparent channels (WebP/PNG) have clean white background
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    return {
      buffer: normalized,
      mime: 'image/jpeg',
      ext: 'jpg',
    };
  } catch {
    // If sharp could not decode, check magic bytes fallback
    const info = detectImageMime(rawBuffer);
    if (info.isValid) {
      return { buffer: rawBuffer, mime: info.mime, ext: info.ext };
    }
    return null;
  }
}

/**
 * Sends a text message or photo to a Telegram channel/group/chat (supports image URL or Buffer)
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  imageUrlOrBuffer?: string | Buffer | null
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const config = getTelegramConfig();
  if (config.status !== 'connected' || !config.botToken) {
    return { success: false, error: 'Bot do Telegram não está conectado. Configure o token em Conexões.' };
  }

  const token = config.botToken;
  const targetChat = resolveTelegramChatId(chatId) || cleanTelegramChatId(chatId) || config.defaultChatId;

  if (!targetChat) {
    return { success: false, error: 'Chat ID ou @nome_do_canal do Telegram não fornecido.' };
  }

  try {
    // Helper to safely truncate caption for photo (Telegram limit is 1024 chars)
    const safeCaption = text.length > 1020 ? text.substring(0, 1016) + '...' : text;

    // 1. Normalize image if provided (handles Buffer, base64 data URL, or HTTP URL)
    let photoJpgBuffer: Buffer | null = null;
    if (imageUrlOrBuffer) {
      try {
        photoJpgBuffer = await normalizeImageBuffer(imageUrlOrBuffer);
      } catch (normErr) {
        console.warn('[TelegramService] Erro ao normalizar buffer de imagem:', normErr);
      }
    }

    // 2. Send via sendPhoto if valid normalized baseline JPEG exists
    if (photoJpgBuffer && Buffer.isBuffer(photoJpgBuffer) && photoJpgBuffer.length > 200) {
      try {
        const formData = new FormData();
        formData.append('chat_id', targetChat);
        formData.append('caption', safeCaption);
        const blob = new Blob([new Uint8Array(photoJpgBuffer)], { type: 'image/jpeg' });
        formData.append('photo', blob, 'photo.jpg');

        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });
        const data: any = await res.json();
        if (data.ok && data.result) {
          return { success: true, messageId: data.result.message_id };
        } else {
          console.warn('[TelegramService] Aviso Telegram sendPhoto:', data.description);
          // If error was caption too long, try with truncated caption
          if (data.description && data.description.includes('caption is too long')) {
            const shorterFormData = new FormData();
            shorterFormData.append('chat_id', targetChat);
            shorterFormData.append('caption', text.slice(0, 900) + '...');
            shorterFormData.append('photo', blob, 'photo.jpg');
            const retryRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: 'POST',
              body: shorterFormData,
            });
            const retryData: any = await retryRes.json();
            if (retryData.ok && retryData.result) {
              return { success: true, messageId: retryData.result.message_id };
            }
          }
        }
      } catch (bufErr: any) {
        console.warn('[TelegramService] Falha ao enviar photo no Telegram:', bufErr?.message || bufErr);
      }
    }

    // 3. Fallback: Text send via sendMessage if no photo or photo send failed
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
      }),
    });
    const data: any = await res.json();
    if (data.ok && data.result) {
      return { success: true, messageId: data.result.message_id };
    } else {
      return { success: false, error: data.description || 'Erro ao enviar mensagem no Telegram.' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha de comunicação com a API do Telegram.' };
  }
}

// ============================================================================
// TELEGRAM INCOMING LISTENER & POLLING ENGINE (Telegram -> WhatsApp)
// ============================================================================

export type TelegramIncomingHandler = (params: {
  rawText: string;
  imageBuffer?: Buffer | null;
  chatId: string;
  chatTitle: string;
  chatUsername?: string;
  messageId?: number;
}) => Promise<{ success: boolean; ruleMatched?: string; targetsSent?: string[]; error?: string; message?: string }>;

let telegramIncomingHandler: TelegramIncomingHandler | null = null;
let isPollingActive = false;
let pollingAbortController: AbortController | null = null;
let lastUpdateId = 0;
let lastPollingHeartbeat = '';

export function registerTelegramIncomingHandler(handler: TelegramIncomingHandler): void {
  telegramIncomingHandler = handler;
  console.log('[TelegramService] 🔗 Manipulador de mensagens Telegram registrado com sucesso!');
}

export function isTelegramPollingRunning(): { active: boolean; lastHeartbeat: string; lastUpdateId: number } {
  return {
    active: isPollingActive,
    lastHeartbeat: lastPollingHeartbeat,
    lastUpdateId,
  };
}

/**
 * Downloads a photo or file from Telegram by file_id
 */
export async function downloadTelegramFile(botToken: string, fileId: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data: any = await res.json();
    if (data.ok && data.result?.file_path) {
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
      const fileRes = await fetch(fileUrl, {
        headers: { 'User-Agent': 'BOT-VIP-OFERTAS/1.0' },
      });
      if (fileRes.ok) {
        const ab = await fileRes.arrayBuffer();
        return Buffer.from(ab);
      }
    }
  } catch (err) {
    console.warn('[TelegramService] Falha ao baixar foto do Telegram:', err);
  }
  return null;
}

/**
 * Processes an incoming Telegram update (from polling OR webhook)
 */
export async function processTelegramUpdate(update: any): Promise<{ success: boolean; handled?: boolean; result?: any }> {
  if (!update) return { success: false, handled: false };

  // Telegram sends either channel_post (for channels) or message (for groups/supergroups/chats)
  const msg = update.channel_post || update.message || update.edited_channel_post || update.edited_message;
  if (!msg) return { success: true, handled: false };

  const chat = msg.chat;
  if (!chat) return { success: true, handled: false };

  // Filter out historical / delayed Telegram messages (> 90 seconds old)
  const msgDateSeconds = msg.date || msg.forward_date || 0;
  if (msgDateSeconds > 0) {
    const ageSeconds = Math.round((Date.now() - msgDateSeconds * 1000) / 1000);
    if (ageSeconds > 90) {
      console.log(`[TelegramService] ⏳ Mensagem antiga do Telegram ignorada (${ageSeconds}s atrás).`);
      return { success: true, handled: false };
    }
  }

  const chatId = String(chat.id);
  const chatTitle = chat.title || chat.username || String(chat.id);
  const chatUsername = chat.username;
  const rawText = msg.text || msg.caption || '';
  const messageId = msg.message_id;

  // If message has no text and no photo, ignore
  if (!rawText && !msg.photo && !msg.document) {
    return { success: true, handled: false };
  }

  console.log(`[TelegramService] 📩 Nova mensagem recebida no Telegram de "${chatTitle}" (${chatId}): "${rawText.slice(0, 60)}..."`);

  // Download photo if attached (Telegram sends multiple sizes, last one is highest resolution)
  let imageBuffer: Buffer | null = null;
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    if (largest?.file_id) {
      const config = getTelegramConfig();
      if (config.botToken) {
        imageBuffer = await downloadTelegramFile(config.botToken, largest.file_id);
        if (imageBuffer) {
          console.log(`[TelegramService] 📸 Foto do Telegram baixada (${imageBuffer.length} bytes)!`);
        }
      }
    }
  }

  if (telegramIncomingHandler) {
    const result = await telegramIncomingHandler({
      rawText,
      imageBuffer,
      chatId,
      chatTitle,
      chatUsername,
      messageId,
    });
    return { success: true, handled: true, result };
  } else {
    console.warn('[TelegramService] Mensagem recebida, mas nenhum manipulador de encaminhamento registrado.');
    return { success: false, handled: false };
  }
}

/**
 * Starts continuous Long-Polling for Telegram channel & group updates
 */
export async function startTelegramPolling(): Promise<void> {
  if (isPollingActive) {
    return;
  }

  const config = getTelegramConfig();
  if (config.status !== 'connected' || !config.botToken) {
    console.log('[TelegramService] ℹ️ Bot Telegram não está conectado. Escuta de mensagens inativa.');
    return;
  }

  isPollingActive = true;
  pollingAbortController = new AbortController();
  lastPollingHeartbeat = new Date().toLocaleTimeString('pt-BR');

  console.log(`[TelegramService] 🎧 Escuta de mensagens do Telegram INICIADA! Monitorando grupos e canais via Long-Polling...`);

  // Run async polling loop
  (async () => {
    while (isPollingActive) {
      try {
        const currentConf = getTelegramConfig();
        if (currentConf.status !== 'connected' || !currentConf.botToken) {
          isPollingActive = false;
          break;
        }

        lastPollingHeartbeat = new Date().toLocaleTimeString('pt-BR');

        const offsetParam = lastUpdateId ? `?offset=${lastUpdateId + 1}&timeout=20` : `?timeout=20`;
        const url = `https://api.telegram.org/bot${currentConf.botToken}/getUpdates${offsetParam}&allowed_updates=["message","channel_post","edited_message","edited_channel_post"]`;

        const res = await fetch(url, {
          signal: pollingAbortController?.signal,
          headers: { 'User-Agent': 'BOT-VIP-OFERTAS/1.0' },
        });

        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            try {
              await processTelegramUpdate(update);
            } catch (pErr) {
              console.warn('[TelegramService] Erro ao processar update do Telegram:', pErr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        // Wait before retrying on transient network disconnects
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    console.log('[TelegramService] ⏹️ Escuta de mensagens do Telegram finalizada.');
  })();
}

/**
 * Stops continuous Long-Polling for Telegram
 */
export function stopTelegramPolling(): void {
  isPollingActive = false;
  if (pollingAbortController) {
    try {
      pollingAbortController.abort();
    } catch {}
    pollingAbortController = null;
  }
  console.log('[TelegramService] 🛑 Polling do Telegram pausado.');
}
