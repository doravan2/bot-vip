import React from 'react';
import {
  TrendingUp,
  Send,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Flame,
} from 'lucide-react';
import { DispatchLog } from '../../types/index.ts';

interface DashboardPanelProps {
  onOpenReplicaModal: () => void;
  onNavigateToTab: (tab: any) => void;
}

const MOCK_PLATFORM_STATS = [
  { name: 'Mercado Livre', percentage: 48, count: 142, color: 'bg-yellow-500' },
  { name: 'Amazon Brasil', percentage: 28, count: 83, color: 'bg-amber-600' },
  { name: 'Shopee', percentage: 16, count: 47, color: 'bg-orange-500' },
  { name: 'Magazine Luiza', percentage: 6, count: 18, color: 'bg-blue-500' },
  { name: 'AliExpress', percentage: 2, count: 6, color: 'bg-red-500' },
];

const INITIAL_LOGS: DispatchLog[] = [
  {
    id: 'log-1',
    timestamp: 'Há 4 minutos',
    productTitle: 'Air Fryer Mondial 4L Sem Óleo 1500W',
    targetGroup: 'VIP OFERTAS #01 (890 membros)',
    platform: 'Mercado Livre',
    status: 'sent',
    monetizedUrl: 'https://mercadolivre.com.br/airfryer?matt_tool_id=sf20250625192813&matt_source=whatsapp',
  },
  {
    id: 'log-2',
    timestamp: 'Há 18 minutos',
    productTitle: 'Echo Dot 5ª Geração Smart Speaker Alexa',
    targetGroup: 'VIP OFERTAS #02 (340 membros)',
    platform: 'Amazon',
    status: 'sent',
    monetizedUrl: 'https://amazon.com.br/dp/B09B8V1LZ3?matt_tool_id=sf20250625192813&matt_source=whatsapp',
  },
  {
    id: 'log-3',
    timestamp: 'Há 32 minutos',
    productTitle: 'Fone Bluetooth JBL Tune 520BT Pure Bass',
    targetGroup: 'VIP OFERTAS #01 (890 membros)',
    platform: 'Shopee',
    status: 'sent',
    monetizedUrl: 'https://shopee.com.br/jbl-520bt?matt_tool_id=sf20250625192813&matt_source=whatsapp',
  },
  {
    id: 'log-4',
    timestamp: 'Há 46 minutos',
    productTitle: 'Smart TV 50 4K UHD Samsung Crystal',
    targetGroup: 'VIP OFERTAS #03 (15 membros)',
    platform: 'Magalu',
    status: 'sent',
    monetizedUrl: 'https://magazineluiza.com.br/tv50?matt_tool_id=sf20250625192813&matt_source=whatsapp',
  },
];

export const DashboardPanel: React.FC<DashboardPanelProps> = ({
  onOpenReplicaModal,
  onNavigateToTab,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#18191d] via-[#151619] to-[#121214] border border-[#26282e] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5722] animate-pulse"></span>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Painel Central &bull; BOT VIP OFERTAS
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30">
              Orquestrador C:\ofertas_bot
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Monitorização em tempo real de envios automáticos, volume de tráfego e monetização mandatória com o ID{' '}
            <code className="text-[#FF5722] font-mono font-bold">sf20250625192813</code>.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenReplicaModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-lg shadow-[#FF5722]/25 cursor-pointer"
          >
            <Flame className="w-4 h-4 fill-white" />
            <span>Processar Replica Zap</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Envios Hoje</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Send className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white font-mono">296</span>
            <span className="text-[11px] font-bold text-emerald-400 flex items-center">
              +18.4% <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <p className="text-[11px] text-neutral-500">Média de 1 disparo a cada 18 min</p>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Cliques Estimados</span>
            <span className="p-1.5 rounded-lg bg-orange-500/10 text-[#FF5722] border border-orange-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white font-mono">4.180</span>
            <span className="text-[11px] font-bold text-emerald-400 flex items-center">
              +24% <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <p className="text-[11px] text-neutral-500">100% tagueados no seu ID</p>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Grupos Ativos</span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white font-mono">3 / 4</span>
            <span className="text-[11px] font-bold text-blue-400">1.245 Membros</span>
          </div>
          <p className="text-[11px] text-neutral-500">Rotativo inteligente &lt; 90% ativado</p>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Taxa de Entrega</span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-400 font-mono">99.8%</span>
            <span className="text-[11px] font-bold text-emerald-400">Anti-ban OK</span>
          </div>
          <p className="text-[11px] text-neutral-500">Intervalos randômicos ativos</p>
        </div>
      </div>

      {/* Main Grid: Platform Distribution & Recent Dispatches */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Platform Volume Breakdown (5 Cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">Volume por Plataforma</h3>
              <p className="text-xs text-neutral-400">Distribuição dos 296 disparos realizados</p>
            </div>
            <button
              onClick={() => onNavigateToTab('produtos')}
              className="text-xs text-[#FF5722] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              Ver produtos <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {MOCK_PLATFORM_STATS.map((stat) => (
              <div key={stat.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-300">{stat.name}</span>
                  <span className="font-mono text-neutral-400">
                    <strong className="text-white font-bold">{stat.count}</strong> envios ({stat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1e2025] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stat.color} transition-all duration-500`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#22242a] flex items-center justify-between text-xs text-neutral-400">
            <span>Rastreamento obrigatório:</span>
            <code className="text-[#FF5722] font-mono font-bold">matt_tool_id=sf20250625192813</code>
          </div>
        </div>

        {/* Right: Real-time Dispatch Logs (7 Cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#FF5722]" />
              <h3 className="font-bold text-sm text-white">Últimos Disparos Enviados</h3>
            </div>
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Sincronizado
            </span>
          </div>

          <div className="space-y-2.5">
            {INITIAL_LOGS.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/30 transition space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-xs text-neutral-100 line-clamp-1">
                    {log.productTitle}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 whitespace-nowrap">
                    ENVIADO
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                  <div className="flex items-center gap-2">
                    <span className="text-[#FF5722] font-semibold">{log.platform}</span>
                    <span>&bull;</span>
                    <span className="text-neutral-300">{log.targetGroup}</span>
                  </div>
                  <span className="text-neutral-500">{log.timestamp}</span>
                </div>

                <div className="pt-1 flex items-center justify-between text-[10px] text-neutral-500 border-t border-[#22242a]">
                  <span className="truncate max-w-[280px] font-mono text-neutral-400">
                    {log.monetizedUrl}
                  </span>
                  <a
                    href={log.monetizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#FF5722] hover:underline flex items-center gap-1 shrink-0 ml-2"
                  >
                    Testar Link <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={() => onNavigateToTab('automacoes')}
              className="text-xs text-neutral-400 hover:text-white font-semibold transition"
            >
              Configurar regras de automação e horários &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
