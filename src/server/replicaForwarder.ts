import path from 'path';
import fs from 'fs';
import {
  OFFICIAL_USER_AFFILIATE_ID,
  OFFICIAL_SOURCE,
  DEFAULT_VIP_GROUP_LINK,
  transformMarketplaceUrl,
  extractUrls,
  resolveShortLinkToLongUrl,
  DEFAULT_USER_MELI_LINKS,
  extractMlbId,
  isCompetitorShareUrl,
  isCompetitorInviteLine,
} from '../utils/affiliateEngine.ts';

export { isCompetitorShareUrl, isCompetitorInviteLine };
import { getAffiliateSettings, setCustomMeliLink, getVipGroupLink } from './affiliateConfig.ts';
import { convertMeliLinkViaCookies, getMarketplacesConfig } from './marketplacesService.ts';
import { converter_link_shopee } from './shopeeAffiliateService.ts';
import { converter_link_amazon } from './amazonAffiliateService.ts';
import { converterLinkAliExpress } from './aliExpressApiService.ts';
import { getWatermarkConfig, replaceCompetitorHandlesInText } from './watermarkAiService.ts';

export interface ProcessedCompetitorMessage {
  cleanedCopy: string;
  originalUrl: string;
  monetizedUrl: string;
  marketplace: string;
  methodUsed: string;
  isMeli: boolean;
  isOfficialMeliShort: boolean;
  requiresConversion: boolean;
  mlbId?: string;
  pureProductUrl?: string;
  shouldForward: boolean;
  blockReason?: string;
  detectedMarketplaces?: string[];
}

export interface ActiveSourceRule {
  id: string;
  sourceName: string;
  sourceNames?: string[];
  sourceJid?: string;
  sourceJids?: string[];
  platform?: 'WhatsApp' | 'Telegram' | 'Misto';
  sourcePlatforms?: ('WhatsApp' | 'Telegram')[];
  targetGroup: string;
  targetGroups?: string[];
  targetJid?: string;
  targetJids?: string[];
  targetPlatforms?: ('WhatsApp' | 'Telegram')[];
  targetChatIds?: string[];
  status: 'monitoring' | 'paused';
  autoForward: boolean;
  filterCompetitorNames: boolean;
  autoFetchProductImage?: boolean;
  validateMeliStock?: boolean;
  onlyMeliDeals?: boolean;
  dealsCapturedToday: number;
  createdAt: string;
}

