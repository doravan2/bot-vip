/**
 * Product Image Extractor Service
 *
 * Automatically detects and downloads high-resolution product photos
 * from Mercado Livre, Shopee, Amazon, AliExpress, Magalu, Temu and other e-commerce links
 * when an incoming source group message does not contain an image.
 */

import { spawn } from 'child_process';
import { normalizeImageBuffer } from './imagePipeline.ts';

// In-memory cache for fast repeated dispatches
const imageCache = new Map<
  string,
  { buffer: Buffer; url: string; mimeType: string; timestamp: number }
>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Upgrades e-commerce product image URLs from thumbnails/low-res to 1000px-1500px Full HD resolution
 */
export function upgradeImageUrlToHighRes(url: string): string {
  if (!url || typeof url !== 'string') return url;
  let clean = url.trim();

  // 1. Mercado Livre: Upgrade mlstatic.com images
  // e.g. ...-I.jpg, -V.jpg, -O.jpg, -V.webp -> -F.jpg (Full HD 1200px+)
  // Also D_NQ_NP_ -> D_NQ_NP_2X_
  if (clean.includes('mlstatic.com')) {
    clean = clean.replace(/-[IVO]\.(jpg|jpeg|webp|png)$/i, '-F.jpg');
    clean = clean.replace(/D_NQ_NP_(?!2X_)/g, 'D_NQ_NP_2X_');
  }

  // 2. Amazon: Upgrade m.media-amazon.com or images-na.ssl-images-amazon.com images
  // e.g. ..._AC_SX100_.jpg, ..._AC_UL320_.jpg, ..._SL160_.jpg -> ..._AC_SL1500_.jpg
  if (clean.includes('amazon.com') || clean.includes('media-amazon.com')) {
    clean = clean.replace(/\._AC_[A-Z0-9_,]+_\./gi, '._AC_SL1500_.');
    clean = clean.replace(/\._[A-Z0-9_,]+_\./gi, '._AC_SL1500_.');
  }

  // 3. Shopee: Upgrade down-br.img.susercontent.com or cf.shopee.com.br
  // e.g. .../file/sg-11134201-7rd5b-m232123456_tn -> .../file/sg-11134201-7rd5b-m232123456
  if (clean.includes('susercontent.com') || clean.includes('shopee.com')) {
    clean = clean.replace(/_tn(\.(jpg|jpeg|webp|png))?$/i, '');
    clean = clean.replace(/_tn$/i, '');
  }

  // 4. AliExpress: Upgrade ae01.alicdn.com or aliexpress-media.com
  // e.g. .../kf/S12345678.jpg_220x220.jpg -> .../kf/S12345678.jpg
  if (clean.includes('alicdn.com') || clean.includes('aliexpress-media.com')) {
    clean = clean.replace(/_\d+x\d+.*$/i, '');
  }

  // 5. SHEIN: Upgrade img.ltwebstatic.com
  if (clean.includes('ltwebstatic.com')) {
    clean = clean.replace(/_\d+x\d+\./gi, '.');
    clean = clean.replace(/_thumbnail\./gi, '.');
  }

  // 6. Magalu: Upgrade luizalabs / magazineluiza
  if (clean.includes('magazineluiza.com') || clean.includes('luizalabs.com')) {
    clean = clean.replace(/\/\d+x\d+\//gi, '/800x800/');
  }

  return clean;
}

/**
 * Extracts AliExpress product image using Python CookieJar with canonical item URL
 */
async function fetchAliExpressImage(productUrl: string): Promise<string | null> {
  // Extract item ID if available
  const match =
    productUrl.match(/\/item\/(\d+)\.html/i) ||
    productUrl.match(/\/item\/(\d+)/i) ||
    productUrl.match(/item[_\-\/](\d+)/i) ||
    productUrl.match(/goodsId=(\d+)/i);

  const targetUrl = match && match[1]
    ? `https://www.aliexpress.com/item/${match[1]}.html`
    : productUrl.split('?')[0];

  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn('python3', [
        '-c',
        `
import urllib.request
import http.cookiejar
import re
import sys
import json

url = sys.argv[1]
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [
    ('User-Agent', '${BROWSER_USER_AGENT}'),
    ('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'),
]

try:
    resp = opener.open(url, timeout=8)
    html = resp.read().decode('utf-8', errors='ignore')
    
    # 1. OpenGraph
    og = re.search(r'<meta[^>]+property=[\"\\']og:image[\"\\'][^>]+content=[\"\\']([^\"\\']+)[\"\\']', html, re.I)
    if not og:
        og = re.search(r'<meta[^>]+content=[\"\\']([^\"\\']+)[\"\\'][^>]+property=[\"\\']og:image[\"\\']', html, re.I)
        
    # 2. AliExpress CDN images (alicdn.com / aliexpress-media.com)
    if not og:
        og = re.search(r'https?://[^\s\"\\'<>]+\.(?:alicdn|aliexpress-media)\.com/kf/[^\s\"\\'<>]+\.(?:jpg|png|webp|jpeg)', html, re.I)
        
    # 3. Twitter Image
    if not og:
        og = re.search(r'<meta[^>]+name=[\"\\']twitter:image[\"\\'][^>]+content=[\"\\']([^\"\\']+)[\"\\']', html, re.I)

    if og:
        img_url = og.group(1) if hasattr(og, 'group') and og.lastindex else og.group(0)
        img_url = img_url.replace('&amp;', '&').replace('\\\\u002F', '/').replace('\\\\/', '/')
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
        print(json.dumps({'success': True, 'imageUrl': img_url}))
        sys.exit(0)
except Exception:
    pass

print(json.dumps({'success': False}))
`,
        targetUrl,
      ]);

      let output = '';
      const timer = setTimeout(() => {
        try {
          pythonProcess.kill();
        } catch {}
        resolve(null);
      }, 9000);

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.on('close', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(output.trim());
          if (parsed.success && parsed.imageUrl) {
            resolve(parsed.imageUrl);
            return;
          }
        } catch {}
        resolve(null);
      });

      pythonProcess.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolves high-resolution Shopee product image using shortlink expansion and Facebook crawler UA
 */
