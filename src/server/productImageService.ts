/**
 * Product Image Extractor Service
 *
 * Automatically detects and downloads high-resolution product photos
 * from Mercado Livre, Shopee, Amazon, AliExpress, Magalu, Temu and other e-commerce links
 * when an incoming source group message does not contain an image.
 */

import { spawn } from 'child_process';

// In-memory cache for fast repeated dispatches
const imageCache = new Map<
  string,
  { buffer: Buffer; url: string; mimeType: string; timestamp: number }
>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
 * Extracts the official product image URL from a product link
 */
export async function fetchProductImageUrl(productUrl: string): Promise<string | null> {
  if (!productUrl || typeof productUrl !== 'string') return null;
  const cleanUrl = productUrl.trim();
  if (!cleanUrl.startsWith('http')) return null;

  // Check cache first
  const cached = imageCache.get(cleanUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.url;
  }

  const isAliExpress = cleanUrl.includes('aliexpress') || cleanUrl.includes('ali.ski');

  // For AliExpress, use the CookieJar engine directly to avoid redirect loops
  if (isAliExpress) {
    const aliImage = await fetchAliExpressImage(cleanUrl);
    if (aliImage) return aliImage;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
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
      return imgUrl;
    }

    // 2. Twitter image tag
    const twitterMatch =
      html.match(/<meta[^>]+name=[\"']twitter:image[\"'][^>]+content=[\"']([^\"']+)[\"']/i) ||
      html.match(/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']twitter:image[\"']/i);

    if (twitterMatch && twitterMatch[1]) {
      let imgUrl = twitterMatch[1].replace(/&amp;/g, '&');
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      return imgUrl;
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
        return mlMatch[0];
      }
    }

    // 4. Amazon product image patterns (m.media-amazon.com or images-na.ssl-images-amazon.com)
    if (
      cleanUrl.includes('amazon.') ||
      cleanUrl.includes('amzn.to') ||
      finalUrl.includes('amazon.')
    ) {
      const amzMatch = html.match(
        /https?:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/I\/[a-zA-Z0-9%_-]+\.(?:jpg|png|webp)/i
      );
      if (amzMatch) {
        return amzMatch[0];
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
        return shpMatch[0];
      }
    }

    // 6. AliExpress CDN pattern
    if (cleanUrl.includes('aliexpress') || finalUrl.includes('aliexpress')) {
      const aliMatch = html.match(
        /https?:\/\/[^\s\"'<>]+\.(?:alicdn|aliexpress-media)\.com\/kf\/[^\s\"'<>]+\.(?:jpg|png|webp|jpeg)/i
      );
      if (aliMatch) {
        return aliMatch[0];
      }
    }

    // 7. JSON-LD Schema.org image
    const jsonLdMatch = html.match(/"image":\s*(?:\[\s*)?"(https?:[^"]+)"/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      return jsonLdMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    }
  } catch {
    // If standard fetch fails (e.g. redirect error or timeout), try CookieJar fallback
    if (isAliExpress) {
      const fallbackImage = await fetchAliExpressImage(cleanUrl);
      if (fallbackImage) return fallbackImage;
    }
  }

  return null;
}

/**
 * Downloads the product image and returns a Buffer ready for WhatsApp dispatch
 */
export async function fetchProductImageBuffer(
  productUrl: string
): Promise<{ buffer: Buffer; url: string; mimeType: string } | null> {
  const cleanUrl = productUrl?.trim();
  if (!cleanUrl) return null;

  // Check cache
  const cached = imageCache.get(cleanUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { buffer: cached.buffer, url: cached.url, mimeType: cached.mimeType };
  }

  const imageUrl = await fetchProductImageUrl(cleanUrl);
  if (!imageUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Minimum size check (must be at least 500 bytes to be a valid image)
    if (buffer.length < 500) {
      return null;
    }

    const result = {
      buffer,
      url: imageUrl,
      mimeType: contentType.split(';')[0],
      timestamp: Date.now(),
    };

    // Cache the result (keep max 150 items)
    if (imageCache.size > 150) {
      const firstKey = imageCache.keys().next().value;
      if (firstKey) imageCache.delete(firstKey);
    }
    imageCache.set(cleanUrl, result);

    console.log(
      `[ProductImageService] 📸 Foto do produto baixada com sucesso (${buffer.length} bytes): "${imageUrl}"`
    );
    return result;
  } catch {
    return null;
  }
}
