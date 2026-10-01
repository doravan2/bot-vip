export const OFFICIAL_USER_AFFILIATE_ID = 'sf20250625192813';
export const OFFICIAL_SOURCE = 'whatsapp';
export const DEFAULT_VIP_GROUP_LINK = 'https://chat.whatsapp.com/CnMivNFKWlF7juMu85u5KO';
export const DEFAULT_SHOPEE_AFFILIATE_ID = '18349270032';
export const DEFAULT_AMAZON_TAG = 'botvip-20';
export const DEFAULT_SHEIN_ID = '';
export const DEFAULT_TEMU_CODE = '';

export type MarketplaceType =
  | 'mercadolivre'
  | 'shopee'
  | 'amazon'
  | 'shein'
  | 'temu'
  | 'aliexpress'
  | 'generic';

export interface ConvertedLinkResult {
  originalUrl: string;
  monetizedUrl: string;
  marketplace: MarketplaceType;
  platformLabel: string;
  trackingIdUsed: string;
  methodUsed: string;
  isDisabled?: boolean;
}

export interface CustomAffiliateOptions {
  mlToolId?: string;
  mlSource?: string;
  mattTool?: string;
  mattWord?: string;
  shopeeAffiliateId?: string;
  amazonTag?: string;
  sheinAffiliateId?: string;
  sheinUniversalLink?: string;
  temuCode?: string;
  temuLink?: string;
  aliAppKey?: string;
  aliTrackingId?: string;
  customMeliLinks?: Record<string, string>;
  enabledMarketplaces?: Record<string, boolean>;
}

/**
 * Extracts MLB item ID from any Mercado Livre product or catalog URL
 * (e.g. /p/MLB53228347 or /MLB-5237833724 -> MLB53228347)
 */
export function extractMlbId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
}

export const DEFAULT_USER_MATT_TOOL = '49196513';
export const DEFAULT_USER_MATT_WORD = 'sf20250625192813';

export const DEFAULT_USER_MELI_LINKS: Record<string, string> = {
  'MLB53228347': 'https://meli.la/1njPhaS',
  '53228347': 'https://meli.la/1njPhaS',
  'MLB5237833724': 'https://meli.la/2dcm9f7',
  '5237833724': 'https://meli.la/2dcm9f7',
};

/**
 * Detects if a URL belongs to a competitor group, channel, social link aggregator,
 * or redirect domain (e.g. linktr.ee, chat.whatsapp.com, t.me, grupos.*, beacons.ai).
 */
