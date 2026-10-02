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
  allGroupsActive: true,
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

/**
 * Normaliza o identificador ou nome de um grupo para match sem ruídos
 */
function normalizeGroupName(str: string): string {
  if (!str) return '';
  return str
    .replace(/^\[(FONTE|DESTINO|WhatsApp|Telegram)\]\s*/gi, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Checa se o Filtro Anti-Marca d'Água está ativo para uma FONTE (grupo/canal/JID de origem)
 */
export function isWatermarkActiveForGroup(groupNameOrJid: string): boolean {
  const config = getWatermarkConfig();
  if (!config.enabled) return false;
  if (config.allGroupsActive || !config.appliedGroups || config.appliedGroups.length === 0) return true;
  if (!groupNameOrJid) return true;

  const rawCandidate = groupNameOrJid.toLowerCase().trim();
  const normCandidate = normalizeGroupName(groupNameOrJid);

  return config.appliedGroups.some((g) => {
    if (!g) return false;
    const rawG = g.toLowerCase().trim();
    if (rawCandidate === rawG) return true;
    if (rawCandidate.includes(rawG) || rawG.includes(rawCandidate)) return true;

    const normG = normalizeGroupName(g);
    if (normCandidate && normG && (normCandidate === normG || normCandidate.includes(normG) || normG.includes(normCandidate))) {
      return true;
    }
    return false;
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
 * Substitui @handles de concorrentes no texto pelo handle oficial do usuário
 */
export function replaceCompetitorHandlesInText(text: string, targetHandle: string = ''): string {
  if (!text) return '';
  const cleanTarget = targetHandle.trim().startsWith('@') ? targetHandle.trim() : targetHandle.trim() ? `@${targetHandle.trim()}` : '';
  if (cleanTarget) {
    return text.replace(/@[A-Za-z0-9_.]+/g, cleanTarget);
  }
  return text.replace(/@[A-Za-z0-9_.]+/g, '').replace(/\s{2,}/g, ' ');
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

    const prompt = `Analise esta foto de produto promocional de e-commerce e determine se ela contém QUALQUER uma das marcas d'água, carimbos de perfil ou elementos visuais de concorrentes listados abaixo:
1. Marca d'água com @ arroba ou nome de concorrente (como: ${known.join(', ')} ou qualquer outro perfil de promoções).
2. Miniatura de foto de perfil (avatar redondo com foto de rosto de homem, mulher ou logotipo no canto superior ou inferior).
3. Selo de verificado azul com checkmark (blue badge) colado na imagem.
4. Banners flutuantes ou logotipos sobrepostos com nomes de grupos de ofertas.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "hasWatermark": boolean (true se houver qualquer marca d'água, avatar ou arroba de concorrente),
  "detectedHandles": string[] (lista de @handles detectados),
  "hasAvatarBadge": boolean (true se houver miniatura de foto de rosto/perfil no canto),
  "hasVerifiedCheckmark": boolean (true se houver selo de verificado sobreposto),
  "confidence": number (de 0.0 a 1.0),
  "reason": string (breve descrição do que foi detectado)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || 'image/jpeg',
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    const cleanJsonText = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);

    return {
      hasWatermark: Boolean(parsed.hasWatermark || parsed.hasAvatarBadge || parsed.hasVerifiedCheckmark),
      detectedHandles: Array.isArray(parsed.detectedHandles) ? parsed.detectedHandles : [],
      hasAvatarBadge: Boolean(parsed.hasAvatarBadge),
      hasVerifiedCheckmark: Boolean(parsed.hasVerifiedCheckmark),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
      reason: parsed.reason || 'Análise visual concluída.',
    };
  } catch (err: any) {
    console.error('[Watermark AI Detector] Erro na análise com Gemini Vision:', err);
    return {
      hasWatermark: false,
      detectedHandles: [],
      hasAvatarBadge: false,
      hasVerifiedCheckmark: false,
      confidence: 0,
      reason: `Falha na análise: ${err?.message || err}`,
    };
  }
}
