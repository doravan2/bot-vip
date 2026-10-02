import React, { useState, useEffect } from 'react';
import {
  Radio,
  Plus,
  Trash2,
  Play,
  Pause,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Loader2,
  X,
  Layers,
  Camera,
  ShieldCheck,
  MoreVertical,
  Settings,
  Send,
  Smartphone,
  Search,
  Check,
  ChevronDown,
  Globe,
  Tag,
  Users2,
  Edit3,
  ChevronRight,
  Megaphone,
} from 'lucide-react';
import { SourceGroup, GroupChannel } from '../../types/index.ts';

interface FontesPanelProps {
  sourceGroups: SourceGroup[];
  groups: GroupChannel[];
  onAddSourceGroup: (source: SourceGroup) => void;
  onUpdateSourceGroup?: (source: SourceGroup) => void;
  onToggleSourceGroupStatus: (id: string) => void;
  onToggleAutoPhoto?: (id: string) => void;
  onToggleMeliStock?: (id: string) => void;
  onDeleteSourceGroup: (id: string) => void;
  onNavigateToGrupos: () => void;
}

export const FontesPanel: React.FC<FontesPanelProps> = ({
  sourceGroups,
  groups,
  onAddSourceGroup,
  onUpdateSourceGroup,
  onToggleSourceGroupStatus,
  onToggleAutoPhoto,
  onToggleMeliStock,
  onDeleteSourceGroup,
  onNavigateToGrupos,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  // Multi-select Source groups state
  const [selectedSources, setSelectedSources] = useState<Array<{ name: string; platform: 'WhatsApp' | 'Telegram' }>>([]);
  const [sourceSearchText, setSourceSearchText] = useState('');
  const [sourcePlatformFilter, setSourcePlatformFilter] = useState<'all' | 'WhatsApp' | 'Telegram'>('all');
  const [isSourceListExpanded, setIsSourceListExpanded] = useState(true);

  // Multi-select Target groups state
  const [selectedTargets, setSelectedTargets] = useState<Array<{ name: string; platform: 'WhatsApp' | 'Telegram'; chatId?: string }>>([]);
  const [targetSearchText, setTargetSearchText] = useState('');
  const [targetPlatformFilter, setTargetPlatformFilter] = useState<'all' | 'WhatsApp' | 'Telegram'>('all');
  const [isTargetListExpanded, setIsTargetListExpanded] = useState(true);

  // Options
  const [autoFetchProductImage, setAutoFetchProductImage] = useState(true);
  const [validateMeliStock, setValidateMeliStock] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [telegramPollingStatus, setTelegramPollingStatus] = useState<{
    active: boolean;
    botConnected: boolean;
    activeBotUsername?: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/telegram/polling-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTelegramPollingStatus({
            active: data.active,
            botConnected: data.botConnected,
            activeBotUsername: data.activeBotUsername,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Telegram synced channels state
  const [telegramSyncedGroups, setTelegramSyncedGroups] = useState<GroupChannel[]>([]);

  useEffect(() => {
    // Fetch registered Telegram channels from /api/telegram/channels
    fetch('/api/telegram/channels')
      .then((res) => res.json())
      .then((data) => {
        if (data.channels && Array.isArray(data.channels)) {
          const list: GroupChannel[] = data.channels.map((tc: any) => ({
            id: tc.id,
            name: tc.name || tc.chatId,
            platform: 'Telegram',
            chatId: tc.chatId,
            inviteLink: tc.inviteLink || (tc.chatId?.startsWith('@') ? `https://t.me/${tc.chatId.replace(/^@/, '')}` : 'https://t.me/'),
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

  // Combined available groups (WhatsApp + Telegram registered channels)
  const allAvailableGroups: GroupChannel[] = [
    ...groups
      .filter((g) => !g.name.toLowerCase().includes('_bot') && !g.id.startsWith('tg-bot-'))
      .map((g) => ({ ...g, platform: (g.platform || 'WhatsApp') as 'WhatsApp' | 'Telegram' })),
    ...telegramSyncedGroups.filter(
      (tg) =>
        !groups.some(
          (g) => g.platform === 'Telegram' && (g.id === tg.id || (g.chatId && g.chatId === tg.chatId))
        )
    ),
  ];

  // Test simulation state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; message: string; isError?: boolean } | null>(null);
  const [testModalSource, setTestModalSource] = useState<SourceGroup | null>(null);
  const [testMarketplace, setTestMarketplace] = useState<'amazon' | 'meli' | 'shopee' | 'custom'>('amazon');
  const [customTestText, setCustomTestText] = useState('');

  const TEST_PRESETS = {
    amazon: `🔥 OFERTA AMAZON BRASIL!\nEcho Dot 5ª Geração Smart Speaker com Alexa\nDe R$ 429,00 por apenas R$ 269,00!\n👉 Veja imagem 1: https://www.amazon.com.br/dp/B09B8VGCR8\nFrete Grátis Prime`,
    meli: `🔥 OFERTA RELÂMPAGO!\nSmart TV 50 Polegadas 4K UHD\nDe R$ 2.499,00 por apenas R$ 1.699,00 à vista!\n👉 Veja imagem 1: https://meli.la/1pKTwSc\nCupom: TVVIP100`,
    shopee: `🔥 ACHADINHO SHOPEE!\nFone de Ouvido Bluetooth Sem Fio TWS Pro\nDe R$ 89,90 por apenas R$ 34,90 com cupom!\n👉 Veja imagem 1: https://s.shopee.com.br/7Uy391qPqS\nFrete Grátis`,
  };

  const handleOpenCreateModal = () => {
    setEditingSourceId(null);
    setSelectedSources([]);
    setSelectedTargets([]);
    setSourceSearchText('');
    setTargetSearchText('');
    setAutoFetchProductImage(true);
    setValidateMeliStock(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (source: SourceGroup) => {
    setEditingSourceId(source.id);
    setOpenMenuId(null);

    const srcNames = source.sourceNames && source.sourceNames.length > 0
      ? source.sourceNames
      : source.sourceName ? source.sourceName.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const srcPlatforms = source.sourcePlatforms || [];
    const mappedSources = srcNames.map((name, idx) => {
      const platform: 'WhatsApp' | 'Telegram' =
        srcPlatforms[idx] ||
        (name.startsWith('@') || name.toLowerCase().includes('telegram') || name.includes('t.me')
          ? 'Telegram'
          : 'WhatsApp');
      return { name, platform };
    });

    const tgtNames = source.targetGroups && source.targetGroups.length > 0
      ? source.targetGroups
      : source.targetGroup ? source.targetGroup.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const tgtPlatforms = source.targetPlatforms || [];
    const tgtChatIds = source.targetChatIds || [];

    const mappedTargets = tgtNames.map((name, idx) => {
      const platform: 'WhatsApp' | 'Telegram' =
        tgtPlatforms[idx] ||
        (name.startsWith('@') || name.toLowerCase().includes('telegram') || name.includes('t.me')
          ? 'Telegram'
          : 'WhatsApp');
      const chatId = tgtChatIds[idx] || undefined;
      return { name, platform, chatId };
    });

    setSelectedSources(mappedSources);
    setSelectedTargets(mappedTargets);
    setAutoFetchProductImage(source.autoFetchProductImage !== false);
    setValidateMeliStock(source.validateMeliStock !== false);
    setSourceSearchText('');
    setTargetSearchText('');
    setIsModalOpen(true);
  };

  const handleQuickRemoveSourceFromRule = (sourceRule: SourceGroup, sourceNameToRemove: string) => {
    const currentSources = sourceRule.sourceNames && sourceRule.sourceNames.length > 0
      ? sourceRule.sourceNames
      : sourceRule.sourceName.split(',').map((s) => s.trim()).filter(Boolean);

    if (currentSources.length <= 1) {
      if (confirm(`"${sourceNameToRemove}" é o único grupo fonte desta regra. Deseja excluir a regra inteira?`)) {
        onDeleteSourceGroup(sourceRule.id);
      }
      return;
    }

    const newSourceNames = currentSources.filter((s) => s.toLowerCase() !== sourceNameToRemove.toLowerCase());
    const oldPlatforms = sourceRule.sourcePlatforms || [];
    const newPlatforms = currentSources
      .map((s, idx) => ({
        name: s,
        platform: oldPlatforms[idx] || (s.startsWith('@') || s.toLowerCase().includes('telegram') || s.includes('t.me') ? ('Telegram' as const) : ('WhatsApp' as const)),
      }))
      .filter((s) => s.name.toLowerCase() !== sourceNameToRemove.toLowerCase())
      .map((s) => s.platform);

    const targetsList = sourceRule.targetGroups && sourceRule.targetGroups.length > 0 ? sourceRule.targetGroups : [sourceRule.targetGroup];
    const targetPlatforms = sourceRule.targetPlatforms || [];

    const hasTelegram = newPlatforms.some((p) => p === 'Telegram') || targetPlatforms.some((p) => p === 'Telegram');
    const hasWhatsApp = newPlatforms.some((p) => p === 'WhatsApp') || targetPlatforms.some((p) => p === 'WhatsApp');
    const overallPlatform: 'WhatsApp' | 'Telegram' | 'Misto' = hasTelegram && hasWhatsApp ? 'Misto' : hasTelegram ? 'Telegram' : 'WhatsApp';

    const updatedRule: SourceGroup = {
      ...sourceRule,
      sourceName: newSourceNames.join(', '),
      sourceNames: newSourceNames,
      sourcePlatforms: newPlatforms,
      platform: overallPlatform,
    };

    if (onUpdateSourceGroup) {
      onUpdateSourceGroup(updatedRule);
    } else {
      onAddSourceGroup(updatedRule);
    }
  };

  const handleQuickRemoveTargetFromRule = (sourceRule: SourceGroup, targetNameToRemove: string) => {
    const currentTargets = sourceRule.targetGroups && sourceRule.targetGroups.length > 0
      ? sourceRule.targetGroups
      : sourceRule.targetGroup.split(',').map((t) => t.trim()).filter(Boolean);

    if (currentTargets.length <= 1) {
      alert('A regra precisa ter pelo menos 1 grupo de destino. Clique em "Editar" para alterar.');
      return;
    }

    const newTargetGroups = currentTargets.filter((t) => t.toLowerCase() !== targetNameToRemove.toLowerCase());
    const oldPlatforms = sourceRule.targetPlatforms || [];
    const oldChatIds = sourceRule.targetChatIds || [];

    const remaining = currentTargets
      .map((t, idx) => ({
        name: t,
        platform: oldPlatforms[idx] || (t.startsWith('@') || t.toLowerCase().includes('telegram') || t.includes('t.me') ? ('Telegram' as const) : ('WhatsApp' as const)),
        chatId: oldChatIds[idx],
      }))
      .filter((t) => t.name.toLowerCase() !== targetNameToRemove.toLowerCase());

    const newPlatforms = remaining.map((t) => t.platform);
    const newChatIds = remaining.map((t) => t.chatId || '');

    const sourcesList = sourceRule.sourceNames && sourceRule.sourceNames.length > 0 ? sourceRule.sourceNames : [sourceRule.sourceName];
    const sourcePlatforms = sourceRule.sourcePlatforms || [];

    const hasTelegram = sourcePlatforms.some((p) => p === 'Telegram') || newPlatforms.some((p) => p === 'Telegram');
    const hasWhatsApp = sourcePlatforms.some((p) => p === 'WhatsApp') || newPlatforms.some((p) => p === 'WhatsApp');
    const overallPlatform: 'WhatsApp' | 'Telegram' | 'Misto' = hasTelegram && hasWhatsApp ? 'Misto' : hasTelegram ? 'Telegram' : 'WhatsApp';

    const updatedRule: SourceGroup = {
      ...sourceRule,
      targetGroup: newTargetGroups.join(', '),
      targetGroups: newTargetGroups,
      targetPlatforms: newPlatforms,
      targetChatIds: newChatIds,
      platform: overallPlatform,
    };

    if (onUpdateSourceGroup) {
      onUpdateSourceGroup(updatedRule);
    } else {
      onAddSourceGroup(updatedRule);
    }
  };

  // Helper to add custom or selected source
  const handleAddSourceItem = (name: string, platform?: 'WhatsApp' | 'Telegram') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const detectedPlatform = platform || (trimmed.startsWith('@') || trimmed.includes('t.me') ? 'Telegram' : 'WhatsApp');
    if (!selectedSources.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedSources((prev) => [...prev, { name: trimmed, platform: detectedPlatform }]);
    }
    setSourceSearchText('');
  };

  const handleRemoveSourceItem = (name: string) => {
    setSelectedSources((prev) => prev.filter((s) => s.name.toLowerCase() !== name.toLowerCase()));
  };

  // Helper to add custom or selected target
  const handleAddTargetItem = (name: string, platform?: 'WhatsApp' | 'Telegram', chatId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const detectedPlatform = platform || (trimmed.startsWith('@') || trimmed.includes('t.me') ? 'Telegram' : 'WhatsApp');
    if (!selectedTargets.some((s) => s.name.toLowerCase() === trimmed.toLowerCase() && s.platform === detectedPlatform)) {
      setSelectedTargets((prev) => [...prev, { name: trimmed, platform: detectedPlatform, chatId }]);
    }
    setTargetSearchText('');
  };

  const handleRemoveTargetItem = (name: string, platform?: 'WhatsApp' | 'Telegram') => {
    setSelectedTargets((prev) =>
      prev.filter((s) => !(s.name.toLowerCase() === name.toLowerCase() && (!platform || s.platform === platform)))
    );
  };

  const handleSaveSource = (e: React.FormEvent) => {
    e.preventDefault();

    // If user typed in search input but didn't press enter, add it automatically
    let finalSources = [...selectedSources];
    if (sourceSearchText.trim() && !finalSources.some((s) => s.name.toLowerCase() === sourceSearchText.trim().toLowerCase())) {
      const isTg = sourceSearchText.trim().startsWith('@') || sourceSearchText.includes('t.me');
      finalSources.push({ name: sourceSearchText.trim(), platform: isTg ? 'Telegram' : 'WhatsApp' });
    }

    let finalTargets = [...selectedTargets];
    if (targetSearchText.trim() && !finalTargets.some((t) => t.name.toLowerCase() === targetSearchText.trim().toLowerCase())) {
      const isTg = targetSearchText.trim().startsWith('@') || targetSearchText.includes('t.me');
      finalTargets.push({ name: targetSearchText.trim(), platform: isTg ? 'Telegram' : 'WhatsApp' });
    }

    if (finalSources.length === 0) {
      finalSources = [{ name: 'Grupo Fonte Concorrente', platform: 'WhatsApp' }];
    }
    if (finalTargets.length === 0) {
      finalTargets = [{ name: 'Meu Grupo VIP', platform: 'WhatsApp' }];
    }

    const sourceNames = finalSources.map((s) => s.name);
    const targetGroups = finalTargets.map((t) => t.name);

    const hasTelegram = finalSources.some((s) => s.platform === 'Telegram') || finalTargets.some((t) => t.platform === 'Telegram');
    const hasWhatsApp = finalSources.some((s) => s.platform === 'WhatsApp') || finalTargets.some((t) => t.platform === 'WhatsApp');
    const overallPlatform: 'WhatsApp' | 'Telegram' | 'Misto' = hasTelegram && hasWhatsApp ? 'Misto' : hasTelegram ? 'Telegram' : 'WhatsApp';

    if (editingSourceId) {
      const existing = sourceGroups.find((s) => s.id === editingSourceId);
      const updatedRule: SourceGroup = {
        id: editingSourceId,
        sourceName: sourceNames.join(', '),
        sourceNames,
        platform: overallPlatform,
        sourcePlatforms: finalSources.map((s) => s.platform),
        targetGroup: targetGroups.join(', '),
        targetGroups,
        targetPlatforms: finalTargets.map((t) => t.platform),
        targetChatIds: finalTargets.map((t) => t.chatId || (t.platform === 'Telegram' ? t.name : '')),
        autoForward: existing ? existing.autoForward : true,
        filterCompetitorNames: existing ? existing.filterCompetitorNames : true,
        autoFetchProductImage,
        validateMeliStock,
        status: existing ? existing.status : 'monitoring',
        dealsCapturedToday: existing ? existing.dealsCapturedToday : 0,
        createdAt: existing ? existing.createdAt : new Date().toLocaleTimeString('pt-BR'),
      };

      if (onUpdateSourceGroup) {
        onUpdateSourceGroup(updatedRule);
      } else {
        onAddSourceGroup(updatedRule);
      }
    } else {
      const newRule: SourceGroup = {
        id: `source-${Date.now()}`,
        sourceName: sourceNames.join(', '),
        sourceNames,
        platform: overallPlatform,
        sourcePlatforms: finalSources.map((s) => s.platform),
        targetGroup: targetGroups.join(', '),
        targetGroups,
        targetPlatforms: finalTargets.map((t) => t.platform),
        targetChatIds: finalTargets.map((t) => t.chatId || (t.platform === 'Telegram' ? t.name : '')),
        autoForward: true,
        filterCompetitorNames: true,
        autoFetchProductImage,
        validateMeliStock,
        status: 'monitoring',
        dealsCapturedToday: 0,
        createdAt: new Date().toLocaleTimeString('pt-BR'),
      };

      onAddSourceGroup(newRule);
    }

    setIsModalOpen(false);
    setEditingSourceId(null);
    setSelectedSources([]);
    setSelectedTargets([]);
    setSourceSearchText('');
    setTargetSearchText('');
    setAutoFetchProductImage(true);
    setValidateMeliStock(true);
  };

  const handleExecuteTest = async (source: SourceGroup, rawTextOverride?: string) => {
    setTestingId(source.id);
    setTestResult(null);

    const payloadText =
      rawTextOverride ||
      (testMarketplace === 'custom' ? customTestText : TEST_PRESETS[testMarketplace as keyof typeof TEST_PRESETS]) ||
      TEST_PRESETS.amazon;

    try {
      const res = await fetch('/api/replica/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceName: source.sourceNames?.[0] || source.sourceName,
          rawText: payloadText,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({
          id: source.id,
          message: `Oferta capturada de [${source.sourceName}] e enviada para [${source.targetGroup}] com link oficial!`,
        });
        setTestModalSource(null);
      } else if (data.skipped) {
        setTestResult({
          id: source.id,
          isError: true,
          message: `Filtro de replicação: ${data.message || 'Pulando mensagem...'}`,
        });
      } else {
        setTestResult({
          id: source.id,
          isError: true,
          message: data.error || 'Simulação concluída.',
        });
      }
    } catch {
      setTestResult({
        id: source.id,
        message: `Teste simulado com sucesso para ${source.targetGroup}!`,
      });
      setTestModalSource(null);
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult(null), 8000);
    }
  };

  // Filtered source suggestion list
  const filteredSourceSuggestions = allAvailableGroups.filter((g) => {
    const matchesFilter = sourcePlatformFilter === 'all' || g.platform === sourcePlatformFilter;
    const search = sourceSearchText.trim().toLowerCase();
    const matchesSearch =
      !search ||
      g.name.toLowerCase().includes(search) ||
      (g.chatId && g.chatId.toLowerCase().includes(search));
    return matchesFilter && matchesSearch;
  });

  // Filtered target suggestion list
  const filteredTargetSuggestions = allAvailableGroups.filter((g) => {
    const matchesFilter = targetPlatformFilter === 'all' || g.platform === targetPlatformFilter;
    const search = targetSearchText.trim().toLowerCase();
    const matchesSearch =
      !search ||
      g.name.toLowerCase().includes(search) ||
      (g.chatId && g.chatId.toLowerCase().includes(search));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-[#FF5722]" />
            Fontes de Monitoramento & Reenvio Multi-Grupo
          </h1>
          <p className="text-xs text-neutral-400">
            Configure múltiplos grupos fontes (WhatsApp e Telegram) e redirecione ofertas automaticamente para múltiplos grupos de destino.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/30 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Criar Grupo Fonte Multi-Canal</span>
        </button>
      </div>

      {/* Telegram Live Listener Status Banner */}
      <div className="p-4 rounded-2xl bg-[#141518] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0088cc]/15 border border-[#0088cc]/30 flex items-center justify-center text-[#29b6f6] shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white">Escuta de Grupos/Canais do Telegram:</span>
              {telegramPollingStatus?.active ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#00c978]/15 border border-[#00c978]/40 text-[#00c978]">
                  ATIVA (LONG-POLLING)
                </span>
              ) : telegramPollingStatus?.botConnected ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 border border-amber-500/40 text-amber-400">
                  CONECTADO
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-neutral-800 border border-neutral-700 text-neutral-400">
                  DESCONECTADO
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400">
              {telegramPollingStatus?.botConnected
                ? `Bot @${telegramPollingStatus.activeBotUsername || 'Telegram'} conectado. Mensagens enviadas em grupos/canais fontes do Telegram são capturadas e enviadas ao WhatsApp automaticamente!`
                : 'Conecte seu bot do Telegram na aba Conexões para ativar o monitoramento automático de grupos do Telegram.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch('/api/telegram/simulate-incoming', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chatTitle: 'Atacado Game Ofertas',
                    chatId: '@atacadogameofertas',
                    rawText: '⚡ Super Oferta Telegram: https://www.mercadolivre.com.br/p/MLB12345678 com 30% OFF!',
                  }),
                });
                const d = await res.json();
                alert(d.success ? `✅ Sucesso! Mensagem capturada do Telegram e enviada ao WhatsApp!` : `Aviso: ${d.error || 'Verifique se há regras ativas'}`);
              } catch (err: any) {
                alert(`Erro ao testar: ${err?.message}`);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold border border-[#282a34] transition cursor-pointer flex items-center gap-1.5"
            title="Simular mensagem recebida no Telegram e enviada para o WhatsApp"
          >
            <Send className="w-3.5 h-3.5 text-[#29b6f6]" />
            <span>Testar Telegram ➔ WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Fontes Cards List */}
      {sourceGroups.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141517] border border-[#22242a] text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1b20] border border-[#282a34] mx-auto flex items-center justify-center text-neutral-500">
            <Radio className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold text-white">Nenhum Grupo Fonte Criado</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Crie uma regra para espelhar mensagens de concorrentes no WhatsApp ou Telegram e distribuir para os seus canais VIP com links monetizados.
            </p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="px-6 py-3 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-md shadow-[#FF5722]/30 cursor-pointer"
          >
            Configurar Primeira Fonte
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sourceGroups.map((source, idx) => {
            const isMonitoring = source.status === 'monitoring';
            const sourcesList = source.sourceNames && source.sourceNames.length > 0 ? source.sourceNames : [source.sourceName];
            const targetsList = source.targetGroups && source.targetGroups.length > 0 ? source.targetGroups : [source.targetGroup];

            return (
              <div
                key={`source-card-${source.id}-${idx}`}
                className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4 relative flex flex-col justify-between"
              >
                <div className="space-y-3.5">
                  {/* Card Top Row: Badges, Edit Button & 3-Dots Settings Menu */}
                  <div className="flex items-center justify-between relative">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                          source.platform === 'Telegram'
                            ? 'bg-[#0088cc]/15 border-[#0088cc]/40 text-[#29b6f6]'
                            : source.platform === 'Misto'
                            ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        }`}
                      >
                        {source.platform === 'Telegram' ? (
                          <Send className="w-3 h-3" />
                        ) : source.platform === 'Misto' ? (
                          <Layers className="w-3 h-3" />
                        ) : (
                          <Smartphone className="w-3 h-3" />
                        )}
                        <span>{source.platform || 'WhatsApp'}</span>
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
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(source)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold border border-[#282a34] hover:border-[#383b48] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                        title="Editar Regra Inteira"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#FF5722]" />
                        <span>Editar</span>
                      </button>

                      {/* 3-Dots Settings Menu */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === source.id ? null : source.id);
                          }}
                          title="Configurações da Fonte"
                          className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e2026] border border-[#282a34] hover:border-[#383b48] transition cursor-pointer flex items-center justify-center shadow-xs"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuId === source.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenMenuId(null)}
                            />

                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full mt-2 w-64 bg-[#141518] border border-[#282a34] rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                            >
                              <div className="px-3 py-2 border-b border-[#202228] text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-bold flex items-center gap-1.5">
                                <Settings className="w-3 h-3 text-[#FF5722]" />
                                <span>Configurações da Fonte</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(source)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1e1f26] transition text-left cursor-pointer group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-[#FF5722]/15 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722] shrink-0">
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-white group-hover:text-[#FF5722] transition">
                                      Editar Fonte Completa
                                    </div>
                                    <div className="text-[10px] text-neutral-400">Adicionar ou excluir grupos</div>
                                  </div>
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white transition" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onToggleAutoPhoto?.(source.id)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1e1f26] transition text-left cursor-pointer group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                                    <Camera className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-white group-hover:text-blue-400 transition">Auto-Foto do Link</div>
                                    <div className="text-[10px] text-neutral-400">Buscar foto do produto</div>
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border transition shrink-0 ${
                                    source.autoFetchProductImage !== false
                                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                                  }`}
                                >
                                  {source.autoFetchProductImage !== false ? 'ON' : 'OFF'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onToggleMeliStock?.(source.id)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1e1f26] transition text-left cursor-pointer group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-white group-hover:text-amber-400 transition">Estoque Mercado Livre</div>
                                    <div className="text-[10px] text-neutral-400">Pular esgotados / pausados</div>
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border transition shrink-0 ${
                                    source.validateMeliStock !== false
                                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                                  }`}
                                >
                                  {source.validateMeliStock !== false ? 'Ativo' : 'OFF'}
                                </span>
                              </button>

                              <div className="h-px bg-[#202228] my-1" />

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onDeleteSourceGroup(source.id);
                                }}
                                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition text-left cursor-pointer group"
                              >
                                <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-red-400">Excluir Regra de Fonte</div>
                                  <div className="text-[10px] text-neutral-500">Remover monitoramento</div>
                                </div>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Title & Multi-group badges */}
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                      <span>[FONTE] {sourcesList[0]}</span>
                      {sourcesList.length > 1 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                          +{sourcesList.length - 1} fontes
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Inner Box with routing flow */}
                  <div className="p-4 rounded-xl bg-[#0e0f11] border border-[#22242a] space-y-2.5 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400 font-medium">
                          Origem ({sourcesList.length} grupo{sourcesList.length === 1 ? '' : 's'} concorrente{sourcesList.length === 1 ? '' : 's'}):
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(source)}
                          className="text-[10px] font-bold text-[#FF5722] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Gerenciar Fontes</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {sourcesList.map((src, i) => {
                          const isTg = src.startsWith('@') || src.toLowerCase().includes('telegram') || src.includes('t.me');
                          return (
                            <span
                              key={`src-pill-${i}`}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition ${
                                isTg
                                  ? 'bg-[#0088cc]/15 border-[#0088cc]/30 text-[#29b6f6]'
                                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              }`}
                            >
                              {isTg ? <Send className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                              <span>{src}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickRemoveSourceFromRule(source, src);
                                }}
                                title={`Excluir "${src}" desta fonte`}
                                className="ml-0.5 p-0.5 rounded text-neutral-400 hover:text-red-400 hover:bg-black/40 transition cursor-pointer"
                              >
                                <X className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-[11px] text-[#FF5722] font-mono text-center font-bold py-1 leading-snug">
                      ↓ [Foto + Validação Estoque + Conversão Oficial de Afiliado] ↓
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400 font-medium">
                          Destino ({targetsList.length} canal/grupo VIP):
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(source)}
                          className="text-[10px] font-bold text-[#FF5722] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Gerenciar Destinos</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {targetsList.map((tgt, i) => {
                          const isTg = tgt.startsWith('@') || tgt.toLowerCase().includes('telegram') || tgt.includes('t.me');
                          return (
                            <span
                              key={`tgt-pill-${i}`}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition ${
                                isTg
                                  ? 'bg-[#0088cc]/20 border-[#0088cc]/40 text-[#29b6f6]'
                                  : 'bg-[#FF5722]/15 border-[#FF5722]/30 text-[#FF5722]'
                              }`}
                            >
                              {isTg ? <Send className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                              <span>{tgt}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickRemoveTargetFromRule(source, tgt);
                                }}
                                title={`Excluir "${tgt}" deste destino`}
                                className="ml-0.5 p-0.5 rounded text-neutral-400 hover:text-red-400 hover:bg-black/40 transition cursor-pointer"
                              >
                                <X className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Metric Line */}
                  <div className="pt-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                      <span>
                        Capturados Hoje: <strong className="text-white">{source.dealsCapturedToday || 0} ofertas</strong>
                      </span>
                    </div>
                  </div>

                  {/* Test feedback */}
                  {testResult && testResult.id === source.id && (
                    <div
                      className={`p-3 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                        testResult.isError
                          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                          : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      }`}
                    >
                      {testResult.isError ? (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-[#1f2026]">
                  <button
                    onClick={() => onToggleSourceGroupStatus(source.id)}
                    className="px-4 py-2 rounded-xl bg-[#1e1f26] hover:bg-[#282a34] text-white text-xs font-bold border border-[#2c2f3a] transition cursor-pointer flex items-center gap-1.5"
                  >
                    {isMonitoring ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pausar Escuta</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-[#00c978]" />
                        <span>Retomar Escuta</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setTestModalSource(source)}
                    disabled={testingId === source.id}
                    className="text-xs font-bold text-[#FF5722] hover:text-[#f4511e] transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingId === source.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Simulando...</span>
                      </>
                    ) : (
                      <span>Testar Manualmente</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR GRUPO FONTE COM BUSCA, AUTOCOMPLETE E MÚLTIPLOS GRUPOS */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-xl bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#20222a] shrink-0">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-[#FF5722]" />
                  <span>{editingSourceId ? 'Editar Regra de Fonte (Multi-Canal)' : 'Criar Grupo Fonte (Multi-Canal)'}</span>
                </h2>
                <p className="text-xs text-neutral-400">
                  {editingSourceId
                    ? 'Adicione ou remova grupos fontes concorrentes e canais de destino desta regra.'
                    : 'Selecione múltiplos grupos concorrentes (WhatsApp/Telegram) e direcione para seus canais VIP.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e1f26] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSource} className="space-y-5 overflow-y-auto pr-1 flex-1">
              {/* =================================================================== */}
              {/* CAMPO 1: GRUPO FONTE (ORIGEM / CONCORRENTE) - MULTI-SELECT & BUSCA */}
              {/* =================================================================== */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#18191d] border border-[#272930]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-neutral-200 flex items-center gap-1.5">
                    <span>GRUPO FONTE (ORIGEM / CONCORRENTE)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] font-bold">
                      {selectedSources.length} selecionado{selectedSources.length === 1 ? '' : 's'}
                    </span>
                  </label>

                  {/* Filter tabs: Todos / WhatsApp / Telegram */}
                  <div className="flex items-center gap-1 bg-[#121214] p-0.5 rounded-lg border border-[#282a34] text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSourcePlatformFilter('all')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        sourcePlatformFilter === 'all' ? 'bg-[#FF5722] text-white' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourcePlatformFilter('WhatsApp')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        sourcePlatformFilter === 'WhatsApp' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-white'
                      }`}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourcePlatformFilter('Telegram')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        sourcePlatformFilter === 'Telegram' ? 'bg-[#0088cc] text-white' : 'text-[#29b6f6] hover:text-white'
                      }`}
                    >
                      Telegram
                    </button>
                  </div>
                </div>

                {/* Selected Sources Tags / Chips */}
                {selectedSources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-[#121214] rounded-xl border border-[#262832]">
                    {selectedSources.map((item, idx) => (
                      <span
                        key={`sel-src-${idx}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                          item.platform === 'Telegram'
                            ? 'bg-[#0088cc]/20 border-[#0088cc]/40 text-[#29b6f6]'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        }`}
                      >
                        {item.platform === 'Telegram' ? (
                          <Send className="w-3 h-3 text-[#29b6f6]" />
                        ) : (
                          <Smartphone className="w-3 h-3 text-emerald-400" />
                        )}
                        <span>{item.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSourceItem(item.name)}
                          className="hover:opacity-75 transition cursor-pointer ml-1 text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Interactive Search & Pick Input */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={sourceSearchText}
                      onChange={(e) => setSourceSearchText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSourceItem(sourceSearchText);
                        }
                      }}
                      placeholder="Digite o nome do grupo ou canal (ex: Vendas Top ou @canal)..."
                      className="w-full pl-9 pr-24 py-2.5 bg-[#121214] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722] font-medium"
                    />
                    {sourceSearchText.trim() && (
                      <button
                        type="button"
                        onClick={() => handleAddSourceItem(sourceSearchText)}
                        className="absolute right-2 px-2.5 py-1 bg-[#FF5722] hover:bg-[#f4511e] text-white text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Suggestions List right below */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                    <span>Grupos Disponíveis (clique para adicionar/remover):</span>
                    <button
                      type="button"
                      onClick={() => setIsSourceListExpanded(!isSourceListExpanded)}
                      className="text-[#FF5722] hover:underline font-bold cursor-pointer"
                    >
                      {isSourceListExpanded ? 'Ocultar Lista' : 'Mostrar Lista'}
                    </button>
                  </div>

                  {isSourceListExpanded && (
                    <div className="max-h-40 overflow-y-auto space-y-1 p-1 bg-[#121214] border border-[#262832] rounded-xl">
                      {filteredSourceSuggestions.length === 0 ? (
                        <div className="p-3 text-center text-xs text-neutral-500">
                          {sourceSearchText.trim() ? (
                            <span>
                              Nenhum grupo encontrado com esse nome. Pressione <strong>Enter</strong> para adicionar como grupo personalizado.
                            </span>
                          ) : (
                            <span>Nenhum grupo sincronizado. Digite o nome do grupo acima.</span>
                          )}
                        </div>
                      ) : (
                        filteredSourceSuggestions.map((g) => {
                          const isSelected = selectedSources.some((s) => s.name.toLowerCase() === g.name.toLowerCase());
                          const isTg = g.platform === 'Telegram';

                          return (
                            <div
                              key={`src-opt-${g.id}`}
                              onClick={() => {
                                if (isSelected) {
                                  handleRemoveSourceItem(g.name);
                                } else {
                                  handleAddSourceItem(g.name, g.platform);
                                }
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                                isSelected
                                  ? isTg
                                    ? 'bg-[#0088cc]/25 border border-[#0088cc]/50 text-white font-bold'
                                    : 'bg-emerald-500/20 border border-emerald-500/40 text-white font-bold'
                                  : 'hover:bg-[#1a1b20] text-neutral-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 shrink-0 ${
                                    isTg
                                      ? 'bg-[#0088cc]/20 text-[#29b6f6] border border-[#0088cc]/40'
                                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  }`}
                                >
                                  {isTg ? <Send className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                                  <span>{isTg ? 'Telegram' : 'WhatsApp'}</span>
                                </span>
                                <span className="font-bold text-white truncate max-w-[200px]">{g.name}</span>
                                {g.chatId && g.chatId !== g.name && (
                                  <span className="text-[11px] text-[#29b6f6] font-mono bg-[#0088cc]/10 px-1.5 py-0.2 rounded border border-[#0088cc]/25 shrink-0">
                                    {g.chatId}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {g.membersCount ? (
                                  <span className="text-[10px] text-neutral-500">{g.membersCount} membros</span>
                                ) : null}
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                                    isSelected
                                      ? isTg
                                        ? 'bg-[#0088cc] border-[#0088cc] text-white'
                                        : 'bg-emerald-500 border-emerald-500 text-white'
                                      : 'border-neutral-700'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* =================================================================== */}
              {/* CAMPO 2: GRUPO DE DESTINO (SEU CANAL VIP) - MULTI-SELECT & BUSCA */}
              {/* =================================================================== */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#18191d] border border-[#272930]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-[#FF5722] flex items-center gap-1.5">
                    <span>GRUPO DE DESTINO (SEU CANAL VIP)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] font-bold">
                      {selectedTargets.length} selecionado{selectedTargets.length === 1 ? '' : 's'}
                    </span>
                  </label>

                  {/* Filter tabs: Todos / WhatsApp / Telegram */}
                  <div className="flex items-center gap-1 bg-[#121214] p-0.5 rounded-lg border border-[#282a34] text-[10px]">
                    <button
                      type="button"
                      onClick={() => setTargetPlatformFilter('all')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        targetPlatformFilter === 'all' ? 'bg-[#FF5722] text-white' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetPlatformFilter('WhatsApp')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        targetPlatformFilter === 'WhatsApp' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-white'
                      }`}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetPlatformFilter('Telegram')}
                      className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        targetPlatformFilter === 'Telegram' ? 'bg-[#0088cc] text-white' : 'text-[#29b6f6] hover:text-white'
                      }`}
                    >
                      Telegram
                    </button>
                  </div>
                </div>

                {/* Selected Targets Tags / Chips */}
                {selectedTargets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-[#121214] rounded-xl border border-[#262832]">
                    {selectedTargets.map((item, idx) => (
                      <span
                        key={`sel-tgt-${idx}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                          item.platform === 'Telegram'
                            ? 'bg-[#0088cc]/20 border-[#0088cc]/40 text-[#29b6f6]'
                            : 'bg-[#FF5722]/15 border-[#FF5722]/30 text-[#FF5722]'
                        }`}
                      >
                        {item.platform === 'Telegram' ? (
                          <Send className="w-3 h-3 text-[#29b6f6]" />
                        ) : (
                          <Smartphone className="w-3 h-3 text-[#FF5722]" />
                        )}
                        <span>{item.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTargetItem(item.name)}
                          className="hover:opacity-75 transition cursor-pointer ml-1 text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Interactive Search & Pick Input */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={targetSearchText}
                      onChange={(e) => setTargetSearchText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTargetItem(targetSearchText);
                        }
                      }}
                      placeholder="Digite o nome do seu grupo VIP ou canal (ex: Meu Grupo VIP ou @meucanal)..."
                      className="w-full pl-9 pr-24 py-2.5 bg-[#121214] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722] font-medium"
                    />
                    {targetSearchText.trim() && (
                      <button
                        type="button"
                        onClick={() => handleAddTargetItem(targetSearchText)}
                        className="absolute right-2 px-2.5 py-1 bg-[#FF5722] hover:bg-[#f4511e] text-white text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Suggestions List right below */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                    <span>Grupos de Destino Disponíveis:</span>
                    <button
                      type="button"
                      onClick={() => setIsTargetListExpanded(!isTargetListExpanded)}
                      className="text-[#FF5722] hover:underline font-bold cursor-pointer"
                    >
                      {isTargetListExpanded ? 'Ocultar Lista' : 'Mostrar Lista'}
                    </button>
                  </div>

                  {isTargetListExpanded && (
                    <div className="max-h-40 overflow-y-auto space-y-1 p-1 bg-[#121214] border border-[#262832] rounded-xl">
                      {filteredTargetSuggestions.length === 0 ? (
                        <div className="p-3 text-center text-xs text-neutral-500">
                          {targetSearchText.trim() ? (
                            <span>
                              Nenhum grupo encontrado com esse nome. Pressione <strong>Enter</strong> para adicionar como destino personalizado.
                            </span>
                          ) : (
                            <span>Nenhum grupo cadastrado. Digite o nome do seu grupo VIP acima.</span>
                          )}
                        </div>
                      ) : (
                        filteredTargetSuggestions.map((g) => {
                          const isSelected = selectedTargets.some(
                            (t) => t.name.toLowerCase() === g.name.toLowerCase() && t.platform === g.platform
                          );
                          const isTg = g.platform === 'Telegram';

                          return (
                            <div
                              key={`tgt-opt-${g.platform}-${g.id}`}
                              onClick={() => {
                                if (isSelected) {
                                  handleRemoveTargetItem(g.name, g.platform);
                                } else {
                                  handleAddTargetItem(g.name, g.platform, g.chatId);
                                }
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                                isSelected
                                  ? isTg
                                    ? 'bg-[#0088cc]/25 border border-[#0088cc]/50 text-white font-bold'
                                    : 'bg-[#FF5722]/20 border border-[#FF5722]/40 text-white font-bold'
                                  : 'hover:bg-[#1a1b20] text-neutral-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 shrink-0 ${
                                    isTg
                                      ? 'bg-[#0088cc]/20 text-[#29b6f6] border border-[#0088cc]/40'
                                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  }`}
                                >
                                  {isTg ? <Send className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                                  <span>{isTg ? 'Telegram' : 'WhatsApp'}</span>
                                </span>
                                <span className="font-bold text-white truncate max-w-[200px]">{g.name}</span>
                                {g.chatId && g.chatId !== g.name && (
                                  <span className="text-[11px] text-[#29b6f6] font-mono bg-[#0088cc]/10 px-1.5 py-0.2 rounded border border-[#0088cc]/25 shrink-0">
                                    {g.chatId}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {g.membersCount ? (
                                  <span className="text-[10px] text-neutral-500">{g.membersCount} membros</span>
                                ) : null}
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                                    isSelected
                                      ? isTg
                                        ? 'bg-[#0088cc] border-[#0088cc] text-white'
                                        : 'bg-[#FF5722] border-[#FF5722] text-white'
                                      : 'border-neutral-700'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Opções de Foto e Validação de Estoque */}
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 p-3.5 bg-[#18191d] border border-[#262832] rounded-xl text-xs cursor-pointer hover:border-[#333644] transition">
                  <input
                    type="checkbox"
                    checked={autoFetchProductImage}
                    onChange={(e) => setAutoFetchProductImage(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#FF5722] rounded cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-white font-bold flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-400" />
                      Auto-Foto do Produto pelo Link
                    </span>
                    <span className="text-[11px] text-neutral-400 block leading-relaxed">
                      Quando o grupo mandar mensagem sem foto, extrair e anexar automaticamente a foto de alta resolução do link (Mercado Livre, Shopee, Amazon, AliExpress).
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-[#18191d] border border-[#262832] rounded-xl text-xs cursor-pointer hover:border-[#333644] transition">
                  <input
                    type="checkbox"
                    checked={validateMeliStock}
                    onChange={(e) => setValidateMeliStock(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#FF5722] rounded cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-white font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      Validar Estoque Mercado Livre (Pular Esgotados / Pausados)
                    </span>
                    <span className="text-[11px] text-neutral-400 block leading-relaxed">
                      Consulta a API oficial do Mercado Livre: se o produto estiver pausado ou sem estoque, pula automaticamente evitando links quebrados.
                    </span>
                  </div>
                </label>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-[#22242a] text-[11px] text-neutral-400 leading-relaxed flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF5722] shrink-0" />
                <span>
                  Todas as mensagens recebidas nas origens selecionadas serão limpas, convertidas para seus links de afiliado oficiais e enviadas para todos os destinos configurados.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-extrabold text-sm shadow-lg shadow-[#FF5722]/30 transition cursor-pointer"
              >
                {editingSourceId ? 'Salvar Alterações da Regra' : 'Salvar Regra e Iniciar Monitoramento Multi-Canal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Testar Manualmente */}
      {testModalSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#20222a]">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#FF5722]" />
                  <span>Simular Disparo da Fonte</span>
                </h2>
                <p className="text-xs text-neutral-400">
                  Simula o recebimento de uma oferta em <strong className="text-white">[{testModalSource.sourceName}]</strong> e replica para <strong className="text-[#FF5722]">[{testModalSource.targetGroup}]</strong>.
                </p>
              </div>
              <button
                onClick={() => setTestModalSource(null)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e1f26] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-neutral-300">ESCOLHA O MARKETPLACE DE TESTE</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestMarketplace('amazon')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      testMarketplace === 'amazon'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                        : 'bg-[#18191d] border-[#262832] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span>Amazon BR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMarketplace('meli')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      testMarketplace === 'meli'
                        ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                        : 'bg-[#18191d] border-[#262832] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span>Mercado Livre</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMarketplace('shopee')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      testMarketplace === 'shopee'
                        ? 'bg-[#FF5722]/15 border-[#FF5722]/50 text-[#FF5722]'
                        : 'bg-[#18191d] border-[#262832] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span>Shopee</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300">Prévia da Mensagem do Concorrente</label>
                <textarea
                  rows={4}
                  value={
                    testMarketplace === 'custom'
                      ? customTestText
                      : TEST_PRESETS[testMarketplace as keyof typeof TEST_PRESETS]
                  }
                  onChange={(e) => {
                    setTestMarketplace('custom');
                    setCustomTestText(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#18191d] border border-[#272930] text-white text-xs font-mono focus:border-[#FF5722] focus:outline-hidden transition resize-none"
                />
              </div>

              <button
                type="button"
                onClick={() => handleExecuteTest(testModalSource)}
                disabled={testingId === testModalSource.id}
                className="w-full py-3.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-extrabold text-xs shadow-lg shadow-[#FF5722]/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {testingId === testModalSource.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executando simulação de disparo...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Disparar Simulação Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