export function isCompetitorShareUrl(rawUrl: string, activeGroupLink?: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // 0. Known Marketplace product domains - NEVER a competitor share link!
  if (
    lower.includes('mercadolivre.') ||
    lower.includes('mercadolibre.') ||
    lower.includes('meli.la') ||
    lower.includes('shopee.') ||
    lower.includes('shope.ee') ||
    lower.includes('amazon.') ||
    lower.includes('amzn.to') ||
    lower.includes('a.co') ||
    lower.includes('shein.') ||
    lower.includes('aliexpress.') ||
    lower.includes('s.click') ||
    lower.includes('ali.ski') ||
    lower.includes('temu.') ||
    lower.includes('magazineluiza.') ||
    lower.includes('magalu.')
  ) {
    return false;
  }

  // If it's already the user's official destination group link, it's NOT a competitor share!
  if (activeGroupLink) {
    const cleanActive = activeGroupLink.trim().toLowerCase();
    const cleanRaw = trimmed.toLowerCase();
    if (cleanActive && (cleanRaw === cleanActive || cleanRaw.includes(cleanActive) || cleanActive.includes(cleanRaw))) {
      return false;
    }
  }

  // 1. WhatsApp invite, group and channel links
  if (
    lower.includes('chat.whatsapp.com') ||
    lower.includes('whatsapp.com/channel') ||
    lower.includes('wa.me/') ||
    lower.includes('api.whatsapp.com/send')
  ) {
    return true;
  }

  // 2. Telegram invite, channel and group links
  if (
    lower.includes('t.me/') ||
    lower.includes('telegram.me/') ||
    lower.includes('telegram.dog/')
  ) {
    return true;
  }

  // 3. Bio / Link aggregators extensively used by competitor offer channels
  const bioAggregators = [
    'linktr.ee',
    'linktree.com',
    'beacons.ai',
    'beacons.page',
    'bio.link',
    'campsite.bio',
    'campsite.to',
    'lnk.bio',
    'taplink.cc',
    'instabio.cc',
    'heylink.me',
    'allmylinks.com',
    'flowpage.com',
    'solo.to',
    'contactinbio.com',
    'shor.by',
    'snipfeed.co',
    'lynxshort.com',
  ];

  if (bioAggregators.some((domain) => lower.includes(domain))) {
    return true;
  }

  // 4. Known competitor promotional domains
  const competitorDomains = [
    'achadinho.pro',
    'achadinhos.net',
    'garimpeiros.com.br',
    'lipeindica.com',
  ];

  if (competitorDomains.some((domain) => lower.includes(domain))) {
    return true;
  }

  // 5. Custom group redirect subdomains (e.g. grupos.garimpeiros.com.br, grupos.lipeindica.com, etc.)
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    if (
      host.startsWith('grupos.') ||
      host.startsWith('grupo.') ||
      host.startsWith('canal.') ||
      host.startsWith('canais.') ||
      host.startsWith('vip.') ||
      host.startsWith('convite.') ||
      host.startsWith('comunidade.')
    ) {
      return true;
    }

    // Path indicators of group invite on custom domains
    const path = parsed.pathname.toLowerCase();
    if (
      path.startsWith('/grupo') ||
      path.startsWith('/canal') ||
      path.startsWith('/entrar') ||
      path.startsWith('/convite') ||
      path.startsWith('/vip')
    ) {
      const isMarketplace =
        host.includes('mercadolivre') ||
        host.includes('mercadolibre') ||
        host.includes('shopee') ||
        host.includes('amazon') ||
        host.includes('shein') ||
        host.includes('aliexpress') ||
        host.includes('temu') ||
        host.includes('magazineluiza') ||
        host.includes('magalu');

      if (!isMarketplace) {
        return true;
      }
    }
  } catch {
    if (lower.includes('grupos.') || lower.includes('grupo.')) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if a line of text is a competitor group invite header, call-to-action (CTA),
 * or channel promotion (e.g. '🫵🏼 Convide Amigos e Familiares para o Grupo!', '👉 Compartilhe com os amigos').
 */
export function isCompetitorInviteLine(line: string): boolean {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;

  // 1. Remove leading/trailing emojis, bullets, asterisks, tildes, markdown and quotes
  const textClean = trimmed
    .replace(/^[\p{Emoji}\p{Symbol}\p{Punctuation}\s*~_>`"']+/gu, '')
    .replace(/[\p{Emoji}\p{Symbol}\p{Punctuation}\s*~_>`"']+$/gu, '')
    .trim()
    .toLowerCase();

  if (!textClean) return false;

  // 2. Direct keyword checks on clean text
  const invitePhrases = [
    'convide amigos',
    'convide familiares',
    'convide',
    'convidar amigos',
    'convidar familiares',
    'chame amigos',
    'chame seus amigos',
    'chame familiares',
    'chame a galera',
    'indique para amigos',
    'indique o grupo',
    'compartilhe com os amigos',
    'compartilhe com amigos',
    'compartilhe este link',
    'compartilhe o grupo',
    'compartilhe nosso grupo',
    'compartilhe nosso canal',
    'entre no nosso grupo',
    'entre no grupo vip',
    'entre no grupo',
    'entre no canal',
    'entre no nosso canal',
    'participe do nosso grupo',
    'participe do grupo vip',
    'participe do grupo',
    'participe do canal',
    'participe do nosso canal',
    'acesse nosso grupo',
    'acesse o grupo vip',
    'acesse o grupo',
    'acesse o canal',
    'acesse nosso canal',
    'junte-se ao nosso grupo',
    'junte-se ao grupo',
    'junte-se ao canal',
    'junte-se a nós',
    'faça parte do nosso grupo',
    'faça parte do grupo',
    'faça parte do canal',
    'vem pro grupo',
    'venha para o grupo',
    'link do grupo',
    'link do canal',
    'link dos grupos',
    'grupo vip',
    'canal vip',
    'canal de ofertas',
    'grupo de ofertas',
    'nossos grupos',
    'nossos canais',
    'grupo no whatsapp',
    'grupo de whatsapp',
    'canal no telegram',
    'canal do telegram',
    'grupo no telegram',
    'grupo do telegram',
  ];

  if (invitePhrases.some((phrase) => textClean.startsWith(phrase) || textClean === phrase || textClean.includes(phrase))) {
    return true;
  }

  // 3. Regex pattern: action verb + target audience or destination
  if (
    /^(?:convide|compartilhe|entre|participe|acesse|junte-se|venha|faça\s+parte)\s+(?:amigos|familiares|no\s+grupo|no\s+nosso|no\s+canal|do\s+grupo|do\s+nosso|com\s+os\s+amigos|com\s+amigos|da\s+nossa\s+comunidade)/i.test(textClean)
  ) {
    return true;
  }

  // 4. Competitor channel brackets or headers: [Canal VIP], [Achados do Fulano], [Garimpeiros], etc.
  if (
    /^\[?(?:canal|grupo|achados|ofertas|clube|dicas|garimpeiros|lipe\s*indica)\s*(?:d[eao]\s+[^\]\n]+|vip|oficial)?\]?$/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Detects the e-commerce platform of a given URL
 */
export function detectMarketplace(url: string): MarketplaceType {
  if (!url || typeof url !== 'string') return 'generic';
  const lower = url.toLowerCase();

  if (
    lower.includes('mercadolivre.com') ||
    lower.includes('mercadolibre.com') ||
    lower.includes('meli.la')
  ) {
    return 'mercadolivre';
  }

  if (
    lower.includes('shopee.com') ||
    lower.includes('shope.ee') ||
    lower.includes('s.shopee.com')
  ) {
    return 'shopee';
  }

  if (
    lower.includes('amazon.com') ||
    lower.includes('amzn.to') ||
    lower.includes('a.co')
  ) {
    return 'amazon';
  }

  if (
    lower.includes('shein.com') ||
    lower.includes('shein.top') ||
    lower.includes('shein.co') ||
    lower.includes('shein')
  ) {
    return 'shein';
  }

  if (
    lower.includes('temu.com') ||
    lower.includes('temu.to') ||
    lower.includes('share.temu.com')
  ) {
    return 'temu';
  }

  if (
    lower.includes('aliexpress') ||
    lower.includes('ali.ski') ||
    lower.includes('s.click')
  ) {
    return 'aliexpress';
  }

  return 'generic';
}

/**
 * Mercado Livre Link Builder Conversion
 * Method: https://www.mercadolivre.com.br/afiliados/linkbuilder#hub
 */
export function monetizeMercadoLivre(
  rawUrl: string,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  source: string = OFFICIAL_SOURCE,
  customMeliLinks?: Record<string, string>,
  mattTool: string = DEFAULT_USER_MATT_TOOL,
  mattWord: string = DEFAULT_USER_MATT_WORD
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const effectiveUrl = resolvedUrlsCache.get(trimmed) || trimmed;

  // 1. Check if we have an official meli.la mapping for this MLB product
  const mlbId = extractMlbId(effectiveUrl) || extractMlbId(trimmed);
  const linksMap: Record<string, string> = {
    ...DEFAULT_USER_MELI_LINKS,
    ...(customMeliLinks || {}),
  };
  if (mlbId) {
    if (linksMap[mlbId]) {
      return linksMap[mlbId];
    }
    const numOnly = mlbId.replace(/^MLB/i, '');
    if (linksMap[numOnly]) {
      return linksMap[numOnly];
    }
  }

  // 2. If it is already an official meli.la short link, keep it clean
  if (effectiveUrl.includes('meli.la')) {
    return effectiveUrl.split('?')[0].split('#')[0];
  }

  // 3. Return official product URL with the user's affiliate tracking parameters (matt_tool/matt_word)
  const cleanBase = effectiveUrl.split('?')[0].split('#')[0];
  const activeWord = mattWord || toolId || OFFICIAL_USER_AFFILIATE_ID;
  const activeTool = mattTool || DEFAULT_USER_MATT_TOOL;
  const sep = cleanBase.includes('?') ? '&' : '?';
  return `${cleanBase}${sep}matt_tool=${activeTool}&matt_word=${encodeURIComponent(activeWord)}`;
}

/**
 * Shopee Custom Link Conversion
 * Method: https://affiliate.shopee.com.br/offer/custom_link
 */
export function monetizeShopee(
  rawUrl: string,
  affiliateId: string = DEFAULT_SHOPEE_AFFILIATE_ID,
  subId: string = 'custom_link'
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const cleanAffId = affiliateId.replace(/^an_/i, '').trim();

  try {
    const urlObj = new URL(trimmed);
    // Strip competitor query parameters and apply official Shopee Custom Link format
    const cleanParams = new URLSearchParams();
    cleanParams.set('af_siteid', `an_${cleanAffId}`);
    cleanParams.set('pid', 'affiliates');
    cleanParams.set('c', subId || 'custom_link');
    cleanParams.set('utm_source', `an_${cleanAffId}`);
    cleanParams.set('utm_medium', 'affiliates');
    cleanParams.set('utm_campaign', subId || 'custom_link');

    urlObj.search = cleanParams.toString();
    return urlObj.toString();
  } catch {
    const baseUrl = trimmed.split('?')[0].split('#')[0];
    return `${baseUrl}?af_siteid=an_${encodeURIComponent(cleanAffId)}&pid=affiliates&c=custom_link&utm_source=an_${encodeURIComponent(cleanAffId)}&utm_medium=affiliates`;
  }
}

/**
 * Amazon SiteStripe Conversion
 * Method: Amazon Associates SiteStripe (ASIN + Tag + linkCode=as2)
 */
export function monetizeAmazon(
  rawUrl: string,
  associateTag: string = DEFAULT_AMAZON_TAG,
  linkCode: string = 'as2'
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Extract 10-character Amazon ASIN code (e.g. B0CS812XYZ or B09B8VGCR8)
  const asinMatch = trimmed.match(/(?:\/dp\/|\/gp\/product\/|\/product\/|\/d\/|[?&]asin=)([A-Z0-9]{10})/i);
  if (asinMatch) {
    const asin = asinMatch[1].toUpperCase();
    // Return canonical Amazon SiteStripe product format
    return `https://www.amazon.com.br/dp/${asin}?tag=${encodeURIComponent(associateTag)}&linkCode=${encodeURIComponent(linkCode)}`;
  }

  // Fallback for search or storefront links: strip competitor tags and append user tag
  try {
    const urlObj = new URL(trimmed);
    urlObj.searchParams.delete('tag');
    urlObj.searchParams.delete('ascsubtag');
    urlObj.searchParams.delete('linkCode');
    urlObj.searchParams.delete('ref');
    urlObj.searchParams.delete('psc');
    urlObj.searchParams.set('tag', associateTag);
    urlObj.searchParams.set('linkCode', linkCode);
    return urlObj.toString();
  } catch {
    const baseUrl = trimmed.split('?')[0].split('#')[0];
    return `${baseUrl}?tag=${encodeURIComponent(associateTag)}&linkCode=${encodeURIComponent(linkCode)}`;
  }
}

/**
 * SHEIN Affiliate Link Conversion
 * Method: https://affiliate.shein.com/
 */
export function monetizeShein(
  rawUrl: string,
  affiliateId: string = '',
  universalLink: string = ''
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const effectiveUrl = resolvedUrlsCache.get(trimmed) || trimmed;
  const activeId = affiliateId.trim();
  const activeLink = universalLink.trim();

  if (activeLink && (!activeId || trimmed.includes('shein.top'))) {
    return activeLink;
  }

  try {
    const urlObj = new URL(effectiveUrl);
    const toDelete = [
      'url_from',
      'aff_id',
      'affiliate_id',
      'ref',
      'rep',
      'ret',
      'spm',
      'utm_source',
      'utm_medium',
      'utm_campaign',
    ];
    for (const p of toDelete) {
      urlObj.searchParams.delete(p);
    }
    if (activeId) {
      urlObj.searchParams.set('url_from', activeId);
      urlObj.searchParams.set('aff_id', activeId);
    }
    urlObj.searchParams.set('ref', 'www');
    urlObj.searchParams.set('rep', 'dir');
    urlObj.searchParams.set('ret', 'br');
    return urlObj.toString();
  } catch {
    if (activeId) {
      const sep = effectiveUrl.includes('?') ? '&' : '?';
      return `${effectiveUrl}${sep}url_from=${encodeURIComponent(activeId)}&aff_id=${encodeURIComponent(activeId)}&ref=www&rep=dir&ret=br`;
    }
    return effectiveUrl;
  }
}

/**
 * Temu Affiliate / Referral Link Conversion
 */
export function monetizeTemu(
  rawUrl: string,
  referralCode: string = '',
  universalLink: string = ''
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  if (universalLink && universalLink.startsWith('http')) {
    return universalLink.trim();
  }

  try {
    const urlObj = new URL(trimmed);
    if (referralCode) {
      urlObj.searchParams.set('referral_code', referralCode.trim());
      urlObj.searchParams.set('aff_code', referralCode.trim());
      urlObj.searchParams.set('_bg_fs', '1');
    }
    return urlObj.toString();
  } catch {
    if (referralCode) {
      const sep = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${sep}referral_code=${encodeURIComponent(referralCode.trim())}`;
    }
    return trimmed;
  }
}

/**
 * AliExpress Affiliate Link Conversion (App Key + Tracking ID)
 * Strips competitor cookies, aff_fcid, aff_fsk, sk and builds official affiliate URL
 */
export function monetizeAliExpress(
  rawUrl: string,
  appKey: string = '',
  trackingId: string = ''
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const effectiveUrl = resolvedUrlsCache.get(trimmed) || trimmed;

  // 1. Extract pure AliExpress Item ID (e.g. 1005006283921000 or /item/1005006283921000.html)
  const itemMatch =
    effectiveUrl.match(/\/item\/(\d+)\.html/i) ||
    effectiveUrl.match(/\/item\/(\d+)/i) ||
    effectiveUrl.match(/item[_\-\/](\d+)/i) ||
    effectiveUrl.match(/goodsId=(\d+)/i);

  let cleanProductUrl = effectiveUrl;

  if (itemMatch && itemMatch[1]) {
    cleanProductUrl = `https://pt.aliexpress.com/item/${itemMatch[1]}.html`;
  } else {
    // Strip competitor tracking parameters from other AliExpress pages
    try {
      const u = new URL(effectiveUrl);
      const toDelete = [
        'aff_fcid',
        'aff_fsk',
        'aff_trace_key',
        'sk',
        'spreadType',
        'biz_type',
        'scm',
        'pdp_npi',
        'src',
        'tt',
        'terminal_id',
        'aff_platform',
        'app_key',
        'tracking_id',
        'spm',
        'dp',
        'cv',
      ];
      for (const p of toDelete) {
        u.searchParams.delete(p);
      }
      cleanProductUrl = u.toString();
    } catch {
      cleanProductUrl = effectiveUrl.split('?')[0].split('#')[0];
    }
  }

  const activeAppKey = appKey ? appKey.trim() : '';
  const activeTrackingId = trackingId ? trackingId.trim() : '';

  // 2. If App Key / Short Key is configured, generate the official s.click tracking URL
  if (activeAppKey) {
    const isShortKey =
      activeAppKey.startsWith('_') ||
      (activeAppKey.length <= 12 && !/^\d+$/.test(activeAppKey));

    if (isShortKey) {
      let sClickUrl = `https://s.click.aliexpress.com/deep_link.htm?aff_short_key=${encodeURIComponent(activeAppKey)}&dl_target_url=${encodeURIComponent(cleanProductUrl)}`;
      if (activeTrackingId) {
        sClickUrl += `&tracking_id=${encodeURIComponent(activeTrackingId)}`;
      }
      return sClickUrl;
    }

    // Official s.click deep link with app_key & targetUrl
    let sClickUrl = `https://s.click.aliexpress.com/deep_link.htm?app_key=${encodeURIComponent(activeAppKey)}&targetUrl=${encodeURIComponent(cleanProductUrl)}`;
    if (activeTrackingId) {
      sClickUrl += `&tracking_id=${encodeURIComponent(activeTrackingId)}`;
    }
    return sClickUrl;
  }

  // 3. Fallback: Return clean product link without competitor tracking
  return cleanProductUrl;
}

/**
 * Transforms any product URL into its official affiliate version
 * based on the detected marketplace and configuration
 */
export function transformMarketplaceUrl(
  rawUrl: string,
  options?: CustomAffiliateOptions
): ConvertedLinkResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      originalUrl: '',
      monetizedUrl: '',
      marketplace: 'generic',
      platformLabel: 'Desconhecido',
      trackingIdUsed: '',
      methodUsed: 'Nenhum',
    };
  }

  const trimmed = rawUrl.trim();
  const marketplace = detectMarketplace(trimmed);

  const mlToolId = options?.mlToolId?.trim() || OFFICIAL_USER_AFFILIATE_ID;
  const mlSource = options?.mlSource?.trim() || OFFICIAL_SOURCE;
  const shopeeId = options?.shopeeAffiliateId?.trim() || DEFAULT_SHOPEE_AFFILIATE_ID;
  const amazonTag = options?.amazonTag?.trim() || DEFAULT_AMAZON_TAG;
  const sheinId = options?.sheinAffiliateId?.trim() || DEFAULT_SHEIN_ID;

  const isMarketplaceDisabled =
    options?.enabledMarketplaces &&
    options.enabledMarketplaces[marketplace] === false;

  if (isMarketplaceDisabled) {
    return {
      originalUrl: trimmed,
      monetizedUrl: trimmed,
      marketplace,
      platformLabel: `${marketplace.toUpperCase()} (Desativado)`,
      trackingIdUsed: '',
      methodUsed: 'Marketplace Desativado pelo Usuário',
      isDisabled: true,
    };
  }

  switch (marketplace) {
    case 'mercadolivre': {
      const monetized = monetizeMercadoLivre(
        trimmed,
        mlToolId,
        mlSource,
        options?.customMeliLinks,
        options?.mattTool,
        options?.mattWord
      );
      const isMeliShort = monetized.includes('meli.la');
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'mercadolivre',
        platformLabel: isMeliShort ? 'Mercado Livre (meli.la)' : 'Mercado Livre (Requer Conversão Oficial)',
        trackingIdUsed: isMeliShort ? (options?.mattWord || mlToolId) : '',
        methodUsed: isMeliShort ? 'Link Oficial meli.la do Usuário (Encurtado)' : 'Pendente de Link meli.la Oficial',
      };
    }

    case 'shopee': {
      const monetized = monetizeShopee(trimmed, shopeeId);
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'shopee',
        platformLabel: 'Shopee',
        trackingIdUsed: shopeeId,
        methodUsed: 'Custom Link Oficial (af_siteid & pid=affiliates)',
      };
    }

    case 'amazon': {
      const monetized = monetizeAmazon(trimmed, amazonTag);
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'amazon',
        platformLabel: 'Amazon',
        trackingIdUsed: amazonTag,
        methodUsed: 'Amazon SiteStripe (ASIN + Tag + linkCode=as2)',
      };
    }

    case 'shein': {
      const monetized = monetizeShein(trimmed, sheinId, options?.sheinUniversalLink);
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'shein',
        platformLabel: 'SHEIN Oficial',
        trackingIdUsed: sheinId || 'SHEIN Affiliate ID',
        methodUsed: 'Link Oficial de Afiliado SHEIN (url_from/aff_id)',
      };
    }

    case 'temu': {
      const monetized = monetizeTemu(trimmed, options?.temuCode, options?.temuLink);
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'temu',
        platformLabel: 'Temu',
        trackingIdUsed: options?.temuCode || 'Código Temu',
        methodUsed: 'Link Oficial de Afiliado Temu (referral_code)',
      };
    }

    case 'aliexpress': {
      const monetized = monetizeAliExpress(trimmed, options?.aliAppKey, options?.aliTrackingId);
      return {
        originalUrl: trimmed,
        monetizedUrl: monetized,
        marketplace: 'aliexpress',
        platformLabel: 'AliExpress Portals',
        trackingIdUsed: options?.aliAppKey || options?.aliTrackingId || 'App Key AliExpress',
        methodUsed: 'Link Oficial de Afiliado AliExpress (App Key / Tracking ID)',
      };
    }

    default: {
      const isComp = isCompetitorShareUrl(trimmed);
      return {
        originalUrl: trimmed,
        monetizedUrl: trimmed,
        marketplace: 'generic',
        platformLabel: isComp ? 'Link de Grupo Concorrente' : 'Link Externo',
        trackingIdUsed: '',
        methodUsed: isComp ? 'Bloqueado (Link Concorrente)' : 'Link Externo Preservado (Sem Modificação)',
        isDisabled: isComp,
      };
    }
  }
}

