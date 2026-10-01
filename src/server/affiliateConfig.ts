import path from 'path';
import fs from 'fs';
import { DEFAULT_VIP_GROUP_LINK } from '../utils/affiliateEngine.ts';

export interface AffiliateSettings {
  vipGroupLink?: string;
  mercadoLivre: {
    enabled: boolean;
    toolId: string;
    mattTool?: string;
    mattWord?: string;
    source: string;
    linkBuilderUrl: string;
    preferMeliShortUrl: boolean;
    customMeliLinks?: Record<string, string>;
    sessionCookie?: string;
    botDoAfiliadoApiKey?: string;
  };
  shopee: {
    enabled: boolean;
    affiliateId: string;
    customLinkUrl: string;
    subId?: string;
  };
  amazon: {
    enabled: boolean;
    associateTag: string;
    siteStripeEnabled: boolean;
    linkCode: string;
  };
  magalu: {
    enabled: boolean;
    storeId: string;
  };
}

export const DEFAULT_AFFILIATE_SETTINGS: AffiliateSettings = {
  vipGroupLink: DEFAULT_VIP_GROUP_LINK,
  mercadoLivre: {
    enabled: true,
    toolId: 'sf20250625192813',
    mattTool: '49196513',
    mattWord: 'sf20250625192813',
    source: 'whatsapp',
    linkBuilderUrl: 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
    preferMeliShortUrl: true,
    customMeliLinks: {
      'MLB53228347': 'https://meli.la/1njPhaS',
      'MLB5237833724': 'https://meli.la/2dcm9f7',
    },
    sessionCookie: '',
    botDoAfiliadoApiKey: '',
  },
  shopee: {
    enabled: true,
    affiliateId: '18349270032',
    customLinkUrl: 'https://affiliate.shopee.com.br/offer/custom_link',
    subId: '',
  },
  amazon: {
    enabled: true,
    associateTag: 'botvip-20',
    siteStripeEnabled: true,
    linkCode: 'as2',
  },
  magalu: {
    enabled: true,
    storeId: 'botvipofertas',
  },
};

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const settingsFilePath = path.resolve(storageDir, 'affiliate_settings.json');

let cachedSettings: AffiliateSettings = { ...DEFAULT_AFFILIATE_SETTINGS };

