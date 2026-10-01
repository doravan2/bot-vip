import React, { useState } from 'react';
import {
  ListOrdered,
  Ticket,
  ExternalLink,
  Plus,
  ShoppingBag,
  Check,
  Copy,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CouponItem } from '../../types/index.ts';

const INITIAL_COUPON_LISTS: (CouponItem & {
  linkedProducts: { title: string; price: string; url: string }[];
})[] = [
  {
    id: 'cup-1',
    code: 'COZINHA10',
    platform: 'Mercado Livre',
    discountDescription: '10% OFF em Eletrodomésticos e Cozinha',
    minSpend: 'R$ 150,00',
    expiresIn: 'Válido até 30/09',
    officialSiteUrl: 'https://www.mercadolivre.com.br/cupons',
    isValid: true,
    linkedProductsCount: 3,
    linkedProducts: [
      {
        title: 'Fritadeira Air Fryer Mondial 4L Sem Óleo 1500W',
        price: '199,90',
        url: 'https://mercadolivre.com.br/airfryer',
      },
      {
        title: 'Liquidificador Philips Walita ProBlend 6 Lâminas',
        price: '149,90',
        url: 'https://mercadolivre.com.br/liquidificador',
      },
      {
        title: 'Batedeira Planetária Arno Deluxe 8 Velocidades',
        price: '329,90',
        url: 'https://mercadolivre.com.br/batedeira',
      },
    ],
  },
  {
    id: 'cup-2',
    code: 'GALAXY300',
    platform: 'Amazon',
    discountDescription: 'R$ 300 OFF em Smartphones Linha Galaxy',
    minSpend: 'R$ 2.500,00',
    expiresIn: 'Válido até 05/10',
    officialSiteUrl: 'https://www.amazon.com.br/cupons',
    isValid: true,
    linkedProductsCount: 2,
    linkedProducts: [
      {
        title: 'Smartphone Samsung Galaxy S24 256GB 5G',
        price: '3.899,00',
        url: 'https://amazon.com.br/s24',
      },
      {
        title: 'Smartphone Samsung Galaxy A55 5G 128GB',
        price: '1.799,00',
        url: 'https://amazon.com.br/a55',
      },
    ],
  },
  {
    id: 'cup-3',
    code: 'GAMER20',
    platform: 'Shopee',
    discountDescription: '20% OFF em Periféricos e Acessórios Gamer',
    minSpend: 'R$ 100,00',
    expiresIn: 'Válido hoje até 23:59',
    officialSiteUrl: 'https://shopee.com.br/m/cupons-diarios',
    isValid: true,
    linkedProductsCount: 2,
    linkedProducts: [
      {
        title: 'Headset Gamer Redragon Zeus X RGB 7.1',
        price: '219,00',
        url: 'https://shopee.com.br/redragon',
      },
      {
        title: 'Teclado Mecânico RGB Switch Blue Redragon Kumara',
        price: '189,00',
        url: 'https://shopee.com.br/teclado',
      },
    ],
  },
  {
    id: 'cup-4',
    code: 'CASA15',
    platform: 'Magalu',
    discountDescription: '15% OFF em Móveis e Decoração para Casa',
    minSpend: 'R$ 200,00',
    expiresIn: 'Válido até 02/10',
    officialSiteUrl: 'https://www.magazineluiza.com.br/cupons',
    isValid: true,
    linkedProductsCount: 1,
    linkedProducts: [
      {
        title: 'Jogo de Panelas Tramontina Paris 7 Peças',
        price: '249,90',
        url: 'https://magazineluiza.com.br/panelas',
      },
    ],
  },
];