/**
 * Multi-marketplace monetize URL helper
 */
export function monetizeUrl(
  rawUrl: string,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  source: string = OFFICIAL_SOURCE,
  options?: CustomAffiliateOptions
): string {
  const result = transformMarketplaceUrl(rawUrl, {
    mlToolId: toolId,
    mlSource: source,
    shopeeAffiliateId: options?.shopeeAffiliateId,
    amazonTag: options?.amazonTag,
    sheinAffiliateId: options?.sheinAffiliateId,
    sheinUniversalLink: options?.sheinUniversalLink,
    temuCode: options?.temuCode,
    temuLink: options?.temuLink,
    aliAppKey: options?.aliAppKey,
    aliTrackingId: options?.aliTrackingId,
    enabledMarketplaces: options?.enabledMarketplaces,
  });
  return result.monetizedUrl;
}

/**
 * Standardizes price format (e.g. 1.299,00 or 49,90)
 */
export function cleanPrice(priceStr: string | undefined): string {
  if (!priceStr) return '0,00';
  let cleaned = priceStr
    .replace(/[^\d,.-]/g, '')
    .trim()
    .replace(/^R\$\s*/i, '');

  if (!cleaned) return '0,00';
  return cleaned;
}

export interface DealData {
  title: string;
  oldPrice?: string;
  currentPrice: string;
  discount?: string;
  coupon?: string;
  productUrl: string;
  vipGroupLink?: string;
}

