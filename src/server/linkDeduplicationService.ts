import fs from 'fs';
import path from 'path';
import { extractUrls, extractMlbId } from '../utils/affiliateEngine.ts';

export interface LinkDedupConfig {
  enabled: boolean;
  dedupWindowHours: number; // e.g. 24
  allGroupsActive: boolean;
  appliedGroups?: string[];
}

export interface DispatchedLinkEntry {
  id: string;
  url: string;
  canonicalUrl?: string;
  productCode?: string; // MLB code, ASIN, Shopee ID
  targetGroup?: string;
  timestamp: number; // Date.now()
}

const STORAGE_DIR = path.resolve(process.cwd(), '.whatsapp_auth');
const CONFIG_PATH = path.resolve(STORAGE_DIR, 'link_dedup_config.json');
const HISTORY_PATH = path.resolve(STORAGE_DIR, 'dispatched_links_history.json');

const DEFAULT_CONFIG: LinkDedupConfig = {
  enabled: true,
  dedupWindowHours: 24,
  allGroupsActive: true,
  appliedGroups: [],
};

let cachedConfig: LinkDedupConfig | null = null;
let cachedHistory: DispatchedLinkEntry[] | null = null;

export function loadLinkDedupConfig(): LinkDedupConfig {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      return cachedConfig!;
    }
  } catch (err) {
    console.warn('[LinkDedup] Erro ao ler link_dedup_config.json, usando padrão:', err);
  }
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function saveLinkDedupConfig(updates: Partial<LinkDedupConfig>): LinkDedupConfig {
  const current = loadLinkDedupConfig();
  const updated: LinkDedupConfig = {
    ...current,
    ...updates,
    dedupWindowHours: typeof updates.dedupWindowHours === 'number' && updates.dedupWindowHours > 0 ? updates.dedupWindowHours : 24,
    appliedGroups: Array.isArray(updates.appliedGroups) ? updates.appliedGroups : current.appliedGroups || [],
  };

  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    cachedConfig = updated;
    console.log('[LinkDedup] Configurações de anti-duplicidade de 24h salvas:', updated);
  } catch (err) {
    console.error('[LinkDedup] Falha ao persistir link_dedup_config.json:', err);
  }

  return updated;
}

export function loadLinkHistory(): DispatchedLinkEntry[] {
  if (cachedHistory) return cachedHistory;
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedHistory = parsed;
        return cachedHistory;
      }
    }
  } catch (err) {
    console.warn('[LinkDedup] Erro ao carregar histórico de links enviados:', err);
  }
  cachedHistory = [];
  return cachedHistory;
}

export function saveLinkHistory(history: DispatchedLinkEntry[]): void {
  cachedHistory = history;
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LinkDedup] Erro ao salvar histórico de links:', err);
  }
}

/**
 * Normaliza uma URL ou extrai o código do produto (MLB / ASIN / Shopee / Ali / Shortlink) para comparação
 */
export function extractProductIdentifiers(rawTextOrUrl: string): {
  urls: string[];
  productCodes: string[];
  cleanUrls: string[];
} {
  if (!rawTextOrUrl || typeof rawTextOrUrl !== 'string') {
    return { urls: [], productCodes: [], cleanUrls: [] };
  }

  const urls = extractUrls(rawTextOrUrl);
  const productCodes: string[] = [];
  const cleanUrls: string[] = [];

  for (const u of urls) {
    // 0. URL limpa sem query params ou hash
    const pureUrl = u.split('?')[0].split('#')[0].toLowerCase().trim();
    if (pureUrl && !cleanUrls.includes(pureUrl)) {
      cleanUrls.push(pureUrl);
    }

    // 1. Mercado Livre MLB ID (ex: MLB123456789 ou MLB-123456789)
    const mlb = extractMlbId(u) || extractMlbId(pureUrl);
    if (mlb && !productCodes.includes(mlb.toUpperCase())) {
      productCodes.push(mlb.toUpperCase());
    }

    // 2. Amazon ASIN (ex: /dp/B08XYZ1234 ou /gp/product/B08XYZ1234 ou /d/B08XYZ1234)
    const asinMatch = u.match(/(?:\/dp\/|\/gp\/product\/|\/ASIN\/|\/d\/)([A-Z0-9]{10})/i);
    if (asinMatch && !productCodes.includes(`ASIN_${asinMatch[1].toUpperCase()}`)) {
      productCodes.push(`ASIN_${asinMatch[1].toUpperCase()}`);
    }

    // 3. Shopee Product ID (ex: /product/12345/67890 ou -i.12345.67890)
    const shopeeMatch = u.match(/(?:\/product\/|-i\.)(\d+)[/.\s](\d+)/i);
    if (shopeeMatch && !productCodes.includes(`SHOPEE_${shopeeMatch[1]}_${shopeeMatch[2]}`)) {
      productCodes.push(`SHOPEE_${shopeeMatch[1]}_${shopeeMatch[2]}`);
    }

    // 4. AliExpress Item ID (ex: /item/100500123456789.html ou 100500123456789)
    const aliMatch = u.match(/(?:item\/)?(\d{11,15})\.html/i);
    if (aliMatch && !productCodes.includes(`ALI_${aliMatch[1]}`)) {
      productCodes.push(`ALI_${aliMatch[1]}`);
    }

    // 5. Shortlink code (ex: shope.ee/xyz, s.click.aliexpress.com/e/_o2xyz, a.co/d/xyz, amzn.to/xyz, meli.la/xyz)
    const shortMatch = u.match(/(?:shope\.ee\/|s\.click\.aliexpress\.com\/e\/|a\.co\/d\/|amzn\.to\/|meli\.la\/)([a-zA-Z0-9_-]+)/i);
    if (shortMatch && !productCodes.includes(`SHORT_${shortMatch[1].toUpperCase()}`)) {
      productCodes.push(`SHORT_${shortMatch[1].toUpperCase()}`);
    }
  }

  // Checa se o texto tem código MLB puro (ex: MLB123456789)
  const textMlbMatch = rawTextOrUrl.match(/MLB[-]?\d+/gi);
  if (textMlbMatch) {
    for (const m of textMlbMatch) {
      const cleanM = m.replace(/-/g, '').toUpperCase();
      if (!productCodes.includes(cleanM)) {
        productCodes.push(cleanM);
      }
    }
  }

  return { urls, productCodes, cleanUrls };
}

