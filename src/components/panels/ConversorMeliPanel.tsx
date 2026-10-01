import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Link2,
  Check,
  Copy,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  RotateCcw,
  Plus,
  Trash2,
  ShoppingBag,
  Send,
  Loader2,
  Info,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Terminal,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCheck,
} from 'lucide-react';

interface PendingOffer {
  id: string;
  timestamp: string;
  sourceGroupName: string;
  targetGroupName: string;
  targetJid: string;
  rawCaption: string;
  imageBufferBase64?: string;
  mlbId: string;
  pureProductUrl: string;
  targetInviteLink: string;
  productTitle?: string;
  status: 'pending' | 'converted' | 'cancelled';
}

interface ConversionLogItem {
  id: string;
  timestamp: string;
  epoch: number;
  durationMs: number;
  inputType: 'single_url' | 'deal_message' | 'manual_approval';
  input: string;
  httpStatus: number;
  overallStatus: 'CONVERTED_MELI_LA' | 'PENDING_CATALOG_MAPPING' | 'CONVERTED_OTHER_MARKETPLACE' | 'ERROR';
  mlbCode?: string;
  originalUrl?: string;
  pureProductUrl?: string;
  monetizedUrl?: string;
  isOfficialMeliShort: boolean;
  methodUsed?: string;
  trackingIdUsed?: string;
  errorMessage?: string;
  steps: {
    step1_expansion?: { status: string; detail?: string; value?: string; durationMs?: number };
    step2_cleaning?: { status: string; detail?: string; value?: string };
    step3_monetization?: { status: string; detail?: string; value?: string };
  };
  rawApiResponse?: Record<string, any>;
}