/**
 * Builds the strict mandatory BOT VIP OFERTAS WhatsApp copy template:
 *
 * 🎁 *[Título Empolgante e Limpo do Produto]*
 * 💰 ~De R$ [Preço Antigo]~
 * 💥 *Por R$ [Preço Atual]* (Com desconto!)
 * 🎟️ Cupom: *[Se houver]*
 * 🔗 Link oficial: [LINK_MONETIZADO]
 * 👉 Entre no nosso grupo VIP: [LINK_INTELIGENTE_DO_GRUPO]
 */
export function buildOfficialCopy(
  deal: DealData,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  source: string = OFFICIAL_SOURCE,
  groupLink: string = DEFAULT_VIP_GROUP_LINK,
  customOptions?: CustomAffiliateOptions
): string {
  const monetized = monetizeUrl(deal.productUrl, toolId, source, customOptions);
  const activeGroup = deal.vipGroupLink?.trim() || groupLink;

  const lines: string[] = [];

  // Title section with 🎁
  lines.push(`🎁 *${deal.title.trim()}*`);

  // Price block
  const priceBlock: string[] = [];
  if (deal.oldPrice && deal.oldPrice.trim()) {
    priceBlock.push(`💰 ~De R$ ${cleanPrice(deal.oldPrice)}~`);
  }

  const discountText =
    deal.discount && deal.discount.trim()
      ? ` (${deal.discount.trim()})`
      : ' (Com desconto!)';

  priceBlock.push(`💥 *Por R$ ${cleanPrice(deal.currentPrice)}*${discountText}`);

  if (deal.coupon && deal.coupon.trim()) {
    priceBlock.push(`🎟️ Cupom: *${deal.coupon.trim().toUpperCase()}*`);
  }

  lines.push(priceBlock.join('\n'));

  // Link Section
  lines.push(`🔗 Link oficial:\n${monetized}`);

  // VIP Group CTA
  lines.push(`👉 Entre no nosso grupo VIP:\n${activeGroup}`);

  return lines.join('\n\n');
}

