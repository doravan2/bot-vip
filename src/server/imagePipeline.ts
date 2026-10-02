/**
 * Unified Image Pipeline & Normalizer for WhatsApp & Telegram
 * 
 * Ensures all images sent to WhatsApp and Telegram are:
 * 1. Verified genuine image buffers (not HTML error pages, 403 blocks, or 1x1 tracking pixels)
 * 2. Converted to 100% compliant baseline standard JPEG
 * 3. Transparent channels flattened with crisp white background (#ffffff)
 * 4. Resized to safe bounds (max 1600x1600) to prevent timeouts or memory crashes
 * 5. Auto-rotated based on EXIF orientation
 * 
 * This completely eliminates:
 * - Telegram "IMAGE_PROCESS_FAILED"
 * - WhatsApp corrupted/black squares or failed media delivery
 * - Pixelated 32px thumbnails
 */

import sharp from 'sharp';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Synchronous magic bytes detector to quickly check if a buffer is an image
 */
export function isLikelyImageBuffer(buffer: Buffer | null | undefined): boolean {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) {
    return false;
  }

  // Reject obvious HTML, XML, JSON, or text responses
  const headerSlice = buffer.subarray(0, 100).toString('utf-8').trim().toLowerCase();
  if (
    headerSlice.startsWith('<!doctype') ||
    headerSlice.startsWith('<html') ||
    headerSlice.startsWith('<?xml') ||
    headerSlice.startsWith('{') ||
    headerSlice.includes('<title>403') ||
    headerSlice.includes('<title>503') ||
    headerSlice.includes('access denied') ||
    headerSlice.includes('cloudflare') ||
    headerSlice.includes('challenge-platform')
  ) {
    return false;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return true;
  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;

  return false;
}

/**
 * Normalizes any image (Buffer, data URL, or HTTP URL) into a pristine,
 * 100% compliant baseline JPEG buffer ready for WhatsApp and Telegram Bot API.
 * 
 * Returns null if the input is not a valid image or cannot be decoded.
 */
export async function normalizeImageBuffer(
  input: Buffer | string | null | undefined
): Promise<Buffer | null> {
  if (!input) return null;

  let rawBuffer: Buffer | null = null;

  // 1. If string: check data URL or HTTP URL
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('data:image/')) {
      const parts = trimmed.split(',');
      if (parts.length > 1) {
        try {
          rawBuffer = Buffer.from(parts[1], 'base64');
        } catch {
          return null;
        }
      }
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(trimmed, {
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

        const ab = await res.arrayBuffer();
        if (ab.byteLength > 100) {
          rawBuffer = Buffer.from(ab);
        }
      } catch {
        return null;
      }
    }
  } else if (Buffer.isBuffer(input)) {
    rawBuffer = input;
  }

  if (!rawBuffer || rawBuffer.length < 100) {
    return null;
  }

  // 2. Reject text/HTML pages disguised as images
  if (!isLikelyImageBuffer(rawBuffer)) {
    return null;
  }

  // 3. Process with sharp
  try {
    const imageInstance = sharp(rawBuffer);
    const metadata = await imageInstance.metadata();

    // Check minimum valid product image dimensions
    // Rejects 1x1 tracking pixels, 16x16 or 32x32 sprites
    if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 80) {
      return null;
    }

    // Convert to baseline, non-progressive standard JPEG
    // Max 1600x1600 (without enlargement)
    const normalized = await imageInstance
      .rotate() // Auto-orient based on EXIF tag
      .resize(1600, 1600, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' }) // Ensure transparency is replaced with clean white
      .jpeg({
        quality: 90,
        progressive: false, // Baseline JPEG is 100% compatible with Telegram Bot API and WhatsApp
        chromaSubsampling: '4:2:0',
      })
      .toBuffer();

    if (normalized.length < 200) {
      return null;
    }

    return normalized;
  } catch (err: any) {
    console.warn('[ImagePipeline] Falha ao decodificar/normalizar imagem com sharp:', err?.message || err);
    return null;
  }
}