export const ListasPanel: React.FC = () => {
  const [lists, setLists] = useState(INITIAL_COUPON_LISTS);
  const [selectedCupom, setSelectedCupom] = useState(INITIAL_COUPON_LISTS[0]);
  const [newProductTitle, setNewProductTitle] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductUrl, setNewProductUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleAddLinkedProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductTitle.trim() || !newProductPrice.trim()) return;

    const newProd = {
      title: newProductTitle.trim(),
      price: newProductPrice.trim(),
      url: newProductUrl.trim() || 'https://www.mercadolivre.com.br',
    };

    const updatedLists = lists.map((c) => {
      if (c.id === selectedCupom.id) {
        const linked = [...c.linkedProducts, newProd];
        return {
          ...c,
          linkedProducts: linked,
          linkedProductsCount: linked.length,
        };
      }
      return c;
    });

    setLists(updatedLists);
    setSelectedCupom({
      ...selectedCupom,
      linkedProducts: [...selectedCupom.linkedProducts, newProd],
      linkedProductsCount: selectedCupom.linkedProductsCount + 1,
    });

    setNewProductTitle('');
    setNewProductPrice('');
    setNewProductUrl('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            Listas &bull; Cupons Ativos & Produtos Atrelados
          </h2>
          <p className="text-xs text-neutral-400">
            Consulte cupons ativos, acesse os sites oficiais e salve produtos já atrelados para a automação disparar no horário agendado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={selectedCupom.officialSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#18191d] hover:bg-[#22242a] text-white border border-[#26282e] text-xs font-semibold transition"
          >
            <span>Página Oficial ({selectedCupom.platform})</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#FF5722]" />
          </a>
        </div>
      </div>

      {/* Main Split: Left Coupon Selector / Right Linked Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Coupon Lists (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-400">
              Cupons Sintonizados
            </h3>
            <span className="text-[11px] text-[#FF5722] font-semibold">{lists.length} Ativos</span>
          </div>

          <div className="space-y-2.5">
            {lists.map((cup) => {
              const isSelected = selectedCupom.id === cup.id;
              return (
                <div
                  key={cup.id}
                  onClick={() => setSelectedCupom(cup)}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 ${
                    isSelected
                      ? 'bg-[#18191d] border-[#FF5722] shadow-lg shadow-[#FF5722]/10'
                      : 'bg-[#141517] border-[#22242a] hover:border-[#FF5722]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1e2025] text-[#FF5722] border border-[#2a2c33]">
                      {cup.platform}
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {cup.linkedProductsCount} produtos atrelados
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-[#FF5722]" />
                      <span className="font-black text-base text-white tracking-wider font-mono">
                        {cup.code}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(cup.code);
                      }}
                      className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCode === cup.code ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCode === cup.code ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-neutral-300 font-medium">
                    {cup.discountDescription}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-[#22242a]">
                    <span>Gasto Mínimo: {cup.minSpend || 'Livre'}</span>
                    <span className="text-amber-400">{cup.expiresIn}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Linked Products for the Selected Coupon (7 Cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Cupom Selecionado:</span>
                <span className="text-sm font-mono font-bold text-[#FF5722]">
                  {selectedCupom.code}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                  {selectedCupom.platform}
                </span>
              </div>
              <h3 className="font-bold text-base text-white mt-0.5">
                Produtos Prontos para Automação com este Cupom
              </h3>
            </div>

            <a
              href={selectedCupom.officialSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#FF5722] hover:underline flex items-center gap-1 font-semibold"
            >
              Abrir Cupons Oficiais <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* List of Linked Products */}
          <div className="space-y-2.5">
            {selectedCupom.linkedProducts.map((prod, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/30 transition flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#121214] text-neutral-400 border border-[#22242a] text-xs font-mono flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold text-xs text-white line-clamp-1">
                      {prod.title}
                    </h4>
                    <span className="text-[11px] text-[#FF5722] font-mono font-bold">
                      Por R$ {prod.price} (com cupom {selectedCupom.code})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    Na Fila
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add Product to this Coupon List */}
          <div className="pt-4 border-t border-[#22242a] space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#FF5722]" /> Atrelar Mais um Produto a este Cupom
            </h4>

            <form onSubmit={handleAddLinkedProduct} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] text-neutral-400">Título do Produto:</label>
                  <input
                    type="text"
                    required
                    value={newProductTitle}
                    onChange={(e) => setNewProductTitle(e.target.value)}
                    placeholder="Ex: Fritadeira Air Fryer Mondial..."
                    className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400">Preço com Cupom (R$):</label>
                  <input
                    type="text"
                    required
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="199,90"
                    className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-400">Link Original do Produto:</label>
                <input
                  type="text"
                  value={newProductUrl}
                  onChange={(e) => setNewProductUrl(e.target.value)}
                  placeholder="https://mercadolivre.com.br/produto..."
                  className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-lg shadow-[#FF5722]/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar na Lista de Automação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
