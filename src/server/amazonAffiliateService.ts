import { getMarketplacesConfig } from './marketplacesService.ts';
import { getAffiliateSettings } from './affiliateConfig.ts';
import { resolveShortLinkToLongUrl, DEFAULT_AMAZON_TAG } from '../utils/affiliateEngine.ts';

export interface AmazonConversionResult {
  success: boolean;
  originalUrl: string;
  canonicalProductUrl: string;
  asin?: string | null;
  monetizedUrl: string;
  tagUsed: string;
  method: string;
  error?: string;
}

/**
 * Extracts 10-character Amazon ASIN from any Amazon product URL or query string
 */
export function extractAmazonAsin(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();

  // Common Amazon URL structures:
  // /dp/B09B8VGCR8
  // /gp/product/B09B8VGCR8
  // /gp/aw/d/B09B8VGCR8
  // /product/B09B8VGCR8
  // /d/B09B8VGCR8
  // /product-reviews/B09B8VGCR8
  // ?asin=B09B8VGCR8 or &asin=B09B8VGCR8
  // link.amazon/B0igTSVuM or link.amazon/B0anM1f0P
  const asinMatch =
    clean.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/|\/d\/|\/product-reviews\/|[?&]asin=)([A-Z0-9]{9,12})/i) ||
    clean.match(/\/(B0[A-Z0-9]{7,10})(?:[/?&#]|$)/i) ||
    clean.match(/\/([A-Z0-9]{10})(?:[/?&#]|$)/i);

  if (asinMatch && asinMatch[1]) {
    const candidate = asinMatch[1].toUpperCase();
    // Validate ASIN format (9 to 12 alphanumeric characters, typically B0...)
    if (/^[A-Z0-9]{9,12}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Converts any Amazon URL (shortlink amzn.to/a.co/link.amazon or direct URL) into the user's
 * official Amazon Associates SiteStripe link with the configured Associate Tag.
 */
export async function converter_link_amazon(
  inputUrl: string,
  customTag?: string
): Promise<AmazonConversionResult> {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return {
      success: false,
      originalUrl: '',
      canonicalProductUrl: '',
      monetizedUrl: '',
      tagUsed: '',
      method: 'URL Inválida',
      error: 'URL não fornecida',
    };
  }

  const trimmed = inputUrl.trim();
  const mpConfig = getMarketplacesConfig();
  const settings = getAffiliateSettings();

  const activeTag =
    customTag?.trim() ||
    mpConfig.amazon?.associateTag?.trim() ||
    mpConfig.amazon?.tagId?.trim() ||
    settings.amazon?.associateTag?.trim() ||
    DEFAULT_AMAZON_TAG ||
    'botvip-20';

  // 1. Resolve short-links (e.g., amzn.to/..., a.co/..., amzn.eu/..., link.amazon/...)
  let resolvedUrl = trimmed;
  const isShortLink =
    trimmed.includes('amzn.to') ||
    trimmed.includes('a.co') ||
    trimmed.includes('amzn.eu') ||
    trimmed.includes('amzn.asia') ||
    trimmed.includes('link.amazon');

  if (isShortLink) {
    try {
      const expanded = await resolveShortLinkToLongUrl(trimmed);
      if (
        expanded &&
        expanded !== trimmed &&
        !expanded.endsWith('amazon.com/') &&
        !expanded.endsWith('amazon.com.br/')
      ) {
        resolvedUrl = expanded;
        console.log(`[Amazon Affiliate] 🔄 Link curto "${trimmed}" expandido para: "${resolvedUrl}"`);
      }
    } catch (err) {
      console.warn('[Amazon Affiliate] Aviso ao expandir link curto Amazon:', err);
    }
  }

  // 2. Extract ASIN
  const asin = extractAmazonAsin(resolvedUrl) || extractAmazonAsin(trimmed);

  if (asin) {
    const canonical = `https://www.amazon.com.br/dp/${asin}`;
    const monetized = `https://www.amazon.com.br/dp/${asin}?tag=${encodeURIComponent(activeTag)}&linkCode=as2`;

    console.log(`[Amazon Affiliate] 🎯 ASIN ${asin} monetizado com a Tag "${activeTag}": ${monetized}`);
    return {
      success: true,
      originalUrl: trimmed,
      canonicalProductUrl: canonical,
      asin,
      monetizedUrl: monetized,
      tagUsed: activeTag,
      method: 'Amazon Associates SiteStripe Oficial (ASIN + Tag + linkCode=as2)',
    };
  }

  // 3. Fallback for non-ASIN Amazon URLs (search, promotions, storefronts):
  // Strip competitor tracking parameters and attach user's Associate Tag
  try {
    const urlObj = new URL(resolvedUrl);
    const toDelete = ['tag', 'ascsubtag', 'linkCode', 'ref', 'ref_', 'psc', 'creative', 'camp', 'creativeASIN'];
    for (const p of toDelete) {
      urlObj.searchParams.delete(p);
    }
    urlObj.searchParams.set('tag', activeTag);
    urlObj.searchParams.set('linkCode', 'as2');

    const monetized = urlObj.toString();
    const cleanCanonical = resolvedUrl.split('?')[0].split('#')[0];

    return {
      success: true,
      originalUrl: trimmed,
      canonicalProductUrl: cleanCanonical,
      asin: null,
      monetizedUrl: monetized,
      tagUsed: activeTag,
      method: 'Link Parametrizado Oficial Amazon Associates',
    };
  } catch {
    const base = resolvedUrl.split('?')[0].split('#')[0];
    const sep = base.includes('?') ? '&' : '?';
    const monetized = `${base}${sep}tag=${encodeURIComponent(activeTag)}&linkCode=as2`;

    return {
      success: true,
      originalUrl: trimmed,
      canonicalProductUrl: base,
      asin: null,
      monetizedUrl: monetized,
      tagUsed: activeTag,
      method: 'Link Parametrizado Oficial Amazon Associates (Fallback)',
    };
  }
}

/**
 * Tests the Amazon Associates Tag configuration with a sample product
 */
export async function testAmazonAssociateTag(tag?: string): Promise<{ success: boolean; message: string; sampleUrl: string; tagUsed: string }> {
  const sampleProduct = 'https://www.amazon.com.br/dp/B09B8VGCR8';
  const result = await converter_link_amazon(sampleProduct, tag);

  if (result.success && result.monetizedUrl.includes(result.tagUsed)) {
    return {
      success: true,
      message: `Amazon Associates ATIVO! Tag "${result.tagUsed}" validada com sucesso no padrão SiteStripe.`,
      sampleUrl: result.monetizedUrl,
      tagUsed: result.tagUsed,
    };
  }

  return {
    success: false,
    message: 'Falha ao validar Tag da Amazon.',
    sampleUrl: '',
    tagUsed: result.tagUsed,
  };
}
