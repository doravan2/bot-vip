/**
 * AliExpress Affiliate Open Platform Service Bridge
 * 
 * Invokes scripts/conversor_aliexpress.py or generates official
 * AliExpress Portals (s.click.aliexpress.com) deep links with App Key and Tracking ID.
 */

import { execFile } from 'child_process';
import path from 'path';
import { getMarketplacesConfig } from './marketplacesService.ts';

export interface AliExpressConversionResult {
  success: boolean;
  original_url: string;
  canonical_url: string;
  monetized_url: string;
  promotion_link?: string;
  marketplace: string;
  platform_label: string;
  tracking_id?: string;
  method: string;
  error?: string;
  details?: any;
}

/**
 * Extracts clean AliExpress Item ID and Canonical URL
 */
export function extractAliExpressCanonicalUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  const match =
    trimmed.match(/\/item\/(\d+)\.html/i) ||
    trimmed.match(/\/item\/(\d+)/i) ||
    trimmed.match(/item[_\-\/](\d+)/i) ||
    trimmed.match(/goodsId=(\d+)/i);

  if (match && match[1]) {
    return `https://pt.aliexpress.com/item/${match[1]}.html`;
  }
  return trimmed.split('?')[0].split('#')[0];
}

/**
 * Converts any AliExpress link using the official Python affiliate API generator or Portals DeepLink
 */
export async function converterLinkAliExpress(
  rawUrl: string,
  overrideAppKey?: string,
  overrideAppSecret?: string,
  overrideTrackingId?: string
): Promise<AliExpressConversionResult | null> {
  const mpConfig = getMarketplacesConfig();
  const appKey = (overrideAppKey || mpConfig.aliexpress?.appKey || '').trim();
  const appSecret = (overrideAppSecret || mpConfig.aliexpress?.appSecret || '').trim();
  const trackingId = (overrideTrackingId || mpConfig.aliexpress?.trackingId || '').trim();

  if (!rawUrl || !appKey) {
    return null;
  }

  const cleanCanonical = extractAliExpressCanonicalUrl(rawUrl);

  // If appSecret is available, execute the official API generator
  if (appSecret) {
    const pythonResult = await new Promise<AliExpressConversionResult | null>((resolve) => {
      const scriptPath = path.resolve(process.cwd(), 'scripts', 'conversor_aliexpress.py');
      
      execFile(
        'python3',
        [scriptPath, rawUrl.trim(), appKey, appSecret, trackingId],
        { timeout: 12000 },
        (error, stdout, stderr) => {
          if (stderr) {
            console.warn('[AliExpress API Service] Log do script Python:\n', stderr);
          }
          if (!error && stdout) {
            try {
              const parsed = JSON.parse(stdout.trim());
              if (parsed.success && (parsed.monetized_url || parsed.promotion_link)) {
                const finalUrl = parsed.monetized_url || parsed.promotion_link;
                console.log(`[AliExpress API] 🎯 Link s.click oficial gerado via API: "${finalUrl}"`);
                resolve({
                  ...parsed,
                  monetized_url: finalUrl,
                  promotion_link: finalUrl,
                  tracking_id: trackingId,
                });
                return;
              }
            } catch (jsonErr) {
              console.error('[AliExpress API] Erro ao interpretar saída JSON:', jsonErr);
            }
          }
          resolve(null);
        }
      );
    });

    if (pythonResult) {
      return pythonResult;
    }
  }

  // Fallback / Direct Generation for App Key / Short Key
  const isShortKey = appKey.startsWith('_') || (appKey.length <= 12 && !/^\d+$/.test(appKey));
  let directMonetized = '';

  if (isShortKey) {
    directMonetized = `https://s.click.aliexpress.com/deep_link.htm?aff_short_key=${encodeURIComponent(appKey)}&dl_target_url=${encodeURIComponent(cleanCanonical || rawUrl.trim())}`;
  } else {
    directMonetized = `https://s.click.aliexpress.com/deep_link.htm?app_key=${encodeURIComponent(appKey)}&targetUrl=${encodeURIComponent(cleanCanonical || rawUrl.trim())}`;
  }

  if (trackingId) {
    directMonetized += `&tracking_id=${encodeURIComponent(trackingId)}`;
  }

  console.log(`[AliExpress Service] 🎯 Link Oficial s.click gerado com sucesso: ${directMonetized}`);

  return {
    success: true,
    original_url: rawUrl,
    canonical_url: cleanCanonical || rawUrl,
    monetized_url: directMonetized,
    promotion_link: directMonetized,
    marketplace: 'aliexpress',
    platform_label: 'AliExpress Oficial (s.click)',
    tracking_id: trackingId,
    method: isShortKey ? 'AliExpress Portals ShortKey (s.click)' : 'AliExpress Portals DeepLink (s.click)',
  };
}

/**
 * Tests AliExpress App Key with a sample product URL
 */
export async function testAliExpressAppKey(
  appKey: string,
  appSecret?: string,
  trackingId?: string
): Promise<{ success: boolean; message: string; sampleUrl?: string }> {
  if (!appKey || !appKey.trim()) {
    return {
      success: false,
      message: 'Informe a sua App Key ou Short Key do AliExpress Portals.',
    };
  }

  const testProduct = 'https://pt.aliexpress.com/item/1005006283921000.html';
  const result = await converterLinkAliExpress(testProduct, appKey.trim(), (appSecret || '').trim(), (trackingId || '').trim());

  if (result && result.monetized_url) {
    return {
      success: true,
      message: `Conversão ativa! Link oficial s.click gerado com sucesso para a chave "${appKey}".`,
      sampleUrl: result.monetized_url,
    };
  }

  return {
    success: false,
    message: 'Não foi possível gerar o link de teste com a App Key informada.',
  };
}
