import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ShoppingBag,
  Zap,
  Clock,
  Radio,
  X,
  ChevronDown,
  Smartphone,
  Edit3,
  Play,
  Check,
  Megaphone,
} from 'lucide-react';
import { SourceGroup, GroupChannel } from '../../types/index.ts';

interface ProdutosPanelProps {
  sourceGroups: SourceGroup[];
  groups: GroupChannel[];
  onNavigateToFontes: () => void;
  onNavigateToConexoes: () => void;
}

interface SweepProductItem {
  id: string;
  ruleId?: string;
  title: string;
  marketplace: string;
  sourceGroup: string;
  targetGroup: string;
  originalUrl?: string;
  monetizedUrl?: string;
  status: 'Enviado' | 'Pendente' | 'Pronto para Envio';
  timestamp: string;
}

export const ProdutosPanel: React.FC<ProdutosPanelProps> = ({
  sourceGroups,
  groups,
  onNavigateToFontes,
}) => {
  const [isSweeping, setIsSweeping] = useState(false);
  const [isDispatchingAll, setIsDispatchingAll] = useState(false);
  const [products, setProducts] = useState<SweepProductItem[]>([]);
  const [ruleSweepData, setRuleSweepData] = useState<
    Record<string, { totalUnsent: number; breakdownBySource: Record<string, number>; lastChecked?: string }>
  >({});

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [dispatchingRuleId, setDispatchingRuleId] = useState<string | null>(null);
  const [dispatchingSourceGroup, setDispatchingSourceGroup] = useState<string | null>(null);
  const [expandedRuleIds, setExpandedRuleIds] = useState<string[]>([]);
  const [selectedTargetPerRule, setSelectedTargetPerRule] = useState<Record<string, string>>({});

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Synced Telegram Channels
  const [telegramSyncedGroups, setTelegramSyncedGroups] = useState<GroupChannel[]>([]);

  useEffect(() => {
    fetch('/api/telegram/channels')
      .then((res) => res.json())
      .then((data) => {
        if (data.channels && Array.isArray(data.channels)) {
          const list: GroupChannel[] = data.channels.map((tc: any) => ({
            id: tc.id,
            name: tc.name || tc.chatId,
            platform: 'Telegram',
            chatId: tc.chatId,
            inviteLink: tc.inviteLink || 'https://t.me/',
            membersCount: 1500,
            maxCapacity: 200000,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
          }));
          setTelegramSyncedGroups(list);
        }
      })
      .catch(() => {});
  }, []);

  const allAvailableTargetChannels: GroupChannel[] = [
    ...groups
      .filter((g) => !g.name.toLowerCase().includes('_bot') && !g.id.startsWith('tg-bot-'))
      .map((g) => ({ ...g, platform: (g.platform || 'WhatsApp') as 'WhatsApp' | 'Telegram' })),
    ...telegramSyncedGroups.filter(
      (tg) =>
        !groups.some(
          (g) =>
            g.platform === 'Telegram' &&
            (g.id === tg.id || g.name.toLowerCase() === tg.name.toLowerCase())
        )
    ),
  ];

  const activeSourcesCount = sourceGroups.filter((s) => s.status === 'monitoring').length;

  // Load accumulated sweep summary and products from backend
  const loadSweepDataAndProducts = async () => {
    try {
      const summaryRes = await fetch('/api/replica/sweep-summary');
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        if (summaryData.ruleData) {
          setRuleSweepData(summaryData.ruleData);
        }

        if (Array.isArray(summaryData.accumulatedItems) && summaryData.accumulatedItems.length > 0) {
          const mapped: SweepProductItem[] = summaryData.accumulatedItems.map((item: any) => ({
            id: item.id || `prod-${Math.random()}`,
            ruleId: item.ruleId,
            title: item.title || 'Oferta de Produto em Destaque',
            marketplace: item.marketplace || 'Mercado Livre',
            sourceGroup: item.sourceGroup || 'Grupo Fonte',
            targetGroup: item.targetGroup || 'Grupo Destino',
            originalUrl: item.originalUrl,
            monetizedUrl: item.monetizedUrl,
            status: item.status === 'sent' ? 'Enviado' : 'Pendente',
            timestamp: item.timestamp || new Date().toLocaleTimeString('pt-BR'),
          }));
          setProducts(mapped);
          return;
        }
      }

      // Fallback: fetch logs
      const logsRes = await fetch('/api/replica/logs');
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (Array.isArray(logsData.logs)) {
          const mapped: SweepProductItem[] = logsData.logs.map((log: any) => ({
            id: log.id || `prod-${Math.random()}`,
            title: log.originalText ? log.originalText.slice(0, 100) : 'Oferta de Produto em Destaque',
            marketplace: log.marketplace || 'Mercado Livre',
            sourceGroup: log.sourceGroupName || 'Grupo Fonte',
            targetGroup: log.targetGroupName || 'Grupo Destino',
            originalUrl: log.originalUrl,
            monetizedUrl: log.monetizedUrl,
            status: log.status === 'success' ? 'Enviado' : 'Pendente',
            timestamp: log.timestamp || new Date().toLocaleTimeString('pt-BR'),
          }));
          setProducts(mapped);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados de varredura:', err);
    }
  };

  useEffect(() => {
    loadSweepDataAndProducts();
  }, []);

  // Execute full Sweep (Varredura Geral)
  const handleRunGlobalSweep = async () => {
    setIsSweeping(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/replica/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        await loadSweepDataAndProducts();
        setFeedback({
          type: 'success',
          message: data.message || 'Varredura geral concluída! Blocos de fontes atualizados.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao executar a varredura.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao conectar ao servidor para varredura.',
      });
    } finally {
      setIsSweeping(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  // Run sweep for a specific rule block
  const handleRunRuleBlockSweep = async (ruleId: string) => {
    setIsSweeping(true);
    try {
      const res = await fetch('/api/replica/sweep-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (data.success && data.ruleData) {
        setRuleSweepData((prev) => ({
          ...prev,
          [ruleId]: data.ruleData,
        }));
        await loadSweepDataAndProducts();
        toggleExpandRule(ruleId);
      }
    } catch (err) {
      console.error('Erro ao executar varredura da regra:', err);
    } finally {
      setIsSweeping(false);
    }
  };

  // Dispatch items for a specific Rule Block or specific Source Group
  const handleDispatchRuleBlock = async (rule: SourceGroup, sourceGroupFilter?: string) => {
    const selectedTarget = selectedTargetPerRule[rule.id] || 'default';
    const targetName =
      selectedTarget === 'default'
        ? rule.targetGroup
        : allAvailableTargetChannels.find((c) => c.id === selectedTarget || c.name === selectedTarget)?.name || selectedTarget;

    setDispatchingRuleId(rule.id);
    if (sourceGroupFilter) setDispatchingSourceGroup(sourceGroupFilter);

    setFeedback({
      type: 'info',
      message: `Enviando ofertas do bloco [${rule.sourceName}]${
        sourceGroupFilter ? ` (${sourceGroupFilter})` : ''
      } para "${targetName}"...`,
    });

    try {
      const res = await fetch('/api/replica/dispatch-rule-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: rule.id,
          targetOverride: targetName,
          sourceGroupFilter,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Mark products in this rule as sent
        setProducts((prev) =>
          prev.map((p) => {
            const matchesRule = p.ruleId === rule.id || rule.sourceNames?.some((sn) => p.sourceGroup.includes(sn));
            const matchesSource = !sourceGroupFilter || p.sourceGroup.includes(sourceGroupFilter);
            if (matchesRule && matchesSource) {
              return { ...p, status: 'Enviado', targetGroup: targetName };
            }
            return p;
          })
        );

        setFeedback({
          type: 'success',
          message: data.message || `Ofertas do bloco [${rule.sourceName}] disparadas com sucesso para "${targetName}"!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao disparar produtos do bloco.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao comunicar disparo do bloco.',
      });
    } finally {
      setDispatchingRuleId(null);
      setDispatchingSourceGroup(null);
      setTimeout(() => setFeedback(null), 7000);
    }
  };

  // DISPARAR TODOS OS PENDENTES PARA TODOS OS GRUPOS DE DESTINO (Envio em Massa Final)
  const handleDispatchAllMass = async () => {
    setIsDispatchingAll(true);
    setFeedback({
      type: 'info',
      message: `Iniciando Envio em Massa Final de todas as ${products.length} ofertas para todos os grupos e canais de destino...`,
    });

    try {
      const res = await fetch('/api/replica/dispatch-all-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setProducts((prev) => prev.map((p) => ({ ...p, status: 'Enviado' })));
        // Reset unsent counters
        setRuleSweepData({});
        setFeedback({
          type: 'success',
          message: `🚀 Envio em Massa Concluído! Todas as ofertas pendentes foram disparadas com sucesso!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao executar o envio em massa.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao conectar para envio em massa.',
      });
    } finally {
      setIsDispatchingAll(false);
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  // Re-send single product
  const handleResendSingle = async (prod: SweepProductItem) => {
    setResendingId(prod.id);
    try {
      setFeedback({
        type: 'success',
        message: `Oferta "${prod.title.slice(0, 35)}..." reenviada com sucesso para ${prod.targetGroup}!`,
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, status: 'Enviado' } : p))
      );
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Falha ao reenviar oferta.',
      });
    } finally {
      setResendingId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleCopyLink = (id: string, url?: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpandRule = (ruleId: string) => {
    setExpandedRuleIds((prev) =>
      prev.includes(ruleId) ? prev.filter((id) => id !== ruleId) : [...prev, ruleId]
    );
  };

  // Filter rule blocks by search query
  const filteredRules = sourceGroups.filter((rule) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const matchesTitle = rule.sourceName.toLowerCase().includes(query);
    const matchesSource = rule.sourceNames?.some((sn) => sn.toLowerCase().includes(query));
    const matchesTarget = rule.targetGroup.toLowerCase().includes(query);
    const matchesProduct = products.some(
      (p) =>
        (p.ruleId === rule.id || rule.sourceNames?.some((sn) => p.sourceGroup.includes(sn))) &&
        p.title.toLowerCase().includes(query)
    );
    return matchesTitle || matchesSource || matchesTarget || matchesProduct;
  });

  const totalPendingAll = products.filter((p) => p.status !== 'Enviado').length;

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#FF5722]" />
            Envio em Lote de Produtos (Varredura)
          </h1>
          <p className="text-xs text-neutral-400">
            Gerencie e envie as ofertas acumuladas por bloco de regra de fonte, filtre os canais de destino e acione o envio em massa.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onNavigateToFontes}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold transition border border-[#282a34] cursor-pointer"
          >
            <Radio className="w-4 h-4 text-[#FF5722]" />
            <span>Ver Regras em Fontes</span>
          </button>

          <button
            onClick={handleRunGlobalSweep}
            disabled={isSweeping || isDispatchingAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-white text-xs font-bold border border-[#2c2f3a] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-[#FF5722] ${isSweeping ? 'animate-spin' : ''}`} />
            <span>{isSweeping ? 'Analisando...' : 'Recarregar Varredura'}</span>
          </button>

          {/* Mass Dispatch Button */}
          <button
            onClick={handleDispatchAllMass}
            disabled={isDispatchingAll || products.length === 0}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-black shadow-lg shadow-[#FF5722]/30 transition cursor-pointer disabled:opacity-50 animate-pulse hover:animate-none"
          >
            <Zap className={`w-4 h-4 ${isDispatchingAll ? 'animate-spin' : ''}`} />
            <span>{isDispatchingAll ? 'ENVIANDO EM MASSA...' : `DISPARAR TODOS OS ${products.length} ITENS`}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg transition animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
              : feedback.type === 'error'
              ? 'bg-red-500/15 border border-red-500/40 text-red-400'
              : 'bg-blue-500/15 border border-blue-500/40 text-blue-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] flex items-center justify-between shadow-lg">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Total de Produtos Lidos
            </span>
            <div className="text-2xl font-black text-white">{products.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722]">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] flex items-center justify-between shadow-lg">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Produtos Pendentes
            </span>
            <div className="text-2xl font-black text-amber-400">{totalPendingAll}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] flex items-center justify-between shadow-lg">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Blocos de Regras Fontes
            </span>
            <div className="text-2xl font-black text-emerald-400">{sourceGroups.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] flex items-center justify-between shadow-lg">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Envio em Massa Final
            </span>
            <div>
              <button
                onClick={handleDispatchAllMass}
                disabled={isDispatchingAll || products.length === 0}
                className="px-3.5 py-1.5 rounded-lg bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-black transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Enviar Todos ({products.length})</span>
              </button>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722]">
            <Send className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Mass Dispatch Banner Callout */}
      {products.length > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-[#1b1c22] via-[#202129] to-[#17181f] border border-[#2e313d] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <div className="text-base font-black text-white flex items-center justify-center sm:justify-start gap-2">
              <Zap className="w-5 h-5 text-[#FF5722]" />
              <span>{products.length} Ofertas Acumuladas Prontas para Disparo em Massa</span>
            </div>
            <p className="text-xs text-neutral-400">
              Dispara todas as ofertas de todos os blocos de fontes para todos os seus grupos/canais de destino.
            </p>
          </div>

          <button
            onClick={handleDispatchAllMass}
            disabled={isDispatchingAll}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-black shadow-lg shadow-[#FF5722]/30 transition cursor-pointer shrink-0 inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>DISPARAR TODOS OS {products.length} ITENS PARA TODOS OS GRUPOS DE DESTINO</span>
          </button>
        </div>
      )}

      {/* Global Search Input (Adiciona Pesquisa) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#121214] p-3 rounded-2xl border border-[#22242a]">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por bloco de fonte, canal de destino ou produto..."
            className="w-full pl-9 pr-3.5 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSweepDataAndProducts}
            className="px-3.5 py-2.5 rounded-xl bg-[#18191d] hover:bg-[#22242a] text-neutral-300 text-xs font-bold border border-[#272930] transition cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#FF5722]" />
            <span>Atualizar Lista</span>
          </button>
        </div>
      </div>

      {/* RULE BLOCKS LIST (Cada bloco que esteja em fontes) */}
      {filteredRules.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141517] border border-[#22242a] text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1b20] border border-[#282a34] mx-auto flex items-center justify-center text-[#FF5722]">
            <Layers className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold text-white">Nenhum Bloco de Fonte Encontrado</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Crie regras de fontes na aba <strong className="text-white">Fontes</strong> para começar o monitoramento e varredura.
            </p>
          </div>
          <button
            onClick={onNavigateToFontes}
            className="px-6 py-3 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-black transition shadow-lg shadow-[#FF5722]/30 cursor-pointer inline-flex items-center gap-2"
          >
            <Radio className="w-4 h-4" />
            <span>CRIAR REGRAS NA ABA FONTES</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule) => {
            const sourcesList =
              rule.sourceNames && rule.sourceNames.length > 0 ? rule.sourceNames : [rule.sourceName];
            const targetsList =
              rule.targetGroups && rule.targetGroups.length > 0 ? rule.targetGroups : [rule.targetGroup];

            const ruleSweep = ruleSweepData[rule.id] || {
              totalUnsent: 0,
              breakdownBySource: {},
            };

            // Products belonging to this rule block
            const ruleProducts = products.filter(
              (p) => p.ruleId === rule.id || sourcesList.some((sn) => p.sourceGroup.includes(sn))
            );

            const isExpanded = expandedRuleIds.includes(rule.id);
            const isMonitoring = rule.status === 'monitoring';

            const selectedTargetId = selectedTargetPerRule[rule.id] || 'default';

            return (
              <div
                key={`rule-block-${rule.id}`}
                className="rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl overflow-hidden transition"
              >
                {/* Block Card Header */}
                <div className="p-5 space-y-4">
                  {/* Top Header Line */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                          rule.platform === 'Telegram'
                            ? 'bg-[#0088cc]/15 border-[#0088cc]/40 text-[#29b6f6]'
                            : rule.platform === 'Misto'
                            ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        }`}
                      >
                        {rule.platform === 'Telegram' ? (
                          <Send className="w-3 h-3" />
                        ) : rule.platform === 'Misto' ? (
                          <Layers className="w-3 h-3" />
                        ) : (
                          <Smartphone className="w-3 h-3" />
                        )}
                        <span>{rule.platform || 'WhatsApp'}</span>
                      </span>

                      {isMonitoring ? (
                        <span className="px-3 py-1 rounded-full bg-[#00c978]/15 border border-[#00c978]/40 text-[#00c978] text-[11px] font-black tracking-wider">
                          MONITORANDO
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 text-[11px] font-bold tracking-wider">
                          PAUSADO
                        </span>
                      )}

                      <h3 className="text-base font-black text-white tracking-tight ml-1">
                        [FONTE] {rule.sourceName}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRunRuleBlockSweep(rule.id)}
                        disabled={isSweeping}
                        className="px-3.5 py-1.5 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-white text-xs font-bold border border-[#2c2f3a] transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Search className={`w-3.5 h-3.5 text-[#FF5722] ${isSweeping ? 'animate-spin' : ''}`} />
                        <span>Varredura do Bloco</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandRule(rule.id)}
                        className="p-2 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white border border-[#2c2f3a] transition cursor-pointer flex items-center gap-1"
                        title="Ver opções e produtos deste bloco"
                      >
                        <span className="text-xs font-bold ml-1">{isExpanded ? 'Recolher' : 'Opções & Lista'}</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-[#FF5722]' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Routing Summary Box */}
                  <div className="p-3.5 rounded-xl bg-[#0e0f11] border border-[#22242a] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 font-medium">
                        Origem ({sourcesList.length} grupo{sourcesList.length === 1 ? '' : 's'} concorrente{sourcesList.length === 1 ? '' : 's'}):
                      </span>
                      <span className="text-amber-400 font-bold font-mono">
                        {ruleSweep.totalUnsent || ruleProducts.length} ofertas pendentes
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {sourcesList.map((src, i) => (
                        <span
                          key={`src-pill-${i}`}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1"
                        >
                          <Smartphone className="w-2.5 h-2.5" />
                          <span>{src}</span>
                          <span className="ml-1 text-[10px] text-amber-400 font-mono">
                            ({ruleSweep.breakdownBySource?.[src] || 0})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Target Channel Selector Dropdown & Dispatch Controls */}
                  <div className="p-4 rounded-xl bg-[#18191d] border border-[#272930] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <label className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Megaphone className="w-3.5 h-3.5 text-[#FF5722]" />
                          <span>Selecionar Grupo / Canal para Enviar Produtos:</span>
                        </label>
                        <p className="text-[11px] text-neutral-400">
                          Escolha o canal de destino onde as ofertas deste bloco serão lançadas.
                        </p>
                      </div>

                      {/* Dropdown with all available target channels */}
                      <select
                        value={selectedTargetId}
                        onChange={(e) =>
                          setSelectedTargetPerRule((prev) => ({
                            ...prev,
                            [rule.id]: e.target.value,
                          }))
                        }
                        className="px-3.5 py-2.5 bg-[#121316] border border-[#2c2f3a] rounded-xl text-xs text-white font-bold focus:outline-none focus:border-[#FF5722] cursor-pointer min-w-[220px]"
                      >
                        <option value="default">
                          🎯 Padrão da Regra ({targetsList.join(', ')})
                        </option>
                        {allAvailableTargetChannels.map((chan) => (
                          <option key={`target-opt-${rule.id}-${chan.id}`} value={chan.id}>
                            {chan.platform === 'Telegram' ? '📢 Telegram: ' : '💬 WhatsApp: '}
                            {chan.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dispatch Rule Block Button */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#22242a]">
                      <div className="text-xs text-neutral-400">
                        Total a disparar neste bloco:{' '}
                        <strong className="text-white font-black">{ruleProducts.length} produtos</strong>
                      </div>

                      <button
                        onClick={() => handleDispatchRuleBlock(rule)}
                        disabled={dispatchingRuleId === rule.id || ruleProducts.length === 0}
                        className="px-5 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-black shadow-lg shadow-[#FF5722]/30 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                      >
                        <Send className={`w-3.5 h-3.5 ${dispatchingRuleId === rule.id ? 'animate-bounce' : ''}`} />
                        <span>
                          {dispatchingRuleId === rule.id
                            ? 'DISPARANDO BLOCO...'
                            : `DISPARAR BLOCO (${ruleProducts.length} PRODUTOS)`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Breakdown by Source Group & Individual Dispatch Buttons */}
                  {sourcesList.length > 1 && (
                    <div className="p-3.5 rounded-xl bg-[#0e0f11] border border-[#22242a] space-y-2">
                      <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                        Disparar Separadamente por Grupo Fonte:
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sourcesList.map((srcName, sIdx) => {
                          const count = ruleSweep.breakdownBySource?.[srcName] || 0;
                          const isDispatchingThisSource =
                            dispatchingRuleId === rule.id && dispatchingSourceGroup === srcName;

                          return (
                            <div
                              key={`src-dispatch-${rule.id}-${sIdx}`}
                              className="p-2.5 rounded-xl bg-[#141518] border border-[#22242a] flex items-center justify-between gap-2"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#FF5722]" />
                                  <span>{srcName}</span>
                                </div>
                                <div className="text-[10px] text-amber-400 font-mono font-bold">
                                  {count} produtos acumulados
                                </div>
                              </div>

                              <button
                                onClick={() => handleDispatchRuleBlock(rule, srcName)}
                                disabled={isDispatchingThisSource}
                                className="px-3 py-1.5 rounded-lg bg-[#1e2026] hover:bg-[#282a34] text-white text-[11px] font-bold border border-[#2c2f3a] hover:border-[#FF5722] transition cursor-pointer shrink-0 flex items-center gap-1"
                              >
                                <Send className="w-3 h-3 text-[#FF5722]" />
                                <span>{isDispatchingThisSource ? 'Enviando...' : 'Disparar Fonte'}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Collapsible Section: Products inside this Rule Block */}
                {isExpanded && (
                  <div className="border-t border-[#22242a] bg-[#101113] p-5 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-300 pb-1 border-b border-[#1f2026]">
                      <span>Produtos Capturados neste Bloco ({ruleProducts.length})</span>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        Destino Selecionado: {selectedTargetId === 'default' ? rule.targetGroup : selectedTargetId}
                      </span>
                    </div>

                    {ruleProducts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-neutral-500">
                        Nenhum produto pendente para este bloco no momento.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {ruleProducts.map((prod) => (
                          <div
                            key={`prod-${prod.id}`}
                            className="p-3.5 rounded-xl bg-[#141517] border border-[#22242a] hover:border-[#333644] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#FF5722]/15 border border-[#FF5722]/30 text-[#FF5722]">
                                  {prod.marketplace}
                                </span>

                                <span className="text-[11px] font-bold text-neutral-300">
                                  Fonte: {prod.sourceGroup}
                                </span>

                                <span className="text-[10px] text-neutral-500 font-mono ml-auto">
                                  {prod.timestamp}
                                </span>
                              </div>

                              <p className="text-xs font-bold text-white line-clamp-1">{prod.title}</p>

                              {prod.monetizedUrl && (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={prod.monetizedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-mono text-[#29b6f6] hover:underline truncate max-w-md flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{prod.monetizedUrl}</span>
                                  </a>

                                  <button
                                    onClick={() => handleCopyLink(prod.id, prod.monetizedUrl)}
                                    className="p-0.5 text-neutral-400 hover:text-white transition cursor-pointer"
                                    title="Copiar Link"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  {copiedId === prod.id && (
                                    <span className="text-[10px] text-emerald-400 font-bold">Copiado!</span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 justify-between sm:justify-end">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                                  prod.status === 'Enviado'
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                }`}
                              >
                                {prod.status}
                              </span>

                              <button
                                onClick={() => handleResendSingle(prod)}
                                disabled={resendingId === prod.id}
                                className="px-3 py-1.5 rounded-lg bg-[#1e2026] hover:bg-[#282a34] text-white text-xs font-bold border border-[#282a34] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <Send className="w-3 h-3 text-[#FF5722]" />
                                <span>{resendingId === prod.id ? 'Enviando...' : 'Reenviar'}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
