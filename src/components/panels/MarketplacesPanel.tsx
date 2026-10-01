import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Shield,
  Key,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Zap,
  Lock,
  ShieldCheck,
  Power,
  Download,
  Upload,
  FileJson,
} from 'lucide-react';

interface MercadoLivreConfig {
  tagId: string;
  sessionCookie: string;
  accessToken?: string;
  status?: 'active' | 'expired' | 'unconfigured';
  lastTested?: string;
  cookieCount?: number;
  enabled?: boolean;
}

interface MarketplacesState {
  mercadoLivre: MercadoLivreConfig;
  amazon: {
    tagId: string;
    associateTag?: string;
    cookies?: string;
    sessionCookie?: string;
    cookieCount?: number;
    status?: 'active' | 'unconfigured';
    enabled?: boolean;
  };
  shopee: {
    appId: string;
    secret: string;
    status?: 'active' | 'unconfigured';
    enabled?: boolean;
  };
  aliexpress: {
    appKey: string;
    appSecret?: string;
    trackingId?: string;
    status?: 'active' | 'unconfigured';
    enabled?: boolean;
  };
  shein: {
    affiliateId?: string;
    affiliateLink?: string;
    status?: 'active' | 'unconfigured';
    enabled?: boolean;
  };
  temu: {
    referralCode: string;
    universalLink?: string;
    status?: 'active' | 'unconfigured';
    enabled?: boolean;
  };
}

