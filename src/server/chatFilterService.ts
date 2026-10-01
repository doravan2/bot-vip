import fs from 'fs';
import path from 'path';

export interface ChatFilterConfig {
  enabled: boolean;
  appliedGroups: string[];
  allGroupsActive: boolean;
  removeAsteriskHeaders: boolean; // Apaga qualquer linha com * no início e no final (*exemplo*)
  removeUnitPriceHooks: boolean;  // Remove chamadas de preço tipo "SÓ R$..."
  excludedPhrases: string[];      // Frases ou linhas específicas cadastradas pelo usuário
}

const CONFIG_PATH = path.resolve(process.cwd(), '.whatsapp_auth', 'chat_filter_config.json');

const DEFAULT_CONFIG: ChatFilterConfig = {
  enabled: true,
  appliedGroups: [],
  allGroupsActive: false,
  removeAsteriskHeaders: true,
  removeUnitPriceHooks: true,
  excludedPhrases: ['*SÓ R$11,66 CADA 😱*'],
};

let cachedConfig: ChatFilterConfig | null = null;

export function loadChatFilterConfig(): ChatFilterConfig {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      return cachedConfig!;
    }
  } catch (err) {
    console.warn('[ChatFilter] Erro ao ler chat_filter_config.json, usando padrão:', err);
  }
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveChatFilterConfig(config: Partial<ChatFilterConfig>): ChatFilterConfig {
  const current = loadChatFilterConfig();
  const updated: ChatFilterConfig = {
    ...current,
    ...config,
    appliedGroups: Array.isArray(config.appliedGroups) ? config.appliedGroups : current.appliedGroups || [],
    excludedPhrases: Array.isArray(config.excludedPhrases) ? config.excludedPhrases : current.excludedPhrases || [],
  };

  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    cachedConfig = updated;
    console.log('[ChatFilter] Configurações salvas com sucesso:', updated);
  } catch (err) {
    console.error('[ChatFilter] Falha ao persistir chat_filter_config.json:', err);
  }

  return updated;
}

/**
 * Normaliza strings para comparação flexível (remove emojis e asteriscos)
 */
function normalizeText(str: string): string {
  return str
    .replace(/[*_~`]/g, '')
    .replace(/[^\p{L}\p{N}\s,.$%]/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Checa se uma linha começa e termina com asterisco '*' (ex: *exemplo*, *SÓ R$11,66 CADA 😱*, *TEXTO* 🔥)
 */
export function isAsteriskEnclosedLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) return false;

  // 1. Exato: começa com * e termina com *
  if (/^\*+[^\n]+\*+$/.test(trimmed)) {
    return true;
  }

  // 2. Com emojis/símbolos antes ou depois dos asteriscos, ex: "*exemplo*", "*SÓ R$11,66 CADA 😱*", "*CORRE* 🔥"
  const cleanLine = trimmed.replace(/^[^\p{L}\p{N}*]+/u, '').replace(/[^\p{L}\p{N}*]+$/u, '');
  if (cleanLine.startsWith('*') && cleanLine.endsWith('*') && cleanLine.length >= 2) {
    return true;
  }

  // 3. Regex para linha envolvida em asteriscos com emojis ao redor
  if (/^[\p{Extended_Pictographic}\s]*\*+[^*\n]+\*+[\p{Extended_Pictographic}\s]*$/u.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checa se o filtro está ativo para um determinado grupo
 */
export function isChatFilterActiveForGroup(...groupNames: (string | undefined)[]): boolean {
  const config = loadChatFilterConfig();
  if (!config.enabled) return false;
  if (config.allGroupsActive) return true;

  const validNames = groupNames.filter((n): n is string => !!n && typeof n === 'string');
  if (validNames.length === 0) return false;

  const applied = config.appliedGroups || [];
  return validNames.some((name) =>
    applied.some((g) => g.trim().toLowerCase() === name.trim().toLowerCase())
  );
}

/**
 * Aplica o filtro de chat excluindo chamadas e linhas indesejadas
 */
export function applyChatFilter(text: string, ...groupNames: (string | undefined)[]): string {
  if (!text || typeof text !== 'string') return text;

  const config = loadChatFilterConfig();
  if (!config.enabled) return text;

  // Verifica escopo dos grupos
  if (!config.allGroupsActive) {
    const isTarget = isChatFilterActiveForGroup(...groupNames);
    if (!isTarget) {
      return text;
    }
  }

  const lines = text.split('\n');
  const filteredLines: string[] = [];

  // Regex para chamadas de preço por unidade tipo "SÓ R$11,66 CADA"
  const unitPriceRegex = /^\s*\*?\s*s[óo]\s+r\$\s*[\d.,]+\s*(?:cada|unidade|o\s+par|peça)?.*$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      filteredLines.push(line);
      continue;
    }

    // 1. Apaga toda linha que tiver * no início e no final (*exemplo*)
    if (config.removeAsteriskHeaders !== false && isAsteriskEnclosedLine(trimmed)) {
      console.log(`[ChatFilter] ✂️ Linha com asteriscos (*exemplo*) apagada: "${trimmed}"`);
      continue;
    }

    // 2. Checa remoção automática de chamadas de preço por unidade (SÓ R$... CADA)
    if (config.removeUnitPriceHooks && unitPriceRegex.test(trimmed)) {
      console.log(`[ChatFilter] ✂️ Linha de chamada de preço unitário removida: "${trimmed}"`);
      continue;
    }

    // 3. Checa frases/linhas customizadas cadastradas pelo usuário para exclusão
    let shouldExclude = false;
    const normalizedLine = normalizeText(trimmed);

    for (const phrase of config.excludedPhrases || []) {
      if (!phrase || !phrase.trim()) continue;

      const pTrimmed = phrase.trim();
      const pNormalized = normalizeText(pTrimmed);

      // Match exato com ou sem formatação de markdown
      if (trimmed === pTrimmed || normalizedLine === pNormalized) {
        shouldExclude = true;
        break;
      }

      // Se a linha começa com a frase ou a contém integralmente
      if (pNormalized.length >= 3 && normalizedLine.includes(pNormalized)) {
        shouldExclude = true;
        break;
      }
    }

    if (shouldExclude) {
      console.log(`[ChatFilter] ✂️ Linha excluída pelo filtro de chat: "${trimmed}"`);
      continue;
    }

    filteredLines.push(line);
  }

  // Limpa quebras de linha consecutivas excessivas no início ou no meio
  let result = filteredLines.join('\n');
  result = result.replace(/^\n+/, ''); // remove linhas vazias no topo
  result = result.replace(/\n{3,}/g, '\n\n'); // colapsa múltiplos enters

  return result.trim();
}
