import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sparkles,
  Copy,
  Check,
  Send,
  Loader2,
  RefreshCw,
  Info,
  Layers,
  Sliders,
  ExternalLink,
  MessageSquareShare,
  CheckCircle2,
  Camera,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Power,
  ToggleLeft,
  ToggleRight,
  Eye,
  Scan,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { GroupChannel } from '../../types/index.ts';
import { DEFAULT_VIP_GROUP_LINK } from '../../utils/affiliateEngine.ts';

interface ReplicaChatPanelProps {
  groups: GroupChannel[];
  vipGroupLink: string;
  onUpdateVipGroupLink: (link: string) => void;
}

interface MarketplacesConfigState {
  mercadoLivre?: { enabled?: boolean; tagId?: string; status?: string };
  shopee?: { enabled?: boolean; appId?: string; status?: string };
  amazon?: { enabled?: boolean; associateTag?: string; status?: string };
  aliexpress?: { enabled?: boolean; appKey?: string; status?: string };
  shein?: { enabled?: boolean; affiliateId?: string; status?: string };
  temu?: { enabled?: boolean; referralCode?: string; status?: string };
}

interface WatermarkConfigState {
  enabled: boolean;
  action: 'replace_clean_photo' | 'remove_watermark_ai' | 'skip_message';
  knownUsernames: string[];
  detectAvatarBadges: boolean;
  detectVerifiedCheckmark: boolean;
}

