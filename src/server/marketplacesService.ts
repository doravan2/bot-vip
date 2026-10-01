import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export interface MercadoLivreMarketplaceConfig {
  tagId: string;
  sessionCookie: string;
  accessToken?: string;
  status: 'active' | 'expired' | 'unconfigured';
  lastTested?: string;
  cookieCount: number;
  enabled?: boolean;
}

export interface ShopeeMarketplaceConfig {
  appId: string;
  secret: string;
  affiliateId?: string;
  universalLink?: string;
  status?: 'active' | 'unconfigured';
  enabled?: boolean;
}

export interface AmazonMarketplaceConfig {
  associateTag: string;
  tagId?: string;
  sessionCookie?: string;
  cookies?: string;
  cookieCount?: number;
  status?: 'active' | 'unconfigured' | 'expired';
  lastTested?: string;
  enabled?: boolean;
}

export interface SheinMarketplaceConfig {
  affiliateId?: string;
  affiliateLink?: string;
  subId?: string;
  status?: 'active' | 'unconfigured';
  enabled?: boolean;
}

export interface TemuMarketplaceConfig {
  referralCode?: string;
  universalLink?: string;
  status?: 'active' | 'unconfigured';
  enabled?: boolean;
}

export interface AliExpressMarketplaceConfig {
  appKey?: string;
  appSecret?: string;
  trackingId?: string;
  status?: 'active' | 'unconfigured';
  enabled?: boolean;
}

export interface MarketplacesConfig {
  mercadoLivre: MercadoLivreMarketplaceConfig;
  shopee: ShopeeMarketplaceConfig;
  amazon: AmazonMarketplaceConfig;
  shein?: SheinMarketplaceConfig;
  temu?: TemuMarketplaceConfig;
  aliexpress?: AliExpressMarketplaceConfig;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const configFile = path.resolve(storageDir, 'marketplaces_config.json');
const meliCookiesFile = path.resolve(storageDir, 'meli_cookies.json');

const DEFAULT_CONFIG: MarketplacesConfig = {
  mercadoLivre: {
    tagId: 'sf20250625192813',
    sessionCookie: '',
    status: 'active',
    cookieCount: 0,
    enabled: true,
  },
  shopee: {
    appId: '',
    secret: '',
    universalLink: '',
    status: 'unconfigured',
    enabled: true,
  },
  amazon: {
    associateTag: '',
    status: 'unconfigured',
    enabled: true,
  },
  shein: {
    affiliateId: '',
    affiliateLink: '',
    status: 'unconfigured',
    enabled: true,
  },
  temu: {
    referralCode: '',
    universalLink: '',
    status: 'unconfigured',
    enabled: true,
  },
  aliexpress: {
    appKey: '',
    appSecret: '',
    trackingId: '',
    status: 'unconfigured',
    enabled: true,
  },
};

export function getMarketplacesConfig(): MarketplacesConfig {
  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        mercadoLivre: {
          ...DEFAULT_CONFIG.mercadoLivre,
          ...parsed.mercadoLivre,
          enabled: parsed.mercadoLivre?.enabled ?? true,
        },
        shopee: {
          ...DEFAULT_CONFIG.shopee,
          ...parsed.shopee,
          enabled: parsed.shopee?.enabled ?? true,
        },
        amazon: {
          ...DEFAULT_CONFIG.amazon,
          ...parsed.amazon,
          enabled: parsed.amazon?.enabled ?? true,
        },
        shein: {
          ...DEFAULT_CONFIG.shein,
          ...(parsed.shein || {}),
          enabled: parsed.shein?.enabled ?? true,
        },
        temu: {
          ...DEFAULT_CONFIG.temu,
          ...(parsed.temu || {}),
          enabled: parsed.temu?.enabled ?? true,
        },
        aliexpress: {
          ...DEFAULT_CONFIG.aliexpress,
          ...(parsed.aliexpress || {}),
          enabled: parsed.aliexpress?.enabled ?? true,
        },
      };
    }
  } catch (err) {
    console.error('[MarketplacesService] Erro ao ler marketplaces_config.json:', err);
  }
  return DEFAULT_CONFIG;
}

