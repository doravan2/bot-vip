import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  Radio,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Zap,
  Send,
  Bot,
  ShieldCheck,
  Link as LinkIcon,
  HelpCircle,
  Copy,
  Check,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { WhatsAppInstance } from '../../types/index.ts';
import { DEFAULT_VIP_GROUP_LINK } from '../../utils/affiliateEngine.ts';

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}

interface TelegramBotAccount {
  id: string;
  botToken: string;
  botInfo: TelegramBotInfo;
  status: 'connected' | 'disconnected';
  createdAt: string;
}

interface TelegramConfig {
  botToken: string;
  status: 'connected' | 'disconnected' | 'unconfigured';
  botInfo?: TelegramBotInfo | null;
  defaultChatId?: string;
  bots?: TelegramBotAccount[];
  activeBotId?: string;
  lastTested?: string;
  lastError?: string;
}

interface ConexoesPanelProps {
  instances: WhatsAppInstance[];
  onAddInstance: () => void;
  onDeleteInstance: (id: string) => void;
  onUpdateInstance: (id: string, updates: Partial<WhatsAppInstance>) => void;
  onSyncAllGroups: () => Promise<void>;
  onNavigateToGrupos: () => void;
  vipGroupLink?: string;
  onUpdateVipGroupLink?: (link: string) => void;
}