export interface ClonedEventLog {
  id: string;
  timestamp: string;
  sourceGroupName: string;
  targetGroupName: string;
  originalText: string;
  finalCaption: string;
  hasImage: boolean;
  imageSource?: 'source-media' | 'auto-link-photo' | 'none';
  originalUrl?: string;
  monetizedUrl?: string;
  marketplace?: string;
  methodUsed?: string;
  status: 'success' | 'error' | 'pending' | 'converted' | 'skipped';
  errorMessage?: string;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const rulesFilePath = path.resolve(storageDir, 'source_rules.json');
const logsFilePath = path.resolve(storageDir, 'replica_logs.json');

let inMemoryRules: ActiveSourceRule[] = [];
let inMemoryLogs: ClonedEventLog[] = [];

// Load initial rules and logs from disk
try {
  if (fs.existsSync(rulesFilePath)) {
    const raw = fs.readFileSync(rulesFilePath, 'utf-8');
    inMemoryRules = JSON.parse(raw);
  }
} catch {
  inMemoryRules = [];
}

try {
  if (fs.existsSync(logsFilePath)) {
    const raw = fs.readFileSync(logsFilePath, 'utf-8');
    inMemoryLogs = JSON.parse(raw);
  }
} catch {
  inMemoryLogs = [];
}

export function getActiveSourceRules(): ActiveSourceRule[] {
  if (inMemoryRules.length === 0 && fs.existsSync(rulesFilePath)) {
    try {
      const raw = fs.readFileSync(rulesFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryRules = parsed;
      }
    } catch {}
  }
  return inMemoryRules;
}

export function setActiveSourceRules(rules: ActiveSourceRule[]): void {
  inMemoryRules = rules;
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(rulesFilePath, JSON.stringify(rules, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar regras no disco:', e);
  }
}

export function getReplicaLogs(): ClonedEventLog[] {
  return inMemoryLogs;
}

export function addReplicaLog(log: ClonedEventLog): void {
  inMemoryLogs.unshift(log);
  if (inMemoryLogs.length > 50) {
    inMemoryLogs = inMemoryLogs.slice(0, 50);
  }
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(logsFilePath, JSON.stringify(inMemoryLogs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar logs no disco:', e);
  }
}

export interface ShortUrlResolution {
  resolvedUrl: string;
  isMeliShortLink: boolean;
  isUserMeliLink: boolean;
}

/**
 * Expands shortlinks (like meli.la/..., amzn.to/..., shope.ee/...) by using the
 * Headless Browser Python engine to resolve canonical long product URLs,
 * and detects if a meli.la shortlink already belongs to the user.
 */
export async function expandShortUrl(
  shortUrl: string,
  expectedUserToolId: string = OFFICIAL_USER_AFFILIATE_ID
): Promise<ShortUrlResolution> {
  const isMeliShortLink = shortUrl.toLowerCase().includes('meli.la');
  let isUserMeliLink = false;

  const knownUserLinks = Object.values(DEFAULT_USER_MELI_LINKS);
  if (isMeliShortLink && knownUserLinks.some(l => shortUrl.includes(l.trim()) || l.includes(shortUrl.trim()))) {
    isUserMeliLink = true;
  }

  try {
    const longUrl = await resolveShortLinkToLongUrl(shortUrl);
    if (isMeliShortLink && (longUrl.includes(expectedUserToolId) || shortUrl.includes(expectedUserToolId) || longUrl.includes('49196513'))) {
      isUserMeliLink = true;
    }

    return {
      resolvedUrl: longUrl || shortUrl,
      isMeliShortLink,
      isUserMeliLink,
    };
  } catch (err) {
    console.error('[expandShortUrl] Erro ao expandir URL:', err);
  }

  return {
    resolvedUrl: shortUrl,
    isMeliShortLink,
    isUserMeliLink,
  };
}

/**
 * Cleans competitor branding, watermarks and social links,
 * monetizes all product links with the user's affiliate credentials
 * for Mercado Livre (Link Builder / meli.la), Shopee (Custom Link), Amazon (SiteStripe),
 * and replaces competitor group links with the destination WhatsApp group link.
 */
export async function cleanAndMonetizeCompetitorMessage(
  rawText: string,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  targetGroupInviteLink?: string
): Promise<ProcessedCompetitorMessage> {
  if (!rawText || !rawText.trim()) {
    return {
      cleanedCopy: '',
      originalUrl: '',
      monetizedUrl: '',
      marketplace: '',
      methodUsed: '',
      isMeli: false,
      isOfficialMeliShort: false,
      requiresConversion: false,
      shouldForward: false,
      blockReason: 'Mensagem vazia recebida.',
      detectedMarketplaces: [],
    };
  }

  const mpConfig = getMarketplacesConfig();
  const enabledMarketplaces: Record<string, boolean> = {
    mercadolivre: mpConfig.mercadoLivre?.enabled !== false,
    shopee: mpConfig.shopee?.enabled !== false,
    amazon: mpConfig.amazon?.enabled !== false,
    shein: mpConfig.shein?.enabled !== false,
    aliexpress: mpConfig.aliexpress?.enabled !== false,
    temu: mpConfig.temu?.enabled !== false,
  };

  const detectedMarketplaces = new Set<string>();
  const activeMarketplaces = new Set<string>();
  const disabledMarketplaces = new Set<string>();

  const activeGroupLink = targetGroupInviteLink?.trim() || getVipGroupLink() || DEFAULT_VIP_GROUP_LINK;
  const lines = rawText.split('\n');
  const processedLines: string[] = [];
  let firstOriginalUrl: string | undefined;
  let firstMonetizedUrl: string | undefined;
  let firstMarketplace: string | undefined;
  let firstMethodUsed: string | undefined;
  let hasHandledShareSection = false;
  let hasMeli = false;
  let isOfficialMeliShort = false;
  let detectedMlbId = '';
  let detectedPureProductUrl = '';
  let totalProductUrlsFound = 0;

  const settings = getAffiliateSettings();
  const activeToolId = settings.mercadoLivre.toolId || toolId;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Replace competitor handles like @atacadovipofertas with user's @ or clean them
    const wmConfig = getWatermarkConfig();
    if (wmConfig.replaceTextHandle && wmConfig.userHandle) {
      line = replaceCompetitorHandlesInText(line, wmConfig.userHandle).trimEnd();
    } else {
      line = line.replace(/@[A-Za-z0-9_.]+/g, '').trimEnd();
    }

    // Check if line contains competitor share phrases, competitor invite headers or CTA
    if (isCompetitorInviteLine(line)) {
      if (!hasHandledShareSection && activeGroupLink) {
        hasHandledShareSection = true;
        processedLines.push('👉 Compartilhe com os amigos:');
        processedLines.push(activeGroupLink);
      }

      // If subsequent lines are competitor links or invitation text, consume them
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const nextUrls = extractUrls(nextLine);
        if (
          nextLine === '' ||
          isCompetitorInviteLine(nextLine) ||
          (nextUrls.length > 0 && nextUrls.every((u) => isCompetitorShareUrl(u, activeGroupLink))) ||
          /achadinho|t\.me|chat\.whatsapp|linktr|beacons|grupos\.|garimpeiros|lipeindica/i.test(nextLine)
        ) {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    const urls = extractUrls(line);
    if (urls.length > 0) {
      let skipLine = false;
      for (const url of urls) {
        const lower = url.toLowerCase();

        // 1. Direct competitor check BEFORE expansion:
        if (isCompetitorShareUrl(url, activeGroupLink)) {
          while (
            processedLines.length > 0 &&
            (processedLines[processedLines.length - 1].trim() === '' ||
              isCompetitorInviteLine(processedLines[processedLines.length - 1]))
          ) {
            processedLines.pop();
          }

          if (!hasHandledShareSection && activeGroupLink) {
            hasHandledShareSection = true;
            processedLines.push('👉 Compartilhe com os amigos:');
            processedLines.push(activeGroupLink);
          }
          skipLine = true;
          break;
        }

        // Resolve redirects & get canonical long product URL (using Python Headless engine)
        const resolution = await expandShortUrl(url, activeToolId);
        const resolvedLower = resolution.resolvedUrl.toLowerCase();

        // 2. Direct competitor check AFTER expansion (catches custom domains/redirects to linktr.ee, t.me, whatsapp groups, etc.):
        if (isCompetitorShareUrl(resolution.resolvedUrl, activeGroupLink)) {
          while (
            processedLines.length > 0 &&
            (processedLines[processedLines.length - 1].trim() === '' ||
              isCompetitorInviteLine(processedLines[processedLines.length - 1]))
          ) {
            processedLines.pop();
          }

          if (!hasHandledShareSection && activeGroupLink) {
            hasHandledShareSection = true;
            processedLines.push('👉 Compartilhe com os amigos:');
            processedLines.push(activeGroupLink);
          }
          skipLine = true;
          break;
        }

        totalProductUrlsFound++;

        // Detect marketplace from original and resolved URLs
        let detectedMp = 'generic';
        if (
          resolvedLower.includes('mercadolivre.com') ||
          resolvedLower.includes('meli.la') ||
          lower.includes('meli.la') ||
          lower.includes('mercadolivre.com')
        ) {
          detectedMp = 'mercadolivre';
        } else if (
          resolvedLower.includes('shopee.') ||
          resolvedLower.includes('shope.ee') ||
          lower.includes('shopee.') ||
          lower.includes('shope.ee')
        ) {
          detectedMp = 'shopee';
        } else if (
          resolvedLower.includes('amazon.') ||
          resolvedLower.includes('amzn.to') ||
          lower.includes('amazon.') ||
          lower.includes('amzn.to') ||
          lower.includes('a.co')
        ) {
          detectedMp = 'amazon';
        } else if (
          resolvedLower.includes('shein.') ||
          resolvedLower.includes('shein.top') ||
          lower.includes('shein.') ||
          lower.includes('shein.top') ||
          lower.includes('shein.co')
        ) {
          detectedMp = 'shein';
        } else if (
          resolvedLower.includes('aliexpress.') ||
          resolvedLower.includes('s.click') ||
          lower.includes('aliexpress') ||
          lower.includes('s.click') ||
          lower.includes('ali.ski')
        ) {
          detectedMp = 'aliexpress';
        } else if (
          resolvedLower.includes('temu.') ||
          resolvedLower.includes('temu.to') ||
          lower.includes('temu.') ||
          lower.includes('temu.to')
        ) {
          detectedMp = 'temu';
        }

        detectedMarketplaces.add(detectedMp);

        const isEnabled = enabledMarketplaces[detectedMp] !== false;
        if (!isEnabled) {
          disabledMarketplaces.add(detectedMp);
          console.log(`[Replica Forwarder] ⏸️ Marketplace "${detectedMp}" está DESATIVADO nas conexões. Conversão bloqueada.`);
        } else {
          activeMarketplaces.add(detectedMp);
        }

        // Product URL detected!
        if (!firstOriginalUrl) firstOriginalUrl = url;

        let monetized = '';
        let platformLabel = '';
        let methodUsed = '';

        if (!isEnabled) {
          monetized = url;
          platformLabel = `${detectedMp.toUpperCase()} (Desativado)`;
          methodUsed = 'Marketplace Desativado';
        } else if (detectedMp === 'mercadolivre') {
          hasMeli = true;
          detectedPureProductUrl = resolution.resolvedUrl.split('?')[0].split('#')[0];
          detectedMlbId = extractMlbId(detectedPureProductUrl) || extractMlbId(url) || '';
          console.log(`[Conversor Meli] 🛒 Produto Mercado Livre detectado (${detectedMlbId}): "${url}"`);

          if (resolution.isMeliShortLink && resolution.isUserMeliLink) {
            monetized = url.split('?')[0].split('#')[0];
            platformLabel = 'Mercado Livre (meli.la)';
            methodUsed = 'Link Oficial meli.la do Usuário (Preservado)';
            isOfficialMeliShort = true;
            console.log(`[Conversor Meli] ✅ Link do usuário já encurtado preservado: ${monetized}`);
          } else {
            try {
              const cookieConv = await convertMeliLinkViaCookies(url);
              if (cookieConv && cookieConv.monetized_url) {
                monetized = cookieConv.monetized_url;
                platformLabel = 'Mercado Livre Oficial';
                methodUsed = cookieConv.method || 'API Oficial Hub de Afiliados (meli.la)';
                isOfficialMeliShort = cookieConv.is_official_meli_la || monetized.includes('meli.la');

                if (detectedMlbId && isOfficialMeliShort) {
                  setCustomMeliLink(detectedMlbId, monetized);
                }
                console.log(`[Conversor Meli] 🎯 Link Oficial gerado com sucesso: "${monetized}" (${methodUsed})`);
              }
            } catch (meliConvErr) {
              console.warn('[Conversor Meli] Falha na conversão com cookies, aplicando fallback rastreado:', meliConvErr);
            }

            if (!monetized) {
              const sep = detectedPureProductUrl.includes('?') ? '&' : '?';
              monetized = `${detectedPureProductUrl}${sep}matt_tool=49196513&matt_word=${encodeURIComponent(activeToolId)}`;
              platformLabel = 'Mercado Livre Oficial';
              methodUsed = 'Link de Afiliado Oficial (matt_tool/matt_word)';
            }
          }
        } else if (detectedMp === 'shopee') {
          try {
            const shopeeShort = await converter_link_shopee(url);
            if (shopeeShort) {
              monetized = shopeeShort;
              platformLabel = 'Shopee Oficial (s.shopee.com.br)';
              methodUsed = 'API Oficial GraphQL Shopee Afiliados (SHA256)';
              console.log(`[Conversor Shopee] 🎯 Link de afiliado gerado com sucesso: ${monetized}`);
            }
          } catch (shpErr) {
            console.warn('[Conversor Shopee] Erro ao converter link:', shpErr);
          }
        } else if (detectedMp === 'amazon') {
          try {
            const amzTag =
              mpConfig.amazon?.associateTag?.trim() ||
              mpConfig.amazon?.tagId?.trim() ||
              settings.amazon?.associateTag?.trim() ||
              'botvip-20';
            const amzResult = await converter_link_amazon(url, amzTag);
            if (amzResult && amzResult.monetizedUrl) {
              monetized = amzResult.monetizedUrl;
              platformLabel = 'Amazon BR Oficial';
              methodUsed = amzResult.method || 'Amazon Associates SiteStripe (ASIN + Tag)';
              console.log(`[Conversor Amazon] 🎯 Link oficial Amazon gerado com sucesso (${amzResult.asin || 'Tag'}): ${monetized}`);
            }
          } catch (amzErr) {
            console.warn('[Conversor Amazon] Erro ao converter link:', amzErr);
          }
        } else if (detectedMp === 'aliexpress') {
          try {
            const aliResult = await converterLinkAliExpress(url);
            if (aliResult && aliResult.monetized_url) {
              monetized = aliResult.monetized_url;
              platformLabel = aliResult.platform_label || 'AliExpress Oficial (s.click)';
              methodUsed = aliResult.method || 'API Oficial aliexpress.affiliate.link.generate';
              console.log(`[Conversor AliExpress] 🎯 Link oficial s.click gerado: ${monetized}`);
            }
          } catch (aliErr) {
            console.warn('[Conversor AliExpress] Falha na conversão via API, aplicando fallback:', aliErr);
          }
        }

        if (!monetized && isEnabled) {
          const amzTag =
            mpConfig.amazon?.associateTag?.trim() ||
            mpConfig.amazon?.tagId?.trim() ||
            settings.amazon?.associateTag?.trim() ||
            'botvip-20';

          const converted = transformMarketplaceUrl(resolution.resolvedUrl, {
            mlToolId: activeToolId,
            mlSource: settings.mercadoLivre.source || OFFICIAL_SOURCE,
            mattTool: settings.mercadoLivre.mattTool || '49196513',
            mattWord: settings.mercadoLivre.mattWord || activeToolId || 'sf20250625192813',
            shopeeAffiliateId: settings.shopee.affiliateId,
            amazonTag: amzTag,
            sheinAffiliateId: mpConfig.shein?.affiliateId,
            sheinUniversalLink: mpConfig.shein?.affiliateLink,
            temuCode: (mpConfig.temu as any)?.referralCode,
            temuLink: (mpConfig.temu as any)?.universalLink,
            aliAppKey: (mpConfig.aliexpress as any)?.appKey,
            aliTrackingId: (mpConfig.aliexpress as any)?.trackingId,
            customMeliLinks: settings.mercadoLivre.customMeliLinks,
            enabledMarketplaces,
          });

          monetized = converted.monetizedUrl;
          platformLabel = converted.platformLabel;
          methodUsed = converted.methodUsed;
        }

        if (!firstMonetizedUrl) {
          firstMonetizedUrl = monetized;
          firstMarketplace = platformLabel;
          firstMethodUsed = methodUsed;
        }

        line = line.split(url).join(monetized);
      }
      if (skipLine) continue;
    }

    processedLines.push(line);
  }

  // Ensure every forwarded deal ends with user's official destination group invite!
  if (!hasHandledShareSection && activeGroupLink) {
    processedLines.push('');
    processedLines.push('👉 Compartilhe com os amigos:');
    processedLines.push(activeGroupLink);
  }

  // Deduplicate consecutive identical link lines so no URL appears duplicated!
  const cleanProcessedLines: string[] = [];
  for (let idx = 0; idx < processedLines.length; idx++) {
    const cur = processedLines[idx];
    const prev = cleanProcessedLines.length > 0 ? cleanProcessedLines[cleanProcessedLines.length - 1] : null;
    if (
      cur.trim().startsWith('http') &&
      prev &&
      prev.trim().startsWith('http') &&
      cur.trim() === prev.trim()
    ) {
      continue; // Skip duplicate consecutive identical link line!
    }
    cleanProcessedLines.push(cur);
  }

  const cleaned = cleanProcessedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Determine whether to forward based on active enabled marketplaces!
  let shouldForward = true;
  let blockReason: string | undefined;

  if (totalProductUrlsFound === 0) {
    shouldForward = false;
    blockReason = 'Nenhum link de produto ou marketplace detectado na mensagem.';
  } else if (activeMarketplaces.size === 0) {
    shouldForward = false;
    const disabledNames = Array.from(disabledMarketplaces).map((m) => m.toUpperCase()).join(', ');
    blockReason = `Marketplace ${disabledNames || 'desconhecido'} está DESATIVADO nas conexões do Replica Chat. Replicação bloqueada instantaneamente.`;
  }

  return {
    cleanedCopy: cleaned,
    originalUrl: firstOriginalUrl || '',
    monetizedUrl: firstMonetizedUrl || '',
    marketplace: firstMarketplace || '',
    methodUsed: firstMethodUsed || '',
    isMeli: hasMeli,
    isOfficialMeliShort,
    requiresConversion: hasMeli && !isOfficialMeliShort,
    mlbId: detectedMlbId,
    pureProductUrl: detectedPureProductUrl,
    shouldForward,
    blockReason,
    detectedMarketplaces: Array.from(detectedMarketplaces),
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