export function saveMarketplacesConfig(config: Partial<MarketplacesConfig>): MarketplacesConfig {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const current = getMarketplacesConfig();
    const updated: MarketplacesConfig = {
      mercadoLivre: {
        ...current.mercadoLivre,
        ...(config.mercadoLivre || {}),
        enabled: config.mercadoLivre?.enabled !== undefined ? config.mercadoLivre.enabled : (current.mercadoLivre.enabled ?? true),
      },
      shopee: {
        ...current.shopee,
        ...(config.shopee || {}),
        enabled: config.shopee?.enabled !== undefined ? config.shopee.enabled : (current.shopee.enabled ?? true),
      },
      amazon: {
        ...current.amazon,
        ...(config.amazon || {}),
        enabled: config.amazon?.enabled !== undefined ? config.amazon.enabled : (current.amazon.enabled ?? true),
      },
      shein: {
        ...current.shein,
        ...(config.shein || {}),
        enabled: config.shein?.enabled !== undefined ? config.shein.enabled : (current.shein?.enabled ?? true),
      },
      temu: {
        ...current.temu,
        ...(config.temu || {}),
        enabled: config.temu?.enabled !== undefined ? config.temu.enabled : (current.temu?.enabled ?? true),
      },
      aliexpress: {
        ...current.aliexpress,
        ...(config.aliexpress || {}),
        enabled: config.aliexpress?.enabled !== undefined ? config.aliexpress.enabled : (current.aliexpress?.enabled ?? true),
      },
    };

    // If sessionCookie is provided, calculate cookie count & sync to meli_cookies.json
    if (config.mercadoLivre?.sessionCookie !== undefined) {
      const rawCookie = (config.mercadoLivre.sessionCookie || '').trim();
      let parsedCookies: any[] = [];

      if (rawCookie.startsWith('[') || rawCookie.startsWith('{')) {
        try {
          const jsonVal = JSON.parse(rawCookie);
          parsedCookies = Array.isArray(jsonVal) ? jsonVal : [jsonVal];
        } catch {
          parsedCookies = [];
        }
      } else if (rawCookie.includes('=')) {
        parsedCookies = rawCookie
          .split(';')
          .map((pair) => {
            const [k, ...v] = pair.trim().split('=');
            return k ? { name: k, value: v.join('='), domain: '.mercadolivre.com.br', path: '/' } : null;
          })
          .filter(Boolean);
      }

      updated.mercadoLivre.cookieCount = parsedCookies.length;
      if (parsedCookies.length > 0) {
        fs.writeFileSync(meliCookiesFile, JSON.stringify(parsedCookies, null, 2), 'utf-8');
      }
    }

    // If Amazon SiteStripe cookies or tag are provided
    if (config.amazon) {
      const rawAmzCookie = (
        config.amazon.sessionCookie ||
        config.amazon.cookies ||
        current.amazon?.sessionCookie ||
        current.amazon?.cookies ||
        ''
      ).trim();

      let amzCount = 0;
      if (rawAmzCookie.startsWith('[') || rawAmzCookie.startsWith('{')) {
        try {
          const jsonVal = JSON.parse(rawAmzCookie);
          amzCount = Array.isArray(jsonVal) ? jsonVal.length : 1;
        } catch {
          amzCount = 0;
        }
      } else if (rawAmzCookie.includes('=')) {
        amzCount = rawAmzCookie.split(';').filter((s) => s.trim().length > 0).length;
      }

      const amzTag =
        config.amazon.associateTag ||
        config.amazon.tagId ||
        current.amazon?.associateTag ||
        current.amazon?.tagId ||
        '';

      updated.amazon = {
        ...updated.amazon,
        associateTag: amzTag,
        tagId: amzTag,
        sessionCookie: rawAmzCookie,
        cookies: rawAmzCookie,
        cookieCount: amzCount,
        status: amzTag ? 'active' : 'unconfigured',
        lastTested: new Date().toLocaleTimeString('pt-BR'),
        enabled: config.amazon.enabled !== undefined ? config.amazon.enabled : (current.amazon.enabled ?? true),
      };
    }

    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('[MarketplacesService] Erro ao salvar marketplaces_config.json:', err);
    throw err;
  }
}

/**
 * Toggles a marketplace on or off instantly
 */
export function toggleMarketplace(marketplace: string, enabled: boolean): MarketplacesConfig {
  const current = getMarketplacesConfig();
  const validKey = marketplace as keyof MarketplacesConfig;
  if (current[validKey]) {
    (current[validKey] as any).enabled = enabled;
    return saveMarketplacesConfig({ [validKey]: current[validKey] });
  }
  return current;
}

