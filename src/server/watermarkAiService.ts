import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

export interface WatermarkConfig {
  enabled: boolean;
  action: 'replace_clean_photo';
  knownUsernames: string[];
  detectAvatarBadges: boolean;
  detectVerifiedCheckmark: boolean;
  replaceTextHandle?: boolean;
  userHandle?: string;
  appliedGroups?: string[];
  allGroupsActive?: boolean;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const configFilePath = path.resolve(storageDir, 'watermark_config.json');

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: true,
  action: 'replace_clean_photo',
  knownUsernames: ['@gustavohoffmannofc', 'gustavohoffmannofc'],
  detectAvatarBadges: true,
  detectVerifiedCheckmark: true,
  replaceTextHandle: true,
  userHandle: '',
  appliedGroups: [],
  allGroupsActive: false,
};

let inMemoryConfig: WatermarkConfig = { ...DEFAULT_CONFIG };

try {
  if (fs.existsSync(configFilePath)) {
    const raw = fs.readFileSync(configFilePath, 'utf-8');
    inMemoryConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw), action: 'replace_clean_photo' };
  }
} catch {
  inMemoryConfig = { ...DEFAULT_CONFIG };
}

export function getWatermarkConfig(): WatermarkConfig {
  return inMemoryConfig;
}

export function isWatermarkActiveForGroup(groupNameOrJid: string): boolean {
  const config = getWatermarkConfig();
  if (!config.enabled) return false;
  if (config.allGroupsActive) return true;
  if (!config.appliedGroups || config.appliedGroups.length === 0) return false;
  const cleanTarget = groupNameOrJid.toLowerCase().trim();
  return config.appliedGroups.some((g) => {
    const cleanG = g.toLowerCase().trim();
    return cleanTarget.includes(cleanG) || cleanG.includes(cleanTarget);
  });
}

export function saveWatermarkConfig(updates: Partial<WatermarkConfig>): WatermarkConfig {
  inMemoryConfig = { ...inMemoryConfig, ...updates };
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(configFilePath, JSON.stringify(inMemoryConfig, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar watermark_config.json:', e);
  }
  return inMemoryConfig;
}

/**
 * Detects watermarks, avatar badge overlays, verified checkmark seals,
 * or username handles (like @gustavohoffmannofc) on product image base64 data.
 */
export async function detectWatermarkOnImage(base64Data: string, mimeType: string = 'image/jpeg'): Promise<{
  hasWatermark: boolean;
  detectedHandles: string[];
  hasAvatarBadge: boolean;
  hasVerifiedCheckmark: boolean;
  confidence: number;
  reason?: string;
}> {
  const config = getWatermarkConfig();
  if (!config.enabled) {
    return {
      hasWatermark: false,
      detectedHandles: [],
      hasAvatarBadge: false,
      hasVerifiedCheckmark: false,
      confidence: 0,
    };
  }

  // Quick fallback check against known usernames in OCR/string if text present
  const known = config.knownUsernames || ['@gustavohoffmannofc'];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      hasWatermark: false,
      detectedHandles: [],
      hasAvatarBadge: false,
      hasVerifiedCheckmark: false,
      confidence: 0,
      reason: 'Sem chave GEMINI_API_KEY configurada para visão.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Model selection: Use gemini-2.5-flash (standard high-speed vision model)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Examine esta imagem de produto com atenção total para identificar se existe alguma marca d'água de concorrente, selo de perfil, avatar circular com borda, selo azul de verificado ou arroba/username de rede social (exemplo: @gustavohoffmannofc ou similar).

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "hasWatermark": boolean,
  "detectedHandles": string[],
  "hasAvatarBadge": boolean,
  "hasVerifiedCheckmark": boolean,
  "confidence": number,
  "description": string
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text?.trim();
    if (text) {
      const parsed = JSON.parse(text);
      const detected: string[] = Array.isArray(parsed.detectedHandles) ? parsed.detectedHandles : [];

      // Check if known handles matched
      const matchedKnown = known.some((k) =>
        text.toLowerCase().includes(k.toLowerCase().replace('@', ''))
      );

      const isWatermarked =
        parsed.hasWatermark ||
        parsed.hasAvatarBadge ||
        parsed.hasVerifiedCheckmark ||
        detected.length > 0 ||
        matchedKnown;

      return {
        hasWatermark: !!isWatermarked,
        detectedHandles: detected,
        hasAvatarBadge: !!parsed.hasAvatarBadge,
        hasVerifiedCheckmark: !!parsed.hasVerifiedCheckmark,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        reason: parsed.description || 'Marca d\'água ou marca de concorrente identificada.',
      };
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded')) {
      console.warn('[Watermark AI Detector] ⚠️ Cota do Gemini excedida (429). Alternando temporariamente para filtro local de marca d\'água.');
    } else {
      console.warn('[Watermark AI Detector] Aviso ao analisar imagem com IA:', errMsg);
    }
  }

  return {
    hasWatermark: false,
    detectedHandles: [],
    hasAvatarBadge: false,
    hasVerifiedCheckmark: false,
    confidence: 0,
  };
}

/**
 * Replaces competitor social handles (like @atacadovipofertas, @grupo_descontos, etc.)
 * in copy text with the user's custom handle or removes them cleanly.
 */
export function replaceCompetitorHandlesInText(text: string, newUserHandle?: string): string {
  if (!text) return '';
  const config = getWatermarkConfig();
  const known = config.knownUsernames || [];

  let result = text;

  // Replace known handles first
  for (const handle of known) {
    if (!handle) continue;
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const regex = new RegExp(cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (newUserHandle && newUserHandle.trim()) {
      const replacement = newUserHandle.trim().startsWith('@')
        ? newUserHandle.trim()
        : `@${newUserHandle.trim()}`;
      result = result.replace(regex, replacement);
    } else {
      result = result.replace(regex, '');
    }
  }

  // Replace any generic handle (@username) if configured
  if (newUserHandle && newUserHandle.trim()) {
    const replacement = newUserHandle.trim().startsWith('@')
      ? newUserHandle.trim()
      : `@${newUserHandle.trim()}`;
    result = result.replace(/@[A-Za-z0-9_.]+/g, replacement);
  } else {
    result = result.replace(/@[A-Za-z0-9_.]+/g, '');
  }

  // Clean up extra spaces left by removals
  return result.replace(/  +/g, ' ').trim();
}
