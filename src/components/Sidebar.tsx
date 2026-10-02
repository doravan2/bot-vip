import React from 'react';
import {
  ShoppingBag,
  Users2,
  Smartphone,
  Radio,
  Zap,
  CheckCircle2,
  Settings,
  Send,
  Megaphone,
  Calendar,
} from 'lucide-react';
import { NavigationTab } from '../types/index.ts';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isWhatsAppConnected?: boolean;
  isTelegramConnected?: boolean;
  telegramBotUsername?: string;
  isAutomationRunning?: boolean;
  className?: string;
}

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'marketplaces',
    label: 'Marketplaces',
    icon: ShoppingBag,
    description: 'Integrações Mercado Livre, Shopee, Amazon',
  },
  {
    id: 'grupos',
    label: 'Grupos',
    icon: Users2,
    description: 'Sincronização de grupos do WhatsApp',
  },
  {
    id: 'canais',
    label: 'Canais',
    icon: Megaphone,
    description: 'Canais de Transmissão WhatsApp & Telegram',
  },
  {
    id: 'conexoes',
    label: 'Conexões',
    icon: Smartphone,
    description: 'Conectar WhatsApp Web via QR Code',
  },
  {
    id: 'fontes',
    label: 'Fontes',
    icon: Radio,
    description: 'Grupos e canais monitorados para reenvio',
  },
  {
    id: 'replica-chat',
    label: 'Replica Chat',
    icon: Zap,
    description: 'Configuração de mensagens e templates',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    description: 'Configure os dias e horários de execução da automação',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    description: 'Exportar e baixar backup JSON de todas as abas',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isWhatsAppConnected = false,
  isTelegramConnected = false,
  telegramBotUsername,
  isAutomationRunning = true,
  className = '',
}) => {
  return (
    <aside
      className={`w-64 bg-[#121214] min-h-screen flex flex-col px-4 py-6 border-r border-[#1f2024] text-[#8e95a5] font-sans select-none shrink-0 ${className}`}
    >
      {/* Top Logo: chat bot */}
      <div className="flex items-center gap-3.5 px-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF5722] to-[#ff7a50] flex items-center justify-center shadow-lg shadow-[#FF5722]/30 relative overflow-hidden shrink-0">
          <Zap className="w-6 h-6 text-white stroke-[2.4]" />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-[19px] leading-tight text-white tracking-tight">
              chat bot
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#FF5722] tracking-wider uppercase">
            Automação VIP
          </span>
        </div>
      </div>

      {/* Navigation Items (Com a nova aba Configurações lá embaixo) */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-[13.5px] font-bold transition-all duration-150 text-left cursor-pointer group ${
                isActive
                  ? 'bg-[#FF5722] text-white shadow-lg shadow-[#FF5722]/30'
                  : 'text-[#8e95a5] hover:text-[#e1e4ea] hover:bg-[#18191d] border border-transparent hover:border-[#22242a]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-[19px] h-[19px] shrink-0 ${
                    isActive ? 'text-white stroke-[2.3]' : 'text-[#8e95a5] stroke-[1.8] group-hover:text-white'
                  }`}
                />
                <span className="tracking-wide capitalize">{item.label}</span>
              </div>
              <span
                className={`text-[10px] font-mono ${
                  isActive ? 'text-white opacity-90' : 'text-neutral-600 opacity-60'
                }`}
              >
                0{index + 1}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Status Badges in Sidebar Bottom (WhatsApp, Telegram e Replica Chat) */}
      <div className="pt-4 mt-2 border-t border-[#1f2024] space-y-2">
        {/* WhatsApp Status */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#16171a] border border-[#22242a] text-xs">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-3.5 h-3.5 ${
                isWhatsAppConnected ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-300">WhatsApp Web</span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isWhatsAppConnected
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}
          >
            {isWhatsAppConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* Telegram Status Button / Badge */}
        <button
          type="button"
          onClick={() => onTabChange('configuracoes')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#16171a] hover:bg-[#1c1d22] border border-[#22242a] text-xs transition cursor-pointer group text-left"
        >
          <div className="flex items-center gap-2">
            <Send
              className={`w-3.5 h-3.5 transition ${
                isTelegramConnected ? 'text-sky-400 animate-pulse' : 'text-neutral-500 group-hover:text-sky-400'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-300 group-hover:text-white">
              Telegram Bot
            </span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isTelegramConnected
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}
          >
            {isTelegramConnected
              ? telegramBotUsername
                ? `@${telegramBotUsername}`
                : 'ONLINE'
              : 'OFFLINE'}
          </span>
        </button>

        {/* Replica Chat Status */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#16171a] border border-[#22242a] text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`w-3.5 h-3.5 ${
                isAutomationRunning ? 'text-[#FF5722]' : 'text-neutral-500'
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-300">Replica Chat</span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isAutomationRunning
                ? 'bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30'
                : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {isAutomationRunning ? 'ATIVO' : 'PAUSADO'}
          </span>
        </div>
      </div>
    </aside>
  );
};
