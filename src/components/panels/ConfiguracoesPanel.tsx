import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Smartphone,
  Trash2,
  Plus,
  RefreshCw,
  FolderCode,
  RotateCcw,
  Check,
  Send,
  Bot,
  Wifi,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { WhatsAppInstance } from '../../types/index.ts';
import {
  OFFICIAL_USER_AFFILIATE_ID,
  OFFICIAL_SOURCE,
  DEFAULT_VIP_GROUP_LINK,
} from '../../utils/affiliateEngine.ts';

interface ConfiguracoesPanelProps {
  toolId: string;
  source: string;
  vipGroupLink: string;
  onUpdateParams: (toolId: string, source: string, vipLink: string) => void;
  instances: WhatsAppInstance[];
  onAddInstance: () => void;
  onDeleteInstance: (id: string) => void;
  onUpdateInstance: (id: string, updates: Partial<WhatsAppInstance>) => void;
}

export const ConfiguracoesPanel: React.FC<ConfiguracoesPanelProps> = ({
  toolId,
  source,
  vipGroupLink,
  onUpdateParams,
  instances,
  onAddInstance,
  onDeleteInstance,
  onUpdateInstance,
}) => {
  const [localToolId, setLocalToolId] = useState(toolId);
  const [localSource, setLocalSource] = useState(source);
  const [localVipLink, setLocalVipLink] = useState(vipGroupLink);
  const [telegramToken, setTelegramToken] = useState('7192837461:AAF-bot-token-exemplo');
  const [telegramChatId, setTelegramChatId] = useState('@bot_vip_ofertas_oficial');
  const [isTelegramConnected, setIsTelegramConnected] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  // Active generating instance id
  const [loadingInstanceId, setLoadingInstanceId] = useState<string | null>(null);

  // Poll server for live WhatsApp connection
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          // Find any instance currently in 'conectando'
          const connectingInst = instances.find((i) => i.status === 'conectando');

          if (data.isConnected && connectingInst) {
            onUpdateInstance(connectingInst.id, {
              status: 'conectada',
              phoneNumber: data.phoneNumber || '+55 11 98888-5887',
              qrCodeDataUrl: undefined,
            });
            return;
          }

          if (data.qrDataUrl && connectingInst && !connectingInst.qrCodeDataUrl) {
            onUpdateInstance(connectingInst.id, {
              qrCodeDataUrl: data.qrDataUrl,
            });
          }
        }
      } catch (e) {
        console.error('Falha ao checar status do WhatsApp:', e);
      }
    };

    const interval = setInterval(checkServerStatus, 3000);
    return () => clearInterval(interval);
  }, [instances, onUpdateInstance]);

  const handleConnectInstance = async (inst: WhatsAppInstance) => {
    setLoadingInstanceId(inst.id);

    onUpdateInstance(inst.id, {
      status: 'conectando',
      qrCodeDataUrl: undefined,
    });

    try {
      // Trigger QR generation from WhatsApp servers
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

      // If server is still in handshake, poll up to 10 times (1s interval)
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        try {
          const pollRes = await fetch('/api/whatsapp/status');
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.qrDataUrl) {
              onUpdateInstance(inst.id, {
                qrCodeDataUrl: pollData.qrDataUrl,
                status: 'conectando',
              });
              clearInterval(pollTimer);
              setLoadingInstanceId(null);
            }
          }
        } catch {
          // ignore transient poll error
        }
        if (attempts >= 10) {
          clearInterval(pollTimer);
          setLoadingInstanceId(null);
        }
      }, 1000);
    } catch (e) {
      console.error('Erro ao conectar ao WhatsApp:', e);
      setLoadingInstanceId(null);
    }
  };

  const handleDisconnectInstance = (inst: WhatsAppInstance) => {
    onUpdateInstance(inst.id, {
      status: 'desconectada',
      qrCodeDataUrl: undefined,
      phoneNumber: undefined,
    });
  };

  const handleSave = () => {
    onUpdateParams(localToolId.trim(), localSource.trim(), localVipLink.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleResetDefaults = () => {
    setLocalToolId(OFFICIAL_USER_AFFILIATE_ID);
    setLocalSource(OFFICIAL_SOURCE);
    setLocalVipLink(DEFAULT_VIP_GROUP_LINK);
  };

  return (
    <div className="space-y-6">
      {/* Title & Path Info */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            Configurações de Conexão & Afiliado
          </h2>
          <p className="text-xs text-neutral-400">
            Gerencie suas instâncias de WhatsApp e parametrização oficial de rastreamento.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#18191d] border border-[#26282e] text-xs font-mono text-neutral-300">
          <FolderCode className="w-4 h-4 text-[#FF5722]" />
          <span>Diretório: </span>
          <strong className="text-white">C:\ofertas_bot</strong>
        </div>
      </div>

      {/* Section: Números de WhatsApp (Matching User Example Image) */}
      <div className="space-y-4">
        {/* Header Bar matching image 3 */}
        <div className="p-4 rounded-2xl bg-[#141517] border border-[#22242a] flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white tracking-tight">
                Números de WhatsApp
              </h3>
              <p className="text-xs text-neutral-400">
                Gerencie seus números para automações ({instances.length} cadastrada{instances.length === 1 ? '' : 's'})
              </p>
            </div>
          </div>

          <button
            onClick={onAddInstance}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-bold transition shadow-lg shadow-[#FF5722]/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nova Instância</span>
          </button>
        </div>

        {/* Grid of WhatsApp Instances matching user images 4 & 5 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instances.map((inst) => {
            const isDesconectada = inst.status === 'desconectada';
            const isConectando = inst.status === 'conectando';
            const isConectada = inst.status === 'conectada';

            return (
              <div
                key={inst.id}
                className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md flex flex-col justify-between space-y-4"
              >
                {/* Top Row: Icon + Title + Status Badge + Trash Can */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Circle Status Icon */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        isConectada
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isConectando
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-[#1b1c20] text-neutral-500 border border-[#26282e]'
                      }`}
                    >
                      {isConectada ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isConectando ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      ) : (
                        <Radio className="w-4 h-4" />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-white">{inst.name}</h4>
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isConectada
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isConectando
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-[#1e2025] text-neutral-400 border border-[#2a2c33]'
                        }`}
                      >
                        {isConectada
                          ? 'Conectada'
                          : isConectando
                          ? 'Conectando'
                          : 'Desconectada'}
                      </span>
                    </div>
                  </div>

                  {/* Red Trash Can Icon to Delete Number and Unlink Groups */}
                  <button
                    onClick={() => onDeleteInstance(inst.id)}
                    className="p-2 rounded-xl text-red-500 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                    title="Excluir número e desvincular grupos respectivos"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* State 1: Desconectada -> Large Button "Conectar Instância" (Matching Image 4) */}
                {isDesconectada && (
                  <div className="pt-3 border-t border-[#22242a]">
                    <button
                      onClick={() => handleConnectInstance(inst)}
                      disabled={loadingInstanceId === inst.id}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-emerald-500/40 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500 transition font-bold text-xs cursor-pointer shadow-xs"
                    >
                      <QrCode className="w-4 h-4 text-emerald-400" />
                      <span>
                        {loadingInstanceId === inst.id
                          ? 'Gerando Instância...'
                          : 'Conectar Instância'}
                      </span>
                    </button>
                  </div>
                )}

                {/* State 2: Conectando -> Dashed Box with QR Code (Matching Image 5) */}
                {isConectando && (
                  <div className="space-y-4">
                    {/* Dashed Border Box */}
                    <div className="border border-dashed border-[#2a2d36] rounded-2xl p-5 bg-[#0e0f11] flex flex-col items-center justify-center text-center space-y-3.5">
                      {/* High-Resolution Scan-Ready QR Code with Soft Green Glow */}
                      <div className="p-3 bg-white rounded-2xl shadow-xl shadow-emerald-500/10 ring-4 ring-emerald-500/15 relative">
                        {inst.qrCodeDataUrl ? (
                          <img
                            src={inst.qrCodeDataUrl}
                            alt="QR Code WhatsApp Web"
                            className="w-52 h-52 object-contain rounded-lg block"
                          />
                        ) : (
                          <div className="w-52 h-52 flex flex-col items-center justify-center gap-2 bg-neutral-100 rounded-lg">
                            <RefreshCw className="w-7 h-7 text-[#FF5722] animate-spin" />
                            <span className="text-[11px] text-neutral-600 font-medium">
                              Aguardando token do WhatsApp...
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Sub-Header: Aguardando leitura... */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                          <QrCode className="w-4 h-4 text-emerald-400" />
                          <span>Aguardando leitura...</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                          Abra o WhatsApp no seu celular, vá em{' '}
                          <strong className="text-neutral-200">Aparelhos Conectados</strong> e escaneie o código.
                        </p>
                      </div>
                    </div>

                    {/* Bottom Action Button */}
                    <div className="pt-2 border-t border-[#22242a] flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleConnectInstance(inst)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-emerald-500/40 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition font-bold text-xs cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Atualizar QR Code</span>
                      </button>

                      <button
                        onClick={() => handleDisconnectInstance(inst)}
                        className="py-2.5 px-3 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white transition text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* State 3: Conectada -> Shows Success & Option to Disconnect */}
                {isConectada && (
                  <div className="space-y-3 pt-2 border-t border-[#22242a]">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                      <span className="text-neutral-300">Número Conectado:</span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        {inst.phoneNumber || '+55 11 98888-5887'}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Disparos e automações ativas
                      </span>
                      <button
                        onClick={() => handleDisconnectInstance(inst)}
                        className="text-red-400 hover:underline font-semibold cursor-pointer"
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
      </div>

      {/* Mandatory Affiliate ID & VIP Link Configuration */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              Parâmetros Oficiais de Monetização & Grupo VIP
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30 font-bold">
                MANDATÓRIO
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Esses parâmetros são injetados automaticamente em todas as URLs processadas pelo robô.
            </p>
          </div>

          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition px-2 py-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão Oficial
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
              <span>ID de Afiliado (matt_tool_id):</span>
              <span className="text-[10px] text-[#FF5722] font-mono">Oficial</span>
            </label>
            <input
              type="text"
              value={localToolId}
              onChange={(e) => setLocalToolId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-[#FF5722] font-bold focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
              placeholder="sf20250625192813"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              Origem de Tráfego (matt_source):
            </label>
            <input
              type="text"
              value={localSource}
              onChange={(e) => setLocalSource(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
              placeholder="whatsapp"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              Link de Convite do Grupo VIP:
            </label>
            <input
              type="text"
              value={localVipLink}
              onChange={(e) => setLocalVipLink(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
              placeholder="https://chat.whatsapp.com/..."
            />
          </div>
        </div>

        {/* meli.la Mapping & Shortlink Hub */}
        <div className="pt-4 border-t border-[#22242a] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                Seus Links Encurtados Oficiais (meli.la)
              </span>
              <p className="text-[11px] text-neutral-400">
                Os links meli.la são gerados exclusivamente pelo Mercado Livre. Quando o robô detecta um produto com link seu cadastrado, substitui na hora.
              </p>
            </div>
            <a
              href="https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-yellow-400 hover:underline font-bold flex items-center gap-1"
            >
              Abrir Gerador do Mercado Livre &rarr;
            </a>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-[#101114] border border-[#22242a] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 font-bold border border-yellow-400/20">
                  MLB53228347
                </span>
                <span className="text-neutral-400 text-[11px]">Fone Havit Gamenote Fuxi-h6</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">https://meli.la/1njPhaS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans font-bold">
                  Ativo
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#101114] border border-[#22242a] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 font-bold border border-yellow-400/20">
                  MLB5237833724
                </span>
                <span className="text-neutral-400 text-[11px]">Vestido Infantil Skye Patrulha Canina</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">https://meli.la/2dcm9f7</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans font-bold">
                  Ativo
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#22242a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-neutral-300">Regra de Conversão Segura:</span>
            <p className="text-[11px] text-neutral-400 font-mono">
              Link Concorrente &rarr; Produto Original &rarr; Link Oficial meli.la do Usuário
            </p>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-bold transition shadow-lg shadow-[#FF5722]/20 cursor-pointer shrink-0"
          >
            {isSaved ? <Check className="w-4 h-4 stroke-[3]" /> : null}
            {isSaved ? 'Configurações Salvas!' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};
