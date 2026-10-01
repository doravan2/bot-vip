import path from 'path';
import fs from 'fs';

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
  const raw = tgt.replace(/^\[Telegram\]\s*/i, '').trim();
  if (raw.startsWith('@') || raw.startsWith('-100') || raw.includes('t.me') || raw.toLowerCase().includes('telegram')) {
    return true;
  }
  const channels = getTelegramChannels();
  const cleanTgt = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return channels.some((c) => {
    const cleanName = (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanId = (c.chatId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanUser = (c.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      (cleanName && (cleanName === cleanTgt || cleanName.includes(cleanTgt) || cleanTgt.includes(cleanName))) ||
      (cleanId && (cleanId === cleanTgt || cleanTgt.includes(cleanId))) ||
      (cleanUser && (cleanUser === cleanTgt || cleanTgt.includes(cleanUser)))
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

  return {
    success: true,
    config: updated,
    message: `Bot @${validation.botInfo.username} (${validation.botInfo.first_name}) conectado com sucesso!`,
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

    // 1. If HTTP URL provided, try downloading it to a buffer first to avoid Telegram 403 blocks
    let photoBuffer: Buffer | null = Buffer.isBuffer(imageUrlOrBuffer) ? imageUrlOrBuffer : null;

    if (!photoBuffer && typeof imageUrlOrBuffer === 'string' && imageUrlOrBuffer.startsWith('http')) {
      try {
        const fetchRes = await fetch(imageUrlOrBuffer, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
        });
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          if (ab.byteLength > 100) {
            photoBuffer = Buffer.from(ab);
          }
        }
      } catch (fetchErr) {
        console.warn('[TelegramService] Falha ao pré-baixar imagem para envio:', fetchErr);
      }
    }

    // 2. Try sending Photo if Buffer available
    if (photoBuffer && Buffer.isBuffer(photoBuffer)) {
      try {
        const formData = new FormData();
        formData.append('chat_id', targetChat);
        formData.append('caption', safeCaption);
        const blob = new Blob([new Uint8Array(photoBuffer)], { type: 'image/jpeg' });
        formData.append('photo', blob, 'photo.jpg');

        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });
        const data: any = await res.json();
        if (data.ok && data.result) {
          return { success: true, messageId: data.result.message_id };
        } else {
          console.warn('[TelegramService] Telegram recusou foto via buffer:', data.description);
        }
      } catch (bufErr) {
        console.warn('[TelegramService] Erro ao enviar buffer de foto no Telegram, tentando texto:', bufErr);
      }
    }

    // 3. Try sending Photo if HTTP URL provided (fallback if buffer download failed)
    if (typeof imageUrlOrBuffer === 'string' && imageUrlOrBuffer.startsWith('http')) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChat,
            photo: imageUrlOrBuffer,
            caption: safeCaption,
          }),
        });
        const data: any = await res.json();
        if (data.ok && data.result) {
          return { success: true, messageId: data.result.message_id };
        } else {
          console.warn('[TelegramService] Telegram recusou foto via URL:', data.description);
        }
      } catch (urlErr) {
        console.warn('[TelegramService] Erro ao enviar foto por URL no Telegram, tentando texto:', urlErr);
      }
    }

    // 4. Fallback: Text send via sendMessage
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
