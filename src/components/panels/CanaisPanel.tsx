import React, { useState, useEffect } from 'react';
import {
  Radio,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  Smartphone,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { GroupChannel, WhatsAppInstance, SourceGroup } from '../../types/index.ts';

// Interface do Canal
export interface CanalWhatsApp {
  id: string; // O ID real que termina em @newsletter
  name: string;
  inviteLink?: string;
  description?: string;
}

interface CanaisPanelProps {
  groups?: GroupChannel[];
  instances?: WhatsAppInstance[];
  onToggleGroupActive?: (id: string) => void;
  onDeleteGroup?: (id: string) => void;
  onAddGroup?: (grp: GroupChannel) => void;
  onSyncAllGroups?: () => Promise<void>;
  onAddSourceGroup?: (source: SourceGroup) => void;
  onNavigateToFontes?: () => void;
}

export const CanaisPanel: React.FC<CanaisPanelProps> = ({
  groups = [],
  instances = [],
  onDeleteGroup,
  onAddGroup,
  onSyncAllGroups,
  onNavigateToFontes,
}) => {
  const [canais, setCanais] = useState<CanalWhatsApp[]>(() => {
    try {
      const salvos = localStorage.getItem('bot_vip_canais_wa');
      if (salvos) {
        const parsed = JSON.parse(salvos);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [nomeInput, setNomeInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Salva no LocalStorage sempre que a lista atualizar
  useEffect(() => {
    try {
      localStorage.setItem('bot_vip_canais_wa', JSON.stringify(canais));
    } catch (err) {
      console.error('Erro ao salvar no LocalStorage:', err);
    }
  }, [canais]);

  // Carrega canais do WhatsApp do backend na montagem
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await fetch('/api/whatsapp/canais');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.channels) && data.channels.length > 0) {
            setCanais((prev) => {
              const map = new Map<string, CanalWhatsApp>();
              prev.forEach((c) => map.set(c.id, c));
              data.channels.forEach((c: any) => {
                if (c.id && !map.has(c.id)) {
                  map.set(c.id, {
                    id: c.id,
                    name: c.name || 'Canal do WhatsApp',
                    inviteLink: c.inviteLink,
                  });
                }
              });
              return Array.from(map.values());
            });
          }
        }
      } catch (err) {
        console.warn('Aviso ao carregar canais do backend:', err);
      }
    };
    fetchChannels();
  }, []);

  const handleCadastrarManual = async () => {
    const cleanLink = linkInput.trim();
    if (!cleanLink.includes('whatsapp.com/channel/')) {
      setMensagem({
        tipo: 'erro',
        texto: 'Por favor, insira um link válido de canal do WhatsApp (ex: https://whatsapp.com/channel/...).',
      });
      return;
    }

    setIsLoading(true);
    setMensagem(null);

    try {
      const response = await fetch('/api/whatsapp/canais/adicionar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeInput.trim(), link: cleanLink }),
      });

      const data = await response.json();

      if (data.success && data.channel) {
        const newChan: CanalWhatsApp = {
          id: data.channel.id,
          name: data.channel.name || nomeInput.trim() || 'Canal do WhatsApp',
          inviteLink: cleanLink,
          description: data.channel.description,
        };

        // Adiciona o novo canal à lista da tela sem duplicar ID
        setCanais((prev) => {
          const filtered = prev.filter((c) => c.id !== newChan.id);
          return [...filtered, newChan];
        });

        // Sincroniza com o estado global da aplicação
        if (onAddGroup) {
          onAddGroup({
            id: newChan.id,
            name: newChan.name,
            platform: 'WhatsApp',
            inviteLink: cleanLink,
            membersCount: 1000,
            maxCapacity: 1000000,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
            type: 'channel',
            chatId: newChan.id,
          });
        }

        setNomeInput('');
        setLinkInput('');
        setMensagem({ tipo: 'sucesso', texto: data.message || `Canal "${newChan.name}" cadastrado com sucesso!` });
      } else {
        setMensagem({ tipo: 'erro', texto: data.error || 'Erro ao cadastrar canal no WhatsApp.' });
      }
    } catch (error: any) {
      setMensagem({ tipo: 'erro', texto: error?.message || 'Falha na comunicação com o servidor Node.js.' });
    } finally {
      setIsLoading(false);
      setTimeout(() => setMensagem(null), 6000);
    }
  };

  const handleRemoverCanal = (idToRemove: string) => {
    setCanais((prev) => prev.filter((c) => c.id !== idToRemove));
    if (onDeleteGroup) {
      onDeleteGroup(idToRemove);
    }
    setMensagem({ tipo: 'sucesso', texto: 'Canal removido com sucesso!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSyncFromMeta = async () => {
    setIsSyncing(true);
    setMensagem(null);
    try {
      if (onSyncAllGroups) {
        await onSyncAllGroups();
      }
      const res = await fetch('/api/whatsapp/canais?force=true');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.channels) && data.channels.length > 0) {
          setCanais((prev) => {
            const map = new Map<string, CanalWhatsApp>();
            prev.forEach((c) => map.set(c.id, c));
            data.channels.forEach((c: any) => {
              if (c.id) {
                map.set(c.id, {
                  id: c.id,
                  name: c.name || 'Canal do WhatsApp',
                  inviteLink: c.inviteLink,
                });
              }
            });
            return Array.from(map.values());
          });
          setMensagem({ tipo: 'sucesso', texto: `${data.channels.length} canais sincronizados da sua conta com sucesso!` });
        } else {
          setMensagem({ tipo: 'sucesso', texto: 'Sincronização realizada!' });
        }
      }
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err?.message || 'Erro ao sincronizar canais.' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setMensagem(null), 5000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto pb-16">
      {/* Header de Gestão Exclusiva de Canais do WhatsApp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-[#FF5722]" />
            Gestão Exclusiva de Canais do WhatsApp
          </h1>
          <p className="text-xs text-neutral-400">
            Cadastre o link do canal do WhatsApp para resolver o ID oculto (@newsletter) diretamente nos servidores da Meta.
          </p>
        </div>

        <button
          onClick={handleSyncFromMeta}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/30 transition cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Canais do WhatsApp'}</span>
        </button>
      </div>

      {mensagem && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-bold ${
            mensagem.tipo === 'sucesso'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <div className="flex items-center gap-3">
            {mensagem.tipo === 'sucesso' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{mensagem.texto}</span>
          </div>
          <button onClick={() => setMensagem(null)} className="text-xs opacity-75 hover:opacity-100 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Box de Cadastro Manual */}
      <div className="bg-[#18191d] border border-[#22242a] rounded-2xl p-6 space-y-4 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          Cadastrar Canal de Transmissão do WhatsApp (Newsletter)
        </h3>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Nome do Canal (ex: Canal VIP Ofertas)"
            value={nomeInput}
            onChange={(e) => setNomeInput(e.target.value)}
            className="flex-1 bg-[#121214] border border-[#22242a] rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none placeholder-neutral-500 font-medium"
          />
          <input
            type="text"
            placeholder="Link do Canal (whatsapp.com/channel/...)"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            className="flex-1 bg-[#121214] border border-[#22242a] rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none placeholder-neutral-500 font-medium"
          />
          <button
            onClick={handleCadastrarManual}
            disabled={isLoading || !linkInput.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-md shadow-emerald-600/20"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Cadastrar Canal do WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Lista de Canais Cadastrados */}
      <div className="bg-[#18191d] border border-[#22242a] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Canais do WhatsApp Cadastrados: {canais.length}</span>
          </span>
        </div>

        {canais.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500 text-center space-y-3">
            <Radio className="w-12 h-12 opacity-30 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-bold text-white text-sm">Nenhum Canal do WhatsApp Encontrado</p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Cole o link de convite acima para contornar o bloqueio da Meta e cadastrar manualmente.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {canais.map((canal) => (
              <div
                key={canal.id}
                className="bg-[#121214] border border-[#22242a] hover:border-[#333644] p-4 rounded-xl flex items-center justify-between transition shadow-md"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <h4 className="text-white font-bold text-sm truncate">{canal.name}</h4>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <p className="text-[11px] text-emerald-400/90 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 truncate max-w-[190px]">
                      {canal.id}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyId(canal.id)}
                      title="Copiar ID"
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#18191d] transition cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {copiedId === canal.id && (
                      <span className="text-[10px] text-emerald-400 font-bold">Copiado!</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onNavigateToFontes && (
                    <button
                      type="button"
                      onClick={onNavigateToFontes}
                      title="Criar regra de fonte na aba Fontes"
                      className="p-2 text-[#FF5722] hover:bg-[#FF5722]/10 rounded-lg border border-[#FF5722]/30 transition cursor-pointer"
                    >
                      <Radio className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoverCanal(canal.id)}
                    title="Remover Canal"
                    className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