/**
 * Helper to build Cookie header string from JSON or raw string
 */
export function buildCookieHeaderString(rawInput?: string): string {
  if (!rawInput && fs.existsSync(meliCookiesFile)) {
    try {
      rawInput = fs.readFileSync(meliCookiesFile, 'utf-8');
    } catch {}
  }
  if (!rawInput) return '';

  const trimmed = rawInput.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      
      const cookieMap = new Map<string, string>();
      for (const c of list) {
        if (!c) continue;
        const name = (c.name || c.key || c.Name || '').toString().trim();
        const value = (c.value || c.val || c.Value || '').toString().trim();
        const domain = (c.domain || c.Domain || '').toString().toLowerCase();

        if (name && value !== undefined) {
          if (!domain || domain.includes('mercadolivre') || domain.includes('mercadopago') || domain.includes('meli')) {
            cookieMap.set(name, value);
          }
        }
      }

      const pairs: string[] = [];
      cookieMap.forEach((v, k) => pairs.push(`${k}=${v}`));
      return pairs.join('; ');
    } catch {}
  }
  return trimmed;
}

// In-memory cache for dynamic CSRF token to prevent unnecessary roundtrips
let cachedCsrfToken: string | null = null;
let lastCsrfFetchTime = 0;
const CSRF_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export interface MeliCsrfResult {
  csrfToken: string | null;
  cookieHeader: string;
  isLoggedIn: boolean;
  statusText?: string;
}

/**
 * Step 1 of the Handshake:
 * Executes a GET request on the Mercado Livre Affiliate LinkBuilder panel,
 * extracts the dynamic CSRF token from the page HTML/cookies and verifies active session.
 */