export async function resolveShopeeProductImageUrl(url: string): Promise<string | null> {
  try {
    let target = url.trim();
    if (target.includes('s.shopee.com.br') || target.includes('shope.ee')) {
      const r = await fetch(target, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        redirect: 'manual',
      });
      const loc = r.headers.get('location');
      if (loc) target = loc;
    }

    const m = target.match(/(?:-i\.|\/product\/|\/opaanlp\/|\.i\.)(\d+)[./](\d+)/i) ||
              target.match(/(?:shopid=)(\d+).*(?:itemid=)(\d+)/i);
    let fetchUrl = target;
    if (m && m[1] && m[2]) {
      fetchUrl = `https://shopee.com.br/product/${m[1]}/${m[2]}`;
    }

    const sRes = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (sRes.ok) {
      const html = await sRes.text();
      const og = html.match(/<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"']/i) ||
                 html.match(/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image[\"']/i);
      if (og && og[1]) {
        return upgradeImageUrlToHighRes(og[1]);
      }
    }
  } catch {}
  return null;
}

/**
 * Searches for official product photo by product title as a 100% reliable safety net
 */
export async function searchProductImageByName(productTitle: string): Promise<string | null> {
  if (!productTitle || typeof productTitle !== 'string') return null;
  const cleanQuery = productTitle
    .replace(/^[💥🔥⚡🎉📢🚨🛒✨👉💵🎟]+/gu, '')
    .replace(/(?:VALOR|CUPOM|R\$|\bhttps?:\/\/|\bGRUPO|\bCompartilhe).*$/gis, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .slice(0, 90);

  if (cleanQuery.length < 4) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&t=h_&iax=images&ia=images`,
      {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: controller.signal,
      }
    );
    const tokenHtml = await tokenRes.text();
    const vqdMatch = tokenHtml.match(/vqd=[\"']?([^\"'&]+)/i) || tokenHtml.match(/vqd:\s*\"([^\"]+)\"/i);
    const vqd = vqdMatch ? vqdMatch[1] : null;
    if (!vqd) {
      clearTimeout(timeout);
      return null;
    }

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(cleanQuery)}&vqd=${vqd}&f=,,,`,
      {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!imgRes.ok) return null;
    const imgData: any = await imgRes.json();
    if (Array.isArray(imgData.results) && imgData.results.length > 0) {
      const best = imgData.results.find((r: any) => r.image && !r.image.includes('placeholder')) || imgData.results[0];
      if (best?.image) {
        return upgradeImageUrlToHighRes(best.image);
      }
    }
  } catch {}
  return null;
}

/**
 * Extracts the official product image URL from a product link
 */
export async function fetchProductImageUrl(productUrl: string, productTitle?: string): Promise<string | null> {
  if (!productUrl || typeof productUrl !== 'string') {
    if (productTitle) return searchProductImageByName(productTitle);
    return null;
  }
  const cleanUrl = productUrl.trim();
  if (!cleanUrl.startsWith('http')) {
    if (productTitle) return searchProductImageByName(productTitle);
    return null;
  }

  // Check cache first
  const cached = imageCache.get(cleanUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.url;
  }

  // 1. Shopee Dedicated Engine (handles s.shopee.com.br, shope.ee, and product links)
  if (cleanUrl.includes('shopee') || cleanUrl.includes('shope.ee')) {
    const shopeeImg = await resolveShopeeProductImageUrl(cleanUrl);
    if (shopeeImg) return shopeeImg;
  }

  const isAliExpress = cleanUrl.includes('aliexpress') || cleanUrl.includes('ali.ski');

  // For AliExpress, use the CookieJar engine directly to avoid redirect loops
  if (isAliExpress) {
    const aliImage = await fetchAliExpressImage(cleanUrl);
    if (aliImage) return aliImage;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const finalUrl = res.url || cleanUrl;
    const html = await res.text();

    // 1. OpenGraph image (Standard across Mercado Livre, Shopee, Amazon, Magalu)
    const ogMatch =
      html.match(/<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"']/i) ||
      html.match(/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image[\"']/i) ||
      html.match(
        /<meta[^>]+property=[\"']og:image:secure_url[\"'][^>]+content=[\"']([^\"']+)[\"']/i
      ) ||
      html.match(
        /<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image:secure_url[\"']/i
      );

    if (
      ogMatch &&
      ogMatch[1] &&
      !ogMatch[1].includes('placeholder') &&
      !ogMatch[1].includes('default_logo')
    ) {
      let imgUrl = ogMatch[1].replace(/&amp;/g, '&');
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      return upgradeImageUrlToHighRes(imgUrl);
    }

    // 2. Twitter image tag
    const twitterMatch =
      html.match(/<meta[^>]+name=[\"']twitter:image[\"'][^>]+content=[\"']([^\"']+)[\"']/i) ||
      html.match(/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']twitter:image[\"']/i);

    if (twitterMatch && twitterMatch[1]) {
      let imgUrl = twitterMatch[1].replace(/&amp;/g, '&');
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      return upgradeImageUrlToHighRes(imgUrl);
    }

    // 3. Mercado Livre static image pattern (http2.mlstatic.com/D_NQ_NP_...)
    if (
      cleanUrl.includes('mercadolivre.com') ||
      cleanUrl.includes('meli.la') ||
      finalUrl.includes('mercadolivre.com')
    ) {
      const mlMatch = html.match(
        /https?:\/\/[^\s\"']+mlstatic\.com\/D_NQ_NP_[^\s\"']+\.(?:webp|jpg|jpeg|png)/i
      );
      if (mlMatch) {
        return upgradeImageUrlToHighRes(mlMatch[0]);
      }
    }

    // 4. Amazon product image patterns (m.media-amazon.com or images-na.ssl-images-amazon.com)
    if (
      cleanUrl.includes('amazon') ||
      cleanUrl.includes('amzn.to') ||
      cleanUrl.includes('a.co') ||
      cleanUrl.includes('link.amazon') ||
      finalUrl.includes('amazon')
    ) {
      const amzMatch = html.match(
        /https?:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/I\/[a-zA-Z0-9%_-]+\.(?:jpg|png|webp)/i
      );
      if (amzMatch) {
        return upgradeImageUrlToHighRes(amzMatch[0]);
      }
    }

    // 5. Shopee product image pattern (down-br.img.susercontent.com or cf.shopee.com.br)
    if (
      cleanUrl.includes('shopee.') ||
      cleanUrl.includes('s.shopee') ||
      finalUrl.includes('shopee.')
    ) {
      const shpMatch = html.match(
        /https?:\/\/(?:down-br\.img\.susercontent\.com|cf\.shopee\.com\.br)\/file\/[a-zA-Z0-9_-]+/i
      );
      if (shpMatch) {
        return upgradeImageUrlToHighRes(shpMatch[0]);
      }
    }

    // 6. AliExpress CDN pattern
    if (cleanUrl.includes('aliexpress') || finalUrl.includes('aliexpress')) {
      const aliMatch = html.match(
        /https?:\/\/[^\s\"'<>]+\.(?:alicdn|aliexpress-media)\.com\/kf\/[^\s\"'<>]+\.(?:jpg|png|webp|jpeg)/i
      );
      if (aliMatch) {
        return upgradeImageUrlToHighRes(aliMatch[0]);
      }
    }

    // 7. JSON-LD Schema.org image
    const jsonLdMatch = html.match(/"image":\s*(?:\[\s*)?"(https?:[^"]+)"/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      return upgradeImageUrlToHighRes(jsonLdMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'));
    }
  } catch {
    // If standard fetch fails (e.g. redirect error or timeout), try CookieJar fallback
    if (isAliExpress) {
      const fallbackImage = await fetchAliExpressImage(cleanUrl);
      if (fallbackImage) return upgradeImageUrlToHighRes(fallbackImage);
    }
  }

  // 8. 100% Reliable Fallback: Search image by product name if available
  if (productTitle) {
    const searchedImg = await searchProductImageByName(productTitle);
    if (searchedImg) return searchedImg;
  }

  return null;
}

/**
 * Downloads the product image and returns a pristine, normalized baseline JPEG Buffer ready for WhatsApp/Telegram dispatch
 */
export async function fetchProductImageBuffer(
  productUrl: string,
  productTitle?: string
): Promise<{ buffer: Buffer; url: string; mimeType: string } | null> {
  const cleanUrl = productUrl?.trim();
  if (!cleanUrl && !productTitle) return null;

  // Check cache
  if (cleanUrl) {
    const cached = imageCache.get(cleanUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { buffer: cached.buffer, url: cached.url, mimeType: cached.mimeType };
    }
  }

  const rawImageUrl = await fetchProductImageUrl(cleanUrl, productTitle);
  if (!rawImageUrl) return null;
  const upgradedImageUrl = upgradeImageUrlToHighRes(rawImageUrl);

  // Helper to attempt downloading and validating a candidate image URL
  const tryDownloadAndNormalize = async (targetImgUrl: string): Promise<Buffer | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(targetImgUrl, {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html') || ct.includes('application/json')) {
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      const rawBuf = Buffer.from(arrayBuffer);
      if (rawBuf.length < 200) return null;

      // Normalize through sharp to guarantee 100% compliant baseline JPEG
      return await normalizeImageBuffer(rawBuf);
    } catch {
      return null;
    }
  };

  // 1. Try high-res upgraded URL first
  let normalized = await tryDownloadAndNormalize(upgradedImageUrl);
  let finalUrlUsed = upgradedImageUrl;

  // 2. If upgraded URL failed, fallback to the raw original image URL
  if (!normalized && upgradedImageUrl !== rawImageUrl) {
    normalized = await tryDownloadAndNormalize(rawImageUrl);
    finalUrlUsed = rawImageUrl;
  }

  // 3. If still not normalized and productTitle provided, search by title as last-ditch guarantee
  if (!normalized && productTitle) {
    const fallbackSearchUrl = await searchProductImageByName(productTitle);
    if (fallbackSearchUrl) {
      normalized = await tryDownloadAndNormalize(fallbackSearchUrl);
      if (normalized) {
        finalUrlUsed = fallbackSearchUrl;
      }
    }
  }

  if (!normalized) {
    return null;
  }

  const result = {
    buffer: normalized,
    url: finalUrlUsed,
    mimeType: 'image/jpeg',
    timestamp: Date.now(),
  };

  // Cache the result (keep max 150 items)
  if (cleanUrl) {
    if (imageCache.size > 150) {
      const firstKey = imageCache.keys().next().value;
      if (firstKey) imageCache.delete(firstKey);
    }
    imageCache.set(cleanUrl, result);
  }

  console.log(
    `[ProductImageService] 📸 Foto oficial do produto normalizada com sucesso (${normalized.length} bytes JPEG): "${finalUrlUsed}"`
  );
  return result;
}
