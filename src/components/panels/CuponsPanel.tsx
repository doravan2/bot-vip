import React, { useState } from 'react';
import {
  Ticket,
  Copy,
  Check,
  ExternalLink,
  Flame,
  Search,
  Sparkles,
  Clock,
  Radio,
} from 'lucide-react';
import { CouponItem } from '../../types/index.ts';

interface CuponsPanelProps {
  toolId: string;
  source: string;
  vipGroupLink: string;
}

const RADAR_COUPONS: CouponItem[] = [
  {
    id: 'c-1',
    code: 'MELI15',
    platform: 'Mercado Livre',
    discountDescription: 'R$ 15 OFF em compras acima de R$ 99',
    minSpend: 'R$ 99,00',
    category: 'Geral',
    expiresIn: 'Expira em 3 horas',
    officialSiteUrl: 'https://www.mercadolivre.com.br/cupons',
    isValid: true,
    linkedProductsCount: 12,
  },
  {
    id: 'c-2',
    code: 'AMAZON50',
    platform: 'Amazon',
    discountDescription: 'R$ 50 OFF na primeira compra no App Amazon',
    minSpend: 'R$ 200,00',
    category: 'App Primeira Compra',
    expiresIn: 'Válido até 30/09',
    officialSiteUrl: 'https://www.amazon.com.br/cupons',
    isValid: true,
    linkedProductsCount: 8,
  },
  {
    id: 'c-3',
    code: 'SHOPEE20',
    platform: 'Shopee',
    discountDescription: '20% OFF em Lojas Oficiais selecionadas',
    minSpend: 'R$ 50,00',
    category: 'Lojas Oficiais',
    expiresIn: 'Restam 142 usos',
    officialSiteUrl: 'https://shopee.com.br/m/cupons-diarios',
    isValid: true,
    linkedProductsCount: 15,
  },
  {
    id: 'c-4',
    code: 'COZINHA10',
    platform: 'Mercado Livre',
    discountDescription: '10% OFF em Fritadeiras, Panelas e Eletrodomésticos',
    minSpend: 'R$ 150,00',
    category: 'Eletrodomésticos',
    expiresIn: 'Válido hoje',
    officialSiteUrl: 'https://www.mercadolivre.com.br/cupons',
    isValid: true,
    linkedProductsCount: 6,
  },
  {
    id: 'c-5',
    code: 'MAGALU50',
    platform: 'Magalu',
    discountDescription: 'R$ 50 OFF em Smart TVs e Áudio',
    minSpend: 'R$ 1.000,00',
    category: 'Eletrônicos',
    expiresIn: 'Válido até amanhã',
    officialSiteUrl: 'https://www.magazineluiza.com.br/cupons',
    isValid: true,
    linkedProductsCount: 4,
  },
  {
    id: 'c-6',
    code: 'ALIEXPRESS12',
    platform: 'AliExpress',
    discountDescription: 'US$ 12 OFF em compras Choice e Remessa Conforme',
    minSpend: 'R$ 250,00',
    category: 'Importados',
    expiresIn: 'Ativo',
    officialSiteUrl: 'https://aliexpress.com',
    isValid: true,
    linkedProductsCount: 3,
  },
];

const PLATFORMS = ['Todas', 'Mercado Livre', 'Amazon', 'Shopee', 'Magalu', 'AliExpress'];

export const CuponsPanel: React.FC<CuponsPanelProps> = ({
  toolId,
  source,
  vipGroupLink,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState('Todas');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = RADAR_COUPONS.filter((item) => {
    const matchesPlat = selectedPlatform === 'Todas' || item.platform === selectedPlatform;
    const matchesSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.discountDescription.toLowerCase().includes(search.toLowerCase()) ||
      item.platform.toLowerCase().includes(search.toLowerCase());
    return matchesPlat && matchesSearch;
  });

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAlertMessage = (item: CouponItem) => {
    const alertCopy = `🎟️ *ALERTA DE CUPOM NO AR &bull; ${item.platform.toUpperCase()}*

💥 Cupom: *${item.code}*
💰 Desconto: *${item.discountDescription}*
${item.minSpend ? `⚠️ Gasto Mínimo: ${item.minSpend}\n` : ''}⏳ Validade: ${item.expiresIn}

🔗 Aproveite agora nos produtos elegíveis:
${item.officialSiteUrl}?matt_tool_id=${toolId}&matt_source=${source}

👉 Entre no nosso grupo VIP:
${vipGroupLink}`;

    navigator.clipboard.writeText(alertCopy);
    setCopiedId(`copy-${item.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FF5722] animate-pulse" />
            <h2 className="text-lg font-extrabold text-white">
              Radar de Cupons & Descontos em Tempo Real
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Sintoniza códigos promocionais ativos nas principais plataformas e permite disparo de alertas imediatos para a sua audiência.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs font-semibold text-[#FF5722] self-start md:self-auto">
          <Clock className="w-3.5 h-3.5" />
          <span>Atualizado a cada 15 min</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Platform Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {PLATFORMS.map((plat) => (
            <button
              key={plat}
              onClick={() => setSelectedPlatform(plat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedPlatform === plat
                  ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20'
                  : 'bg-[#18191d] text-neutral-400 hover:text-white border border-[#22242a]'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cupom ou loja..."
            className="w-full pl-9 pr-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
          />
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] hover:border-[#FF5722]/40 transition space-y-3.5 flex flex-col justify-between shadow-md group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1e2025] text-neutral-300 border border-[#2a2c33]">
                  {item.platform}
                </span>
                <span className="text-[11px] text-amber-400 font-semibold">{item.expiresIn}</span>
              </div>

              {/* Coupon Box */}
              <div className="p-3 rounded-xl bg-[#18191d] border border-dashed border-[#FF5722]/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-[#FF5722]" />
                  <span className="font-mono font-black text-lg text-white tracking-wider">
                    {item.code}
                  </span>
                </div>

                <button
                  onClick={() => handleCopyCode(item.code, item.id)}
                  className="px-2.5 py-1 rounded-lg bg-[#22242a] hover:bg-[#2b2d35] text-xs text-neutral-200 font-semibold transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === item.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                  <span>{copiedId === item.id ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>

              <p className="text-xs text-neutral-200 font-medium leading-relaxed">
                {item.discountDescription}
              </p>

              <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-[#22242a]">
                <span>Mínimo: {item.minSpend || 'Qualquer valor'}</span>
                <span className="text-neutral-400 font-mono">
                  {item.linkedProductsCount} produtos compatíveis
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-[#22242a] flex items-center justify-between gap-2">
              <a
                href={item.officialSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
              >
                Página Oficial <ExternalLink className="w-3 h-3" />
              </a>

              <button
                onClick={() => handleCopyAlertMessage(item)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ${
                  copiedId === `copy-${item.id}`
                    ? 'bg-emerald-500 text-neutral-950'
                    : 'bg-[#FF5722] hover:bg-[#f4511e] text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span>{copiedId === `copy-${item.id}` ? 'Alerta Copiado!' : 'Gerar Alerta VIP'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