export const ConexoesPanel: React.FC<ConexoesPanelProps> = ({
  instances,
  onAddInstance,
  onDeleteInstance,
  onUpdateInstance,
  onSyncAllGroups,
  onNavigateToGrupos,
  vipGroupLink = DEFAULT_VIP_GROUP_LINK,
  onUpdateVipGroupLink,
}) => {
  // Sub-tabs: 'whatsapp' | 'telegram' | 'links'
  const [activeSubTab, setActiveSubTab] = useState<'whatsapp' | 'telegram' | 'links'>('whatsapp');

  // WhatsApp state
  const [loadingInstanceId, setLoadingInstanceId] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  // Telegram state - ONLY Bot Token as requested by user
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '',
    status: 'disconnected',
    botInfo: null,
    defaultChatId: '',
    bots: [],
  });
  const [telegramTokenInput, setTelegramTokenInput] = useState('');
  const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);
  const [isLoadingTelegram, setIsLoadingTelegram] = useState(false);
  const [telegramNotice, setTelegramNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showAddAnotherBot, setShowAddAnotherBot] = useState(false);

  // Link VIP state
  const [localVipLink, setLocalVipLink] = useState(vipGroupLink);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [linkSavedNotice, setLinkSavedNotice] = useState<string | null>(null);
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // Load Telegram config on mount
  const loadTelegramConfig = async () => {
    setIsLoadingTelegram(true);
    try {
      const res = await fetch('/api/telegram/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setTelegramConfig(data.config);
          setTelegramTokenInput(data.config.botToken || '');
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do Telegram:', err);
    } finally {
      setIsLoadingTelegram(false);
    }
  };

  useEffect(() => {
    loadTelegramConfig();
  }, []);

  // Sync VIP link if prop changes
  useEffect(() => {
    if (vipGroupLink) {
      setLocalVipLink(vipGroupLink);
    }
  }, [vipGroupLink]);

  // Poll status from backend to detect live QR code & WhatsApp connection state
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          const connectingInst = instances.find((i) => i.status === 'conectando');

          if (data.isConnected && connectingInst) {
            onUpdateInstance(connectingInst.id, {
              status: 'conectada',
              phoneNumber: data.phoneNumber || '+55 (WhatsApp Conectado)',
              qrCodeDataUrl: undefined,
            });
            setSyncNotice('WhatsApp conectado com sucesso! Sincronizando grupos...');
            await onSyncAllGroups();
            setTimeout(() => setSyncNotice(null), 6000);
            return;
          }

          if (data.qrDataUrl && connectingInst && !connectingInst.qrCodeDataUrl) {
            onUpdateInstance(connectingInst.id, {
              qrCodeDataUrl: data.qrDataUrl,
            });
          }
        }
      } catch (err) {
        console.error('Erro ao verificar status do WhatsApp:', err);
      }
    };

    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [instances, onUpdateInstance, onSyncAllGroups]);

  const handleStartConnect = async (inst: WhatsAppInstance) => {
    setLoadingInstanceId(inst.id);
    onUpdateInstance(inst.id, {
      status: 'conectando',
      qrCodeDataUrl: undefined,
    });

    try {
      const res = await fetch('/api/whatsapp/qr');
      if (res.ok) {
        const data = await res.json();
        if (data.qrDataUrl) {
          onUpdateInstance(inst.id, {
            qrCodeDataUrl: data.qrDataUrl,
            status: 'conectando',
          });
          setLoadingInstanceId(null);
          return;
        }
      }

      let count = 0;
      const timer = setInterval(async () => {
        count++;
        try {
          const pollRes = await fetch('/api/whatsapp/status');
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.qrDataUrl) {
              onUpdateInstance(inst.id, {
                qrCodeDataUrl: pollData.qrDataUrl,
                status: 'conectando',
              });
              clearInterval(timer);
              setLoadingInstanceId(null);
            }
          }
        } catch {}
        if (count >= 12) {
          clearInterval(timer);
          setLoadingInstanceId(null);
        }
      }, 1000);
    } catch (e) {
      console.error('Falha ao requisitar QR code:', e);
      setLoadingInstanceId(null);
    }
  };

  const handleCancelConnect = (instId: string) => {
    onUpdateInstance(instId, {
      status: 'desconectada',
      qrCodeDataUrl: undefined,
    });
  };

  const handleRepairSession = async () => {
    setIsRepairing(true);
    setSyncNotice('Reparando chaves criptográficas da sessão do WhatsApp...');
    try {
      const res = await fetch('/api/whatsapp/repair-session', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncNotice('Chaves criptográficas reparadas com sucesso! Sessão reconectando...');
      } else {
        setSyncNotice('Aviso ao reparar: ' + (data.message || 'Tentando reconexão...'));
      }
    } catch {
      setSyncNotice('Comando de reparo enviado ao servidor.');
    } finally {
      setIsRepairing(false);
      setTimeout(() => setSyncNotice(null), 5000);
    }
  };

  const handleDisconnect = async (inst: WhatsAppInstance) => {
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' }).catch(() => {});
    } catch {}
    onUpdateInstance(inst.id, {
      status: 'desconectada',
      qrCodeDataUrl: undefined,
      phoneNumber: undefined,
    });
  };

  // Telegram handlers - ONLY Bot Token (Chat ID removed from Conexões and placed in Grupos)
  const handleConnectTelegram = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = telegramTokenInput.trim();
    if (!token) {
      setTelegramNotice({ type: 'error', text: 'Por favor, insira o Token do Bot fornecido pelo @BotFather.' });
      return;
    }

    setIsConnectingTelegram(true);
    setTelegramNotice(null);
    try {
      const res = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: token,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramConfig(data.config);
        setTelegramNotice({
          type: 'success',
          text: data.message || `Bot @${data.config?.botInfo?.username || 'Telegram'} conectado com sucesso!`,
        });
        setShowAddAnotherBot(false);
      } else {
        setTelegramNotice({
          type: 'error',
          text: data.error || data.message || 'Falha ao conectar com a API do Telegram. Verifique o token.',
        });
      }
    } catch (err: any) {
      setTelegramNotice({
        type: 'error',
        text: err?.message || 'Erro de conexão com o servidor.',
      });
    } finally {
      setIsConnectingTelegram(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    try {
      const res = await fetch('/api/telegram/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.config) {
        setTelegramConfig(data.config);
      }
      setTelegramNotice({
        type: 'info',
        text: 'Todos os bots do Telegram foram desconectados.',
      });
    } catch (err: any) {
      setTelegramNotice({
        type: 'error',
        text: err?.message || 'Falha ao desconectar bot.',
      });
    }
  };

  const handleDisconnectSpecificBot = async (botId: string) => {
    try {
      const res = await fetch('/api/telegram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (data.config) {
        setTelegramConfig(data.config);
      }
      setTelegramNotice({
        type: 'info',
        text: 'Bot removido com sucesso.',
      });
    } catch (err: any) {
      setTelegramNotice({
        type: 'error',
        text: err?.message || 'Falha ao remover bot.',
      });
    }
  };

  const handleSetActiveBot = async (botId: string) => {
    try {
      const res = await fetch('/api/telegram/set-active-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (data.config) {
        setTelegramConfig(data.config);
      }
      setTelegramNotice({
        type: 'success',
        text: 'Bot ativo alterado com sucesso!',
      });
    } catch (err: any) {
      setTelegramNotice({
        type: 'error',
        text: err?.message || 'Falha ao alterar bot ativo.',
      });
    }
  };

  // Link VIP handler
  const handleSaveVipLink = async () => {
    const clean = localVipLink.trim() || DEFAULT_VIP_GROUP_LINK;
    setIsSavingLink(true);
    setLinkSavedNotice(null);

    try {
      if (onUpdateVipGroupLink) {
        onUpdateVipGroupLink(clean);
      }
      const res = await fetch('/api/settings/vip-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipGroupLink: clean }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLinkSavedNotice('Link de convite oficial atualizado e salvo com sucesso no servidor!');
        setTimeout(() => setLinkSavedNotice(null), 4000);
      }
    } catch (err: any) {
      setLinkSavedNotice('Erro ao salvar link no servidor.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(localVipLink);
    setIsCopiedLink(true);
    setTimeout(() => setIsCopiedLink(false), 2000);
  };

  const isAnyWhatsAppConnected = instances.some((i) => i.status === 'conectada');
  const isTelegramConnected = telegramConfig.status === 'connected';
  const allConnectedBots = telegramConfig.bots || [];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-[#FF5722]" />
            Conexões & Canais de Envio
          </h1>
          <p className="text-xs text-neutral-400">
            Conecte suas instâncias do WhatsApp Web, Bot oficial do Telegram via @BotFather e configure seus links de destino.
          </p>
        </div>

        {activeSubTab === 'whatsapp' && (
          <button
            onClick={onAddInstance}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-white text-xs font-bold border border-[#2e313c] transition shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-[#FF5722] stroke-[2.5]" />
            <span>Nova Instância WhatsApp</span>
          </button>
        )}
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#141517] border border-[#22242a] w-fit shadow-md overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeSubTab === 'whatsapp'
              ? 'bg-[#FF5722] text-white shadow-lg shadow-[#FF5722]/20'
              : 'text-neutral-400 hover:text-white hover:bg-[#1a1b20]'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>WhatsApp Web</span>
          <span
            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
              activeSubTab === 'whatsapp'
                ? 'bg-black/30 text-white'
                : isAnyWhatsAppConnected
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {isAnyWhatsAppConnected ? 'Conectado' : `${instances.length}`}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('telegram')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeSubTab === 'telegram'
              ? 'bg-[#0088cc] text-white shadow-lg shadow-[#0088cc]/20'
              : 'text-neutral-400 hover:text-white hover:bg-[#1a1b20]'
          }`}
        >
          <Send className="w-4 h-4 text-[#29b6f6]" />
          <span>Telegram (@BotFather)</span>
          <span
            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
              activeSubTab === 'telegram'
                ? 'bg-black/30 text-white'
                : isTelegramConnected
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {isTelegramConnected ? 'Ativo' : 'Pendente'}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('links')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeSubTab === 'links'
              ? 'bg-[#2a2c36] text-white border border-[#3e414f]'
              : 'text-neutral-400 hover:text-white hover:bg-[#1a1b20]'
          }`}
        >
          <LinkIcon className="w-4 h-4 text-[#FF5722]" />
          <span>Link Grupo VIP & Destino</span>
        </button>
      </div>

      {/* Sync Notification Banner */}
      {syncNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button
            onClick={onNavigateToGrupos}
            className="px-3 py-1 bg-emerald-500 text-black text-xs font-bold rounded-lg hover:bg-emerald-400 transition"
          >
            Ver Grupos
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: WHATSAPP WEB INSTANCES */}
      {/* ========================================================================= */}
      {activeSubTab === 'whatsapp' && (
        <div className="space-y-5 animate-in fade-in">
          {instances.map((inst) => {
            const isDisconnected = inst.status === 'desconectada';
            const isConnecting = inst.status === 'conectando';
            const isConnected = inst.status === 'conectada';

            return (
              <div
                key={inst.id}
                className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-5 transition-all"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status Circle Icon */}
                    {isDisconnected && (
                      <div className="w-10 h-10 rounded-full bg-[#1c1d22] border border-[#272930] flex items-center justify-center text-neutral-500">
                        <Radio className="w-5 h-5" />
                      </div>
                    )}
                    {isConnecting && (
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                      </div>
                    )}
                    {isConnected && (
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                    )}

                    <div>
                      <h3 className="font-extrabold text-base text-white tracking-tight capitalize">
                        {inst.name}
                      </h3>
                      <div className="mt-0.5">
                        {isDisconnected && (
                          <span className="inline-block text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-[#1d1f25] text-neutral-400 border border-[#2a2c36]">
                            Desconectada
                          </span>
                        )}
                        {isConnecting && (
                          <span className="inline-block text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Conectando
                          </span>
                        )}
                        {isConnected && (
                          <span className="inline-block text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Conectada {inst.phoneNumber ? `• ${inst.phoneNumber}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delete button (Red trash icon) */}
                  <button
                    onClick={() => onDeleteInstance(inst.id)}
                    title="Excluir instância"
                    className="p-2 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                  >
                    <Trash2 className="w-5 h-5 stroke-[1.8]" />
                  </button>
                </div>

                {/* State 1: DESCONECTADA */}
                {isDisconnected && (
                  <div className="pt-2">
                    <button
                      onClick={() => handleStartConnect(inst)}
                      className="w-full py-3.5 px-4 rounded-xl border border-[#00c978]/60 hover:border-[#00c978] bg-transparent hover:bg-[#00c978]/10 text-[#00c978] font-extrabold text-sm transition flex items-center justify-center gap-2.5 cursor-pointer shadow-sm group"
                    >
                      <QrCode className="w-5 h-5 text-[#00c978] group-hover:scale-110 transition-transform" />
                      <span>Conectar Instância</span>
                    </button>
                  </div>
                )}

                {/* State 2: CONECTANDO / QR CODE */}
                {isConnecting && (
                  <div className="p-6 rounded-2xl bg-[#0e0f11] border border-[#22242a] flex flex-col items-center justify-center text-center space-y-5 animate-in fade-in">
                    <div className="w-64 h-64 bg-white rounded-3xl p-4 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
                      {inst.qrCodeDataUrl ? (
                        <img
                          src={inst.qrCodeDataUrl}
                          alt="WhatsApp QR Code"
                          className="w-full h-full object-contain rounded-xl"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center space-y-3 p-4">
                          <RefreshCw className="w-10 h-10 text-[#FF5722] animate-spin" />
                          <p className="text-xs font-bold text-neutral-800 leading-tight">
                            Aguardando token do WhatsApp...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 max-w-sm">
                      <div className="flex items-center justify-center gap-2 text-[#00c978] font-bold text-xs">
                        <QrCode className="w-4 h-4 text-[#00c978]" />
                        <span>Aguardando leitura...</span>
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        Abra o WhatsApp no seu celular, vá em <strong className="text-white font-bold">Aparelhos Conectados</strong> e escaneie o código.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md pt-2">
                      <button
                        onClick={() => handleStartConnect(inst)}
                        className="w-full sm:flex-1 py-3 px-4 rounded-xl border border-[#00c978]/60 hover:border-[#00c978] bg-transparent hover:bg-[#00c978]/10 text-[#00c978] font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Atualizar QR Code</span>
                      </button>

                      <button
                        onClick={() => handleCancelConnect(inst.id)}
                        className="w-full sm:w-auto py-3 px-6 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-neutral-300 hover:text-white font-bold text-xs border border-[#2e313c] transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* State 3: CONECTADA */}
                {isConnected && (
                  <div className="p-4 rounded-xl bg-[#101915] border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold text-white">Sessão Baileys Sincronizada</p>
                        <p className="text-neutral-400 text-[11px]">
                          Pronto para monitorar grupos fontes e replicar ofertas com seus links monetizados.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
                      <button
                        onClick={onSyncAllGroups}
                        className="flex-1 sm:flex-none py-2 px-3.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sincronizar Grupos</span>
                      </button>

                      <button
                        onClick={handleRepairSession}
                        disabled={isRepairing}
                        title="Reparar chaves criptográficas da sessão"
                        className="py-2 px-3.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isRepairing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>Reparar Chaves</span>
                      </button>

                      <button
                        onClick={() => handleDisconnect(inst)}
                        className="py-2 px-3.5 rounded-lg bg-[#22242a] hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-neutral-300 text-xs font-bold border border-[#2a2c36] transition cursor-pointer"
                      >
                        Desconectar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TELEGRAM BOT FATHER INTEGRATION (ONLY TOKEN - NO CHAT ID) */}
      {/* ========================================================================= */}
      {activeSubTab === 'telegram' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Telegram Status & Connection Box */}
          <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#22242a]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0088cc]/10 border border-[#0088cc]/30 flex items-center justify-center text-[#29b6f6] shrink-0">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white tracking-tight flex items-center gap-2">
                    Conectar Bot do Telegram
                    {isTelegramConnected && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Ativo & Conectado
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Insira o token gerado pelo <strong>@BotFather</strong> para autorizar o bot a enviar mensagens em seus canais.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isTelegramConnected && (
                  <button
                    onClick={() => setShowAddAnotherBot(!showAddAnotherBot)}
                    className="px-3.5 py-2 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-white border border-[#2e313c] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#29b6f6]" />
                    <span>Adicionar Outro Bot</span>
                  </button>
                )}

                {isTelegramConnected && (
                  <button
                    onClick={handleDisconnectTelegram}
                    className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition cursor-pointer"
                  >
                    Desconectar Bot
                  </button>
                )}
              </div>
            </div>

            {/* Telegram Notice feedback */}
            {telegramNotice && (
              <div
                className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
                  telegramNotice.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : telegramNotice.type === 'error'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {telegramNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{telegramNotice.text}</span>
                </div>
                <button
                  onClick={() => setTelegramNotice(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Connected Bot Card Details (Matching user's Image 1) */}
            {isTelegramConnected && telegramConfig.botInfo && (
              <div className="p-4 rounded-xl bg-[#0088cc]/10 border border-[#0088cc]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0088cc] text-white flex items-center justify-center font-bold text-sm shadow-md">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                      {telegramConfig.botInfo.first_name}
                      <span className="text-xs text-[#29b6f6] font-mono">
                        @{telegramConfig.botInfo.username}
                      </span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      ID: <strong className="text-neutral-200">{telegramConfig.botInfo.id}</strong> • Bot Oficial Conectado
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    API Telegram Operacional
                  </span>
                </div>
              </div>
            )}

            {/* Direct Notice pointing to Grupos tab for channel management */}
            <div className="p-4 rounded-2xl bg-[#0e1620] border border-[#0088cc]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-[#29b6f6]" />
                  <span>Cadastrar Canais e Grupos de Envio do Telegram</span>
                </p>
                <p className="text-neutral-400 text-[11px]">
                  Os canais e grupos de destino agora são cadastrados na aba <strong>Grupos</strong> na seção <strong>GRUPOS / CANAIS TELEGRAM</strong>.
                </p>
              </div>

              <button
                onClick={onNavigateToGrupos}
                className="px-4 py-2 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-[#0088cc]/20"
              >
                <span>Ir para Grupos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Form to Connect BotFather Token - ONLY TOKEN, CHAT ID REMOVED */}
            {(!isTelegramConnected || showAddAnotherBot) && (
              <form onSubmit={handleConnectTelegram} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#29b6f6]" />
                    Token do Bot (@BotFather) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Ex: 7192837461:AAF_abcdefghijklmnopqrstuvwxyz123"
                    value={telegramTokenInput}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl bg-[#18191d] border border-[#282a32] text-white text-xs font-mono focus:border-[#0088cc] focus:outline-hidden transition"
                  />
                  <p className="text-[11px] text-neutral-500">
                    Cole o token HTTP API gerado pelo @BotFather no Telegram. Não é necessário digitar Chat ID aqui.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  {showAddAnotherBot && (
                    <button
                      type="button"
                      onClick={() => setShowAddAnotherBot(false)}
                      className="px-4 py-2.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isConnectingTelegram || !telegramTokenInput.trim()}
                    className="px-6 py-2.5 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white text-xs font-extrabold shadow-lg shadow-[#0088cc]/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingTelegram ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Validando com BotFather...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>{isTelegramConnected ? 'Conectar Outro Bot' : 'Validar & Conectar Telegram'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* List of Connected Telegram Bots (supports multiple bots) */}
            {allConnectedBots.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-[#202228]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#29b6f6]" />
                    <span>Seus Bots Conectados ({allConnectedBots.length})</span>
                  </h4>
                  {!showAddAnotherBot && (
                    <button
                      onClick={() => setShowAddAnotherBot(true)}
                      className="text-xs text-[#29b6f6] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Conectar Outro Bot</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allConnectedBots.map((bot) => {
                    const isActive = telegramConfig.botInfo?.id === bot.botInfo?.id || telegramConfig.activeBotId === bot.id;

                    return (
                      <div
                        key={bot.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition gap-3 ${
                          isActive
                            ? 'bg-[#0088cc]/15 border-[#0088cc]/50 text-white shadow-md'
                            : 'bg-[#18191d] border-[#262832] text-neutral-300 hover:border-[#383a48]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive ? 'bg-[#0088cc] text-white' : 'bg-[#22242c] text-neutral-400'
                          }`}>
                            <Bot className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <p className="font-extrabold truncate text-white leading-tight">
                              {bot.botInfo?.first_name || 'Bot Telegram'}
                            </p>
                            <p className="text-[11px] text-[#29b6f6] font-mono truncate">
                              @{bot.botInfo?.username}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isActive ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30">
                              Ativo
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSetActiveBot(bot.id)}
                              className="px-2.5 py-1 rounded-lg bg-[#22242c] hover:bg-[#0088cc]/20 hover:text-[#29b6f6] text-neutral-300 text-[11px] font-bold transition border border-[#2e313c] cursor-pointer"
                            >
                              Ativar
                            </button>
                          )}

                          <button
                            onClick={() => handleDisconnectSpecificBot(bot.id)}
                            title="Remover este bot"
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step-by-Step Guide for BotFather */}
          <div className="p-6 rounded-2xl bg-[#0f1114] border border-[#22242a] space-y-4">
            <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#29b6f6]" />
              Como criar seu Bot no Telegram via @BotFather em 1 minuto
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#141517] border border-[#22242a] space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0088cc]/20 text-[#29b6f6] font-black flex items-center justify-center text-xs">
                  1
                </div>
                <h5 className="font-bold text-white">Abra o @BotFather</h5>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Pesquise por <strong>@BotFather</strong> no Telegram e inicie a conversa clicando em <strong>Start</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141517] border border-[#22242a] space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0088cc]/20 text-[#29b6f6] font-black flex items-center justify-center text-xs">
                  2
                </div>
                <h5 className="font-bold text-white">Envie /newbot</h5>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Digite <code>/newbot</code>, escolha um nome público e um usuário terminando em <strong>bot</strong> (ex: <code>AtacadoVIP_bot</code>).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141517] border border-[#22242a] space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0088cc]/20 text-[#29b6f6] font-black flex items-center justify-center text-xs">
                  3
                </div>
                <h5 className="font-bold text-white">Copie o Token</h5>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  O BotFather responderá com o <strong>HTTP API Token</strong>. Copie e cole no campo acima.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141517] border border-[#22242a] space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0088cc]/20 text-[#29b6f6] font-black flex items-center justify-center text-xs">
                  4
                </div>
                <h5 className="font-bold text-white">Adicione em Grupos</h5>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Vá na aba <strong>Grupos</strong> e cadastre os canais ou grupos onde você quer que o bot publique as ofertas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: LINKS & GRUPO VIP CONFIGURATION */}
      {/* ========================================================================= */}
      {activeSubTab === 'links' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-6">
            <div className="flex items-center gap-3 pb-5 border-b border-[#22242a]">
              <div className="w-12 h-12 rounded-2xl bg-[#FF5722]/10 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722] shrink-0">
                <LinkIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Link Oficial do Grupo VIP / Canal de Destino
                </h3>
                <p className="text-xs text-neutral-400">
                  Este é o link que substitui os links de grupos concorrentes em todas as mensagens clonadas e enviadas.
                </p>
              </div>
            </div>

            {linkSavedNotice && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{linkSavedNotice}</span>
              </div>
            )}

            <div className="space-y-4 max-w-2xl">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300">
                  Link de Convite (WhatsApp / Telegram / Linktree)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={localVipLink}
                    onChange={(e) => setLocalVipLink(e.target.value)}
                    placeholder="https://chat.whatsapp.com/... ou https://t.me/..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#18191d] border border-[#282a32] text-white text-xs font-mono focus:border-[#FF5722] focus:outline-hidden transition"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-2.5 rounded-xl bg-[#1f2026] hover:bg-[#282a32] text-neutral-300 hover:text-white border border-[#2e313c] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCopiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopiedLink ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Exemplo: <code>https://chat.whatsapp.com/GXYZ1234567890</code> ou <code>https://t.me/meucanalvip</code>
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveVipLink}
                  disabled={isSavingLink}
                  className="px-6 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingLink ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Salvar Link Oficial</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setLocalVipLink(DEFAULT_VIP_GROUP_LINK);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#18191d] hover:bg-[#22242a] text-neutral-400 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Restaurar Padrão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