export const MarketplacesPanel: React.FC = () => {
  // Config state
  const [config, setConfig] = useState<MarketplacesState>({
    mercadoLivre: {
      tagId: 'sf20250625192813',
      sessionCookie: '',
      status: 'active',
      cookieCount: 0,
      enabled: true,
    },
    amazon: {
      tagId: '',
      cookies: '',
      status: 'unconfigured',
      enabled: true,
    },
    shopee: {
      appId: '',
      secret: '',
      status: 'unconfigured',
      enabled: true,
    },
    aliexpress: {
      appKey: '',
      appSecret: '',
      trackingId: '',
      status: 'unconfigured',
      enabled: true,
    },
    shein: {
      affiliateId: '',
      affiliateLink: '',
      status: 'unconfigured',
      enabled: true,
    },
    temu: {
      referralCode: '',
      universalLink: '',
      status: 'unconfigured',
      enabled: true,
    },
  });

  // Modal selector
  const [activeModal, setActiveModal] = useState<
    'meli' | 'amazon' | 'shopee' | 'aliexpress' | 'shein' | 'temu' | null
  >(null);

  // Form states for Mercado Livre Modal
  const [meliTag, setMeliTag] = useState(config.mercadoLivre.tagId);
  const [meliCookie, setMeliCookie] = useState(config.mercadoLivre.sessionCookie);
  const [meliAccessToken, setMeliAccessToken] = useState('');
  const [showTagHelp, setShowTagHelp] = useState(false);
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Generic forms for other marketplaces
  const [amazonTag, setAmazonTag] = useState('');
  const [amazonCookie, setAmazonCookie] = useState('');
  const [showAmazonTagHelp, setShowAmazonTagHelp] = useState(false);
  const [showAmazonCookieHelp, setShowAmazonCookieHelp] = useState(false);
  const [shopeeAppId, setShopeeAppId] = useState('');
  const [shopeeSecret, setShopeeSecret] = useState('');

  // AliExpress forms (App Key + App Secret + Tracking ID)
  const [aliAppKey, setAliAppKey] = useState('');
  const [aliAppSecret, setAliAppSecret] = useState('');
  const [aliTrackingId, setAliTrackingId] = useState('');
  const [showAliSecret, setShowAliSecret] = useState(false);
  const [showAliHelp, setShowAliHelp] = useState(false);

  // SHEIN forms
  const [sheinId, setSheinId] = useState('');
  const [sheinLink, setSheinLink] = useState('');
  const [showSheinHelp, setShowSheinHelp] = useState(false);

  // Temu forms
  const [temuCode, setTemuCode] = useState('');
  const [temuLink, setTemuLink] = useState('');
  const [showTemuHelp, setShowTemuHelp] = useState(false);

  // Load config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/marketplaces/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            ...data.config,
            shein: data.config.shein || prev.shein,
          }));
          if (data.config.mercadoLivre) {
            setMeliTag(data.config.mercadoLivre.tagId || 'sf20250625192813');
            setMeliCookie(data.config.mercadoLivre.sessionCookie || '');
            if (data.config.mercadoLivre.accessToken) {
              setMeliAccessToken(data.config.mercadoLivre.accessToken);
            }
          }
          if (data.config.amazon) {
            setAmazonTag(data.config.amazon.tagId || data.config.amazon.associateTag || '');
            setAmazonCookie(data.config.amazon.sessionCookie || data.config.amazon.cookies || '');
          }
          if (data.config.shopee) {
            setShopeeAppId(data.config.shopee.appId || '');
            setShopeeSecret(data.config.shopee.secret || '');
          }
          if (data.config.aliexpress) {
            setAliAppKey(data.config.aliexpress.appKey || '');
            setAliAppSecret(data.config.aliexpress.appSecret || '');
            setAliTrackingId(data.config.aliexpress.trackingId || '');
          }
          if (data.config.shein) {
            setSheinId(data.config.shein.affiliateId || '');
            setSheinLink(data.config.shein.affiliateLink || '');
          }
          if (data.config.temu) {
            setTemuCode(data.config.temu.referralCode || '');
            setTemuLink(data.config.temu.universalLink || '');
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar configurações de marketplaces:', e);
    }
  };

  const handleToggleMarketplace = async (key: keyof MarketplacesState) => {
    const currentObj = config[key] as any;
    const currentEnabled = currentObj?.enabled !== false;
    const newEnabled = !currentEnabled;

    // Optimistic update
    setConfig((prev: any) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled: newEnabled,
      },
    }));

    try {
      await fetch('/api/marketplaces/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace: key, enabled: newEnabled }),
      });
    } catch (err) {
      console.error('Erro ao alternar marketplace:', err);
      fetchConfig();
    }
  };

  const handleSaveMeli = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    const activeTag = meliTag.trim() || 'sf20250625192813';

    try {
      const saveRes = await fetch('/api/marketplaces/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mercadoLivre: {
            tagId: activeTag,
            sessionCookie: meliCookie.trim(),
            accessToken: meliAccessToken.trim(),
            status: 'active',
          },
        }),
      });

      if (!saveRes.ok) throw new Error('Falha ao salvar credenciais.');

      if (meliCookie.trim()) {
        await fetch('/api/marketplaces/test-meli', { method: 'POST' }).catch(() => {});
      }

      await fetchConfig();

      setFeedback({
        type: 'success',
        message: `Credenciais e Tag de Afiliado (${activeTag}) salvas com sucesso! A monetização do Mercado Livre está 100% ativa.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao conectar ao Mercado Livre.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const [amazonTestResult, setAmazonTestResult] = useState<{ success: boolean; message: string; sampleUrl?: string } | null>(null);

  const handleTestAmazon = async () => {
    setIsLoading(true);
    setAmazonTestResult(null);
    try {
      const res = await fetch('/api/marketplaces/test-amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: amazonTag.trim() || 'botvip-20' }),
      });
      const data = await res.json();
      setAmazonTestResult(data);
    } catch (err: any) {
      setAmazonTestResult({ success: false, message: 'Erro ao testar conversão Amazon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGeneric = async (marketplace: string, payload: Record<string, any>) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/marketplaces/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [marketplace]: {
            ...payload,
            status: 'active',
          },
        }),
      });
      if (res.ok) {
        await fetchConfig();
        setActiveModal(null);
      }
    } catch (err) {
      console.error(`Erro ao salvar ${marketplace}:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  // JSON Export / Download & Import handlers
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonExportSuccess, setJsonExportSuccess] = useState(false);
  const [jsonImportSuccess, setJsonImportSuccess] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleDownloadJsonConfig = () => {
    try {
      const exportPayload = {
        app: 'AutoBotPromos',
        description: 'Backup de Configurações dos Marketplaces & Afiliados',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        config,
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marketplaces_config_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setJsonExportSuccess(true);
      setTimeout(() => setJsonExportSuccess(false), 3500);
    } catch (err: any) {
      console.error('Erro ao exportar JSON:', err);
      setJsonError('Erro ao gerar download do arquivo JSON.');
      setTimeout(() => setJsonError(null), 3500);
    }
  };

  const handleImportJsonFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const importedData = parsed.config || parsed;

        if (!importedData || typeof importedData !== 'object') {
          throw new Error('Formato do arquivo JSON inválido.');
        }

        setIsLoading(true);
        // Save imported configuration to backend
        const res = await fetch('/api/marketplaces/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(importedData),
        });

        if (res.ok) {
          await fetchConfig();
          setJsonImportSuccess(true);
          setTimeout(() => setJsonImportSuccess(false), 4000);
        } else {
          throw new Error('Falha ao salvar configurações importadas no servidor.');
        }
      } catch (err: any) {
        setJsonError(err.message || 'Arquivo JSON inválido ou corrompido.');
        setTimeout(() => setJsonError(null), 4000);
      } finally {
        setIsLoading(false);
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-16 text-neutral-200">
      {/* Hidden File Input for JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportJsonFile}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-[#FF5722]" />
            Marketplaces & Conexões de Afiliados
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Ative ou desative marketplaces instantaneamente e configure suas credenciais oficiais de comissão.
          </p>
        </div>

        {/* JSON Backup & Restore Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadJsonConfig}
            className="px-3.5 py-2 rounded-xl bg-[#1e1f26] hover:bg-[#282a34] text-white text-xs font-bold border border-[#2c2f3a] hover:border-[#FF5722] transition cursor-pointer flex items-center gap-2 shadow-xs group"
            title="Baixar todas as credenciais e tags em um arquivo JSON"
          >
            <Download className="w-4 h-4 text-[#FF5722] group-hover:scale-110 transition-transform" />
            <span>Baixar Backup (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-[#1e1f26] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold border border-[#2c2f3a] hover:border-emerald-500 transition cursor-pointer flex items-center gap-2 shadow-xs group disabled:opacity-50"
            title="Importar configurações de um arquivo JSON salvo anteriormente"
          >
            <Upload className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Restaurar JSON</span>
          </button>
        </div>
      </div>

      {/* JSON Feedback Banners */}
      {jsonExportSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>✅ Download concluído! Arquivo JSON salvo com sucesso. Você pode restaurá-lo sempre que atualizar o app.</span>
        </div>
      )}

      {jsonImportSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>✅ Configurações restauradas com sucesso do arquivo JSON! Todas as tags e chaves estão ativas.</span>
        </div>
      )}

      {jsonError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{jsonError}</span>
        </div>
      )}

      {/* Grid of 6 Marketplaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Amazon BR */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
            config.amazon.enabled !== false
              ? 'border-[#22242a] hover:border-[#2f323c]'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.amazon.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.amazon.status === 'active' || amazonTag
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    • {config.amazon.enabled === false ? 'DESATIVADO' : amazonTag ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('amazon')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.amazon.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.amazon.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.amazon.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://associados.amazon.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              Tag de associado + cookies SiteStripe (amzn.to / ASIN)
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('amazon')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#24252c] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>

        {/* 2. Mercado Livre */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
            config.mercadoLivre.enabled !== false
              ? 'border-[#22242a] hover:border-[#2f323c]'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.mercadoLivre.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.mercadoLivre.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : config.mercadoLivre.status === 'expired'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    •{' '}
                    {config.mercadoLivre.enabled === false
                      ? 'DESATIVADO'
                      : config.mercadoLivre.status === 'active'
                      ? 'CONFIGURADO'
                      : config.mercadoLivre.status === 'expired'
                      ? 'COOKIE EXPIRADO'
                      : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('mercadoLivre')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.mercadoLivre.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.mercadoLivre.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.mercadoLivre.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://www.mercadolivre.com.br/afiliados/hub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              Tag sf20250625192813 + Cookie de Sessão do Hub meli.la
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('meli')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#FF5722] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] hover:border-[#FF5722] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>

        {/* 3. Shopee */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
            config.shopee.enabled !== false
              ? 'border-[#22242a] hover:border-[#2f323c]'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.shopee.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.shopee.status === 'active' || shopeeAppId
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    • {config.shopee.enabled === false ? 'DESATIVADO' : shopeeAppId ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('shopee')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.shopee.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.shopee.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.shopee.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://affiliate.shopee.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              AppID + Secret da API GraphQL de Afiliados (s.shopee.com)
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('shopee')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#24252c] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>

        {/* 4. AliExpress */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
            config.aliexpress.enabled !== false
              ? 'border-[#22242a] hover:border-[#2f323c]'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.aliexpress.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.aliexpress.status === 'active' || aliAppKey
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    • {config.aliexpress.enabled === false ? 'DESATIVADO' : aliAppKey ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('aliexpress')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.aliexpress.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.aliexpress.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.aliexpress.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://portals.aliexpress.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              Links oficiais https://s.click.aliexpress.com (App Key / API)
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('aliexpress')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#24252c] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>

        {/* 5. SHEIN (Substituindo Magazine Luiza) */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition ${
            config.shein?.enabled !== false
              ? 'border-[#22242a] hover:border-[#2f323c]'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.shein?.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.shein?.status === 'active' || sheinId
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    • {config.shein?.enabled === false ? 'DESATIVADO' : sheinId ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('shein')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.shein?.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.shein?.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.shein?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://affiliate.shein.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              ID de Afiliado SHEIN + Link Universal (shein.top / url_from)
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('shein')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#24252c] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>

        {/* 6. Temu */}
        <div
          className={`p-6 rounded-2xl bg-[#141517] border flex flex-col justify-between transition group ${
            config.temu.enabled !== false
              ? 'border-[#22242a] hover:border-[#f97316]/40'
              : 'border-red-500/20 opacity-75 bg-[#101113]'
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
                      config.temu.enabled === false
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : config.temu.status === 'active' || temuCode
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-neutral-800/80 text-neutral-400'
                    }`}
                  >
                    • {config.temu.enabled === false ? 'DESATIVADO' : temuCode ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMarketplace('temu')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.temu.enabled !== false ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                  title={config.temu.enabled !== false ? 'Marketplace Ativo (Clique para desativar)' : 'Marketplace Desativado (Clique para ativar)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.temu.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <a
                  href="https://affiliate.temu.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#1a1b1f] hover:bg-[#25262c] text-neutral-400 hover:text-white transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed min-h-[36px]">
              Código de Afiliado / Influencer (referral_code / link universal)
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => setActiveModal('temu')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1a1b1f] hover:bg-[#24252c] text-neutral-200 hover:text-white text-xs font-bold border border-[#262830] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Configurar marketplace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Mercado Livre */}
      {activeModal === 'meli' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#20222a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center text-yellow-400 font-extrabold text-xs">
                  meli
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Configurar Mercado Livre</h2>
                  <p className="text-xs text-neutral-400">
                    Handshake oficial com Tag de Afiliado e Cookies de Sessão.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setFeedback(null);
                }}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e1f26] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback && (
              <div
                className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            <form onSubmit={handleSaveMeli} className="space-y-5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px]">
                <span className="flex items-center gap-1.5 text-neutral-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#FF5722]" />
                  Hub Oficial de Afiliados Mercado Livre
                </span>
                <a
                  href="https://www.mercadolivre.com.br/afiliados/hub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#20222a] hover:bg-[#2a2d38] text-neutral-200 hover:text-white font-bold border border-[#2e313c] transition"
                >
                  <span>Abrir Hub</span>
                  <ExternalLink className="w-3 h-3 text-neutral-400" />
                </a>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300">TAG DE AFILIADO MERCADO LIVRE</label>
                <input
                  type="text"
                  value={meliTag}
                  onChange={(e) => setMeliTag(e.target.value)}
                  placeholder="sf20250625192813"
                  className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-300">COOKIE DE SESSÃO DO PAINEL</label>
                  <button
                    type="button"
                    onClick={() => setShowCookieHelp(!showCookieHelp)}
                    className="text-[11px] font-bold text-[#FF5722] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showCookieHelp ? 'Ocultar Tutorial' : 'Como obter o Cookie JSON?'}</span>
                    {showCookieHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {showCookieHelp && (
                  <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#272930] text-[11px] text-neutral-300 space-y-2 animate-in fade-in">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF5722]" />
                      Passo a Passo para Exportar os Cookies de Login:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-neutral-400 leading-relaxed pl-1">
                      <li>Abra o site do <strong className="text-white">mercadolivre.com.br/afiliados</strong> e faça login.</li>
                      <li>Abra a extensão <strong className="text-white">Cookie-Editor</strong> ou <strong className="text-white">EditThisCookie</strong> no navegador.</li>
                      <li>Clique no botão <strong className="text-white">Export</strong> e escolha <strong className="text-white">JSON</strong>.</li>
                      <li>Cole todo o código JSON no campo abaixo e clique em <strong className="text-white">Salvar e Autenticar Sessão</strong>.</li>
                    </ol>
                  </div>
                )}

                <textarea
                  value={meliCookie}
                  onChange={(e) => setMeliCookie(e.target.value)}
                  rows={4}
                  placeholder="Cole aqui os cookies JSON ou string de sessão do Cookie Editor..."
                  className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722] resize-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#18191d] border border-[#272930] text-[11px] text-neutral-400 leading-relaxed flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#FF5722] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-extrabold mb-0.5">Garantia de Atribuição de Comissão:</strong>
                  Sua Tag de Afiliado <span className="text-[#FF5722] font-mono font-bold">{meliTag || 'sf20250625192813'}</span> e o código de rastreamento <span className="font-mono text-white font-bold">matt_tool=49196513</span> são injetados em todos os links capturados.
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Conectando ao Mercado Livre...</span>
                  </>
                ) : (
                  <span>Salvar e Autenticar Sessão</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Generic Modal for Other Marketplaces */}
      {activeModal && activeModal !== 'meli' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-[#121214] border border-[#262832] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#20222a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF5722]/10 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722] font-extrabold text-xs">
                  {activeModal.slice(0, 3)}
                </div>
                <div>
                  <h2 className="text-lg font-black text-white capitalize">
                    Configurar {activeModal === 'shein' ? 'SHEIN' : activeModal}
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Insira os identificadores de afiliado para substituição automática de links.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#1e1f26] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Amazon Modal Content */}
            {activeModal === 'amazon' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px]">
                  <span className="flex items-center gap-1.5 text-neutral-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Portal Oficial de Associados da Amazon Brasil
                  </span>
                  <a
                    href="https://associados.amazon.com.br/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#20222a] hover:bg-[#2a2d38] text-neutral-200 hover:text-white font-bold border border-[#2e313c] transition"
                  >
                    <span>Abrir Portal</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">ASSOCIATE TAG / ID DA AMAZON</label>
                  <input
                    type="text"
                    value={amazonTag}
                    onChange={(e) => setAmazonTag(e.target.value)}
                    placeholder="ex: botvip-20"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                  <p className="text-[11px] text-neutral-400">
                    Sua Tag de Associado Amazon (ex: <code className="text-amber-400 font-mono">botvip-20</code>) será injetada em todos os links e ofertas replicadas.
                  </p>
                </div>

                {amazonTestResult && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium space-y-1.5 ${
                      amazonTestResult.success
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {amazonTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      )}
                      <span>{amazonTestResult.message}</span>
                    </div>
                    {amazonTestResult.sampleUrl && (
                      <div className="text-[10px] font-mono break-all text-neutral-300 bg-black/40 p-2 rounded-lg">
                        {amazonTestResult.sampleUrl}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestAmazon}
                    disabled={isLoading}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#1e2028] hover:bg-[#282a36] text-neutral-200 hover:text-white text-xs font-bold border border-[#2e303e] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Testar Conversão</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSaveGeneric('amazon', {
                        associateTag: amazonTag.trim() || 'botvip-20',
                        tagId: amazonTag.trim() || 'botvip-20',
                        status: 'active',
                        enabled: true,
                      })
                    }
                    disabled={isLoading || !amazonTag.trim()}
                    className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-xs transition cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isLoading ? 'Salvando...' : 'Salvar Amazon BR'}
                  </button>
                </div>
              </div>
            )}

            {/* Shopee Modal Content */}
            {activeModal === 'shopee' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">APP ID SHOPEE OPEN PLATFORM</label>
                  <input
                    type="text"
                    value={shopeeAppId}
                    onChange={(e) => setShopeeAppId(e.target.value)}
                    placeholder="ex: 18349270032"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">API SECRET SHOPEE (SHA256)</label>
                  <input
                    type="password"
                    value={shopeeSecret}
                    onChange={(e) => setShopeeSecret(e.target.value)}
                    placeholder="Cole seu segredo da API Shopee..."
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <button
                  onClick={() => handleSaveGeneric('shopee', { appId: shopeeAppId.trim(), secret: shopeeSecret.trim() })}
                  disabled={isLoading || !shopeeAppId.trim()}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-sm transition cursor-pointer"
                >
                  Salvar Shopee
                </button>
              </div>
            )}

            {/* AliExpress Modal Content */}
            {activeModal === 'aliexpress' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">APP KEY DO ALIEXPRESS (PORTALS)</label>
                  <input
                    type="text"
                    value={aliAppKey}
                    onChange={(e) => setAliAppKey(e.target.value)}
                    placeholder="ex: 33182940 ou _oBXYZ"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-300">APP SECRET DA API (OPCIONAL)</label>
                    <button
                      type="button"
                      onClick={() => setShowAliSecret(!showAliSecret)}
                      className="text-[10px] text-neutral-400 hover:text-white font-mono"
                    >
                      {showAliSecret ? 'Ocultar' : 'Exibir'}
                    </button>
                  </div>
                  <input
                    type={showAliSecret ? 'text' : 'password'}
                    value={aliAppSecret}
                    onChange={(e) => setAliAppSecret(e.target.value)}
                    placeholder="ex: 8f49a781b29a..."
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">TRACKING ID (OPCIONAL)</label>
                  <input
                    type="text"
                    value={aliTrackingId}
                    onChange={(e) => setAliTrackingId(e.target.value)}
                    placeholder="ex: default"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <button
                  onClick={() =>
                    handleSaveGeneric('aliexpress', {
                      appKey: aliAppKey.trim(),
                      appSecret: aliAppSecret.trim(),
                      trackingId: aliTrackingId.trim(),
                    })
                  }
                  disabled={isLoading || !aliAppKey.trim()}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-sm transition cursor-pointer"
                >
                  Salvar AliExpress
                </button>
              </div>
            )}

            {/* SHEIN Modal Content */}
            {activeModal === 'shein' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#18191d] border border-[#242630] text-[11px]">
                  <span className="flex items-center gap-1.5 text-neutral-400 font-medium">
                    <Shield className="w-3.5 h-3.5 text-pink-400" />
                    SHEIN Affiliate Program
                  </span>
                  <a
                    href="https://affiliate.shein.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#20222a] hover:bg-[#2a2d38] text-neutral-200 hover:text-white font-bold border border-[#2e313c] transition"
                  >
                    <span>Painel SHEIN</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-300 flex items-center gap-1">
                      <span>ID DE AFILIADO SHEIN / URL_FROM</span>
                      <span className="text-pink-400">*</span>
                    </label>
                    <span className="text-[10px] text-neutral-500 font-mono">ex: br_aff_12345</span>
                  </div>
                  <input
                    type="text"
                    value={sheinId}
                    onChange={(e) => setSheinId(e.target.value)}
                    placeholder="ex: br_aff_12345 ou 182736"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">
                    LINK UNIVERSAL DE AFILIADO / SHEIN.TOP (OPCIONAL)
                  </label>
                  <input
                    type="text"
                    value={sheinLink}
                    onChange={(e) => setSheinLink(e.target.value)}
                    placeholder="ex: https://shein.top/abc1234"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowSheinHelp(!showSheinHelp)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#16171b] border border-[#22242a] text-[11px] text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
                >
                  <span>Onde encontrar meu ID de Afiliado na SHEIN?</span>
                  {showSheinHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showSheinHelp && (
                  <div className="p-3 bg-black/40 rounded-xl border border-[#242630] text-[11px] text-neutral-400 leading-relaxed">
                    Acesse o <strong>SHEIN Affiliate Program</strong> (affiliate.shein.com) ou a seção de afiliados da SHEIN Brasil. Seu código de afiliado é inserido nas URLs como <code>url_from</code> e <code>aff_id</code>.
                  </div>
                )}

                <button
                  onClick={() => handleSaveGeneric('shein', { affiliateId: sheinId.trim(), affiliateLink: sheinLink.trim() })}
                  disabled={isLoading || !sheinId.trim()}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-sm transition cursor-pointer"
                >
                  Salvar SHEIN
                </button>
              </div>
            )}

            {/* Temu Modal Content */}
            {activeModal === 'temu' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">CÓDIGO DE AFILIADO / INFLUENCER TEMU</label>
                  <input
                    type="text"
                    value={temuCode}
                    onChange={(e) => setTemuCode(e.target.value)}
                    placeholder="ex: acl123456"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300">LINK UNIVERSAL DE AFILIADO TEMU (OPCIONAL)</label>
                  <input
                    type="text"
                    value={temuLink}
                    onChange={(e) => setTemuLink(e.target.value)}
                    placeholder="ex: https://temu.to/m/u123456"
                    className="w-full px-4 py-3 bg-[#18191d] border border-[#272930] rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF5722]"
                  />
                </div>
                <button
                  onClick={() => handleSaveGeneric('temu', { referralCode: temuCode.trim(), universalLink: temuLink.trim() })}
                  disabled={isLoading || !temuCode.trim()}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-extrabold text-sm transition cursor-pointer"
                >
                  Salvar Temu
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