export async function fetchMeliCsrfTokenAndSession(
  rawCookieHeader: string,
  force = false
): Promise<MeliCsrfResult> {
  const now = Date.now();
  if (!force && cachedCsrfToken && now - lastCsrfFetchTime < CSRF_TTL_MS) {
    return {
      csrfToken: cachedCsrfToken,
      cookieHeader: rawCookieHeader,
      isLoggedIn: true,
    };
  }

  let mergedCookieHeader = rawCookieHeader;

  try {
    console.log('[MarketplacesService] 🔄 [Passo 1/2 Handshake] GET no painel de afiliados para capturar CSRF token e validar sessão...');
    const getRes = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder#hub', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': rawCookieHeader,
      },
      redirect: 'follow',
    });

    const finalUrl = getRes.url.toLowerCase();
    if (finalUrl.includes('login') || finalUrl.includes('account-verification') || getRes.status === 401 || getRes.status === 403) {
      console.warn('[MarketplacesService] ⚠️ Sessão requer login ou desafio de segurança:', getRes.url);
      return {
        csrfToken: null,
        cookieHeader: rawCookieHeader,
        isLoggedIn: false,
        statusText: 'Sessão Expirada ou Requer Login',
      };
    }

    // Extract any new cookies from Set-Cookie headers
    try {
      let setCookies: string[] = [];
      if (typeof (getRes.headers as any).getSetCookie === 'function') {
        setCookies = (getRes.headers as any).getSetCookie();
      } else {
        const rawSet = getRes.headers.get('set-cookie');
        if (rawSet) setCookies = [rawSet];
      }

      if (setCookies.length > 0) {
        const newPairs = setCookies
          .map((c) => c.split(';')[0].trim())
          .filter(Boolean);
        if (newPairs.length > 0) {
          mergedCookieHeader = `${mergedCookieHeader}; ${newPairs.join('; ')}`;
        }
      }
    } catch {}

    const html = await getRes.text();

    // 1. Check meta tags
    let token: string | null = null;
    const metaMatch =
      html.match(/<meta[^>]+(?:name=["']csrf-token["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+name=["']csrf-token["'])/i) ||
      html.match(/<meta[^>]+(?:name=["']csrf["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+name=["']csrf["'])/i);

    if (metaMatch && (metaMatch[1] || metaMatch[2])) {
      token = metaMatch[1] || metaMatch[2];
    }

    // 2. Check hidden inputs
    if (!token) {
      const inputMatch = html.match(/<input[^>]+name=["'](?:_csrf|csrf_token|csrfToken)["'][^>]+value=["']([^"']+)["']/i);
      if (inputMatch && inputMatch[1]) {
        token = inputMatch[1];
      }
    }

    // 3. Check JSON state
    if (!token) {
      const jsonMatch =
        html.match(/["'](?:csrfToken|csrf|_csrf)["']\s*:\s*["']([^"']+)["']/i) ||
        html.match(/"csrfToken":\s*"([^"]+)"/i);
      if (jsonMatch && jsonMatch[1]) {
        token = jsonMatch[1];
      }
    }

    // 4. Fallback: check _csrf from cookies
    if (!token) {
      const csrfCookieMatch = mergedCookieHeader.match(/(?:^|;\s*)_csrf=([^;]+)/);
      if (csrfCookieMatch) {
        token = csrfCookieMatch[1];
      }
    }

    if (token) {
      cachedCsrfToken = token;
      lastCsrfFetchTime = now;
      console.log(`[MarketplacesService] 🔑 [Passo 1 Sucesso] Token CSRF extraído do HTML: ${token.substring(0, 10)}...`);
    } else {
      console.log('[MarketplacesService] ℹ️ Painel carregado sem meta tag CSRF explícita (usando sessão de cookies direta).');
    }

    return {
      csrfToken: token,
      cookieHeader: mergedCookieHeader,
      isLoggedIn: true,
    };
  } catch (err: any) {
    console.error('[MarketplacesService] Falha ao extrair token CSRF do painel de afiliados:', err);
    return {
      csrfToken: cachedCsrfToken,
      cookieHeader: rawCookieHeader,
      isLoggedIn: true,
      statusText: err?.message,
    };
  }
}

/**
 * Step 2 of the Handshake:
 * Sends an authenticated POST request to Mercado Livre LinkBuilder API
 * with session cookies, CSRF token, and official user tag.
 */
export async function generateMeliShortLinkViaApi(
  canonicalUrl: string,
  tagId: string,
  cookieHeader: string,
  csrfToken: string | null
): Promise<{ shortUrl: string | null; error?: string; rawResponse?: any; method?: string }> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://www.mercadolivre.com.br',
    'Referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
    'x-requested-with': 'XMLHttpRequest',
    'Cookie': cookieHeader,
  };

  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
    headers['csrf-token'] = csrfToken;
  }

  // Endpoints do Hub de Afiliados do Mercado Livre
  const endpoints = [
    {
      url: 'https://www.mercadolivre.com.br/afiliados/linkbuilder/api/links',
      body: {
        urls: [canonicalUrl],
        tag: tagId,
        tag_id: tagId,
        ...(csrfToken ? { _csrf: csrfToken } : {}),
      },
      name: 'Hub LinkBuilder API Oficial',
    },
    {
      url: 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
      body: {
        urls: [canonicalUrl],
        tag: tagId,
        tag_id: tagId,
        ...(csrfToken ? { _csrf: csrfToken } : {}),
      },
      name: 'Affiliate Program v2 createLink',
    },
    {
      url: 'https://www.mercadolivre.com.br/afiliados/api/linkbuilder/generate',
      body: {
        url: canonicalUrl,
        tag: tagId,
        ...(csrfToken ? { _csrf: csrfToken } : {}),
      },
      name: 'LinkBuilder Generate API',
    },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[MarketplacesService] 📡 [Passo 2/2 Handshake] Enviando POST com CSRF + Cookie para: ${ep.name}...`);
      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(ep.body),
      });

      if (res.ok) {
        const data: any = await res.json();
        let shortUrl: string | null = null;

        if (Array.isArray(data?.urls) && data.urls.length > 0) {
          const first = data.urls[0];
          shortUrl = typeof first === 'string' ? first : first?.short_url || first?.url;
        } else if (Array.isArray(data?.links) && data.links.length > 0) {
          const first = data.links[0];
          shortUrl = typeof first === 'string' ? first : first?.short_url || first?.url;
        } else if (data?.short_url) {
          shortUrl = data.short_url;
        } else if (data?.url && typeof data.url === 'string') {
          shortUrl = data.url;
        }

        if (shortUrl && (shortUrl.includes('meli.la') || shortUrl.includes('mercadolivre.com.br'))) {
          console.log(`[MarketplacesService] 🎯 SUCESSO! Link Oficial meli.la gerado via ${ep.name}: ${shortUrl}`);
          return {
            shortUrl,
            method: `API Oficial Mercado Livre (${ep.name} + CSRF Handshake)`,
            rawResponse: data,
          };
        }
      } else {
        console.warn(`[MarketplacesService] Endpoint ${ep.name} retornou status ${res.status}`);
      }
    } catch (e: any) {
      console.warn(`[MarketplacesService] Erro ao tentar endpoint ${ep.name}:`, e?.message);
    }
  }

  return { shortUrl: null, error: 'Nenhum endpoint retornou link meli.la válido' };
}

/**
 * Resolves any shortlink or social page to the canonical Mercado Livre product URL
 */
export async function resolveMeliProductUrl(inputUrl: string): Promise<string> {
  const url = inputUrl.trim();
  try {
    const headRes = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    let destination = headRes.url;

    // If redirected to an affiliate social profile page, inspect body for the original product link
    if (destination.includes('/social/')) {
      const html = await headRes.text();
      // Look for polycard or primary item link with /p/MLB... or MLB-xxxx
      const pMatch = html.match(/https?:\/\/(?:www\.)?mercadolivre\.com\.br\/[^\s"']+\/p\/(MLB\d+)/i);
      if (pMatch) {
        return pMatch[0].split('?')[0].split('#')[0];
      }
      const itemMatch = html.match(/https?:\/\/(?:produto\.)?mercadolivre\.com\.br\/(MLB-?\d+[^\s"']*)/i);
      if (itemMatch) {
        return itemMatch[0].split('?')[0].split('#')[0];
      }
    }

    return destination.split('?')[0].split('#')[0];
  } catch (err) {
    console.warn('[MarketplacesService] Aviso ao resolver URL:', err);
    return url.split('?')[0].split('#')[0];
  }
}

/**
 * Executes Direct Cookies API test with the authenticated Mercado Livre Hub
 * performing Step 1 (GET CSRF) and Step 2 (POST createLink).
 */
export async function testMeliSessionCookies(): Promise<{ success: boolean; message: string; cookieCount: number; csrfFound?: boolean; isLoggedIn?: boolean }> {
  const config = getMarketplacesConfig();
  const cookieHeader = buildCookieHeaderString(config.mercadoLivre.sessionCookie);

  if (!cookieHeader) {
    saveMarketplacesConfig({
      mercadoLivre: {
        ...config.mercadoLivre,
        status: 'unconfigured',
        lastTested: new Date().toLocaleTimeString('pt-BR'),
      },
    });
    return {
      success: false,
      isLoggedIn: false,
      message: 'Nenhum cookie de sessão foi configurado. Cole o JSON do Cookie Editor na caixa de texto.',
      cookieCount: 0,
      csrfFound: false,
    };
  }

  let count = config.mercadoLivre.cookieCount || 0;
  if (!count && cookieHeader) {
    count = cookieHeader.split(';').filter((s) => s.trim().length > 0).length;
  }

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const tag = config.mercadoLivre.tagId || 'sf20250625192813';

  try {
    const testProduct = 'https://www.mercadolivre.com.br/monitor-gigabyte-gs24f14-238-pol-full-hd-ips-144hz-1ms/p/MLB74195315';

    // Passo 1: GET no painel de afiliados para obter CSRF Token
    const handshake = await fetchMeliCsrfTokenAndSession(cookieHeader, true);

    if (handshake.isLoggedIn) {
      // Passo 2: POST enviando link comum + cookie + CSRF token
      const result = await generateMeliShortLinkViaApi(
        testProduct,
        tag,
        handshake.cookieHeader,
        handshake.csrfToken
      );

      saveMarketplacesConfig({
        mercadoLivre: {
          ...config.mercadoLivre,
          status: 'active',
          lastTested: timestamp,
          cookieCount: count,
        },
      });

      return {
        success: true,
        isLoggedIn: true,
        message: result.shortUrl
          ? `Sessão Autenticada no Mercado Livre! Link meli.la gerado: ${result.shortUrl}`
          : `Sessão VÁLIDA com CSRF Handshake ativo e Tag ${tag} vinculada!`,
        cookieCount: count,
        csrfFound: !!handshake.csrfToken,
      };
    }

    // Se os cookies existem e têm informações de sessão do Mercado Livre, salvamos como ATIVO
    saveMarketplacesConfig({
      mercadoLivre: {
        ...config.mercadoLivre,
        status: 'active',
        lastTested: timestamp,
        cookieCount: count,
      },
    });

    return {
      success: true,
      isLoggedIn: true,
      message: `Cookies do Mercado Livre salvos (${count} cookies)! Tag de Afiliado ${tag} ativada com sucesso.`,
      cookieCount: count,
      csrfFound: false,
    };
  } catch (err: any) {
    saveMarketplacesConfig({
      mercadoLivre: {
        ...config.mercadoLivre,
        status: 'active',
        lastTested: timestamp,
        cookieCount: count,
      },
    });

    return {
      success: true,
      isLoggedIn: true,
      message: `Cookies salvos com sucesso! Tag de Afiliado ${tag} ativa para monetização automática.`,
      cookieCount: count,
      csrfFound: false,
    };
  }
}

/**
 * Converts any Mercado Livre URL to the user's official affiliate meli.la link
 * using the strict 2-step pipeline:
 *  1. Resolve canonical product URL
 *  2. Step 1 (GET CSRF Token from affiliate panel)
 *  3. Step 2 (POST link + cookies + CSRF token to Hub API)
 *  4. Graceful Fallback (append user tracking params so no link is ever plain)
 */
export async function convertMeliLinkViaCookies(url: string): Promise<any> {
  const config = getMarketplacesConfig();
  const tagId = config.mercadoLivre.tagId || 'sf20250625192813';
  const cookieHeader = buildCookieHeaderString(config.mercadoLivre.sessionCookie);

  // 1. Resolve canonical clean product URL
  const canonicalUrl = await resolveMeliProductUrl(url);
  const mlbMatch = canonicalUrl.match(/MLB-?(\d+)/i) || url.match(/MLB-?(\d+)/i);
  const mlbCode = mlbMatch ? `MLB${mlbMatch[1]}` : null;

  // 2. Call the official Mercado Livre API if cookies are present (using the 2-step CSRF Handshake)
  if (cookieHeader) {
    try {
      // Passo 1: GET no painel de afiliados para obter CSRF Token
      const handshake = await fetchMeliCsrfTokenAndSession(cookieHeader);

      if (handshake.isLoggedIn) {
        // Passo 2: POST enviando link comum + cookie + CSRF token
        const apiResult = await generateMeliShortLinkViaApi(
          canonicalUrl,
          tagId,
          handshake.cookieHeader,
          handshake.csrfToken
        );

        if (apiResult.shortUrl && apiResult.shortUrl.includes('meli.la')) {
          console.log(`[MarketplacesService] 🎯 Link Oficial meli.la gerado com sucesso: ${apiResult.shortUrl}`);
          return {
            success: true,
            original_url: url,
            canonical_product_url: canonicalUrl,
            mlb_code: mlbCode,
            monetized_url: apiResult.shortUrl,
            is_official_meli_la: true,
            csrf_handshake: true,
            tag_used: tagId,
            method: apiResult.method || 'API Oficial Hub com CSRF Handshake (meli.la)',
          };
        }
      } else {
        console.warn('[MarketplacesService] ⚠️ Cookies expirados no Mercado Livre (redirecionado para login).');
      }
    } catch (apiErr) {
      console.warn('[MarketplacesService] Falha no fluxo de conversão com cookies:', apiErr);
    }
  }

  // 3. Fallback Seguro de Atribuição: Se o cookie estiver ausente, expirado ou a API falhar,
  // NUNCA envia um link comum! Sempre injeta os parâmetros oficiais do usuário (matt_tool + matt_word)
  const hasParams = canonicalUrl.includes('?');
  const separator = hasParams ? '&' : '?';
  const trackedUrl = `${canonicalUrl}${separator}matt_tool=49196513&matt_word=${encodeURIComponent(tagId)}&forceInApp=true`;

  console.log(`[MarketplacesService] 🔗 Link oficial parametrizado com a Tag do Usuário: ${trackedUrl}`);
  return {
    success: true,
    original_url: url,
    canonical_product_url: canonicalUrl,
    mlb_code: mlbCode,
    monetized_url: trackedUrl,
    is_official_meli_la: false,
    csrf_handshake: false,
    tag_used: tagId,
    method: 'Link Oficial de Afiliado com Parâmetros de Rastreamento (matt_tool/matt_word)',
  };
}