function isGenericDomainRoot(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return !parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 2;
  } catch {
    return false;
  }
}

/**
 * Verifica se o mesmo link/produto foi enviado nas últimas X horas (padrão 24h)
 */
export function isLinkDuplicateInWindow(
  rawTextOrUrl: string,
  targetGroup?: string
): {
  isDuplicate: boolean;
  hoursAgo?: number;
  lastSentFormatted?: string;
  matchedCodeOrUrl?: string;
  matchedEntry?: DispatchedLinkEntry;
} {
  const config = loadLinkDedupConfig();
  if (!config.enabled) {
    return { isDuplicate: false };
  }

  const { urls, productCodes, cleanUrls } = extractProductIdentifiers(rawTextOrUrl);
  if (urls.length === 0 && productCodes.length === 0) {
    return { isDuplicate: false };
  }

  const history = loadLinkHistory();
  const windowMs = (config.dedupWindowHours || 24) * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of history) {
    const ageMs = now - entry.timestamp;
    if (ageMs > windowMs) continue; // Fora da janela de 24h

    // Extrai códigos e URLs puras tanto de entry.url quanto de entry.canonicalUrl
    const entryCombinedText = `${entry.url || ''} ${entry.canonicalUrl || ''} ${entry.productCode || ''}`;
    const entryIdentifiers = extractProductIdentifiers(entryCombinedText);

    // 1. Checa por códigos de produto (MLB, ASIN, Shopee, Ali, Shortlink)
    for (const code of productCodes) {
      if (
        (entry.productCode && entry.productCode.toUpperCase() === code.toUpperCase()) ||
        entryIdentifiers.productCodes.includes(code)
      ) {
        const hoursAgo = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
        return {
          isDuplicate: true,
          hoursAgo,
          lastSentFormatted: new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          matchedCodeOrUrl: code,
          matchedEntry: entry,
        };
      }
    }

    // 2. Checa por URLs limpas (comparando entry.url e entry.canonicalUrl com cleanUrls)
    const entryPureUrls: string[] = [];
    if (entry.url) {
      const p = entry.url.split('?')[0].split('#')[0].toLowerCase().trim();
      if (p) entryPureUrls.push(p);
    }
    if (entry.canonicalUrl) {
      const p = entry.canonicalUrl.split('?')[0].split('#')[0].toLowerCase().trim();
      if (p && !entryPureUrls.includes(p)) entryPureUrls.push(p);
    }
    for (const ep of entryIdentifiers.cleanUrls) {
      if (!entryPureUrls.includes(ep)) entryPureUrls.push(ep);
    }

    for (const cu of cleanUrls) {
      if (!cu || cu.length < 8) continue; // Ignora URLs muito curtas/inválidas

      for (const ep of entryPureUrls) {
        if (!ep || ep.length < 8) continue;

        if (cu === ep) {
          const hoursAgo = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
          return {
            isDuplicate: true,
            hoursAgo,
            lastSentFormatted: new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            matchedCodeOrUrl: cu,
            matchedEntry: entry,
          };
        }

        if (
          !isGenericDomainRoot(cu) &&
          !isGenericDomainRoot(ep) &&
          (cu.includes(ep) || ep.includes(cu))
        ) {
          const hoursAgo = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
          return {
            isDuplicate: true,
            hoursAgo,
            lastSentFormatted: new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            matchedCodeOrUrl: cu,
            matchedEntry: entry,
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Registra o disparo de um link no histórico para evitar repetição nas próximas 24 horas
 */
export function recordDispatchedLink(
  rawUrlOrText: string,
  canonicalUrl?: string,
  productCode?: string,
  targetGroup?: string
): void {
  const history = loadLinkHistory();
  const now = Date.now();

  const combined = `${rawUrlOrText || ''} ${canonicalUrl || ''}`;
  const identifiers = extractProductIdentifiers(combined);
  const primaryCode = productCode || identifiers.productCodes[0] || undefined;

  const entry: DispatchedLinkEntry = {
    id: `dedup-${now}-${Math.random().toString(36).substring(2, 7)}`,
    url: rawUrlOrText,
    canonicalUrl,
    productCode: primaryCode ? primaryCode.toUpperCase() : undefined,
    targetGroup: targetGroup || 'Grupo VIP',
    timestamp: now,
  };

  // Adiciona ao topo e limpa registros antigos com mais de 72h para manter o arquivo leve
  const pruneMs = 72 * 60 * 60 * 1000;
  const filtered = [entry, ...history].filter((e) => now - e.timestamp < pruneMs);

  saveLinkHistory(filtered);
  console.log(`[LinkDedup] 💾 Link registrado no histórico de 24h: ${entry.productCode || entry.canonicalUrl || entry.url}`);
}

/**
 * Limpa todo o histórico de links enviados
 */
export function clearLinkDedupHistory(): void {
  saveLinkHistory([]);
  console.log('[LinkDedup] 🧹 Histórico de anti-duplicidade de 24h limpo com sucesso.');
}