export const ConversorMeliPanel: React.FC = () => {
  const [inputUrl, setInputUrl] = useState('https://meli.la/2rycBD7');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [conversionError, setConversionError] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Mapped links
  const [customLinks, setCustomLinks] = useState<Record<string, string>>({
    MLB53228347: 'https://meli.la/1njPhaS',
    MLB5237833724: 'https://meli.la/2dcm9f7',
  });

  // Pending queue
  const [pendingQueue, setPendingQueue] = useState<PendingOffer[]>([]);
  const [pendingInputs, setPendingInputs] = useState<Record<string, string>>({});
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Conversion API Audit Logs
  const [conversionLogs, setConversionLogs] = useState<ConversionLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'pending' | 'error'>('all');
  const [showRawResultJson, setShowRawResultJson] = useState(false);

  // Quick register for unmapped MLB right inside conversion result
  const [quickMeliUrl, setQuickMeliUrl] = useState('');
  const [isQuickSaving, setIsQuickSaving] = useState(false);

  // New link form
  const [newMlb, setNewMlb] = useState('');
  const [newMeliUrl, setNewMeliUrl] = useState('');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchMeliStatus();
    fetchPendingQueue();
    fetchConversionLogs();

    // Poll pending queue and logs every 6 seconds
    const interval = setInterval(() => {
      fetchPendingQueue();
      fetchConversionLogs();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const fetchMeliStatus = async () => {
    try {
      const res = await fetch('/api/meli/status');
      const data = await res.json();
      if (data.success && data.mercadoLivre?.customMeliLinks) {
        setCustomLinks(data.mercadoLivre.customMeliLinks);
      }
    } catch (e) {
      console.error('Erro ao buscar status Meli:', e);
    }
  };

  const fetchPendingQueue = async () => {
    try {
      const res = await fetch('/api/meli/pending');
      const data = await res.json();
      if (data.success && Array.isArray(data.pending)) {
        setPendingQueue(data.pending);
      }
    } catch (e) {
      console.error('Erro ao buscar fila pendente:', e);
    }
  };

  const fetchConversionLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const res = await fetch('/api/meli/logs?limit=40');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setConversionLogs(data.logs);
      }
    } catch (e) {
      console.error('Erro ao buscar logs de conversão:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/meli/logs', { method: 'DELETE' });
      setConversionLogs([]);
      setFeedbackMsg({ type: 'success', text: 'Logs de auditoria da API limpos com sucesso.' });
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao limpar logs.' });
    }
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleConvert = async () => {
    if (!inputUrl.trim()) return;
    setIsConverting(true);
    setConversionResult(null);
    setConversionError(null);
    setQuickMeliUrl('');

    try {
      const res = await fetch('/api/meli/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setConversionResult(data);
      } else {
        setConversionError(data);
        setFeedbackMsg({
          type: 'error',
          text: data.error || 'Falha na resposta da API de conversão.',
        });
      }
      // Refresh logs immediately so the new request appears
      fetchConversionLogs();
    } catch (err: any) {
      const errPayload = { error: err?.message || 'Falha na comunicação de rede com o servidor.' };
      setConversionError(errPayload);
      setFeedbackMsg({ type: 'error', text: 'Erro ao se comunicar com o servidor.' });
    } finally {
      setIsConverting(false);
    }
  };

  const handleQuickRegisterAndComplete = async () => {
    if (!conversionResult?.mlbCode || !quickMeliUrl.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Informe seu link meli.la gerado no Hub.' });
      return;
    }

    const cleanUrl = quickMeliUrl.trim();
    if (!cleanUrl.includes('meli.la') && !cleanUrl.includes('mercadolivre.com.br')) {
      setFeedbackMsg({ type: 'error', text: 'O link deve ser um link oficial meli.la do Mercado Livre.' });
      return;
    }

    setIsQuickSaving(true);
    try {
      const res = await fetch('/api/meli/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mlbId: conversionResult.mlbCode,
          meliUrl: cleanUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomLinks(data.customMeliLinks);
        // Update current conversion result state
        setConversionResult((prev: any) => ({
          ...prev,
          isOfficialMeliShort: true,
          step3_monetized: cleanUrl,
          monetizedUrl: cleanUrl,
          methodUsed: 'Link Oficial meli.la do Usuário (Recém Cadastrado)',
          status: 'CONVERTED_MELI_LA',
        }));
        setQuickMeliUrl('');
        setFeedbackMsg({
          type: 'success',
          text: `Produto ${conversionResult.mlbCode} cadastrado para ${cleanUrl}! Conversão oficial concluída.`,
        });
        fetchConversionLogs();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Erro ao salvar link.' });
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao conectar ao servidor.' });
    } finally {
      setIsQuickSaving(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleApprovePending = async (item: PendingOffer) => {
    const enteredMeliUrl = (pendingInputs[item.id] || '').trim();
    if (!enteredMeliUrl) {
      setFeedbackMsg({
        type: 'error',
        text: 'Insira o seu link oficial meli.la gerado no Hub antes de aprovar!',
      });
      return;
    }

    if (!enteredMeliUrl.includes('meli.la') && !enteredMeliUrl.includes('mercadolivre.com.br')) {
      setFeedbackMsg({
        type: 'error',
        text: 'O link deve ser um link oficial meli.la do Mercado Livre.',
      });
      return;
    }

    setApprovingId(item.id);
    try {
      const res = await fetch('/api/meli/approve-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          meliUrl: enteredMeliUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({
          type: 'success',
          text: `Oferta (${item.mlbId}) convertida para ${enteredMeliUrl} e disparada com sucesso ao WhatsApp!`,
        });
        await fetchMeliStatus();
        await fetchPendingQueue();
        await fetchConversionLogs();
      } else {
        setFeedbackMsg({ type: 'error', text: data.message || 'Falha ao aprovar oferta.' });
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao disparar oferta.' });
    } finally {
      setApprovingId(null);
      setTimeout(() => setFeedbackMsg(null), 6000);
    }
  };

  const handleDismissPending = async (id: string) => {
    try {
      await fetch(`/api/meli/pending/${id}`, { method: 'DELETE' });
      setPendingQueue(prev => prev.filter(i => i.id !== id));
      setFeedbackMsg({ type: 'success', text: 'Oferta descartada da fila.' });
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao descartar oferta.' });
    }
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMlb.trim() || !newMeliUrl.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Preencha o código MLB e o link oficial meli.la' });
      return;
    }

    let cleanMlb = newMlb.trim().toUpperCase();
    if (!cleanMlb.startsWith('MLB')) {
      cleanMlb = `MLB${cleanMlb}`;
    }

    const cleanUrl = newMeliUrl.trim();
    if (!cleanUrl.includes('meli.la') && !cleanUrl.includes('mercadolivre.com.br')) {
      setFeedbackMsg({ type: 'error', text: 'O link deve ser um link oficial meli.la ou Mercado Livre' });
      return;
    }

    setIsSavingLink(true);
    try {
      const res = await fetch('/api/meli/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mlbId: cleanMlb, meliUrl: cleanUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomLinks(data.customMeliLinks);
        setNewMlb('');
        setNewMeliUrl('');
        setFeedbackMsg({ type: 'success', text: `Link oficial cadastrado para ${cleanMlb}!` });
        fetchConversionLogs();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Erro ao salvar' });
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao conectar ao servidor' });
    } finally {
      setIsSavingLink(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleDeleteLink = async (mlbId: string) => {
    try {
      const res = await fetch(`/api/meli/links/${mlbId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCustomLinks(data.customMeliLinks);
        setFeedbackMsg({ type: 'success', text: `Mapeamento ${mlbId} removido.` });
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao excluir mapeamento.' });
    }
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const copyAndOpenHub = (pureProductUrl: string, fieldId: string) => {
    navigator.clipboard.writeText(pureProductUrl);
    setCopiedField(fieldId);
    window.open('https://www.mercadolivre.com.br/afiliados/linkbuilder#hub', '_blank');
    setTimeout(() => setCopiedField(null), 3000);
  };

  const filteredLogs = conversionLogs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'success') return log.overallStatus === 'CONVERTED_MELI_LA';
    if (logFilter === 'pending') return log.overallStatus === 'PENDING_CATALOG_MAPPING';
    if (logFilter === 'error') return log.overallStatus === 'ERROR' || log.httpStatus >= 400;
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Banner & Official Hub Links */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#18191d] via-[#1b1c22] to-[#26241a] border border-yellow-500/30 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-yellow-400 text-black shadow-md shadow-yellow-400/20">
                <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
              </span>
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  Conversor Mercado Livre
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    CONVERSÃO OBRIGATÓRIA & AUDITORIA ATIVA
                  </span>
                </h2>
                <p className="text-xs text-neutral-400">
                  Pipeline profissional de 3 etapas com monitoramento e auditoria em tempo real de cada chamada da API de conversão.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition shadow-lg shadow-yellow-400/20 cursor-pointer"
            >
              <span>Portal de Afiliados Oficial</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <a
              href="https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#22242a] hover:bg-[#2c2e36] text-neutral-200 hover:text-white font-medium text-xs border border-[#333640] transition cursor-pointer"
            >
              <span>Gerador LinkBuilder (meli.la)</span>
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
            </a>
          </div>
        </div>

        {/* Global Mandatory Rule Card */}
        <div className="p-3.5 rounded-xl bg-black/40 border border-yellow-500/20 flex items-start gap-3 text-xs text-neutral-300">
          <ShieldCheck className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-yellow-400">Garantia de Não-Quebra de Links:</span>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              O robô intercepta qualquer link de afiliado Mercado Livre e expande até o produto canônico.
              <strong> Concatenação manual de strings foi 100% desativada.</strong> Links convertidos usam estritamente o formato oficial <code className="text-yellow-300 font-mono">meli.la</code> para abertura nativa no aplicativo mobile.
            </p>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-neutral-400 hover:text-white ml-2">
            &times;
          </button>
        </div>
      )}

      {/* FILA DE CONVERSÃO OBRIGATÓRIA (MENSAGENS RETIDAS ANTES DO DISPARO) */}
      <div className="p-6 rounded-2xl bg-[#141517] border border-amber-500/30 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#22242a]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Clock className="w-4 h-4" />
              </span>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Fila de Conversão Obrigatória
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
                  {pendingQueue.length} {pendingQueue.length === 1 ? 'Oferta Retida' : 'Ofertas Retidas'}
                </span>
              </h3>
            </div>
            <p className="text-xs text-neutral-400">
              Ofertas capturadas dos concorrentes contendo produtos Mercado Livre que aguardam seu link meli.la oficial antes do envio aos grupos.
            </p>
          </div>

          <button
            onClick={fetchPendingQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2127] text-neutral-300 hover:text-white border border-[#2e313b] text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Atualizar Fila
          </button>
        </div>

        {pendingQueue.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#18191d] border border-[#22242a] text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Tudo em dia! Nenhuma oferta retida na fila.</h4>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              Todas as ofertas recentes do Mercado Livre foram convertidas com sucesso para seus links oficiais meli.la e disparadas nos grupos VIP.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingQueue.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-[#18191d] border border-amber-500/20 hover:border-amber-500/40 transition space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 font-mono font-bold text-xs border border-yellow-400/20">
                      {item.mlbId || 'MLB'}
                    </span>
                    <span className="font-bold text-white text-xs line-clamp-1">
                      {item.productTitle || 'Oferta Mercado Livre'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                    <span className="font-mono">{item.timestamp}</span>
                    <span>•</span>
                    <span className="text-neutral-300 font-medium">De: {item.sourceGroupName}</span>
                    <ArrowRight className="w-3 h-3 text-neutral-500" />
                    <span className="text-emerald-400 font-medium">Para: {item.targetGroupName}</span>
                  </div>
                </div>

                {/* Product URL & Hub Launcher */}
                <div className="p-3 rounded-lg bg-[#121316] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                      URL Limpa do Produto (Pronta para Gerar no Hub):
                    </span>
                    <p className="font-mono text-neutral-300 truncate text-[11px]">
                      {item.pureProductUrl}
                    </p>
                  </div>

                  <button
                    onClick={() => copyAndOpenHub(item.pureProductUrl, `pending-${item.id}`)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition shadow-md shadow-yellow-400/10 cursor-pointer shrink-0"
                  >
                    {copiedField === `pending-${item.id}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        Copiado & Aberto!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Link & Abrir Hub
                      </>
                    )}
                  </button>
                </div>

                {/* Action input row */}
                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={pendingInputs[item.id] || ''}
                      onChange={(e) =>
                        setPendingInputs((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="Cole aqui o seu link meli.la gerado no Hub (ex: https://meli.la/...)"
                      className="w-full px-3.5 py-2.5 bg-[#101114] border border-[#2d3039] rounded-xl text-xs font-mono text-emerald-400 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprovePending(item)}
                      disabled={approvingId === item.id || !pendingInputs[item.id]?.trim()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      {approvingId === item.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Disparando...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Converter & Disparar no WhatsApp
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDismissPending(item.id)}
                      className="p-2.5 rounded-xl bg-[#1f2127] hover:bg-red-500/15 hover:text-red-400 text-neutral-400 transition cursor-pointer border border-[#2e313b]"
                      title="Descartar esta oferta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive 3-Stage Link Converter Simulator */}
      <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
          <div className="space-y-0.5">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Simulador do Pipeline de Conversão em 3 Etapas
            </h3>
            <p className="text-xs text-neutral-400">
              Cole qualquer link concorrente ou cópia inteira de mensagem para analisar o processo e inspecionar a resposta da API.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 font-medium">Exemplos:</span>
            <button
              onClick={() => {
                setInputUrl('https://meli.la/2rycBD7');
                setConversionResult(null);
                setConversionError(null);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1f2127] text-neutral-300 hover:text-white border border-[#2d3039] transition cursor-pointer"
            >
              Fone Havit (Mapeado)
            </button>
            <button
              onClick={() => {
                setInputUrl('https://meli.la/1pKTwSc');
                setConversionResult(null);
                setConversionError(null);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1f2127] text-neutral-300 hover:text-white border border-[#2d3039] transition cursor-pointer"
            >
              Monitor Gigabyte
            </button>
          </div>
        </div>

        {/* Input bar */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Cole a URL do concorrente (ex: https://meli.la/2rycBD7) ou texto completo..."
              className="w-full pl-10 pr-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50"
            />
          </div>

          <button
            onClick={handleConvert}
            disabled={isConverting || !inputUrl.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition shadow-lg shadow-yellow-400/20 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processando Conversão...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Testar Conversão
              </>
            )}
          </button>
        </div>

        {/* Real-time Loading Stepper */}
        {isConverting && (
          <div className="p-4 rounded-xl bg-[#18191d] border border-yellow-400/30 space-y-3 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold text-yellow-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Executando Pipeline de Conversão em Segundo Plano...
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-neutral-400">
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-black/30">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                1. Expandindo redirecionamentos...
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-black/30">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                2. Extraindo código MLB canônico...
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-black/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                3. Verificando catálogo oficial meli.la...
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {conversionError && !isConverting && (
          <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>STATUS: FALHA NA RESPOSTA DA API DE CONVERSÃO</span>
              </div>
              {conversionError.durationMs && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300">
                  {conversionError.durationMs}ms
                </span>
              )}
            </div>
            <p className="text-xs text-red-300 leading-relaxed font-mono">
              {conversionError.error || 'Erro desconhecido ao processar requisição.'}
            </p>
            {conversionError.logId && (
              <span className="text-[10px] text-neutral-500 font-mono">
                Log ID: {conversionError.logId}
              </span>
            )}
          </div>
        )}

        {/* Successful or Pending Conversion Result Breakdown */}
        {conversionResult && !isConverting && (
          <div className="pt-2 space-y-4 animate-in fade-in duration-200">
            {/* High-visibility Status Alert Banner */}
            {conversionResult.isOfficialMeliShort ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-300">
                        STATUS: CONVERTIDO COM SUCESSO (Link Oficial meli.la Ativo)
                      </span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                        100% PRONTO
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      O produto foi higienizado e conectado ao seu link encurtado oficial do Mercado Livre ({conversionResult.step3_monetized || conversionResult.monetizedUrl}).
                      Ele abre nativamente no aplicativo móvel e pontua comissão diretamente na sua conta.
                    </p>
                  </div>
                </div>

                {conversionResult.durationMs && (
                  <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 shrink-0">
                    {conversionResult.durationMs}ms
                  </span>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-300">
                          STATUS: PRODUTO IDENTIFICADO ({conversionResult.mlbCode}) — PENDENTE DE LINK meli.la
                        </span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold">
                          AGUARDANDO ENCURTAMENTO
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        O robô identificou o produto com sucesso e limpou todo o rastreamento do concorrente. Para que o disparo no WhatsApp seja liberado com Deep Linking no celular dos clientes, gere o link meli.la no Hub e salve abaixo.
                      </p>
                    </div>
                  </div>

                  {conversionResult.durationMs && (
                    <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 shrink-0">
                      {conversionResult.durationMs}ms
                    </span>
                  )}
                </div>

                {/* Quick Register form inside status card */}
                <div className="p-3 rounded-lg bg-black/40 border border-amber-500/20 flex flex-col sm:flex-row items-center gap-2">
                  <button
                    onClick={() =>
                      copyAndOpenHub(
                        conversionResult.step2_pureProduct || conversionResult.step1_expanded,
                        'quick-reg-copy'
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition cursor-pointer shrink-0"
                  >
                    {copiedField === 'quick-reg-copy' ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        Copiado & Aberto!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        1. Copiar URL & Abrir Hub
                      </>
                    )}
                  </button>

                  <input
                    type="text"
                    value={quickMeliUrl}
                    onChange={(e) => setQuickMeliUrl(e.target.value)}
                    placeholder="2. Cole o link meli.la gerado no Hub aqui..."
                    className="w-full px-3 py-2 bg-[#121316] border border-[#2d3039] rounded-lg text-xs font-mono text-emerald-400 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                  />

                  <button
                    onClick={handleQuickRegisterAndComplete}
                    disabled={isQuickSaving || !quickMeliUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isQuickSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    )}
                    3. Concluir Conversão
                  </button>
                </div>
              </div>
            )}

            {/* 3-Step Grid Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className="p-4 rounded-xl bg-[#18191d] border border-[#22242a] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">
                      1
                    </span>
                    Expandir Concorrente
                  </span>
                  <span className="text-[10px] text-blue-400 font-mono">Headless</span>
                </div>
                <p className="text-[11px] text-neutral-400 break-all font-mono line-clamp-3">
                  {conversionResult.step1_expanded || conversionResult.originalUrl || 'Link original'}
                </p>
                <div className="pt-2 text-[10px] text-neutral-500 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Redirecionamento descompactado
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-xl bg-[#18191d] border border-[#22242a] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px]">
                      2
                    </span>
                    Extrair Produto Puro
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono font-bold">
                    {conversionResult.mlbCode || 'MLB'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 break-all font-mono line-clamp-3">
                  {conversionResult.step2_pureProduct || 'URL limpa sem parâmetros'}
                </p>
                <div className="pt-2 text-[10px] text-neutral-500 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  100% livre de tracking do concorrente
                </div>
              </div>

              {/* Step 3 */}
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  conversionResult.isOfficialMeliShort
                    ? 'bg-[#1a1c18] border-emerald-500/30'
                    : 'bg-[#1c1a18] border-amber-500/30'
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-bold ${
                    conversionResult.isOfficialMeliShort ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        conversionResult.isOfficialMeliShort
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      3
                    </span>
                    {conversionResult.isOfficialMeliShort ? 'Link Afiliado Oficial' : 'Pendente de meli.la'}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-bold uppercase ${
                      conversionResult.isOfficialMeliShort
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {conversionResult.isOfficialMeliShort ? 'Pronto' : 'Pendente'}
                  </span>
                </div>
                <p
                  className={`text-[11px] break-all font-mono font-bold line-clamp-2 ${
                    conversionResult.isOfficialMeliShort ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {conversionResult.step3_monetized || conversionResult.monetizedUrl}
                </p>
                <div
                  className={`pt-2 text-[10px] flex items-center gap-1 ${
                    conversionResult.isOfficialMeliShort ? 'text-emerald-400/80' : 'text-amber-400/80'
                  }`}
                >
                  {conversionResult.isOfficialMeliShort ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                      Link Oficial meli.la do Usuário
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Aguardando cadastro no catálogo
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-3.5 rounded-xl bg-[#101114] border border-[#22242a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-neutral-400 shrink-0 font-medium">Link do Produto:</span>
                <span className="font-mono text-emerald-400 font-bold truncate">
                  {conversionResult.step3_monetized || conversionResult.monetizedUrl}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    copyToClipboard(
                      conversionResult.step3_monetized || conversionResult.monetizedUrl,
                      'convertedLink'
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2127] hover:bg-[#292c34] text-white text-xs font-semibold border border-[#31343f] transition cursor-pointer"
                >
                  {copiedField === 'convertedLink' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                  {copiedField === 'convertedLink' ? 'Copiado!' : 'Copiar Link'}
                </button>

                <a
                  href={conversionResult.step3_monetized || conversionResult.monetizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 text-xs font-bold border border-yellow-400/30 transition cursor-pointer"
                >
                  <span>Abrir Produto</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => setShowRawResultJson((prev) => !prev)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#18191d] hover:bg-[#22242a] text-neutral-300 text-xs font-mono border border-[#2d3039] transition cursor-pointer"
                  title="Inspecionar JSON da resposta da API"
                >
                  <Terminal className="w-3 h-3 text-yellow-400" />
                  <span>{showRawResultJson ? 'Ocultar JSON' : 'Ver JSON'}</span>
                </button>
              </div>
            </div>

            {/* Collapsible Raw API Response Inspector */}
            {showRawResultJson && (
              <div className="p-4 rounded-xl bg-black/80 border border-[#2d3039] space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-[#22242a]">
                  <span className="font-mono text-[11px] text-yellow-400 font-bold flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Resposta HTTP 200 da API (/api/meli/convert)
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(JSON.stringify(conversionResult, null, 2), 'raw-json')
                    }
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                  >
                    {copiedField === 'raw-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedField === 'raw-json' ? 'Copiado!' : 'Copiar Payload'}
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-emerald-400/90 overflow-x-auto p-2 bg-[#0c0d10] rounded-lg max-h-60">
                  {JSON.stringify(conversionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAINEL DE AUDITORIA & LOGS DA API DE CONVERSÃO */}
      <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#22242a]">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Logs de Auditoria da API de Conversão
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#1f2127] text-neutral-300 border border-[#2d3039]">
                {conversionLogs.length} requisições registradas
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Captura em tempo real da resposta HTTP, latência e diagnóstico de cada tentativa de conversão de links de afiliados.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Filters */}
            <div className="flex items-center rounded-lg bg-[#18191d] p-0.5 border border-[#2a2d36] text-[11px]">
              <button
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-md transition ${
                  logFilter === 'all' ? 'bg-[#292c36] text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setLogFilter('success')}
                className={`px-2.5 py-1 rounded-md transition ${
                  logFilter === 'success' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Oficiais
              </button>
              <button
                onClick={() => setLogFilter('pending')}
                className={`px-2.5 py-1 rounded-md transition ${
                  logFilter === 'pending' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Pendentes
              </button>
              <button
                onClick={() => setLogFilter('error')}
                className={`px-2.5 py-1 rounded-md transition ${
                  logFilter === 'error' ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Erros
              </button>
            </div>

            <button
              onClick={fetchConversionLogs}
              disabled={isLoadingLogs}
              className="p-1.5 rounded-lg bg-[#1f2127] text-neutral-300 hover:text-white border border-[#2e313b] transition cursor-pointer"
              title="Atualizar Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleClearLogs}
              className="p-1.5 rounded-lg bg-[#1f2127] hover:bg-red-500/10 text-neutral-400 hover:text-red-400 border border-[#2e313b] transition cursor-pointer"
              title="Limpar Histórico de Logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#18191d] border border-[#22242a] text-center text-xs text-neutral-400">
            Nenhum registro de log encontrado para o filtro selecionado. Faça um teste de conversão acima!
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const isSuccess = log.overallStatus === 'CONVERTED_MELI_LA';
              const isPending = log.overallStatus === 'PENDING_CATALOG_MAPPING';
              const isError = log.overallStatus === 'ERROR' || log.httpStatus >= 400;

              return (
                <div
                  key={log.id}
                  className={`rounded-xl border transition overflow-hidden ${
                    isSuccess
                      ? 'bg-[#161819] border-emerald-500/20 hover:border-emerald-500/40'
                      : isPending
                      ? 'bg-[#181816] border-amber-500/20 hover:border-amber-500/40'
                      : 'bg-[#1a1616] border-red-500/20 hover:border-red-500/40'
                  }`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase shrink-0 ${
                          isSuccess
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isPending
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {isSuccess ? 'MELI.LA OFICIAL' : isPending ? 'PENDENTE MELI' : 'ERRO'}
                      </span>

                      <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                        {log.timestamp}
                      </span>

                      {log.durationMs !== undefined && (
                        <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                          {log.durationMs}ms
                        </span>
                      )}

                      <div className="text-xs font-mono text-neutral-200 truncate max-w-sm">
                        {log.input}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {log.mlbCode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-yellow-400 font-mono font-bold">
                          {log.mlbCode}
                        </span>
                      )}

                      <span
                        className={`text-[11px] font-mono font-bold truncate max-w-[180px] ${
                          isSuccess ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {log.monetizedUrl || log.errorMessage || 'Processado'}
                      </span>

                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Audit Log Details */}
                  {isExpanded && (
                    <div className="p-4 bg-black/60 border-t border-[#22242a] space-y-3 animate-in fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-[#121316] border border-[#22242a] space-y-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-400">
                            1. Resolução Headless:
                          </span>
                          <p className="font-mono text-neutral-300 text-[11px] break-all">
                            {log.steps?.step1_expansion?.value || log.originalUrl || 'N/D'}
                          </p>
                          <span className="text-[10px] text-emerald-400">
                            {log.steps?.step1_expansion?.detail || 'OK'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[#121316] border border-[#22242a] space-y-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-400">
                            2. Higienização & MLB:
                          </span>
                          <p className="font-mono text-neutral-300 text-[11px] break-all">
                            {log.pureProductUrl || log.steps?.step2_cleaning?.value || 'N/D'}
                          </p>
                          <span className="text-[10px] text-purple-400">
                            Código: {log.mlbCode || 'Identificado'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[#121316] border border-[#22242a] space-y-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-400">
                            3. Monetização & Tag:
                          </span>
                          <p className="font-mono text-emerald-400 text-[11px] break-all font-bold">
                            {log.monetizedUrl || 'Pendente de link encurtado'}
                          </p>
                          <span className="text-[10px] text-neutral-400">
                            {log.methodUsed || 'Status verificado'}
                          </span>
                        </div>
                      </div>

                      {/* Raw JSON Payload */}
                      {log.rawApiResponse && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-neutral-400">
                            <span className="font-mono">Payload HTTP JSON da Resposta:</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(JSON.stringify(log.rawApiResponse, null, 2), `log-${log.id}`);
                              }}
                              className="text-neutral-400 hover:text-white flex items-center gap-1"
                            >
                              {copiedField === `log-${log.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              {copiedField === `log-${log.id}` ? 'Copiado!' : 'Copiar JSON'}
                            </button>
                          </div>
                          <pre className="p-2 rounded-lg bg-[#0e0f12] text-[10px] font-mono text-neutral-300 overflow-x-auto max-h-40 border border-[#22242a]">
                            {JSON.stringify(log.rawApiResponse, null, 2)}
                          </pre>
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

      {/* Mapeador de Links Oficiais meli.la */}
      <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#22242a]">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
              Catálogo de Links Oficiais Cadastrados (meli.la)
            </h3>
            <p className="text-xs text-neutral-400">
              Produtos cadastrados abaixo são convertidos instantaneamente para o seu link meli.la sem precisar de aprovação manual.
            </p>
          </div>

          <a
            href="https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2127] hover:bg-[#282a32] text-yellow-400 border border-yellow-400/30 text-xs font-bold transition cursor-pointer self-start sm:self-auto"
          >
            <span>Gerar Link no Mercado Livre</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Add Link Form */}
        <form onSubmit={handleAddLink} className="p-4 rounded-xl bg-[#18191d] border border-[#22242a] space-y-3">
          <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-yellow-400" />
            Cadastrar Novo Link Oficial meli.la
          </span>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-neutral-400">
                Código MLB do Produto ou URL:
              </label>
              <input
                type="text"
                value={newMlb}
                onChange={(e) => setNewMlb(e.target.value)}
                placeholder="Ex: MLB53228347"
                className="w-full px-3 py-2 bg-[#121316] border border-[#272930] rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-neutral-400">
                Seu Link Oficial meli.la Gerado no Hub:
              </label>
              <input
                type="text"
                value={newMeliUrl}
                onChange={(e) => setNewMeliUrl(e.target.value)}
                placeholder="https://meli.la/..."
                className="w-full px-3 py-2 bg-[#121316] border border-[#272930] rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSavingLink || !newMlb.trim() || !newMeliUrl.trim()}
                className="w-full py-2 px-4 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSavingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Salvar Link
              </button>
            </div>
          </div>
        </form>

        {/* Links Table */}
        <div className="space-y-2">
          {Object.entries(customLinks).map(([mlb, url]) => (
            <div
              key={mlb}
              className="p-3.5 rounded-xl bg-[#18191d] border border-[#22242a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-[#30333d] transition"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md bg-yellow-400/10 text-yellow-400 font-mono font-bold border border-yellow-400/20 text-xs">
                  {mlb}
                </span>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold">{url}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                      Ativo
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-400">
                    Substituição automática em mensagens monitoradas
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => copyToClipboard(url, `link-${mlb}`)}
                  className="p-1.5 rounded-lg bg-[#202228] hover:bg-[#2a2d36] text-neutral-300 transition cursor-pointer"
                  title="Copiar Link"
                >
                  {copiedField === `link-${mlb}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-[#202228] hover:bg-[#2a2d36] text-neutral-300 transition cursor-pointer"
                  title="Abrir no Mercado Livre"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => handleDeleteLink(mlb)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                  title="Remover Mapeamento"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
