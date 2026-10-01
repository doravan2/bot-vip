import React, { useState, useEffect } from 'react';
import {
  Users2,
  Plus,
  RefreshCw,
  Power,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  ArrowRight,
  ShieldCheck,
  X,
  Camera,
  Send,
  Smartphone,
  Search,
  Check,
  Bot,
  Copy,
  Info,
  HelpCircle,
} from 'lucide-react';
import { GroupChannel, WhatsAppInstance, SourceGroup, TelegramChannelItem } from '../../types/index.ts';

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

interface GruposPanelProps {
  groups: GroupChannel[];
  instances: WhatsAppInstance[];
  onToggleGroupActive: (id: string) => void;
  onToggleAutoRotate: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onAddGroup: (grp: GroupChannel) => void;
  onAddGroups: (grps: GroupChannel[]) => void;
  onSyncAllGroups: () => Promise<void>;
  onAddSourceGroup: (source: SourceGroup) => void;
  onNavigateToConexoes: () => void;
  onNavigateToFontes: () => void;
}

export const GruposPanel: React.FC<GruposPanelProps> = ({
  groups,
  instances,
  onToggleGroupActive,
  onToggleAutoRotate,
  onDeleteGroup,
  onAddGroup,
  onAddGroups,
  onSyncAllGroups,
  onAddSourceGroup,
  onNavigateToConexoes,
  onNavigateToFontes,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // Filter Subtabs: 'todos' | 'whatsapp' | 'telegram'
  const [activeFilterTab, setActiveFilterTab] = useState<'todos' | 'whatsapp' | 'telegram'>('todos');

  // Telegram Channels State (Chat ID management moved to Grupos as requested)
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannelItem[]>([]);
  const [telegramBotInfo, setTelegramBotInfo] = useState<TelegramBotInfo | null>(null);
  const [isBotConnected, setIsBotConnected] = useState(false);
  const [telegramChatIdInput, setTelegramChatIdInput] = useState('');
  const [telegramNameInput, setTelegramNameInput] = useState('');
  const [isAddingTelegramChannel, setIsAddingTelegramChannel] = useState(false);
  const [testingChatId, setTestingChatId] = useState<string | null>(null);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  // Modal: Criar Grupo Fonte (Multi-Source & Multi-Target)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Array<{ name: string; platform: 'WhatsApp' | 'Telegram' }>>([]);
  const [sourceSearchText, setSourceSearchText] = useState('');
  const [sourcePlatformFilter, setSourcePlatformFilter] = useState<'all' | 'WhatsApp' | 'Telegram'>('all');
  const [isSourceListExpanded, setIsSourceListExpanded] = useState(true);

  const [selectedTargets, setSelectedTargets] = useState<Array<{ name: string; platform: 'WhatsApp' | 'Telegram'; chatId?: string }>>([]);
  const [targetSearchText, setTargetSearchText] = useState('');
  const [targetPlatformFilter, setTargetPlatformFilter] = useState<'all' | 'WhatsApp' | 'Telegram'>('all');
  const [isTargetListExpanded, setIsTargetListExpanded] = useState(true);

  const [autoFetchProductImage, setAutoFetchProductImage] = useState(true);
  const [validateMeliStock, setValidateMeliStock] = useState(true);

  // Modal: Adicionar Grupo Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPlatform, setManualPlatform] = useState<'WhatsApp' | 'Telegram'>('WhatsApp');
  const [manualLink, setManualLink] = useState('');
  const [manualMembers, setManualMembers] = useState('1');

  // Load Telegram channels and bot config
  const loadTelegramData = async () => {
    try {
      const [resChan, resConf] = await Promise.all([
        fetch('/api/telegram/channels'),
        fetch('/api/telegram/config'),
      ]);

      if (resChan.ok) {
        const dChan = await resChan.json();
        if (Array.isArray(dChan.channels)) {
          setTelegramChannels(dChan.channels);
        }
      }

      if (resConf.ok) {
        const dConf = await resConf.json();
        if (dConf.config) {
          setIsBotConnected(dConf.config.status === 'connected' && !!dConf.config.botToken);
          setTelegramBotInfo(dConf.config.botInfo || null);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Telegram em Grupos:', err);
    }
  };

  useEffect(() => {
    loadTelegramData();
  }, []);

  // Convert Telegram channels to GroupChannel items for unified list
  const mappedTelegramGroups: GroupChannel[] = telegramChannels.map((tc) => ({
    id: tc.id,
    name: tc.name || tc.chatId,
    platform: 'Telegram',
    chatId: tc.chatId,
    inviteLink: tc.inviteLink || (tc.chatId.startsWith('@') ? `https://t.me/${tc.chatId.replace(/^@/, '')}` : 'https://t.me/'),
    membersCount: 1500,
    maxCapacity: 200000,
    isActive: true,
    autoRotate: false,
    dispatchesToday: 0,
  }));

  const allAvailableGroups: GroupChannel[] = [
    ...groups
      .filter((g) => !g.name.toLowerCase().includes('_bot') && !g.id.startsWith('tg-bot-'))
      .map((g) => ({ ...g, platform: (g.platform || 'WhatsApp') as 'WhatsApp' | 'Telegram' })),
    ...mappedTelegramGroups.filter(
      (tg) =>
        !groups.some(
          (g) =>
            g.platform === 'Telegram' &&
            (g.id === tg.id || g.name.toLowerCase() === tg.name.toLowerCase())
        )
    ),
  ];

  const whatsappGroups = allAvailableGroups.filter((g) => g.platform === 'WhatsApp');
  const telegramGroups = allAvailableGroups.filter((g) => g.platform === 'Telegram');

  const displayedGroups =
    activeFilterTab === 'whatsapp'
      ? whatsappGroups
      : activeFilterTab === 'telegram'
      ? telegramGroups
      : allAvailableGroups;

  const connectedInstances = instances.filter((i) => i.status === 'conectada');
  const isWhatsAppConnected = connectedInstances.length > 0;

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      await onSyncAllGroups();
      await loadTelegramData();
      setFeedback({
        type: 'success',
        message: 'Sincronização de grupos e canais concluída com sucesso!',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Falha ao sincronizar grupos da conta.',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // Add Telegram Channel by Chat ID
  const handleAddTelegramChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = telegramChatIdInput.trim();
    if (!input) {
      setFeedback({ type: 'error', message: 'Digite o Chat ID ou @username do canal.' });
      return;
    }

    setIsAddingTelegramChannel(true);
    try {
      const res = await fetch('/api/telegram/channels/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          name: telegramNameInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramChannels(data.channels || []);
        setTelegramChatIdInput('');
        setTelegramNameInput('');
        setFeedback({
          type: 'success',
          message: `Canal ${data.channel?.name || input} (${data.channel?.chatId || input}) adicionado com sucesso!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Falha ao cadastrar canal do Telegram.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao conectar ao servidor.',
      });
    } finally {
      setIsAddingTelegramChannel(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // Delete Telegram Channel
  const handleDeleteTelegramChannel = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/telegram/channels/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.channels) {
        setTelegramChannels(data.channels);
        setFeedback({
          type: 'info',
          message: `Canal ${name} removido com sucesso.`,
        });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao remover canal do Telegram.' });
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  // Test Send to a Telegram Chat ID
  const handleTestSendTelegram = async (chatId: string, channelName: string) => {
    setTestingChatId(chatId);
    try {
      const res = await fetch('/api/telegram/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          text: `🚀 Teste oficial de disparo no canal ${channelName} (${chatId})!\n\nBOT VIP OFERTAS validado com sucesso para este Chat ID.`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Mensagem de teste enviada com sucesso para ${channelName} (${chatId})!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || `Falha ao enviar mensagem para ${chatId}. Verifique se o Bot é Administrador.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Falha ao testar envio para o canal.',
      });
    } finally {
      setTestingChatId(null);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleCopyChatId = (chatId: string) => {
    navigator.clipboard.writeText(chatId);
    setCopiedChatId(chatId);
    setTimeout(() => setCopiedChatId(null), 2000);
  };

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

  const handleAddTargetItem = (name: string, platform?: 'WhatsApp' | 'Telegram', chatId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const detectedPlatform = platform || (trimmed.startsWith('@') || trimmed.includes('t.me') ? 'Telegram' : 'WhatsApp');
    if (!selectedTargets.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.platform === detectedPlatform)) {
      setSelectedTargets((prev) => [...prev, { name: trimmed, platform: detectedPlatform, chatId }]);
    }
    setTargetSearchText('');
  };

  const handleRemoveTargetItem = (name: string, platform?: 'WhatsApp' | 'Telegram') => {
    setSelectedTargets((prev) =>
      prev.filter((t) => !(t.name.toLowerCase() === name.toLowerCase() && (!platform || t.platform === platform)))
    );
  };

  const handleCreateSourceGroup = (e: React.FormEvent) => {
    e.preventDefault();

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
      finalSources = [{ name: 'Grupo Fonte', platform: 'WhatsApp' }];
    }
    if (finalTargets.length === 0) {
      finalTargets = [{ name: 'Meu Grupo VIP', platform: 'WhatsApp' }];
    }

    const sourceNames = finalSources.map((s) => s.name);
    const targetGroups = finalTargets.map((t) => t.name);
    const hasTelegram = finalSources.some((s) => s.platform === 'Telegram') || finalTargets.some((t) => t.platform === 'Telegram');
    const hasWhatsApp = finalSources.some((s) => s.platform === 'WhatsApp') || finalTargets.some((t) => t.platform === 'WhatsApp');
    const overallPlatform: 'WhatsApp' | 'Telegram' | 'Misto' = hasTelegram && hasWhatsApp ? 'Misto' : hasTelegram ? 'Telegram' : 'WhatsApp';

    const newSource: SourceGroup = {
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

    onAddSourceGroup(newSource);
    setIsSourceModalOpen(false);
    setSelectedSources([]);
    setSelectedTargets([]);
    setSourceSearchText('');
    setTargetSearchText('');
    setAutoFetchProductImage(true);
    setValidateMeliStock(true);
    setFeedback({
      type: 'success',
      message: `Grupo Fonte criado com ${sourceNames.length} fonte(s) e vinculado a ${targetGroups.length} destino(s)! Veja na aba Fontes.`,
    });
  };

  const handleAddManualGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    const newGrp: GroupChannel = {
      id: `grp-${Date.now()}`,
      instanceId: connectedInstances[0]?.id || 'inst-1',
      name: manualName.trim(),
      platform: manualPlatform,
      chatId: manualPlatform === 'Telegram' && manualName.startsWith('@') ? manualName : undefined,
      inviteLink:
        manualLink.trim() ||
        (manualPlatform === 'Telegram'
          ? `https://t.me/${manualName.replace(/^@/, '')}`
          : 'https://chat.whatsapp.com/'),
      membersCount: parseInt(manualMembers) || 1,
      maxCapacity: manualPlatform === 'Telegram' ? 200000 : 1024,
      isActive: true,
      autoRotate: true,
      dispatchesToday: 0,
    };

    onAddGroup(newGrp);
    setIsManualModalOpen(false);
    setManualName('');
    setManualLink('');
    setManualMembers('1');
    setFeedback({
      type: 'success',
      message: `Grupo ${manualName} (${manualPlatform}) adicionado com sucesso!`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const filteredSourceSuggestions = allAvailableGroups.filter((g) => {
    const matchesFilter = sourcePlatformFilter === 'all' || g.platform === sourcePlatformFilter;
    const matchesSearch =
      !sourceSearchText.trim() ||
      g.name.toLowerCase().includes(sourceSearchText.trim().toLowerCase()) ||
      (g.chatId && g.chatId.toLowerCase().includes(sourceSearchText.trim().toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const filteredTargetSuggestions = allAvailableGroups.filter((g) => {
    const matchesFilter = targetPlatformFilter === 'all' || g.platform === targetPlatformFilter;
    const matchesSearch =
      !targetSearchText.trim() ||
      g.name.toLowerCase().includes(targetSearchText.trim().toLowerCase()) ||
      (g.chatId && g.chatId.toLowerCase().includes(targetSearchText.trim().toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Users2 className="w-6 h-6 text-[#FF5722]" />
            Grupos & Canais de Destino
          </h1>
          <p className="text-xs text-neutral-400">
            Gerencie seus grupos do WhatsApp, cadastre seus Chat IDs do Telegram para postagem e crie regras de espelhamento.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-white text-xs font-bold border border-[#2e313c] transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Grupos'}</span>
          </button>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-white text-xs font-bold border border-[#2e313c] transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#29b6f6]" />
            <span>Adicionar Canal/Grupo</span>
          </button>

          <button
            onClick={() => setIsSourceModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Criar Grupo Fonte</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : feedback.type === 'error'
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO PRINCIPAL: GRUPOS / CANAIS TELEGRAM (CHAT ID) - REFERÊNCIA IMAGEM 2 */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-3xl bg-[#141517] border border-[#0088cc]/30 shadow-2xl space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#22242a]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0088cc]/15 border border-[#0088cc]/30 flex items-center justify-center text-[#29b6f6] shrink-0">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">
                  GRUPOS / CANAIS TELEGRAM (CHAT ID)
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#0088cc]/20 text-[#29b6f6] border border-[#0088cc]/30">
                  {telegramChannels.length} canal{telegramChannels.length === 1 ? '' : 'is'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Cadastre os Chat IDs de seus canais ou grupos onde o bot publicará as ofertas clonadas.
              </p>
            </div>
          </div>

          {/* Active Bot Status Pill */}
          <div className="flex items-center gap-2 flex-wrap">
            {isBotConnected && telegramBotInfo ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0088cc]/10 border border-[#0088cc]/30 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <Bot className="w-4 h-4 text-[#29b6f6]" />
                <span className="text-white font-bold">{telegramBotInfo.first_name}</span>
                <span className="text-[#29b6f6] font-mono text-[11px]">@{telegramBotInfo.username}</span>
              </div>
            ) : (
              <button
                onClick={onNavigateToConexoes}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Conectar Bot em Conexões</span>
              </button>
            )}
          </div>
        </div>

        {/* Form to Add Telegram Channel by Chat ID */}
        <form onSubmit={handleAddTelegramChannel} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5 space-y-1">
              <label className="text-xs font-extrabold text-neutral-300 flex items-center gap-1.5">
                <span>Chat ID do Canal / Grupo</span>
                <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={telegramChatIdInput}
                onChange={(e) => setTelegramChatIdInput(e.target.value)}
                placeholder="Ex: @atacadogameofertas ou -1001234567890"
                className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#282a32] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-[#0088cc] placeholder-neutral-500"
              />
            </div>

            <div className="md:col-span-4 space-y-1">
              <label className="text-xs font-extrabold text-neutral-300 flex items-center gap-1.5">
                <span>Nome de Identificação</span>
                <span className="text-neutral-500 text-[10px]">(Opcional)</span>
              </label>
              <input
                type="text"
                value={telegramNameInput}
                onChange={(e) => setTelegramNameInput(e.target.value)}
                placeholder="Ex: Atacado Game Ofertas"
                className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#282a32] rounded-xl text-xs text-white focus:outline-none focus:border-[#0088cc] placeholder-neutral-500"
              />
            </div>

            <div className="md:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={isAddingTelegramChannel || !telegramChatIdInput.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white text-xs font-extrabold shadow-lg shadow-[#0088cc]/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isAddingTelegramChannel ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Adicionando...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Adicionar Chat ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-neutral-400 leading-relaxed flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#29b6f6] shrink-0" />
            <span>
              Para canais públicos, informe <code>@nomedocanal</code>. Para grupos privados, adicione o bot como <strong>Administrador</strong> com permissão de envio.
            </span>
          </p>
        </form>

        {/* Telegram Channels Cards Grid (Image 2 representation) */}
        {telegramChannels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
            {telegramChannels.map((tc) => {
              const isTesting = testingChatId === tc.chatId;

              return (
                <div
                  key={tc.id}
                  className="p-4 rounded-2xl bg-[#101216] border border-[#0088cc]/25 hover:border-[#0088cc]/50 transition shadow-lg space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#0088cc]/20 text-[#29b6f6] border border-[#0088cc]/40">
                        <Send className="w-2.5 h-2.5" />
                        <span>Canal Telegram</span>
                      </span>

                      <button
                        onClick={() => handleDeleteTelegramChannel(tc.id, tc.name)}
                        title="Remover canal"
                        className="p-1 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold text-white truncate tracking-tight">
                        {tc.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] font-mono text-[#29b6f6] bg-[#0088cc]/10 px-2 py-0.5 rounded-md border border-[#0088cc]/20 truncate">
                          {tc.chatId}
                        </span>
                        <button
                          onClick={() => handleCopyChatId(tc.chatId)}
                          title="Copiar Chat ID"
                          className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                        >
                          {copiedChatId === tc.chatId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1c1e26] flex items-center justify-between text-xs gap-2">
                    <button
                      onClick={() => handleTestSendTelegram(tc.chatId, tc.name)}
                      disabled={isTesting}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#0088cc]/15 hover:bg-[#0088cc]/25 text-[#29b6f6] border border-[#0088cc]/30 text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isTesting ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3 h-3" />
                          <span>Testar Envio</span>
                        </>
                      )}
                    </button>

                    {tc.inviteLink && (
                      <a
                        href={tc.inviteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-[#18191d] hover:bg-[#22242a] text-neutral-300 hover:text-white transition border border-[#282a32] flex items-center justify-center cursor-pointer"
                        title="Abrir no Telegram"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#0e1014] border border-dashed border-[#242732] text-center space-y-2">
            <Send className="w-8 h-8 text-[#29b6f6] mx-auto opacity-70" />
            <p className="text-xs font-bold text-white">Nenhum canal ou grupo do Telegram cadastrado ainda.</p>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
              Digite o Chat ID (ex: <code>@atacadogameofertas</code>) no formulário acima para que ele fique disponível nas regras de replicação.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO DE FILTROS & TODOS OS GRUPOS (WHATSAPP + TELEGRAM) */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Sub-tab Navigation for Groups */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#141517] border border-[#22242a] w-fit">
            <button
              onClick={() => setActiveFilterTab('todos')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilterTab === 'todos'
                  ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Todos os Grupos</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 text-white font-extrabold">
                {allAvailableGroups.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('whatsapp')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilterTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>WhatsApp Web</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 text-white font-extrabold">
                {whatsappGroups.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('telegram')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilterTab === 'telegram'
                  ? 'bg-[#0088cc] text-white shadow-md shadow-[#0088cc]/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram (Chat ID)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 text-white font-extrabold">
                {telegramGroups.length}
              </span>
            </button>
          </div>

          <p className="text-xs text-neutral-400">
            Exibindo <strong>{displayedGroups.length}</strong> grupo(s) cadastrado(s)
          </p>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedGroups.map((g) => {
            const isTg = g.platform === 'Telegram';

            return (
              <div
                key={g.id}
                className={`p-5 rounded-2xl bg-[#141517] border shadow-xl space-y-4 flex flex-col justify-between transition ${
                  isTg ? 'border-[#0088cc]/30 hover:border-[#0088cc]/60' : 'border-[#22242a] hover:border-[#2e313c]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                        isTg
                          ? 'bg-[#0088cc]/15 text-[#29b6f6] border-[#0088cc]/40'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {isTg ? <Send className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      <span>{isTg ? 'Telegram' : 'WhatsApp'}</span>
                    </span>

                    <button
                      onClick={() => onDeleteGroup(g.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-tight truncate">{g.name}</h3>
                    {g.chatId && (
                      <p className="text-[11px] font-mono text-[#29b6f6] mt-0.5 truncate">
                        Chat ID: {g.chatId}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Capacidade: <strong className="text-neutral-200">{g.membersCount || 1}</strong> / {g.maxCapacity || 1024} membros
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#202228] flex items-center justify-between text-xs">
                  <button
                    onClick={() => onToggleGroupActive(g.id)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      g.isActive
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {g.isActive ? 'Disparo Ativo' : 'Pausado'}
                  </button>

                  {g.inviteLink && (
                    <a
                      href={g.inviteLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#FF5722] hover:underline text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>Abrir Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Criar Grupo Fonte Multi-Canal */}
      {isSourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-xl bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#20222a] shrink-0">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-[#FF5722]" />
                  <span>Criar Grupo Fonte Multi-Canal</span>
                </h2>
                <p className="text-xs text-neutral-400">
                  Vincule múltiplos grupos concorrentes (WhatsApp ou Telegram) aos seus grupos e canais VIP.
                </p>
              </div>
              <button
                onClick={() => setIsSourceModalOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e1f26] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSourceGroup} className="space-y-5 overflow-y-auto pr-1 flex-1">
              {/* Campo 1: Grupo Fonte */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#18191d] border border-[#272930]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-neutral-200 flex items-center gap-1.5">
                    <span>1. GRUPO FONTE (ORIGEM / CONCORRENTE)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] font-bold">
                      {selectedSources.length} selecionado{selectedSources.length === 1 ? '' : 's'}
                    </span>
                  </label>

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
                      placeholder="Digite o nome do grupo ou canal para filtrar ou adicionar..."
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

                {isSourceListExpanded && (
                  <div className="max-h-36 overflow-y-auto space-y-1 p-1 bg-[#121214] border border-[#262832] rounded-xl">
                    {filteredSourceSuggestions.map((g) => {
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
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Campo 2: Grupo de Destino */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#18191d] border border-[#272930]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-[#FF5722] flex items-center gap-1.5">
                    <span>2. GRUPO DE DESTINO (ONDE REPLICAR)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] font-bold">
                      {selectedTargets.length} selecionado{selectedTargets.length === 1 ? '' : 's'}
                    </span>
                  </label>

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
                      placeholder="Digite o grupo ou canal de destino para filtrar ou adicionar..."
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

                {isTargetListExpanded && (
                  <div className="max-h-36 overflow-y-auto space-y-1 p-1 bg-[#121214] border border-[#262832] rounded-xl">
                    {filteredTargetSuggestions.map((g) => {
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
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Opções de Foto e Validação */}
              <div className="space-y-3">
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
                      Quando o grupo mandar uma mensagem sem foto, buscar e anexar automaticamente a foto do link.
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
                      Pula automaticamente produtos pausados ou sem estoque para evitar envio de links quebrados.
                    </span>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-extrabold text-sm shadow-lg shadow-[#FF5722]/30 transition cursor-pointer"
              >
                Vincular e Iniciar Replicação Multi-Canal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Grupo Manual */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#20222a]">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#FF5722]" />
                <span>Cadastrar Canal ou Grupo Manual</span>
              </h2>
              <button onClick={() => setIsManualModalOpen(false)} className="p-1.5 text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualGroup} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-300">Plataforma</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPlatform('WhatsApp')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      manualPlatform === 'WhatsApp'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-[#18191d] border-[#272930] text-neutral-400'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualPlatform('Telegram')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      manualPlatform === 'Telegram'
                        ? 'bg-[#0088cc]/20 border-[#0088cc] text-[#29b6f6]'
                        : 'bg-[#18191d] border-[#272930] text-neutral-400'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Telegram</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-300">
                  {manualPlatform === 'Telegram' ? 'Chat ID ou @Username do Canal/Grupo' : 'Nome do Grupo WhatsApp'}
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={manualPlatform === 'Telegram' ? '@meucanal_vip ou -1001234567890' : 'Ex: Ofertas VIP WhatsApp'}
                  className="w-full px-4 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF5722]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-300">Link de Convite (Opcional)</label>
                <input
                  type="text"
                  value={manualLink}
                  onChange={(e) => setManualLink(e.target.value)}
                  placeholder={manualPlatform === 'Telegram' ? 'https://t.me/meucanal' : 'https://chat.whatsapp.com/...'}
                  className="w-full px-4 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF5722]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-extrabold text-xs transition cursor-pointer shadow-lg shadow-[#FF5722]/30"
              >
                Salvar Canal/Grupo
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