// Load from disk if exists
try {
  if (fs.existsSync(settingsFilePath)) {
    const raw = fs.readFileSync(settingsFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedSettings = {
      vipGroupLink: parsed.vipGroupLink || DEFAULT_VIP_GROUP_LINK,
      mercadoLivre: {
        ...DEFAULT_AFFILIATE_SETTINGS.mercadoLivre,
        ...parsed.mercadoLivre,
        customMeliLinks: {
          ...DEFAULT_AFFILIATE_SETTINGS.mercadoLivre.customMeliLinks,
          ...(parsed.mercadoLivre?.customMeliLinks || {}),
        },
      },
      shopee: { ...DEFAULT_AFFILIATE_SETTINGS.shopee, ...parsed.shopee },
      amazon: { ...DEFAULT_AFFILIATE_SETTINGS.amazon, ...parsed.amazon },
      magalu: { ...DEFAULT_AFFILIATE_SETTINGS.magalu, ...parsed.magalu },
    };
  }
} catch {
  cachedSettings = { ...DEFAULT_AFFILIATE_SETTINGS };
}

export function getAffiliateSettings(): AffiliateSettings {
  return cachedSettings;
}

export function getVipGroupLink(): string {
  return (cachedSettings.vipGroupLink || '').trim() || DEFAULT_VIP_GROUP_LINK;
}

export function setVipGroupLink(link: string): string {
  const cleanLink = link.trim() || DEFAULT_VIP_GROUP_LINK;
  updateAffiliateSettings({ vipGroupLink: cleanLink });
  return cleanLink;
}

export function updateAffiliateSettings(newSettings: Partial<AffiliateSettings>): AffiliateSettings {
  cachedSettings = {
    vipGroupLink: newSettings.vipGroupLink !== undefined ? newSettings.vipGroupLink : cachedSettings.vipGroupLink,
    mercadoLivre: { ...cachedSettings.mercadoLivre, ...(newSettings.mercadoLivre || {}) },
    shopee: { ...cachedSettings.shopee, ...(newSettings.shopee || {}) },
    amazon: { ...cachedSettings.amazon, ...(newSettings.amazon || {}) },
    magalu: { ...cachedSettings.magalu, ...(newSettings.magalu || {}) },
  };

  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(settingsFilePath, JSON.stringify(cachedSettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar affiliate_settings.json:', err);
  }

  return cachedSettings;
}

export function setCustomMeliLink(mlbId: string, meliUrl: string): AffiliateSettings {
  const cleanMlb = mlbId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanUrl = meliUrl.trim();
  const current = { ...(cachedSettings.mercadoLivre.customMeliLinks || {}) };
  current[cleanMlb] = cleanUrl;
  return updateAffiliateSettings({
    mercadoLivre: {
      ...cachedSettings.mercadoLivre,
      customMeliLinks: current,
    },
  });
}

export function removeCustomMeliLink(mlbId: string): AffiliateSettings {
  const cleanMlb = mlbId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const current = { ...(cachedSettings.mercadoLivre.customMeliLinks || {}) };
  delete current[cleanMlb];
  return updateAffiliateSettings({
    mercadoLivre: {
      ...cachedSettings.mercadoLivre,
      customMeliLinks: current,
    },
  });
}

export interface PendingMeliItem {
  id: string;
  timestamp: string;
  sourceGroupName: string;
  targetGroupName: string;
  targetJid: string;
  rawCaption: string;
  imageBufferBase64?: string;
  mlbId: string;
  pureProductUrl: string;
  targetInviteLink: string;
  productTitle?: string;
  status: 'pending' | 'converted' | 'cancelled';
}

const pendingQueuePath = path.resolve(storageDir, 'pending_meli_queue.json');
let cachedPendingQueue: PendingMeliItem[] = [];

try {
  if (fs.existsSync(pendingQueuePath)) {
    const raw = fs.readFileSync(pendingQueuePath, 'utf-8');
    cachedPendingQueue = JSON.parse(raw);
  } else {
    // Seed with the recent monitor offer if present
    cachedPendingQueue = [
      {
        id: 'meli-monitor-gigabyte',
        timestamp: '11:10:02',
        sourceGroupName: 'Vendas',
        targetGroupName: 'Atacado Game Ofertas',
        targetJid: '',
        rawCaption: '🔥 Monitor Gigabyte Gs24f14 23.8 Pol Full Hd Ips 144hz 1ms\n\n💵 R$ 517 pix\n🎟 Cupom: APROVEITAHOJE\n\nhttps://meli.la/1pKTwSc',
        mlbId: 'MLB74195315',
        pureProductUrl: 'https://www.mercadolivre.com.br/monitor-gigabyte-gs24f14-238-pol-full-hd-ips-144hz-1ms/p/MLB74195315',
        targetInviteLink: 'https://chat.whatsapp.com/CnMivNFKWlF7juMu85u5KO',
        productTitle: 'Monitor Gigabyte Gs24f14 23.8 Pol Full Hd Ips 144hz 1ms',
        status: 'pending',
      },
    ];
    fs.writeFileSync(pendingQueuePath, JSON.stringify(cachedPendingQueue, null, 2), 'utf-8');
  }
} catch {
  cachedPendingQueue = [];
}

function savePendingQueue() {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(pendingQueuePath, JSON.stringify(cachedPendingQueue, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar pending_meli_queue.json:', err);
  }
}

export function getPendingMeliQueue(): PendingMeliItem[] {
  return cachedPendingQueue.filter(i => i.status === 'pending');
}

export function addPendingMeliItem(item: PendingMeliItem): void {
  // Check if same MLB is already pending to avoid duplicates
  const existingIdx = cachedPendingQueue.findIndex(
    i => i.status === 'pending' && i.mlbId && i.mlbId === item.mlbId
  );
  if (existingIdx >= 0) {
    cachedPendingQueue[existingIdx] = item;
  } else {
    cachedPendingQueue.unshift(item);
  }
  // Keep max 50 items
  if (cachedPendingQueue.length > 50) {
    cachedPendingQueue = cachedPendingQueue.slice(0, 50);
  }
  savePendingQueue();
}

export function removePendingMeliItem(id: string): void {
  cachedPendingQueue = cachedPendingQueue.filter(i => i.id !== id);
  savePendingQueue();
}

export function getPendingMeliItem(id: string): PendingMeliItem | undefined {
  return cachedPendingQueue.find(i => i.id === id);
}