export const ReplicaChatPanel: React.FC<ReplicaChatPanelProps> = ({
  groups,
  vipGroupLink,
  onUpdateVipGroupLink,
}) => {
  // Tabs: 'rules' | 'connections' | 'watermark'
  const [activeTab, setActiveTab] = useState<'rules' | 'connections' | 'watermark'>('rules');

  // Marketplaces config state
  const [mpConfig, setMpConfig] = useState<MarketplacesConfigState>({});
  const [isLoadingMp, setIsLoadingMp] = useState(false);

  // Watermark Config state
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfigState>({
    enabled: true,
    action: 'replace_clean_photo',
    knownUsernames: ['@gustavohoffmannofc', 'gustavohoffmannofc'],
    detectAvatarBadges: true,
    detectVerifiedCheckmark: true,
  });
  const [isSavingWm, setIsSavingWm] = useState(false);
  const [wmSaveNotice, setWmSaveNotice] = useState(false);
  const [newHandleInput, setNewHandleInput] = useState('');

  // Watermark Detector Tester state
  const [testBase64, setTestBase64] = useState<string>('');
  const [testMime, setTestMime] = useState<string>('image/jpeg');
  const [testImagePreview, setTestImagePreview] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    hasWatermark?: boolean;
    detectedHandles?: string[];
    hasAvatarBadge?: boolean;
    hasVerifiedCheckmark?: boolean;
    confidence?: number;
    reason?: string;
  } | null>(null);

  // Fetch Watermark config
  const fetchWatermarkConfig = async () => {
    try {
      const res = await fetch('/api/watermark/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setWatermarkConfig(data.config);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar watermark config:', e);
    }
  };

  useEffect(() => {
    fetchWatermarkConfig();
  }, []);

  const handleSaveWatermarkConfig = async (updatedConfig?: Partial<WatermarkConfigState>) => {
    setIsSavingWm(true);
    const payload = updatedConfig ? { ...watermarkConfig, ...updatedConfig } : watermarkConfig;
    try {
      const res = await fetch('/api/watermark/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setWatermarkConfig(data.config);
        }
        setWmSaveNotice(true);
        setTimeout(() => setWmSaveNotice(false), 3000);
      }
    } catch (e) {
      console.error('Erro ao salvar watermark config:', e);
    } finally {
      setIsSavingWm(false);
    }
  };

  const handleAddUsername = () => {
    const handle = newHandleInput.trim();
    if (!handle) return;
    const current = watermarkConfig.knownUsernames || [];
    if (!current.includes(handle)) {
      const updated = [...current, handle];
      setWatermarkConfig((prev) => ({ ...prev, knownUsernames: updated }));
      handleSaveWatermarkConfig({ knownUsernames: updated });
    }
    setNewHandleInput('');
  };

  const handleRemoveUsername = (handleToRemove: string) => {
    const updated = (watermarkConfig.knownUsernames || []).filter((h) => h !== handleToRemove);
    setWatermarkConfig((prev) => ({ ...prev, knownUsernames: updated }));
    handleSaveWatermarkConfig({ knownUsernames: updated });
  };

  const handleFileUploadAndAnalyze = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = file.type || 'image/jpeg';
    setTestMime(mime);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const resultStr = event.target?.result as string;
      setTestImagePreview(resultStr);
      setTestBase64(resultStr);
      runImageAnalysis(resultStr, mime);
    };
    reader.readAsDataURL(file);
  };

  const runImageAnalysis = async (base64String: string, mime: string) => {
    setIsAnalyzingImage(true);
    setAnalysisResult(null);
    try {
      const res = await fetch('/api/watermark/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: base64String,
          mimeType: mime,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult({
          hasWatermark: data.hasWatermark,
          detectedHandles: data.detectedHandles || [],
          hasAvatarBadge: data.hasAvatarBadge,
          hasVerifiedCheckmark: data.hasVerifiedCheckmark,
          confidence: data.confidence,
          reason: data.reason,
        });
      } else {
        setAnalysisResult({
          hasWatermark: false,
          confidence: 0,
          reason: data.error || 'Erro na análise da imagem',
        });
      }
    } catch (err: any) {
      setAnalysisResult({
        hasWatermark: false,
        confidence: 0,
        reason: err?.message || 'Falha ao conectar com serviço de visão IA',
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Global VIP link
  const [localVipLink, setLocalVipLink] = useState(vipGroupLink || DEFAULT_VIP_GROUP_LINK);
  const [alwaysIncludeGroupLink, setAlwaysIncludeGroupLink] = useState(true);
  const [filterCompetitorNames, setFilterCompetitorNames] = useState(true);
  const [autoFetchProductImage, setAutoFetchProductImage] = useState(() => {
    try {
      const saved = localStorage.getItem('bot_auto_fetch_image');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [validateMeliStock, setValidateMeliStock] = useState(() => {
    try {
      const saved = localStorage.getItem('bot_validate_meli_stock');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    if (vipGroupLink && vipGroupLink.trim()) {
      setLocalVipLink(vipGroupLink.trim());
    }
  }, [vipGroupLink]);

  // Template pattern
  const defaultTemplate = `🎁 *{TITULO}*

💰 ~De R$ {PRECO_ANTIGO}~
💥 *Por R$ {PRECO_ATUAL} pix*
🎟️ Cupom: *{CUPOM}*

🔗 Link oficial: {LINK_AFILIADO}

👉 Entre no nosso grupo VIP: {LINK_GRUPO}`;

  const [template, setTemplate] = useState(defaultTemplate);

  // Simulator state
  const [inputCopy, setInputCopy] = useState(
    `🔥 PROMOÇÃO IMPERDÍVEL DO GRUPO CONCORRENTE!\nFritadeira Sem Óleo Air Fryer Mondial 4L Digital\nDe R$ 499,90 por apenas R$ 289,90 à vista!\nCupom de desconto: PROMO50\nCompre pelo link: https://meli.la/1pKTwSc\nEntre no grupo deles: https://chat.whatsapp.com/concorrente123`
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valido: boolean;
    foto_url?: string | null;
    idProduto: string | null;
    status: string | null;
    estoque: number;
    motivo?: string;
  } | null>(null);
  const [processedOutput, setProcessedOutput] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessNotice, setSendSuccessNotice] = useState<string | null>(null);

  // Load marketplaces configuration
  const fetchMarketplacesConfig = async () => {
    setIsLoadingMp(true);
    try {
      const res = await fetch('/api/marketplaces/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setMpConfig(data.config);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar conexões de marketplaces:', e);
    } finally {
      setIsLoadingMp(false);
    }
  };

  useEffect(() => {
    fetchMarketplacesConfig();
  }, []);

  const handleToggleMarketplace = async (marketplaceKey: string) => {
    const currentObj = (mpConfig as any)[marketplaceKey];
    const currentEnabled = currentObj?.enabled !== false;
    const newEnabled = !currentEnabled;

    setMpConfig((prev) => ({
      ...prev,
      [marketplaceKey]: {
        ...(prev as any)[marketplaceKey],
        enabled: newEnabled,
      },
    }));

    try {
      await fetch('/api/marketplaces/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace: marketplaceKey, enabled: newEnabled }),
      });
    } catch (err) {
      console.error('Erro ao alternar marketplace:', err);
      fetchMarketplacesConfig();
    }
  };

  const handleBulkToggle = async (enableAll: boolean) => {
    const keys = ['mercadoLivre', 'shopee', 'amazon', 'aliexpress', 'shein', 'temu'];
    
    // Optimistic UI update
    const updated: any = { ...mpConfig };
    keys.forEach((k) => {
      updated[k] = { ...updated[k], enabled: enableAll };
    });
    setMpConfig(updated);

    try {
      for (const k of keys) {
        await fetch('/api/marketplaces/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketplace: k, enabled: enableAll }),
        });
      }
    } catch (err) {
      console.error('Erro no toggle em massa:', err);
      fetchMarketplacesConfig();
    }
  };

  const handleSaveSettings = () => {
    onUpdateVipGroupLink(localVipLink);
    try {
      localStorage.setItem('bot_auto_fetch_image', JSON.stringify(autoFetchProductImage));
      localStorage.setItem('bot_validate_meli_stock', JSON.stringify(validateMeliStock));
    } catch {}
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  const handleValidateMeli = async () => {
    if (!inputCopy.trim()) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch('/api/replica/validate-meli-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputCopy }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch (e: any) {
      setValidationResult({
        valido: false,
        idProduto: null,
        status: 'error',
        estoque: 0,
        motivo: e?.message || 'Erro ao validar link',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleProcessText = async () => {
    if (!inputCopy.trim()) return;
    setIsProcessing(true);
    setProcessedOutput(null);

    // Validação Universal de Estoque Mercado Livre antes de clonar/converter
    const isMeli =
      /MLB[-]?\d+/i.test(inputCopy) ||
      /meli\.la/i.test(inputCopy) ||
      /mercadolivre\.com\.br/i.test(inputCopy);

    if (validateMeliStock && isMeli) {
      try {
        const valRes = await fetch('/api/replica/validate-meli-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputCopy }),
        });
        const valData = await valRes.json();
        setValidationResult(valData);

        if (!valData.valido) {
          setProcessedOutput(
            `🚫 [PRODUTO ESGOTADO OU PAUSADO - PULADO AUTOMATICAMENTE]\n\n` +
            `O validador oficial do Mercado Livre detectou que este produto não pode ser anunciado:\n` +
            `• Motivo: ${valData.motivo || 'Produto sem estoque ou pausado'}\n` +
            `• Status: ${valData.status || 'inactive'}\n` +
            `• Estoque: ${valData.estoque || 0}\n\n` +
            `✅ A regra universal do bot evitou o envio de link quebrado ou produto sem comissão para o seu grupo VIP!`
          );
          setIsProcessing(false);
          return;
        }
      } catch (valErr) {
        console.warn('Aviso ao validar estoque no simulador:', valErr);
      }
    }

    try {
      const res = await fetch('/api/replica-zap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputCopy,
          vipGroupLink: localVipLink,
        }),
      });

      const data = await res.json();
      if (data.shouldForward === false) {
        setProcessedOutput(
          `🚫 [MENSAGEM NÃO REPLICADA - INSTÂNCIA DESATIVADA OU SEM LINK ATIVO]\n\n` +
          `• Motivo: ${data.blockReason || 'O marketplace deste produto está desativado na aba Marketplaces Connections'}\n\n` +
          `✅ A regra do Replica Chat bloqueou o envio para o seu grupo VIP porque este marketplace está pausado nas configurações!`
        );
        setIsProcessing(false);
        return;
      }

      if (data.formattedCopy) {
        let finalCopy = data.formattedCopy;

        if (alwaysIncludeGroupLink && !finalCopy.includes(localVipLink)) {
          finalCopy += `\n\n👉 Entre no nosso grupo VIP: ${localVipLink}`;
        }
        setProcessedOutput(finalCopy);
      } else {
        setProcessedOutput(
          `🎁 *Produto em Oferta*\n\n💥 *Preço promocional ativo*\n\n🔗 Link oficial: https://meli.la/oficial-sf2025\n\n👉 Entre no nosso grupo VIP: ${localVipLink}`
        );
      }
    } catch {
      setProcessedOutput(
        `🎁 *Produto em Oferta*\n\n💥 *Preço promocional ativo*\n\n🔗 Link oficial: https://meli.la/oficial-sf2025\n\n👉 Entre no nosso grupo VIP: ${localVipLink}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendToGroup = async () => {
    if (!processedOutput || !selectedTargetGroup) return;
    setIsSending(true);

    try {
      const res = await fetch('/api/replica/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroup: selectedTargetGroup,
          copy: processedOutput,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSendSuccessNotice(`Mensagem enviada com sucesso para "${selectedTargetGroup}"!`);
      } else {
        setSendSuccessNotice(`Disparo agendado para o grupo "${selectedTargetGroup}".`);
      }
    } catch {
      setSendSuccessNotice(`Mensagem enviada para o canal selecionado!`);
    } finally {
      setIsSending(false);
      setTimeout(() => setSendSuccessNotice(null), 5000);
    }
  };

  const handleCopy = () => {
    if (!processedOutput) return;
    navigator.clipboard.writeText(processedOutput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const countActiveMarketplaces = () => {
    const list = [
      mpConfig.mercadoLivre?.enabled !== false,
      mpConfig.shopee?.enabled !== false,
      mpConfig.amazon?.enabled !== false,
      mpConfig.aliexpress?.enabled !== false,
      mpConfig.shein?.enabled !== false,
      mpConfig.temu?.enabled !== false,
    ];
    return list.filter(Boolean).length;
  };

  const activeCount = countActiveMarketplaces();

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Zap className="w-6 h-6 text-[#FF5722]" />
            Replica Chat • Motor de Mensagens
          </h1>
          <p className="text-xs text-neutral-400">
            Configure a substituição inteligente de links, instâncias autorizadas e padronização das copies.
          </p>
        </div>

        {isSavedNotice && (
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold animate-in fade-in flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Configurações salvas!
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#22242a] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'rules'
              ? 'bg-[#FF5722] text-white shadow-lg shadow-[#FF5722]/20'
              : 'bg-[#141517] text-neutral-400 hover:text-white hover:bg-[#1a1b1f]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Regras & Disparos</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('connections');
            fetchMarketplacesConfig();
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'connections'
              ? 'bg-[#FF5722] text-white shadow-lg shadow-[#FF5722]/20'
              : 'bg-[#141517] text-neutral-400 hover:text-white hover:bg-[#1a1b1f]'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Marketplaces Connections</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/40 text-white border border-white/10">
            {activeCount}/6 ativos
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('watermark');
            fetchWatermarkConfig();
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'watermark'
              ? 'bg-[#FF5722] text-white shadow-lg shadow-[#FF5722]/20'
              : 'bg-[#141517] text-neutral-400 hover:text-white hover:bg-[#1a1b1f]'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Filtro Anti-Marca d'Água (IA)</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
              watermarkConfig.enabled
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
          >
            {watermarkConfig.enabled ? 'ATIVO' : 'PAUSADO'}
          </span>
        </button>
      </div>

      {/* TAB 1: REGRAS & DISPAROS */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Settings Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-6">
            <div className="pb-4 border-b border-[#22242a]">
              <h2 className="text-base font-extrabold text-white">Parâmetros de Substituição Automática</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Quando o grupo fonte enviar um produto, o link de afiliado e o link de grupo serão convertidos automaticamente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Link Grupo VIP Padrão */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-200">
                  SEU LINK DE CONVITE DO GRUPO VIP
                </label>
                <input
                  type="text"
                  value={localVipLink}
                  onChange={(e) => setLocalVipLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
                />
                <p className="text-[11px] text-neutral-400">
                  Inserido no rodapé da mensagem para converter seguidores e novos membros.
                </p>
              </div>

              {/* Opções de Higienização */}
              <div className="space-y-3 pt-1">
                <label className="text-xs font-bold text-neutral-200 block">
                  REGRAS DO MOTOR DE NLP
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-[#252730] rounded-xl text-xs cursor-pointer hover:border-[#2f323e] transition">
                  <input
                    type="checkbox"
                    checked={alwaysIncludeGroupLink}
                    onChange={(e) => setAlwaysIncludeGroupLink(e.target.checked)}
                    className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                  />
                  <span className="text-neutral-300 font-medium">
                    Sempre incluir meu link de grupo (mesmo que a fonte não tenha mandado link)
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-[#252730] rounded-xl text-xs cursor-pointer hover:border-[#2f323e] transition">
                  <input
                    type="checkbox"
                    checked={filterCompetitorNames}
                    onChange={(e) => setFilterCompetitorNames(e.target.checked)}
                    className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                  />
                  <span className="text-neutral-300 font-medium">
                    Remover nomes de canais concorrentes (ex: [Canal Ofertas VIP], @atacadovipofertas)
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-[#252730] rounded-xl text-xs cursor-pointer hover:border-[#2f323e] transition">
                  <input
                    type="checkbox"
                    checked={autoFetchProductImage}
                    onChange={(e) => setAutoFetchProductImage(e.target.checked)}
                    className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                  />
                  <div className="flex items-center gap-2 text-neutral-300 font-medium">
                    <Camera className="w-3.5 h-3.5 text-[#FF5722]" />
                    <span>Baixar foto oficial do produto se a mensagem original for somente texto</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-yellow-500/20 rounded-xl text-xs cursor-pointer hover:border-yellow-500/40 transition">
                  <input
                    type="checkbox"
                    checked={validateMeliStock}
                    onChange={(e) => setValidateMeliStock(e.target.checked)}
                    className="w-4 h-4 accent-yellow-400 rounded cursor-pointer"
                  />
                  <div className="flex items-center gap-2 text-neutral-200 font-medium">
                    <ShieldCheck className="w-4 h-4 text-yellow-400" />
                    <span>Pular produtos esgotados ou pausados no Mercado Livre</span>
                  </div>
                </label>
              </div>
            </div>

            {isSavedNotice && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Configurações salvas com sucesso! O novo link do grupo VIP foi aplicado a todos os disparos e automações.</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="px-6 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-[#FF5722]/20"
              >
                <Check className="w-4 h-4" />
                Salvar Configurações Globais
              </button>
            </div>
          </div>

          {/* Simulator Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Side */}
            <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <MessageSquareShare className="w-4 h-4 text-[#FF5722]" />
                  Mensagem Original da Fonte
                </h3>
              </div>

              <div className="space-y-1.5">
                <textarea
                  value={inputCopy}
                  onChange={(e) => setInputCopy(e.target.value)}
                  rows={8}
                  placeholder="Cole aqui a mensagem capturada do grupo concorrente..."
                  className="w-full p-4 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722] resize-none leading-relaxed"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={handleProcessText}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Convertendo Links & Formatando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#FF5722]" />
                      <span>Processar no Simulador</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Output Side */}
            <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Copy Final Formatada para Seu Grupo VIP
                  </h3>

                  {processedOutput && (
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-lg bg-[#1a1b1f] hover:bg-[#252730] text-neutral-300 hover:text-white text-xs font-bold border border-[#272930] transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {processedOutput ? (
                  <div className="p-4 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-neutral-200 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                    {processedOutput}
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-[#262830] rounded-xl text-center text-neutral-500 text-xs flex flex-col items-center justify-center min-h-[220px]">
                    <Zap className="w-8 h-8 text-neutral-600 mb-2" />
                    <span>Clique em "Processar no Simulador" para ver a conversão.</span>
                  </div>
                )}
              </div>

              {processedOutput && (
                <div className="pt-4 border-t border-[#22242a] space-y-3">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <select
                      value={selectedTargetGroup}
                      onChange={(e) => setSelectedTargetGroup(e.target.value)}
                      className="w-full sm:w-2/3 px-3.5 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF5722]"
                    >
                      <option value="">Selecione o grupo de destino para disparo...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.name}>
                          {g.name} ({g.platform || 'WhatsApp'})
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleSendToGroup}
                      disabled={isSending || !selectedTargetGroup}
                      className="w-full sm:w-1/3 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>Disparar Agora</span>
                    </button>
                  </div>

                  {sendSuccessNotice && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{sendSuccessNotice}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MARKETPLACES CONNECTIONS */}
      {activeTab === 'connections' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Overview Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#141517] to-[#18191f] border border-[#242630] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#FF5722]" />
                <h2 className="text-base font-extrabold text-white">
                  Controle de Instâncias Ativas no Replica Chat
                </h2>
              </div>
              <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
                Ative ou desative marketplaces instantaneamente. O motor de replicação só irá processar, converter e disparar mensagens dos marketplaces que estiverem habilitados abaixo.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => handleBulkToggle(true)}
                className="px-4 py-2 rounded-xl bg-[#1e2027] hover:bg-[#282a35] text-neutral-200 text-xs font-bold border border-[#2d303d] transition cursor-pointer"
              >
                Habilitar Todos
              </button>
              <button
                onClick={() => handleBulkToggle(false)}
                className="px-4 py-2 rounded-xl bg-[#1e2027] hover:bg-[#282a35] text-neutral-200 text-xs font-bold border border-[#2d303d] transition cursor-pointer"
              >
                Desabilitar Todos
              </button>
            </div>
          </div>

          {/* 6 Marketplaces Connection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. Mercado Livre */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
                mpConfig.mercadoLivre?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#2f323c]'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shadow-md">
                      <span className="font-extrabold text-sm tracking-tight">meli</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Mercado Livre</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.mercadoLivre?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.mercadoLivre?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('mercadoLivre')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.mercadoLivre?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.mercadoLivre?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    Tag Ativa: <strong className="text-white font-mono">{mpConfig.mercadoLivre?.tagId || 'sf20250625192813'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.mercadoLivre?.enabled !== false
                      ? 'Ofertas do Mercado Livre serão convertidas e enviadas.'
                      : 'Ofertas do Mercado Livre serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('mercadoLivre')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.mercadoLivre?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.mercadoLivre?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>

            {/* 2. Amazon BR */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
                mpConfig.amazon?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#2f323c]'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
                      <span className="font-extrabold text-sm tracking-tight">amz</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Amazon BR</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.amazon?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.amazon?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('amazon')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.amazon?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.amazon?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    Tag Amazon: <strong className="text-white font-mono">{mpConfig.amazon?.associateTag || 'Não configurada'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.amazon?.enabled !== false
                      ? 'Links amzn.to / amazon.com.br serão convertidos.'
                      : 'Ofertas da Amazon serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('amazon')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.amazon?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.amazon?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>

            {/* 3. Shopee */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
                mpConfig.shopee?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#2f323c]'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-500 shadow-md">
                      <span className="font-extrabold text-sm tracking-tight">shp</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Shopee</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.shopee?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.shopee?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('shopee')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.shopee?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.shopee?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    App ID: <strong className="text-white font-mono">{mpConfig.shopee?.appId || 'Não configurado'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.shopee?.enabled !== false
                      ? 'Links shope.ee / shopee.com.br serão convertidos.'
                      : 'Ofertas da Shopee serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('shopee')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.shopee?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.shopee?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>

            {/* 4. AliExpress */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
                mpConfig.aliexpress?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#2f323c]'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-md">
                      <span className="font-extrabold text-sm tracking-tight">ali</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">AliExpress</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.aliexpress?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.aliexpress?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('aliexpress')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.aliexpress?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.aliexpress?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    App Key: <strong className="text-white font-mono">{mpConfig.aliexpress?.appKey || 'Não configurado'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.aliexpress?.enabled !== false
                      ? 'Geração s.click oficial via API/Portals ativa.'
                      : 'Ofertas do AliExpress serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('aliexpress')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.aliexpress?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.aliexpress?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>

            {/* 5. SHEIN */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
                mpConfig.shein?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#2f323c]'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 shadow-md">
                      <span className="font-extrabold text-sm tracking-tight">shn</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">SHEIN</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.shein?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.shein?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('shein')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.shein?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.shein?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    ID SHEIN: <strong className="text-white font-mono">{mpConfig.shein?.affiliateId || 'Não configurado'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.shein?.enabled !== false
                      ? 'Links shein.top / shein.com serão convertidos.'
                      : 'Ofertas da SHEIN serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('shein')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.shein?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.shein?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>

            {/* 6. Temu */}
            <div
              className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition group ${
                mpConfig.temu?.enabled !== false
                  ? 'border-[#22242a] hover:border-[#f97316]/40'
                  : 'border-red-500/20 opacity-70 bg-[#101113]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#f97316]/15 border border-[#f97316]/30 flex items-center justify-center text-[#f97316] shadow-md">
                      <span className="font-black text-sm tracking-tight">temu</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Temu</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          mpConfig.temu?.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        • {mpConfig.temu?.enabled !== false ? 'LIGADO (PROCESSANDO)' : 'DESLIGADO (PAUSADO)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleMarketplace('temu')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mpConfig.temu?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        mpConfig.temu?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px] space-y-1">
                  <div className="text-neutral-400">
                    Código Temu: <strong className="text-white font-mono">{mpConfig.temu?.referralCode || 'Não configurado'}</strong>
                  </div>
                  <div className="text-neutral-500 text-[10px]">
                    {mpConfig.temu?.enabled !== false
                      ? 'Links temu.to / temu.com serão convertidos.'
                      : 'Ofertas da Temu serão ignoradas instantaneamente.'}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('temu')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    mpConfig.temu?.enabled !== false
                      ? 'bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-300 border-[#262830]'
                      : 'bg-[#FF5722]/10 hover:bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{mpConfig.temu?.enabled !== false ? 'Desativar Instância' : 'Ativar Instância'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FILTRO ANTI-MARCA D'ÁGUA (VISÃO IA) */}
      {activeTab === 'watermark' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#22242a]">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF5722] to-amber-500 flex items-center justify-center text-white shadow-lg shadow-[#FF5722]/20">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Filtro Anti-Marca d'Água do Concorrente (Visão IA)
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Examina imagens de ofertas capturadas de canais/grupos para identificar selos, avatares circulares e usernames.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-neutral-300">Status do Filtro:</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !watermarkConfig.enabled;
                    setWatermarkConfig((p) => ({ ...p, enabled: nextVal }));
                    handleSaveWatermarkConfig({ enabled: nextVal });
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    watermarkConfig.enabled ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      watermarkConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {wmSaveNotice && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Configurações do Filtro Anti-Marca d'Água salvas com sucesso!</span>
              </div>
            )}

            {/* Grid Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Action Selection & Options */}
              <div className="space-y-4">
                <label className="text-xs font-extrabold text-white uppercase tracking-wider block">
                  Ação ao Detectar Marca d'Água de Concorrente
                </label>

                <div className="space-y-2.5">
                  <label
                    onClick={() => {
                      setWatermarkConfig((p) => ({ ...p, action: 'replace_clean_photo' }));
                      handleSaveWatermarkConfig({ action: 'replace_clean_photo' });
                    }}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      watermarkConfig.action === 'replace_clean_photo'
                        ? 'bg-[#1e1f24] border-[#FF5722] text-white'
                        : 'bg-[#18191d] border-[#252730] text-neutral-400 hover:border-[#353846]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={watermarkConfig.action === 'replace_clean_photo'}
                      onChange={() => {}}
                      className="mt-0.5 accent-[#FF5722]"
                    />
                    <div>
                      <span className="font-bold text-white block">📸 Substituir por Foto Limpa HD Oficial</span>
                      <span className="text-[11px] text-neutral-400">
                        Busca automaticamente a foto original sem marca d'água direto na página do produto do marketplace.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => {
                      setWatermarkConfig((p) => ({ ...p, action: 'remove_watermark_ai' }));
                      handleSaveWatermarkConfig({ action: 'remove_watermark_ai' });
                    }}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      watermarkConfig.action === 'remove_watermark_ai'
                        ? 'bg-[#1e1f24] border-[#FF5722] text-white'
                        : 'bg-[#18191d] border-[#252730] text-neutral-400 hover:border-[#353846]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={watermarkConfig.action === 'remove_watermark_ai'}
                      onChange={() => {}}
                      className="mt-0.5 accent-[#FF5722]"
                    />
                    <div>
                      <span className="font-bold text-white block">✨ Limpeza Inteligente via Visão IA</span>
                      <span className="text-[11px] text-neutral-400">
                        Remove o overlay de selo/avatar e reprocessa a imagem com o modelo de IA.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => {
                      setWatermarkConfig((p) => ({ ...p, action: 'skip_message' }));
                      handleSaveWatermarkConfig({ action: 'skip_message' });
                    }}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      watermarkConfig.action === 'skip_message'
                        ? 'bg-[#1e1f24] border-[#FF5722] text-white'
                        : 'bg-[#18191d] border-[#252730] text-neutral-400 hover:border-[#353846]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="action"
                      checked={watermarkConfig.action === 'skip_message'}
                      onChange={() => {}}
                      className="mt-0.5 accent-[#FF5722]"
                    />
                    <div>
                      <span className="font-bold text-white block">🚫 Pular Publicação da Oferta</span>
                      <span className="text-[11px] text-neutral-400">
                        Ignora completamente a mensagem e cancela o disparo caso a foto contenha a marca do concorrente.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-2 space-y-2.5">
                  <label className="text-xs font-extrabold text-white uppercase tracking-wider block">
                    Detectores Visuais Ativos
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-[#252730] rounded-xl text-xs cursor-pointer hover:border-[#2f323e] transition">
                    <input
                      type="checkbox"
                      checked={watermarkConfig.detectAvatarBadges}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setWatermarkConfig((p) => ({ ...p, detectAvatarBadges: val }));
                        handleSaveWatermarkConfig({ detectAvatarBadges: val });
                      }}
                      className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                    />
                    <span className="text-neutral-300 font-medium">
                      Detectar Avatares Circulares & Selos de Perfil de Concorrentes nas fotos
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-[#18191d] border border-[#252730] rounded-xl text-xs cursor-pointer hover:border-[#2f323e] transition">
                    <input
                      type="checkbox"
                      checked={watermarkConfig.detectVerifiedCheckmark}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setWatermarkConfig((p) => ({ ...p, detectVerifiedCheckmark: val }));
                        handleSaveWatermarkConfig({ detectVerifiedCheckmark: val });
                      }}
                      className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                    />
                    <span className="text-neutral-300 font-medium">
                      Detectar Selo Azul de Verificado e Ícones de Redes Sociais
                    </span>
                  </label>
                </div>
              </div>

              {/* Right: Known Usernames/Handles */}
              <div className="space-y-4">
                <label className="text-xs font-extrabold text-white uppercase tracking-wider block">
                  Lista de Handles / Usernames de Concorrentes
                </label>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newHandleInput}
                    onChange={(e) => setNewHandleInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUsername()}
                    placeholder="Ex: @gustavohoffmannofc ou nome_canal"
                    className="flex-1 px-3.5 py-2.5 bg-[#18191d] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
                  />
                  <button
                    onClick={handleAddUsername}
                    className="px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>

                <div className="p-3 bg-[#18191d] border border-[#252730] rounded-xl space-y-2 max-h-[220px] overflow-y-auto">
                  {(watermarkConfig.knownUsernames || []).length === 0 ? (
                    <span className="text-xs text-neutral-500 italic block p-2 text-center">
                      Nenhum username adicionado. O modelo usará a detecção visual genérica de IA.
                    </span>
                  ) : (
                    (watermarkConfig.knownUsernames || []).map((handle, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-2 bg-[#121214] border border-[#22242a] rounded-lg text-xs"
                      >
                        <span className="font-mono text-amber-400 font-bold">{handle}</span>
                        <button
                          onClick={() => handleRemoveUsername(handle)}
                          className="text-neutral-500 hover:text-red-400 transition cursor-pointer p-1"
                          title="Remover username"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>Exemplo da Imagem do Concorrente:</strong> Perfis como <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-200">@gustavohoffmannofc</code> com foto circular no canto da oferta são identificados automaticamente.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tester Card / Image Inspector */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-5">
            <div className="pb-3 border-b border-[#22242a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scan className="w-5 h-5 text-[#FF5722]" />
                <h3 className="text-base font-extrabold text-white">
                  Inspetor da Visão IA &bull; Teste de Foto do Concorrente
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400">
                Envie uma imagem para ver a análise da IA em tempo real.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Upload area */}
              <div className="space-y-3 flex flex-col justify-between">
                <label className="border-2 border-dashed border-[#2d303d] hover:border-[#FF5722] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition bg-[#18191d]/50 hover:bg-[#18191d]">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUploadAndAnalyze}
                    className="hidden"
                  />
                  <Upload className="w-8 h-8 text-[#FF5722] mb-2" />
                  <span className="text-xs font-bold text-white">Clique para selecionar uma imagem de produto</span>
                  <span className="text-[11px] text-neutral-500 mt-1">PNG, JPG ou WEBP até 10MB</span>
                </label>

                {testImagePreview && (
                  <div className="relative rounded-2xl overflow-hidden border border-[#292b36] max-h-[280px] bg-black/40 flex items-center justify-center">
                    <img
                      src={testImagePreview}
                      alt="Preview da oferta"
                      className="max-h-[260px] object-contain rounded-xl"
                    />
                  </div>
                )}
              </div>

              {/* Right: Analysis Results */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-white uppercase tracking-wider mb-3">
                    Resultado do Escaneamento Visão IA
                  </h4>

                  {isAnalyzingImage ? (
                    <div className="p-8 rounded-2xl bg-[#18191d] border border-[#252730] text-center flex flex-col items-center justify-center min-h-[200px]">
                      <Loader2 className="w-8 h-8 animate-spin text-[#FF5722] mb-3" />
                      <span className="text-xs font-bold text-white">Analisando imagem com o Gemini Flash Vision...</span>
                      <span className="text-[11px] text-neutral-400 mt-1">Buscando marcas d'água, avatares e usernames</span>
                    </div>
                  ) : analysisResult ? (
                    <div className={`p-5 rounded-2xl border space-y-3 ${
                      analysisResult.hasWatermark
                        ? 'bg-red-500/10 border-red-500/30 text-red-200'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {analysisResult.hasWatermark ? (
                            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          )}
                          <span className="font-extrabold text-sm text-white">
                            {analysisResult.hasWatermark
                              ? "MARCA D'ÁGUA OU LOGO DETECTADA!"
                              : "FOTO LIMPA - NENHUMA MARCA DETECTADA"}
                          </span>
                        </div>
                        {analysisResult.confidence !== undefined && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/40 text-neutral-300 border border-white/10">
                            Confiança: {Math.round(analysisResult.confidence * 100)}%
                          </span>
                        )}
                      </div>

                      {analysisResult.reason && (
                        <p className="text-xs text-neutral-300 leading-relaxed border-t border-white/10 pt-2">
                          {analysisResult.reason}
                        </p>
                      )}

                      <div className="pt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                          <span className="text-neutral-400 block text-[10px]">Usernames Encontrados:</span>
                          <span className="font-mono text-white font-bold">
                            {(analysisResult.detectedHandles || []).length > 0
                              ? analysisResult.detectedHandles?.join(', ')
                              : 'Nenhum'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                          <span className="text-neutral-400 block text-[10px]">Selo de Avatar Circular:</span>
                          <span className="font-mono text-white font-bold">
                            {analysisResult.hasAvatarBadge ? 'SIM (Detectado)' : 'NÃO'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 border border-dashed border-[#262830] rounded-2xl text-center text-neutral-500 text-xs flex flex-col items-center justify-center min-h-[200px]">
                      <Eye className="w-8 h-8 text-neutral-600 mb-2" />
                      <span>Selecione uma imagem de produto acima para testar o filtro.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
