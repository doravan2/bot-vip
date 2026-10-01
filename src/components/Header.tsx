import React from 'react';
import { Menu } from 'lucide-react';
import { NavigationTab } from '../types/index.ts';

interface HeaderProps {
  currentTab: NavigationTab;
  onOpenMobileMenu: () => void;
  onOpenReplicaModal?: () => void;
  toolId?: string;
  isWhatsAppConnected?: boolean;
}

const TAB_TITLES: Record<NavigationTab, { title: string; subtitle: string }> = {
  marketplaces: {
    title: 'Marketplaces & Afiliados',
    subtitle: 'Conecte suas contas do Mercado Livre, Shopee, Amazon e outras plataformas',
  },
  grupos: {
    title: 'Gestão de Grupos',
    subtitle: 'Sincronização em massa de grupos do WhatsApp e regras anti-lotação',
  },
  canais: {
    title: 'Gestão de Canais (WhatsApp & Telegram)',
    subtitle: 'Gerencie canais de transmissão do WhatsApp e canais públicos/privados do Telegram',
  },
  conexoes: {
    title: 'Conexões WhatsApp Web',
    subtitle: 'Conecte instâncias e dispositivos via QR Code para automação',
  },
  fontes: {
    title: 'Fontes & Direcionamento',
    subtitle: 'Grupos e canais concorrentes monitorados com espelhamento para seus canais VIP',
  },
  'replica-chat': {
    title: 'Replica Chat',
    subtitle: 'Configuração de mensagens, conversão de links e personalização de templates',
  },
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  onOpenReplicaModal,
  toolId,
  isWhatsAppConnected,
}) => {
  const currentInfo = TAB_TITLES[currentTab] || TAB_TITLES.marketplaces;

  return (
    <header className="border-b border-[#22242a] bg-[#121214]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-[#18191d] text-neutral-300 hover:text-white border border-[#22242a] cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
            <span>{currentInfo.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 hidden sm:block">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Header Right Actions (Cleaned up as requested) */}
      <div className="flex items-center gap-3">
      </div>
    </header>
  );
};
