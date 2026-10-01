import React, { useState } from 'react';
import {
  Sparkles,
  Tag,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Flame,
  Search,
  Filter,
} from 'lucide-react';
import { ProductItem } from '../../types/index.ts';
import { buildOfficialCopy } from '../../utils/affiliateEngine.ts';

interface AchadinhosPanelProps {
  toolId: string;
  source: string;
  vipGroupLink: string;
}

const INITIAL_ACHADINHOS: ProductItem[] = [
  {
    id: 'achado-1',
    title: 'Fritadeira Air Fryer Mondial 4L Sem Óleo 1500W Preto',
    category: 'Eletrodomésticos',
    platform: 'Mercado Livre',
    oldPrice: '349,90',
    currentPrice: '199,90',
    discount: '42% OFF',
    coupon: 'COZINHA10',
    rawUrl: 'https://www.mercadolivre.com.br/airfryer-mondial-4l/p/MLB123',
    monetizedUrl: 'https://www.mercadolivre.com.br/airfryer-mondial-4l/p/MLB123?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 1420,
    rating: 4.8,
    active: true,
    createdAt: 'Hoje',
  },
  {
    id: 'achado-2',
    title: 'Smartphone Samsung Galaxy S24 256GB 5G Tela 6.2 Câmera 50MP',
    category: 'Eletrônicos',
    platform: 'Amazon',
    oldPrice: '5.999,00',
    currentPrice: '3.899,00',
    discount: '35% OFF',
    coupon: 'GALAXY300',
    rawUrl: 'https://www.amazon.com.br/dp/B0CS812XYZ',
    monetizedUrl: 'https://www.amazon.com.br/dp/B0CS812XYZ?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 890,
    rating: 4.9,
    active: true,
    createdAt: 'Hoje',
  },
  {
    id: 'achado-3',
    title: 'Headset Gamer Redragon Zeus X RGB 7.1 Surround Mic USB',
    category: 'Eletrônicos Gamers',
    platform: 'Shopee',
    oldPrice: '389,00',
    currentPrice: '219,00',
    discount: '43% OFF',
    coupon: 'GAMER20',
    rawUrl: 'https://shopee.com.br/redragon-zeus-x-rgb',
    monetizedUrl: 'https://shopee.com.br/redragon-zeus-x-rgb?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 2310,
    rating: 4.9,
    active: true,
    createdAt: 'Ontem',
  },
  {
    id: 'achado-4',
    title: 'Monitor Gamer AOC Hero 24 144Hz 1ms IPS FreeSync Premium',
    category: 'Eletrônicos Gamers',
    platform: 'Mercado Livre',
    oldPrice: '1.099,00',
    currentPrice: '789,00',
    discount: '28% OFF',
    coupon: 'HERO100',
    rawUrl: 'https://www.mercadolivre.com.br/monitor-aoc-hero-24/p/MLB456',
    monetizedUrl: 'https://www.mercadolivre.com.br/monitor-aoc-hero-24/p/MLB456?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 750,
    rating: 4.7,
    active: true,
    createdAt: 'Ontem',
  },
  {
    id: 'achado-5',
    title: 'Robô Aspirador de Pó Inteligente Xiaomi Robot Vacuum E10',
    category: 'Eletrodomésticos',
    platform: 'Amazon',
    oldPrice: '1.499,00',
    currentPrice: '999,00',
    discount: '33% OFF',
    coupon: 'CASA50',
    rawUrl: 'https://www.amazon.com.br/dp/B0B7981ABC',
    monetizedUrl: 'https://www.amazon.com.br/dp/B0B7981ABC?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 1100,
    rating: 4.8,
    active: true,
    createdAt: 'Há 2 dias',
  },
  {
    id: 'achado-6',
    title: 'Jogo de Panelas Tramontina Antiaderente Paris 7 Peças Vermelho',
    category: 'Casa & Cozinha',
    platform: 'Magalu',
    oldPrice: '399,90',
    currentPrice: '249,90',
    discount: '37% OFF',
    coupon: 'PANELA15',
    rawUrl: 'https://www.magazineluiza.com.br/jogo-panelas-paris/p/1234',
    monetizedUrl: 'https://www.magazineluiza.com.br/jogo-panelas-paris/p/1234?matt_tool_id=sf20250625192813&matt_source=whatsapp',
    salesCount: 680,
    rating: 4.6,
    active: true,
    createdAt: 'Há 3 dias',
  },
];

const CATEGORIES = [
  'Todos',
  'Eletrodomésticos',
  'Eletrônicos',
  'Eletrônicos Gamers',
  'Casa & Cozinha',
  'Moda & Beleza',
];

