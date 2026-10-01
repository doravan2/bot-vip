/**
 * AliExpress Affiliate Open Platform Service Bridge
 * 
 * Invokes scripts/conversor_aliexpress.py to resolve canonical product URLs
 * and call `aliexpress.affiliate.link.generate` with official TOP MD5 signature.
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
  method: string;
  error?: string;
  details?: any;
}

/**
 * Converts any AliExpress link using the official Python affiliate API generator
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

  // If appSecret is available, execute the official API generator
  if (appSecret) {
    return new Promise((resolve) => {
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
              if (parsed.success && parsed.monetized_url) {
                console.log(`[AliExpress API] 🎯 Link s.click oficial gerado via API: "${parsed.monetized_url}"`);
                resolve(parsed);
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
  }

  return null;
}
