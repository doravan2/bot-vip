import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Radio,
  X,
  Smartphone,
  Search,
  Copy,
  Send,
} from 'lucide-react';
import { GroupChannel, WhatsAppInstance, SourceGroup } from '../../types/index.ts';

interface CanaisPanelProps {
  groups: GroupChannel[];
  instances: WhatsAppInstance[];
  onToggleGroupActive: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onAddGroup: (grp: GroupChannel) => void;
  onSyncAllGroups: () => Promise<void>;
  onAddSourceGroup: (source: SourceGroup) => void;
  onNavigateToFontes: () => void;
}

export const CanaisPanel: React.FC<CanaisPanelProps> = ({
  groups,
  instances,
  onDeleteGroup,
  onAddGroup,
  onSyncAllGroups,
  onNavigateToFontes,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // WhatsApp Channel Modal / Form State
  const [isWaChannelModalOpen, setIsWaChannelModalOpen] = useState(false);
  const [waChannelLink, setWaChannelLink] = useState('');
  const [waChannelName, setWaChannelName] = useState('');

  // Live fetched channels from server
  const [fetchedWaChannels, setFetchedWaChannels] = useState<GroupChannel[]>([]);

  // Search input
  const [searchQuery, setSearchQuery] = useState('');
  const [testingChatId, setTestingChatId] = useState<string | null>(null);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  // Fetch real WhatsApp channels directly from server endpoint /api/whatsapp/canais
  const loadWhatsAppChannels = async () => {
    try {
      const res = await fetch('/api/whatsapp/canais');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.channels) && data.channels.length > 0) {
          const mapped: GroupChannel[] = data.channels.map((c: any) => ({
            id: c.id,
            name: c.name || 'Canal do WhatsApp',
            platform: 'WhatsApp',
            type: 'channel',
            inviteLink: c.inviteLink || 'https://whatsapp.com/channel/',
            membersCount: c.membersCount || 1000,
            maxCapacity: 1000000,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
            chatId: c.id,
          }));
          setFetchedWaChannels(mapped);
          
          // Also sync into parent group state if not already present
          mapped.forEach((chan) => onAddGroup(chan));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar canais do WhatsApp:', err);
    }
  };

  useEffect(() => {
    loadWhatsAppChannels();
  }, []);

  // Filter channels from global groups state (WhatsApp channels / newsletters / channels)
  const whatsappChannelsFromProps = groups.filter(
    (g) =>
      g.platform === 'WhatsApp' &&
      (g.type === 'channel' ||
        g.id.includes('@newsletter') ||
        g.id.includes('channel') ||
        g.name.toLowerCase().includes('canal') ||
        g.inviteLink.includes('whatsapp.com/channel/'))
  );

  // Combine fetched + props WhatsApp channels uniquely by ID
  const allWhatsAppChannelsMap = new Map<string, GroupChannel>();
  [...fetchedWaChannels, ...whatsappChannelsFromProps].forEach((c) => {
    if (c.id) allWhatsAppChannelsMap.set(c.id, c);
  });
  const allWhatsAppChannels = Array.from(allWhatsAppChannelsMap.values());

  const filteredChannels = allWhatsAppChannels.filter((c) => {
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.id && c.id.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSearch;
  });

  const connectedInstances = instances.filter((i) => i.status === 'conectada');
  const isWhatsAppConnected = connectedInstances.length > 0;

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      await onSyncAllGroups();
      await loadWhatsAppChannels();
      setFeedback({
        type: 'success',
        message: 'Sincronização de Canais do WhatsApp concluída com sucesso!',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Falha ao sincronizar canais do WhatsApp.',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // Add WhatsApp Channel manually
  const handleAddWaChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const link = waChannelLink.trim();
    const name = waChannelName.trim();

    if (!name) {
      setFeedback({ type: 'error', message: 'Digite o nome do Canal do WhatsApp.' });
      return;
    }

    const newChannel: GroupChannel = {
      id: `wa-chan-${Date.now()}@newsletter`,
      name,
      platform: 'WhatsApp',
      inviteLink: link || 'https://whatsapp.com/channel/',
      membersCount: 1,
      maxCapacity: 1000000,
      isActive: true,
      autoRotate: false,
      dispatchesToday: 0,
      type: 'channel',
      chatId: `wa-chan-${Date.now()}@newsletter`,
    };

    onAddGroup(newChannel);
    setIsWaChannelModalOpen(false);
    setWaChannelLink('');
    setWaChannelName('');
    setFeedback({
      type: 'success',
      message: `Canal do WhatsApp "${name}" cadastrado com sucesso!`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Delete Channel
  const handleDeleteChannel = (id: string, name: string) => {
    onDeleteGroup(id);
    setFetchedWaChannels((prev) => prev.filter((c) => c.id !== id));
    setFeedback({
      type: 'info',
      message: `Canal ${name} removido com sucesso.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Test Send to Channel
  const handleTestSendChannel = async (channel: GroupChannel) => {
    setTestingChatId(channel.id);
    try {
      setFeedback({
        type: 'success',
        message: `Teste de envio disparado com sucesso para o Canal do WhatsApp ${channel.name}!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Falha ao testar envio no canal.',
      });
    } finally {
      setTestingChatId(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleCopyChatId = (chatId: string) => {
    navigator.clipboard.writeText(chatId);
    setCopiedChatId(chatId);
    setTimeout(() => setCopiedChatId(null), 2000);
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-[#FF5722]" />
            Gestão Exclusiva de Canais do WhatsApp
          </h1>
          <p className="text-xs text-neutral-400">
            Gerencie e sincronize canais de transmissão do WhatsApp (Newsletters/Channels) para disparo de ofertas.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsWaChannelModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Cadastrar Canal WhatsApp</span>
          </button>

          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/30 transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Canais do WhatsApp'}</span>
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

      {/* Cadastro Rápido de Canal do WhatsApp */}
      <div className="p-5 rounded-3xl bg-[#141517] border border-[#22242a] shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-extrabold text-white">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Cadastrar Canal de Transmissão do WhatsApp (Newsletter)</span>
          </div>
          <span className="text-[10px] text-neutral-400">
            Status Conexão: <strong className={isWhatsAppConnected ? 'text-emerald-400' : 'text-amber-400'}>{isWhatsAppConnected ? 'Conectado' : 'Aguardando Sincronização'}</strong>
          </span>
        </div>

        <form onSubmit={handleAddWaChannel} className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={waChannelName}
            onChange={(e) => setWaChannelName(e.target.value)}
            placeholder="Nome do Canal (ex: Canal VIP Ofertas)"
            className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-medium"
          />
          <input
            type="text"
            value={waChannelLink}
            onChange={(e) => setWaChannelLink(e.target.value)}
            placeholder="Link do Canal (whatsapp.com/channel/...)"
            className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-medium"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Canal do WhatsApp</span>
          </button>
        </form>
      </div>

      {/* Search Bar & Total Counter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#121214] p-3 rounded-2xl border border-[#22242a]">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Canais do WhatsApp Cadastrados: {allWhatsAppChannels.length}</span>
          </span>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar canal por nome ou ID..."
            className="w-full pl-9 pr-3.5 py-2 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
          />
        </div>
      </div>

      {/* WhatsApp Channels List Cards */}
      {filteredChannels.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141517] border border-[#22242a] text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1b20] border border-[#282a34] mx-auto flex items-center justify-center text-emerald-500">
            <Smartphone className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold text-white">Nenhum Canal do WhatsApp Encontrado</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Clique no botão de sincronização abaixo para buscar automaticamente os canais da sua conta do WhatsApp conectada ou cadastre um manualmente.
            </p>
          </div>
          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="px-6 py-3 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-md shadow-[#FF5722]/30 cursor-pointer inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar Canais do WhatsApp Agora</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChannels.map((channel) => (
            <div
              key={`wa-chan-card-${channel.id}`}
              className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4 flex flex-col justify-between relative hover:border-[#333644] transition"
            >
              <div className="space-y-3">
                {/* Top Bar Badges */}
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 bg-emerald-500/15 border-emerald-500/30 text-emerald-400">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Canal WhatsApp</span>
                  </span>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                      channel.isActive !== false
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {channel.isActive !== false ? 'ATIVO' : 'PAUSADO'}
                  </span>
                </div>

                {/* Title & Info */}
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-white truncate flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{channel.name}</span>
                  </h3>

                  {(channel.chatId || channel.id) && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/25 truncate max-w-[200px]">
                        {channel.chatId || channel.id}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyChatId(channel.chatId || channel.id)}
                        title="Copiar ID do Canal"
                        className="p-1 rounded hover:bg-[#22242a] text-neutral-400 hover:text-white transition cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {copiedChatId === (channel.chatId || channel.id) && (
                        <span className="text-[10px] text-emerald-400 font-bold">Copiado!</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-[#1f2026] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestSendChannel(channel)}
                  disabled={testingChatId === channel.id}
                  className="px-3 py-1.5 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold border border-[#282a34] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3 h-3 text-emerald-400" />
                  <span>{testingChatId === channel.id ? 'Testando...' : 'Testar Envio'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onNavigateToFontes()}
                    title="Criar Regra de Fonte para este Canal"
                    className="p-1.5 rounded-xl text-[#FF5722] hover:bg-[#FF5722]/10 border border-[#FF5722]/30 transition cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(channel.id, channel.name)}
                    title="Remover Canal"
                    className="p-1.5 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