/**
 * Extracts links from raw text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);
  return matches ? matches.map((u) => u.replace(/[),;.]+$/, '')) : [];
}

/**
 * Replica Zap parser:
 * Identifies competitor text, cleans competitor branding, extracts prices and coupon,
 * replaces links with the user's multi-marketplace affiliate link.
 */
export function processReplicaZap(
  rawMessage: string,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  groupLink: string = DEFAULT_VIP_GROUP_LINK,
  customOptions?: CustomAffiliateOptions
): { deal: DealData; copy: string; competitorDetected?: string; linkResult: ConvertedLinkResult } {
  // Detect and strip competitor mentions and invite lines
  const rawLines = rawMessage.split('\n');
  const cleanLines: string[] = [];
  let competitorDetected: string | undefined;

  for (const line of rawLines) {
    if (isCompetitorInviteLine(line)) {
      competitorDetected = line.trim();
      continue;
    }
    const lineUrls = extractUrls(line);
    if (lineUrls.length > 0 && lineUrls.every((u) => isCompetitorShareUrl(u, groupLink))) {
      competitorDetected = line.trim();
      continue;
    }
    cleanLines.push(line);
  }

  let cleaned = cleanLines.join('\n');

  const competitorPatterns = [
    /\[?(?:canal|grupo|achados|ofertas|clube|dicas|garimpeiros|lipe\s*indica)\s+d[eao]\s+[^\]\n]+\]?/gi,
    /achados\s+da\s+\w+/gi,
    /promoções\s+do\s+\w+/gi,
    /canal\s+vip\s+\w+/gi,
  ];

  for (const pattern of competitorPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      competitorDetected = match[0];
      cleaned = cleaned.replace(pattern, '').trim();
    }
  }

  // Extract URLs (filtering out competitor group/share links)
  const allUrls = extractUrls(cleaned);
  const productUrls = allUrls.filter((u) => !isCompetitorShareUrl(u, groupLink));
  const rawProductUrl = productUrls.length > 0 ? productUrls[0] : (allUrls.length > 0 ? allUrls[0] : 'https://www.mercadolivre.com.br');

  const linkResult = transformMarketplaceUrl(rawProductUrl, {
    mlToolId: toolId,
    mattTool: customOptions?.mattTool,
    mattWord: customOptions?.mattWord,
    shopeeAffiliateId: customOptions?.shopeeAffiliateId,
    amazonTag: customOptions?.amazonTag,
    sheinAffiliateId: customOptions?.sheinAffiliateId,
    sheinUniversalLink: customOptions?.sheinUniversalLink,
    temuCode: customOptions?.temuCode,
    temuLink: customOptions?.temuLink,
    aliAppKey: customOptions?.aliAppKey,
    aliTrackingId: customOptions?.aliTrackingId,
    customMeliLinks: customOptions?.customMeliLinks,
    enabledMarketplaces: customOptions?.enabledMarketplaces,
  });

  // Extract Old Price: "De R$ 199", "~De R$ 199~", "de: 199"
  const oldPriceMatch = cleaned.match(/(?:de|de\s+r\$|~\s*de\s*r?\$?)\s*([0-9.,]+)/i);
  const oldPrice = oldPriceMatch ? cleanPrice(oldPriceMatch[1]) : undefined;

  // Extract Current Price: "Por R$ 99", "por: 99", "*por r$ 99*"
  const currentPriceMatch = cleaned.match(/(?:por|por\s+r\$|\*\s*por\s*r?\$?)\s*([0-9.,]+)/i);
  let currentPrice = currentPriceMatch ? cleanPrice(currentPriceMatch[1]) : '0,00';

  if (currentPrice === '0,00') {
    const anyPrice = cleaned.match(/r\$\s*([0-9.,]+)/i);
    if (anyPrice) currentPrice = cleanPrice(anyPrice[1]);
  }

  // Extract Coupon: "Cupom: X", "Cupom *X*", "Use cupom X"
  const couponMatch = cleaned.match(/(?:cupom|cupom:|\*cupom:\*|use)\s*[:*]?\s*([A-Za-z0-9_-]+)/i);
  const coupon =
    couponMatch && !['de', 'por', 'o', 'com', 'no'].includes(couponMatch[1].toLowerCase())
      ? couponMatch[1].toUpperCase()
      : undefined;

  // Clean Title
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = lines[0] || 'Produto em Super Oferta';

  if (title.length < 5 && lines.length > 1) {
    title = lines[1];
  }

  title = title
    .replace(/(?:de\s+r\$|por\s+r\$|r\$\s*\d|pegue\s+aqui|compre\s+aqui|link|https?:\/\/|cupom:?|use\s+o\s+cupom).*$/i, '')
    .trim();

  title = title
    .replace(/^[🎁🔥⚡💥🚨😱✨🛍️]+/, '')
    .replace(/^[*_~]+|[*_~]+$/g, '')
    .replace(/frete grátis/gi, '')
    .replace(/pronta entrega/gi, '')
    .replace(/envio rápido/gi, '')
    .replace(/original/gi, '')
    .replace(/promoção/gi, '')
    .trim();

  if (!title) title = 'Achado Imperdível Selecionado';

  const deal: DealData = {
    title,
    oldPrice,
    currentPrice,
    discount: oldPrice ? 'Com super desconto!' : undefined,
    coupon,
    productUrl: rawProductUrl,
    vipGroupLink: groupLink,
  };

  const copy = buildOfficialCopy(deal, toolId, OFFICIAL_SOURCE, groupLink, customOptions);

  return { deal, copy, competitorDetected, linkResult };
}