export const AchadinhosPanel: React.FC<AchadinhosPanelProps> = ({
  toolId,
  source,
  vipGroupLink,
}) => {
  const [items, setItems] = useState<ProductItem[]>(INITIAL_ACHADINHOS);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New item form
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ProductItem['category']>('Eletrônicos');
  const [newPlatform, setNewPlatform] = useState<ProductItem['platform']>('Mercado Livre');
  const [newOldPrice, setNewOldPrice] = useState('');
  const [newCurrentPrice, setNewCurrentPrice] = useState('');
  const [newCoupon, setNewCoupon] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCategory === 'Todos' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.coupon && item.coupon.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleCopyFormatted = (item: ProductItem) => {
    const copy = buildOfficialCopy(
      {
        title: item.title,
        oldPrice: item.oldPrice,
        currentPrice: item.currentPrice,
        discount: item.discount,
        coupon: item.coupon,
        productUrl: item.rawUrl,
        vipGroupLink,
      },
      toolId,
      source,
      vipGroupLink
    );

    navigator.clipboard.writeText(copy);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCurrentPrice.trim() || !newUrl.trim()) return;

    const newItem: ProductItem = {
      id: `achado-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory,
      platform: newPlatform,
      oldPrice: newOldPrice.trim() || undefined,
      currentPrice: newCurrentPrice.trim(),
      discount: newOldPrice ? 'Com super desconto!' : undefined,
      coupon: newCoupon.trim() || undefined,
      rawUrl: newUrl.trim(),
      monetizedUrl: newUrl.trim(),
      salesCount: 1,
      rating: 5.0,
      active: true,
      createdAt: 'Agora',
    };

    setItems([newItem, ...items]);
    setIsAddModalOpen(false);
    setNewTitle('');
    setNewOldPrice('');
    setNewCurrentPrice('');
    setNewCoupon('');
    setNewUrl('');
  };

  const handleDelete = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            Achadinhos &bull; Mais Vendidos & Cupons Ativos
          </h2>
          <p className="text-xs text-neutral-400">
            Vitrine de produtos validados, com cupons aplicáveis e cópia em 1 clique no template oficial.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-lg shadow-[#FF5722]/25 cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Achadinho</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20'
                  : 'bg-[#18191d] text-neutral-400 hover:text-white border border-[#22242a]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar achadinho ou cupom..."
            className="w-full pl-9 pr-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
          />
        </div>
      </div>

      {/* Grid of Achadinhos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] hover:border-[#FF5722]/40 transition space-y-3 flex flex-col justify-between shadow-md group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1e2025] text-neutral-300 border border-[#2a2c33]">
                  {item.category}
                </span>
                <span className="text-[10px] font-bold text-[#FF5722]">{item.platform}</span>
              </div>

              <h3 className="font-bold text-sm text-neutral-100 line-clamp-2 leading-snug group-hover:text-white transition">
                {item.title}
              </h3>

              {/* Price Block */}
              <div className="space-y-0.5 pt-1">
                {item.oldPrice && (
                  <span className="text-xs text-neutral-500 line-through block">
                    De R$ {item.oldPrice}
                  </span>
                )}
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black text-white font-mono">
                    R$ {item.currentPrice}
                  </span>
                  {item.discount && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {item.discount}
                    </span>
                  )}
                </div>
              </div>

              {/* Coupon applicable */}
              {item.coupon ? (
                <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Tag className="w-3.5 h-3.5 text-[#FF5722]" />
                    <span>Cupom:</span>
                  </div>
                  <code className="text-[#FF5722] font-mono font-bold tracking-wider">
                    {item.coupon}
                  </code>
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-[#18191d] border border-[#22242a] text-[11px] text-neutral-500 text-center">
                  Desconto direto no carrinho
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-[#22242a] flex items-center justify-between gap-2">
              <a
                href={item.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
              >
                Loja Oficial <ExternalLink className="w-3 h-3" />
              </a>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl bg-[#18191d] hover:bg-red-950 text-neutral-500 hover:text-red-400 transition cursor-pointer"
                  title="Excluir produto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleCopyFormatted(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ${
                    copiedId === item.id
                      ? 'bg-emerald-500 text-neutral-950'
                      : 'bg-[#FF5722] hover:bg-[#f4511e] text-white'
                  }`}
                  title="Copiar mensagem completa formatada com seu ID"
                >
                  {copiedId === item.id ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === item.id ? 'Copiado!' : 'Copiar Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Achadinho Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141517] border border-[#22242a] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF5722]" /> Cadastrar Novo Achadinho
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-neutral-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">Título do Produto:</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Fritadeira Air Fryer Mondial 4L"
                  className="w-full px-3.5 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Categoria:</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  >
                    <option value="Eletrodomésticos">Eletrodomésticos</option>
                    <option value="Eletrônicos">Eletrônicos</option>
                    <option value="Eletrônicos Gamers">Eletrônicos Gamers</option>
                    <option value="Casa & Cozinha">Casa & Cozinha</option>
                    <option value="Moda & Beleza">Moda & Beleza</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Plataforma:</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  >
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Magalu">Magalu</option>
                    <option value="AliExpress">AliExpress</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Preço De (R$):</label>
                  <input
                    type="text"
                    value={newOldPrice}
                    onChange={(e) => setNewOldPrice(e.target.value)}
                    placeholder="349,90"
                    className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Preço Por (R$):</label>
                  <input
                    type="text"
                    required
                    value={newCurrentPrice}
                    onChange={(e) => setNewCurrentPrice(e.target.value)}
                    placeholder="199,90"
                    className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">Cupom:</label>
                  <input
                    type="text"
                    value={newCoupon}
                    onChange={(e) => setNewCoupon(e.target.value)}
                    placeholder="COZINHA10"
                    className="w-full px-3 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">Link Original do Produto:</label>
                <input
                  type="text"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-[#18191d] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-lg shadow-[#FF5722]/20"
                >
                  Salvar Achadinho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
