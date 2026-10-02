export type NavigationTab =
  | 'marketplaces'
  | 'grupos'
  | 'canais'
  | 'conexoes'
  | 'fontes'
  | 'replica-chat'
  | 'agenda'
  | 'configuracoes';

export interface ProductItem {
  id: string;
  title: string;
  category: 'Eletrodomésticos' | 'Eletrônicos' | 'Eletrônicos Gamers' | 'Casa & Cozinha' | 'Moda & Beleza' | 'Geral';
  platform: 'Mercado Livre' | 'Amazon' | 'Shopee' | 'Magalu' | 'AliExpress';
  oldPrice?: string;
  currentPrice: string;
  discount?: string;
  coupon?: string;
  rawUrl: string;
  monetizedUrl: string;
  salesCount?: number;
  rating?: number;
  imageUrl?: string;
  active: boolean;
  createdAt: string;
}

export interface WhatsAppInstance {
  id: string;
  name: string; // e.g. "instancia 1", "instancia 2"
  status: 'desconectada' | 'conectando' | 'conectada';
  phoneNumber?: string;
  qrCodeDataUrl?: string;
  createdAt: string;
}

export interface SourceGroup {
  id: string;
  sourceName: string; // Single name or joined summary
  sourceNames?: string[]; // Multiple source groups supported
  sourceJid?: string;
  sourceJids?: string[];
  platform: 'WhatsApp' | 'Telegram' | 'Misto';
  sourcePlatforms?: ('WhatsApp' | 'Telegram')[];
  targetGroup: string; // Single target or joined summary
  targetGroups?: string[]; // Multiple target groups supported
  targetJid?: string;
  targetJids?: string[];
  targetPlatforms?: ('WhatsApp' | 'Telegram')[];
  targetChatIds?: string[];
  autoForward: boolean;
  filterCompetitorNames: boolean;
  autoFetchProductImage?: boolean; // When true: if source message has no photo, fetch photo from product link
  validateMeliStock?: boolean; // When true: validates MLB status == 'active' && estoque > 0, skips paused/out-of-stock
  onlyMeliDeals?: boolean; // When true: only forwards verified Mercado Livre deals
  status: 'monitoring' | 'paused';
  dealsCapturedToday: number;
  wordFilters?: string[];
  createdAt: string;
}

export interface GroupChannel {
  id: string;
  instanceId?: string; // links to WhatsAppInstance
  name: string;
  platform: 'WhatsApp' | 'Telegram';
  chatId?: string; // Telegram @username or numerical chat ID or WhatsApp Newsletter JID
  inviteLink: string;
  membersCount: number;
  maxCapacity: number;
  isActive: boolean;
  autoRotate: boolean;
  dispatchesToday: number;
  type?: 'group' | 'channel'; // 'group' for standard chat groups, 'channel' for broadcast/newsletter channels
  subscribersCount?: number;
}

export interface TelegramChannelItem {
  id: string;
  name: string;
  chatId: string;
  username?: string;
  type?: 'channel' | 'group' | 'supergroup' | 'chat';
  inviteLink?: string;
  createdAt: string;
}

export interface CouponItem {
  id: string;
  code: string;
  platform: 'Mercado Livre' | 'Amazon' | 'Shopee' | 'Magalu' | 'AliExpress';
  discountDescription: string;
  minSpend?: string;
  category?: string;
  expiresIn: string;
  officialSiteUrl: string;
  isValid: boolean;
  linkedProductsCount: number;
}

export interface AutomationSettings {
  isEnabled: boolean;
  startHour: string; // "08:00"
  endHour: string;   // "23:00"
  minIntervalMinutes: number; // ex: 20
  maxIntervalMinutes: number; // ex: 45
  antiBanJitter: boolean;
  autoReplicaZap: boolean;
  sourceGroupsCount: number;
  targetGroupsCount: number;
  vipGroupLink: string;
  affiliateToolId: string;
  affiliateSource: string;
}

export interface DispatchLog {
  id: string;
  timestamp: string;
  productTitle: string;
  targetGroup: string;
  platform: string;
  status: 'sent' | 'queued' | 'failed';
  price?: string;
  link?: string;
  monetizedUrl?: string;
}