const resolvedUrlsCache = new Map<string, string>();

/**
 * Resolves short-links (meli.la, amzn.to, shope.ee, magalu.me) to their final
 * canonical long product URLs using a Headless Browser approach in Python (with Node.js fallback).
 */
export async function resolveShortLinkToLongUrl(shortUrl: string): Promise<string> {
  if (!shortUrl || typeof shortUrl !== 'string') return '';
  const trimmed = shortUrl.trim();
  if (!trimmed) return '';

  // Return from in-memory cache if previously resolved
  if (resolvedUrlsCache.has(trimmed)) {
    return resolvedUrlsCache.get(trimmed)!;
  }

  const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

  // 1. Browser environment: call server-side headless resolver endpoint
  if (isBrowser) {
    try {
      const resp = await fetch(`/api/resolve-link?url=${encodeURIComponent(trimmed)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.canonicalLongUrl || data.longUrl) {
          const finalUrl = (data.canonicalLongUrl || data.longUrl).trim();
          resolvedUrlsCache.set(trimmed, finalUrl);
          return finalUrl;
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Server-side environment: execute Python headless browser resolver script
  if (!isBrowser) {
    try {
      const { execFile } = await import('child_process');
      const pathModule = await import('path');
      const scriptPath = pathModule.resolve(process.cwd(), 'scripts', 'resolve_url.py');

      const pythonResult = await new Promise<string | null>((resolve) => {
        execFile('python3', [scriptPath, trimmed], { timeout: 15000 }, (error, stdout) => {
          if (!error && stdout) {
            try {
              const parsed = JSON.parse(stdout.trim());
              if (parsed.canonicalLongUrl) {
                return resolve(parsed.canonicalLongUrl);
              }
            } catch {}
          }
          resolve(null);
        });
      });

      if (pythonResult) {
        resolvedUrlsCache.set(trimmed, pythonResult);
        console.log(`[AffiliateEngine/Python] 🎯 Link encurtado "${trimmed}" resolvido para URL longa canônica: "${pythonResult}"`);
        return pythonResult;
      }
    } catch (pyErr) {
      console.warn('[AffiliateEngine] Falha ao invocar Python headless resolver, tentando fallback Node:', pyErr);
    }

    // 3. Fallback: Node.js fetch with browser headers + DOM/regex parsing
    try {
      const res = await fetch(trimmed, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'follow',
      });

      const finalUrl = res.url || trimmed;
      if (finalUrl.includes('/p/MLB') || finalUrl.includes('produto.mercadolivre.com.br/MLB')) {
        const clean = finalUrl.split('?')[0].split('#')[0];
        resolvedUrlsCache.set(trimmed, clean);
        return clean;
      }

      const html = await res.text();
      // Catalog match: /p/MLB...
      const catalogMatch = html.match(/https?:\/\/(?:www\.)?mercadolivre\.com\.br\/[a-zA-Z0-9\-_/]+\/p\/MLB\d+/i);
      if (catalogMatch) {
        const clean = catalogMatch[0].split('?')[0];
        resolvedUrlsCache.set(trimmed, clean);
        return clean;
      }

      // JSON url match: "url":"produto.mercadolivre.com.br\u002F..."
      const jsonMatch = html.match(/"url":\s*"([^"]*mercadolivre\.com\.br[^"]*MLB[^"]*)"/i);
      if (jsonMatch) {
        let clean = jsonMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        if (!clean.startsWith('http')) clean = 'https://' + clean;
        clean = clean.split('?')[0];
        resolvedUrlsCache.set(trimmed, clean);
        return clean;
      }

      // Item match: MLB-12345
      const itemMatch = html.match(/https?:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/MLB-?\d+[a-zA-Z0-9\-_]*/i);
      if (itemMatch && !itemMatch[0].includes('/social/')) {
        const clean = itemMatch[0].split('?')[0];
        resolvedUrlsCache.set(trimmed, clean);
        return clean;
      }

      const cleanFinal = finalUrl.split('?')[0].split('#')[0];
      resolvedUrlsCache.set(trimmed, cleanFinal);
      return cleanFinal;
    } catch (e) {
      console.warn('[AffiliateEngine] Falha no fallback de resolução:', e);
    }
  }

  // Default return original
  return trimmed;
}

/**
 * Resolves any short-link to its long product URL and applies official affiliate parameters
 */
export async function resolveAndMonetizeUrl(
  rawUrl: string,
  options?: CustomAffiliateOptions
): Promise<ConvertedLinkResult> {
  const longUrl = await resolveShortLinkToLongUrl(rawUrl);
  return transformMarketplaceUrl(longUrl, options);
}

/**
 * Async version of processReplicaZap that resolves short-links to their
 * canonical product URLs using the Headless Browser resolver before formatting.
 */
export async function processReplicaZapAsync(
  rawMessage: string,
  toolId: string = OFFICIAL_USER_AFFILIATE_ID,
  groupLink: string = DEFAULT_VIP_GROUP_LINK,
  customOptions?: CustomAffiliateOptions
): Promise<{ deal: DealData; copy: string; competitorDetected?: string; linkResult: ConvertedLinkResult }> {
  const urls = extractUrls(rawMessage);
  const rawProductUrl = urls.length > 0 ? urls[0] : 'https://www.mercadolivre.com.br';

  const canonicalLongUrl = await resolveShortLinkToLongUrl(rawProductUrl);

  const linkResult = transformMarketplaceUrl(canonicalLongUrl, {
    mlToolId: toolId,
    mattTool: customOptions?.mattTool,
    mattWord: customOptions?.mattWord,
    shopeeAffiliateId: customOptions?.shopeeAffiliateId,
    amazonTag: customOptions?.amazonTag,
    sheinAffiliateId: customOptions?.sheinAffiliateId,
    sheinUniversalLink: customOptions?.sheinUniversalLink,
    temuCode: customOptions?.temuCode,
    temuLink: customOptions?.temuLink,
    aliAppKey: customOptions?.aliAppKey,
    aliTrackingId: customOptions?.aliTrackingId,
    customMeliLinks: customOptions?.customMeliLinks,
    enabledMarketplaces: customOptions?.enabledMarketplaces,
  });

  const syncResult = processReplicaZap(rawMessage, toolId, groupLink, customOptions);
  syncResult.deal.productUrl = canonicalLongUrl;
  syncResult.linkResult = linkResult;
  syncResult.copy = buildOfficialCopy(syncResult.deal, toolId, OFFICIAL_SOURCE, groupLink, customOptions);

  return syncResult;
}
