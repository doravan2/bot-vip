/**
 * Shopee Affiliate GraphQL Service & AI Studio Function Calling
 * 
 * Implementa a integração oficial com a API GraphQL de Afiliados da Shopee Brasil:
 *  - Autenticação via SHA-256 (app_id + timestamp + payload + app_secret)
 *  - Geração de links curtos oficiais (generateShortLink)
 *  - Expansão automática de links encurtados (shope.ee / s.shopee.com.br)
 *  - Declaração de Ferramenta (Function Declaration) para Google AI Studio / Gemini: 'gerar_link_afiliado_shopee'
 */

import crypto from 'crypto';
import { getMarketplacesConfig } from './marketplacesService.ts';
import { resolveShortLinkToLongUrl, monetizeShopee } from '../utils/affiliateEngine.ts';

export const GERAR_LINK_AFILIADO_SHOPEE_DECLARATION = {
  name: 'gerar_link_afiliado_shopee',
  description: 'Usa a API da Shopee para converter um link comum ou encurtado em um link de afiliado rastreável.',
  parameters: {
    type: 'OBJECT',
    properties: {
      url_produto: {
        type: 'STRING',
        description: 'URL original ou encurtada do produto na Shopee (ex: https://shopee.com.br/... ou https://shope.ee/...)',
      },
    },
    required: ['url_produto'],
  },
};

export interface ShopeeConvertResult {
  success: boolean;
  shortLink: string | null;
  originalUrl: string;
  error?: string;
  rawResponse?: any;
}

/**
 * Recebe um link da Shopee, expande links encurtados de forma resiliente,
 * gera a assinatura criptográfica SHA-256 e devolve o link curto de afiliado oficial (s.shopee.com.br).
 * Se a API GraphQL falhar ou não estiver disponível, gera fallback com Custom Link rastreado.
 * 
 * @param url_original URL do produto ou link encurtado (shope.ee / s.shopee.com.br)
 */
export async function converter_link_shopee(url_original: string): Promise<string | null> {
  if (!url_original || typeof url_original !== 'string') return null;
  const cleanUrl = url_original.trim();
  if (!cleanUrl) return null;

  const config = getMarketplacesConfig();
  const appId = config.shopee?.appId?.trim() || process.env.SHOPEE_APP_ID?.trim() || '18321500539';
  const appSecret = config.shopee?.secret?.trim() || process.env.SHOPEE_SECRET?.trim() || 'Q2R37O67MZG72WYM5L2NY5KARDWDT5WJ';
  const affiliateId = config.shopee?.affiliateId?.trim() || appId;

  const urlApi = 'https://open-api.affiliate.shopee.com.br/graphql';

  // Expande link encurtado (shope.ee / s.shopee.com.br) para a URL longa canônica do produto
  let canonicalProductUrl = cleanUrl;
  if (cleanUrl.includes('shope.ee') || cleanUrl.includes('s.shopee.com.br')) {
    try {
      const resolved = await resolveShortLinkToLongUrl(cleanUrl);
      if (resolved && resolved !== cleanUrl && resolved.includes('shopee.com.br')) {
        canonicalProductUrl = resolved;
      }
    } catch (expErr) {
      console.warn('[Shopee Affiliate] Aviso ao expandir link encurtador Shopee:', expErr);
    }
  }

  const urlsToTry = [canonicalProductUrl];
  if (cleanUrl !== canonicalProductUrl) {
    urlsToTry.push(cleanUrl);
  }

  if (appId && appSecret) {
    for (const targetUrl of urlsToTry) {
      try {
        // Montar o Payload (GraphQL generateShortLink)
        const payloadDict = {
          query: `mutation {
            generateShortLink(input: {originUrl: "${targetUrl}"}) {
              shortLink
            }
          }`,
        };

        const payloadStr = JSON.stringify(payloadDict);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const textoParaAssinar = appId + timestamp + payloadStr + appSecret;
        const assinatura = crypto.createHash('sha256').update(textoParaAssinar).digest('hex');

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resposta = await fetch(urlApi, {
          method: 'POST',
          headers,
          body: payloadStr,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const dados: any = await resposta.json().catch(() => null);
        const linkCurto = dados?.data?.generateShortLink?.shortLink;

        if (linkCurto) {
          console.log(`[Shopee Affiliate] 🎯 SUCESSO! Link de afiliado gerado via GraphQL: ${linkCurto}`);
          return linkCurto;
        }
      } catch (e: any) {
        console.warn(`[Shopee Affiliate] Erro de conexão com a API GraphQL (${targetUrl}):`, e?.message);
      }
    }
  }

  // Fallback garantido: Custom Link oficial Shopee com af_siteid
  const fallbackUrl = monetizeShopee(canonicalProductUrl || cleanUrl, affiliateId);
  if (fallbackUrl) {
    console.log(`[Shopee Affiliate] 🚀 Fallback Custom Link Shopee aplicado com sucesso: ${fallbackUrl}`);
    return fallbackUrl;
  }

  return null;
}

/**
 * Função acionada pelo Google AI Studio / Gemini Function Calling:
 * Name: gerar_link_afiliado_shopee
 */
export async function gerar_link_afiliado_shopee(args: {
  url_produto: string;
}): Promise<{ link_afiliado?: string; erro?: string }> {
  const url_do_grupo = args?.url_produto;
  console.log(`[AI Tool Shopee] Convertendo link da Shopee: ${url_do_grupo}`);

  const link_convertido = await converter_link_shopee(url_do_grupo);

  if (link_convertido) {
    return { link_afiliado: link_convertido };
  } else {
    return { erro: 'Falha na conversão, cancele a postagem' };
  }
}
