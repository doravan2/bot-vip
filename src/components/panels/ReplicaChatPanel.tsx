import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  Image as ImageIcon,
  Users2,
  Search,
  Megaphone,
  X,
  Scissors,
  Terminal,
  Key,
  Smartphone,
  Play,
  Square,
  Lock,
  Unlock,
  ChevronRight,
  ArrowLeft,
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
  action: 'replace_clean_photo';
  knownUsernames: string[];
  detectAvatarBadges: boolean;
  detectVerifiedCheckmark: boolean;
  appliedGroups?: string[];
  allGroupsActive?: boolean;
}

export const ReplicaChatPanel: React.FC<ReplicaChatPanelProps> = ({
  groups,
  vipGroupLink,
  onUpdateVipGroupLink,
}) => {
  // Tabs: 'rules' | 'connections' | 'telegram_fantasma' | 'watermark' | 'chat_filter'
  const [activeTab, setActiveTab] = useState<'rules' | 'connections' | 'telegram_fantasma' | 'watermark' | 'chat_filter'>('rules');
  const [fullScreenTab, setFullScreenTab] = useState<'rules' | 'connections' | 'telegram_fantasma' | 'watermark' | 'chat_filter' | null>(null);

  const handleOpenOption = (tab: 'rules' | 'connections' | 'telegram_fantasma' | 'watermark' | 'chat_filter') => {
    setActiveTab(tab);
    setFullScreenTab(tab);
    if (tab === 'connections') fetchMarketplacesConfig();
    if (tab === 'telegram_fantasma') fetchTelethonStatus();
    if (tab === 'watermark') fetchWatermarkConfig();
    if (tab === 'chat_filter') fetchChatFilterConfig();
  };

  // Telethon Modo Fantasma State
  const [telethonForm, setTelethonForm] = useState({
    apiId: '',
    apiHash: '',
    phone: '',
  });
  const [telethonStatus, setTelethonStatus] = useState<{
    isRunning: boolean;
    status: 'idle' | 'starting' | 'waiting_code' | 'waiting_2fa' | 'connected' | 'error' | 'stopped';
    statusMessage: string;
    lastCodeRequestedAt?: string;
    lastConnectedAt?: string;
    pid?: number;
    config: {
      apiId: string;
      apiHashMasked: string;
      phone: string;
      hasApiHash: boolean;
    };
    recentLogs: string[];
  } | null>(null);
  const [telethonCodeInput, setTelethonCodeInput] = useState('');
  const [isStartingTelethon, setIsStartingTelethon] = useState(false);
  const [isStoppingTelethon, setIsStoppingTelethon] = useState(false);
  const [isSavingTelethonConfig, setIsSavingTelethonConfig] = useState(false);
  const [isSendingTelethonCode, setIsSendingTelethonCode] = useState(false);
  const [telethonActionFeedback, setTelethonActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showApiHash, setShowApiHash] = useState(false);
  const [simulatedTgText, setSimulatedTgText] = useState('🔥 PROMOÇÃO RELÂMPAGO DO TELEGRAM!\nFone Bluetooth Sem Fio Air Dots Pro\nDe R$ 199,90 por R$ 89,90 no Pix!\nLink: https://meli.la/1pKTwSc\nEntre no canal concorrente: @promos_top');
  const [isTestingSimulateTg, setIsTestingSimulateTg] = useState(false);
  const [simulateTgNotice, setSimulateTgNotice] = useState<{ success: boolean; message: string } | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

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
    appliedGroups: [],
    allGroupsActive: false,
  });
  const [isSavingWm, setIsSavingWm] = useState(false);
  const [wmSaveNotice, setWmSaveNotice] = useState(false);
  const [customGroupInput, setCustomGroupInput] = useState('');

  // Chat Filter Config state
  const [chatFilterConfig, setChatFilterConfig] = useState<{
    enabled: boolean;
    appliedGroups: string[];
    allGroupsActive: boolean;
    removeAsteriskHeaders: boolean;
    removeUnitPriceHooks: boolean;
    excludedPhrases: string[];
  }>({
    enabled: true,
    appliedGroups: [],
    allGroupsActive: false,
    removeAsteriskHeaders: true,
    removeUnitPriceHooks: true,
    excludedPhrases: ['*SÓ R$11,66 CADA 😱*'],
  });
  const [isSavingChatFilter, setIsSavingChatFilter] = useState(false);
  const [chatFilterSaveNotice, setChatFilterSaveNotice] = useState(false);
  const [customChatGroupInput, setCustomChatGroupInput] = useState('');
  const [newExcludedPhraseInput, setNewExcludedPhraseInput] = useState('');

  // Groups of operation for watermark & chat filters
  const [allAvailableGroups, setAllAvailableGroups] = useState<Array<{ id: string; name: string; type: string }>>([]);

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

  // Fetch Chat Filter config
  const fetchChatFilterConfig = async () => {
    try {
      const res = await fetch('/api/chat-filter/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setChatFilterConfig(data.config);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar chat filter config:', e);
    }
  };

  // Fetch Telethon Status & Configuration
  const fetchTelethonStatus = async () => {
    try {
      const res = await fetch('/api/telegram/userbot/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setTelethonStatus(data.status);
          if (data.status.config) {
            setTelethonForm((prev) => ({
              ...prev,
              apiId: prev.apiId || data.status.config.apiId || '',
              phone: prev.phone || data.status.config.phone || '',
            }));
          }
        }
      }
    } catch (e) {
      console.error('Erro ao buscar status do Telethon:', e);
    }
  };

  useEffect(() => {
    fetchWatermarkConfig();
    fetchChatFilterConfig();
    fetchTelethonStatus();
  }, []);

  // Polling for Telethon Status & Live Logs (Every 3 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTelethonStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveTelethonConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingTelethonConfig(true);
    try {
      const res = await fetch('/api/telegram/userbot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telethonForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelethonActionFeedback({
          type: 'success',
          message: 'Configurações do Telethon salvas com sucesso no servidor!',
        });
        fetchTelethonStatus();
      } else {
        setTelethonActionFeedback({
          type: 'error',
          message: data.error || data.message || 'Falha ao salvar configurações do Telethon.',
        });
      }
    } catch (err: any) {
      setTelethonActionFeedback({
        type: 'error',
        message: err?.message || 'Erro ao conectar com servidor.',
      });
    } finally {
      setIsSavingTelethonConfig(false);
      setTimeout(() => setTelethonActionFeedback(null), 5000);
    }
  };

  const handleStartTelethon = async () => {
    setIsStartingTelethon(true);
    try {
      // Save config first if filled
      if (telethonForm.apiId && telethonForm.phone) {
        await fetch('/api/telegram/userbot/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telethonForm),
        });
      }

      const res = await fetch('/api/telegram/userbot/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelethonActionFeedback({
          type: 'success',
          message: data.message || 'Motor Fantasma do Telegram iniciado!',
        });
        fetchTelethonStatus();
      } else {
        setTelethonActionFeedback({
          type: 'error',
          message: data.message || 'Falha ao iniciar Motor Fantasma.',
        });
      }
    } catch (err: any) {
      setTelethonActionFeedback({
        type: 'error',
        message: err?.message || 'Erro ao iniciar processo.',
      });
    } finally {
      setIsStartingTelethon(false);
      setTimeout(() => setTelethonActionFeedback(null), 6000);
    }
  };

  const handleStopTelethon = async () => {
    setIsStoppingTelethon(true);
    try {
      const res = await fetch('/api/telegram/userbot/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelethonActionFeedback({
          type: 'info',
          message: data.message || 'Motor Fantasma pausado.',
        });
        fetchTelethonStatus();
      } else {
        setTelethonActionFeedback({
          type: 'error',
          message: data.message || 'Falha ao pausar motor.',
        });
      }
    } catch (err: any) {
      setTelethonActionFeedback({
        type: 'error',
        message: err?.message || 'Erro ao parar processo.',
      });
    } finally {
      setIsStoppingTelethon(false);
      setTimeout(() => setTelethonActionFeedback(null), 5000);
    }
  };

  const handleSendTelethonCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!telethonCodeInput.trim()) return;

    setIsSendingTelethonCode(true);
    try {
      const res = await fetch('/api/telegram/userbot/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: telethonCodeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelethonActionFeedback({
          type: 'success',
          message: `✅ Código ${telethonCodeInput} enviado ao Telethon com sucesso!`,
        });
        setTelethonCodeInput('');
        fetchTelethonStatus();
      } else {
        setTelethonActionFeedback({
          type: 'error',
          message: data.error || data.message || 'Falha ao enviar código.',
        });
      }
    } catch (err: any) {
      setTelethonActionFeedback({
        type: 'error',
        message: err?.message || 'Erro ao enviar código.',
      });
    } finally {
      setIsSendingTelethonCode(false);
      setTimeout(() => setTelethonActionFeedback(null), 6000);
    }
  };

  const handleClearTelethonLogs = async () => {
    try {
      await fetch('/api/telegram/userbot/clear-logs', { method: 'POST' });
      fetchTelethonStatus();
    } catch {}
  };

  const handleTestSimulateTelegramIncoming = async () => {
    if (!simulatedTgText.trim()) return;
    setIsTestingSimulateTg(true);
    setSimulateTgNotice(null);
    try {
      const res = await fetch('/api/telegram/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: simulatedTgText,
          chatTitle: 'Canal Telegram Teste',
          chatId: '@canal_teste_vip',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSimulateTgNotice({
          success: true,
          message: `Oferta convertida e enviada com sucesso para os grupos WhatsApp vinculados!`,
        });
      } else {
        setSimulateTgNotice({
          success: false,
          message: data.error || data.message || 'Verifique se há regras ativas vinculando este canal na aba Fontes.',
        });
      }
    } catch (err: any) {
      setSimulateTgNotice({
        success: false,
        message: err?.message || 'Erro ao testar envio.',
      });
    } finally {
      setIsTestingSimulateTg(false);
      setTimeout(() => setSimulateTgNotice(null), 8000);
    }
  };

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

  // Fetch and sync all groups, channels and source rules
  useEffect(() => {
    const list: Array<{ id: string; name: string; type: string }> = [];

    // From props (WhatsApp & Telegram groups)
    if (Array.isArray(groups)) {
      groups.forEach((g) => {
        if (!list.some((item) => item.name === g.name)) {
          list.push({ id: g.id || g.name, name: g.name, type: g.platform === 'Telegram' ? 'Telegram' : 'WhatsApp' });
        }
      });
    }

    // From WhatsApp channels
    fetch('/api/whatsapp/channels')
      .then((r) => r.json())
      .then((data) => {
        if (data.channels && Array.isArray(data.channels)) {
          data.channels.forEach((c: any) => {
            if (!list.some((item) => item.name === c.name)) {
              list.push({ id: c.id || c.name, name: c.name, type: 'Canal WhatsApp' });
            }
          });
        }
      })
      .catch(() => {});

    // From Telegram channels
    fetch('/api/telegram/channels')
      .then((r) => r.json())
      .then((data) => {
        if (data.channels && Array.isArray(data.channels)) {
          data.channels.forEach((c: any) => {
            const title = c.title || c.username;
            if (title && !list.some((item) => item.name === title)) {
              list.push({ id: c.chatId || title, name: title, type: 'Canal Telegram' });
            }
          });
        }
      })
      .catch(() => {});

    // From Source Rules (Grupos e Canais Fontes Monitorados)
    fetch('/api/rules')
      .then((r) => r.json())
      .then((data) => {
        if (data.rules && Array.isArray(data.rules)) {
          data.rules.forEach((rule: any) => {
            const sources = [
              rule.sourceName,
              ...(Array.isArray(rule.sourceNames) ? rule.sourceNames : []),
            ].filter(Boolean);
            sources.forEach((name) => {
              if (name && !list.some((item) => item.name === name)) {
                list.unshift({ id: name, name, type: 'Grupo Fonte' });
              }
            });
          });
        }
      })
      .catch(() => {});

    setAllAvailableGroups(list);
  }, [groups]);

  const handleAddGroupWatermark = (groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const current = watermarkConfig.appliedGroups || [];
    if (!current.includes(trimmed)) {
      const updated = {
        ...watermarkConfig,
        appliedGroups: [...current, trimmed],
        allGroupsActive: false,
      };
      setWatermarkConfig(updated);
      handleSaveWatermarkConfig(updated);
    }
  };

  const handleAddCustomGroup = () => {
    if (!customGroupInput.trim()) return;
    handleAddGroupWatermark(customGroupInput);
    setCustomGroupInput('');
  };

  const handleRemoveGroupWatermark = (groupName: string) => {
    const current = watermarkConfig.appliedGroups || [];
    const updated = {
      ...watermarkConfig,
      appliedGroups: current.filter((g) => g !== groupName),
      allGroupsActive: false,
    };
    setWatermarkConfig(updated);
    handleSaveWatermarkConfig(updated);
  };

  const handleToggleAllGroupsActive = (val: boolean) => {
    const updated = {
      ...watermarkConfig,
      allGroupsActive: val,
    };
    setWatermarkConfig(updated);
    handleSaveWatermarkConfig(updated);
  };

  const handleClearAllGroups = () => {
    const updated = {
      ...watermarkConfig,
      appliedGroups: [],
      allGroupsActive: false,
    };
    setWatermarkConfig(updated);
    handleSaveWatermarkConfig(updated);
  };

  const handleSaveChatFilterConfig = async (updatedConfig?: Partial<typeof chatFilterConfig>) => {
    setIsSavingChatFilter(true);
    const payload = updatedConfig ? { ...chatFilterConfig, ...updatedConfig } : chatFilterConfig;
    try {
      const res = await fetch('/api/chat-filter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setChatFilterConfig(data.config);
        }
        setChatFilterSaveNotice(true);
        setTimeout(() => setChatFilterSaveNotice(false), 3000);
      }
    } catch (e) {
      console.error('Erro ao salvar chat filter config:', e);
    } finally {
      setIsSavingChatFilter(false);
    }
  };

  const handleAddGroupChatFilter = (groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const current = chatFilterConfig.appliedGroups || [];
    if (!current.includes(trimmed)) {
      const updated = {
        ...chatFilterConfig,
        appliedGroups: [...current, trimmed],
        allGroupsActive: false,
      };
      setChatFilterConfig(updated);
      handleSaveChatFilterConfig(updated);
    }
  };

  const handleAddCustomChatGroup = () => {
    if (!customChatGroupInput.trim()) return;
    handleAddGroupChatFilter(customChatGroupInput);
    setCustomChatGroupInput('');
  };

  const handleRemoveGroupChatFilter = (groupName: string) => {
    const current = chatFilterConfig.appliedGroups || [];
    const updated = {
      ...chatFilterConfig,
      appliedGroups: current.filter((g) => g !== groupName),
      allGroupsActive: false,
    };
    setChatFilterConfig(updated);
    handleSaveChatFilterConfig(updated);
  };

  const handleToggleAllChatGroupsActive = (val: boolean) => {
    const updated = {
      ...chatFilterConfig,
      allGroupsActive: val,
    };
    setChatFilterConfig(updated);
    handleSaveChatFilterConfig(updated);
  };

  const handleClearAllChatGroups = () => {
    const updated = {
      ...chatFilterConfig,
      appliedGroups: [],
      allGroupsActive: false,
    };
    setChatFilterConfig(updated);
    handleSaveChatFilterConfig(updated);
  };

  const handleAddExcludedPhrase = () => {
    const phrase = newExcludedPhraseInput.trim();
    if (!phrase) return;
    const current = chatFilterConfig.excludedPhrases || [];
    if (!current.includes(phrase)) {
      const updated = {
        ...chatFilterConfig,
        excludedPhrases: [...current, phrase],
      };
      setChatFilterConfig(updated);
      handleSaveChatFilterConfig(updated);
    }
    setNewExcludedPhraseInput('');
  };

  const handleRemoveExcludedPhrase = (phraseToRemove: string) => {
    const current = chatFilterConfig.excludedPhrases || [];
    const updated = {
      ...chatFilterConfig,
      excludedPhrases: current.filter((p) => p !== phraseToRemove),
    };
    setChatFilterConfig(updated);
    handleSaveChatFilterConfig(updated);
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

      {/* Stacked Options List (Deitadas uma encima da outra) */}
      <div className="space-y-4 max-w-5xl">
        {/* Option 1: Regras & Disparos */}
        <div
          onClick={() => handleOpenOption('rules')}
          className="p-6 rounded-2xl bg-[#141517] hover:bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/50 transition-all cursor-pointer shadow-xl group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FF5722]/15 border border-[#FF5722]/30 flex items-center justify-center text-[#FF5722] shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Sliders className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-extrabold text-white group-hover:text-[#FF5722] transition">
                  Regras & Disparos
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                  Parâmetros Globais
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
                Configure a substituição automática do link VIP, regras de NLP para remoção de concorrentes, busca de fotos e simulador de disparos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1d22] group-hover:bg-[#FF5722] text-xs font-bold text-[#FF5722] group-hover:text-white transition-colors self-end sm:self-center shrink-0 border border-[#262832] group-hover:border-[#FF5722]">
            <span>Acessar em Tela Inteira</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Option 2: Marketplaces Connections */}
        <div
          onClick={() => handleOpenOption('connections')}
          className="p-6 rounded-2xl bg-[#141517] hover:bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/50 transition-all cursor-pointer shadow-xl group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Radio className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-extrabold text-white group-hover:text-[#FF5722] transition">
                  Marketplaces Connections
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/40 text-white border border-white/10">
                  {activeCount}/6 ativos
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
                Ative ou desative instâncias de processamento de links do Mercado Livre, Amazon, Shopee, AliExpress, SHEIN e Temu.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1d22] group-hover:bg-[#FF5722] text-xs font-bold text-[#FF5722] group-hover:text-white transition-colors self-end sm:self-center shrink-0 border border-[#262832] group-hover:border-[#FF5722]">
            <span>Acessar em Tela Inteira</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Option 3: Modo Fantasma Telegram (Telethon) */}
        <div
          onClick={() => handleOpenOption('telegram_fantasma')}
          className="p-6 rounded-2xl bg-[#141517] hover:bg-[#18191d] border border-[#22242a] hover:border-[#0088cc]/50 transition-all cursor-pointer shadow-xl group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0088cc]/15 border border-[#0088cc]/30 flex items-center justify-center text-[#29b6f6] shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Send className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-extrabold text-white group-hover:text-[#29b6f6] transition">
                  Modo Fantasma Telegram (Telethon)
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${
                    telethonStatus?.status === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-bold'
                      : telethonStatus?.status === 'waiting_code' || telethonStatus?.status === 'waiting_2fa'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse font-bold'
                      : telethonStatus?.isRunning
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  }`}
                >
                  {telethonStatus?.status === 'connected'
                    ? 'CONECTADO'
                    : telethonStatus?.status === 'waiting_code'
                    ? 'DIGITAR CÓDIGO'
                    : telethonStatus?.status === 'waiting_2fa'
                    ? 'DIGITAR 2FA'
                    : telethonStatus?.isRunning
                    ? 'INICIANDO'
                    : 'DESLIGADO'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
                Motor Python para capturar mensagens de canais e grupos concorrentes do Telegram e replicar automaticamente para o WhatsApp VIP.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1d22] group-hover:bg-[#0088cc] text-xs font-bold text-[#29b6f6] group-hover:text-white transition-colors self-end sm:self-center shrink-0 border border-[#262832] group-hover:border-[#0088cc]">
            <span>Acessar em Tela Inteira</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Option 4: Filtro Anti-Marca d'Água */}
        <div
          onClick={() => handleOpenOption('watermark')}
          className="p-6 rounded-2xl bg-[#141517] hover:bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/50 transition-all cursor-pointer shadow-xl group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Eye className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-extrabold text-white group-hover:text-[#FF5722] transition">
                  Filtro Anti-Marca d'Água
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${
                    watermarkConfig.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  }`}
                >
                  {watermarkConfig.enabled ? 'ATIVO' : 'PAUSADO'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
                Exclui ou substitui imagens contendo selos, avatares circulares ou nomes de concorrentes por fotos limpas oficiais HD.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1d22] group-hover:bg-[#FF5722] text-xs font-bold text-[#FF5722] group-hover:text-white transition-colors self-end sm:self-center shrink-0 border border-[#262832] group-hover:border-[#FF5722]">
            <span>Acessar em Tela Inteira</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Option 5: Filtro de Chat */}
        <div
          onClick={() => handleOpenOption('chat_filter')}
          className="p-6 rounded-2xl bg-[#141517] hover:bg-[#18191d] border border-[#22242a] hover:border-[#FF5722]/50 transition-all cursor-pointer shadow-xl group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Scissors className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition">
                  Filtro de Chat
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${
                    chatFilterConfig.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  }`}
                >
                  {chatFilterConfig.enabled ? 'ATIVO' : 'PAUSADO'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
                Remove cabeçalhos em *asteriscos*, chamadas apelativas e frases indesejadas das mensagens replicadas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1d22] group-hover:bg-emerald-500 text-xs font-bold text-emerald-400 group-hover:text-black transition-colors self-end sm:self-center shrink-0 border border-[#262832] group-hover:border-emerald-500">
            <span>Acessar em Tela Inteira</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* FULL SCREEN MODAL VIEW (Abre a tela inteira quando acessa qualquer opção) */}
      {fullScreenTab !== null && (
        <div className="fixed inset-0 z-50 bg-[#0e0f12] text-neutral-200 overflow-y-auto animate-in fade-in zoom-in-95 p-4 sm:p-8 flex flex-col">
          {/* Top Full Screen Header Bar */}
          <div className="max-w-7xl w-full mx-auto pb-6 mb-6 border-b border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFullScreenTab(null)}
                className="px-4 py-2 rounded-xl bg-[#18191d] hover:bg-[#252730] text-neutral-300 hover:text-white border border-[#272930] transition text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md"
              >
                <ArrowLeft className="w-4 h-4 text-[#FF5722]" />
                <span>Voltar às Opções</span>
              </button>

              <div className="h-6 w-px bg-[#262832]" />

              <div className="flex items-center gap-2.5">
                {fullScreenTab === 'rules' && <Sliders className="w-5 h-5 text-[#FF5722]" />}
                {fullScreenTab === 'connections' && <Radio className="w-5 h-5 text-[#FF5722]" />}
                {fullScreenTab === 'telegram_fantasma' && <Send className="w-5 h-5 text-[#29b6f6]" />}
                {fullScreenTab === 'watermark' && <Eye className="w-5 h-5 text-[#FF5722]" />}
                {fullScreenTab === 'chat_filter' && <Scissors className="w-5 h-5 text-[#FF5722]" />}

                <h2 className="text-lg font-black text-white tracking-tight">
                  {fullScreenTab === 'rules' && 'Regras & Disparos • Configuração em Tela Inteira'}
                  {fullScreenTab === 'connections' && 'Marketplaces Connections • Configuração em Tela Inteira'}
                  {fullScreenTab === 'telegram_fantasma' && 'Modo Fantasma Telegram (Telethon) • Configuração em Tela Inteira'}
                  {fullScreenTab === 'watermark' && "Filtro Anti-Marca d'Água • Configuração em Tela Inteira"}
                  {fullScreenTab === 'chat_filter' && 'Filtro de Chat • Configuração em Tela Inteira'}
                </h2>
              </div>
            </div>

            {/* Quick Option Switcher Pills inside Full Screen Header */}
            <div className="flex items-center gap-1.5 bg-[#141517] p-1.5 rounded-2xl border border-[#22242a] overflow-x-auto">
              <button
                onClick={() => handleOpenOption('rules')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  fullScreenTab === 'rules' ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Regras
              </button>
              <button
                onClick={() => handleOpenOption('connections')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  fullScreenTab === 'connections' ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Marketplaces
              </button>
              <button
                onClick={() => handleOpenOption('telegram_fantasma')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  fullScreenTab === 'telegram_fantasma' ? 'bg-[#0088cc] text-white shadow-md shadow-[#0088cc]/30' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Telegram Fantasma
              </button>
              <button
                onClick={() => handleOpenOption('watermark')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  fullScreenTab === 'watermark' ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Anti-Marca d'Água
              </button>
              <button
                onClick={() => handleOpenOption('chat_filter')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  fullScreenTab === 'chat_filter' ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/20' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Filtro Chat
              </button>

              <button
                onClick={() => setFullScreenTab(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-[#252730] transition ml-2 cursor-pointer"
                title="Fechar Tela Inteira"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Full Screen Body Container */}
          <div className="max-w-7xl w-full mx-auto flex-1">
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

      {/* TAB: MODO FANTASMA TELEGRAM (TELETHON PROCESS MANAGER) */}
      {activeTab === 'telegram_fantasma' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Hero & Process Control Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#12151c] border border-[#0088cc]/30 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#0088cc]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#1c2230]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0088cc] to-[#29b6f6] flex items-center justify-center text-white shadow-xl shadow-[#0088cc]/30 shrink-0">
                  <Send className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-black text-white tracking-tight">
                      Modo Fantasma Telegram (Telethon)
                    </h2>
                    <span
                      className={`px-3 py-0.5 rounded-full text-[11px] font-mono font-black border uppercase tracking-wider ${
                        telethonStatus?.status === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : telethonStatus?.status === 'waiting_code' || telethonStatus?.status === 'waiting_2fa'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : telethonStatus?.isRunning
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {telethonStatus?.status === 'connected'
                        ? '● Fantasma Conectado & Escutando'
                        : telethonStatus?.status === 'waiting_code'
                        ? '● Aguardando Código de Login'
                        : telethonStatus?.status === 'waiting_2fa'
                        ? '● Aguardando Senha 2FA'
                        : telethonStatus?.isRunning
                        ? '● Iniciando Processo...'
                        : '○ Motor Fantasma Desligado'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
                    Escuta canais e grupos concorrentes do Telegram (mesmo onde você não é admin) através da sua conta pessoal usando a biblioteca oficial Telethon e replica diretamente para os seus grupos VIP do WhatsApp.
                  </p>
                </div>
              </div>

              {/* Action Buttons: Start / Stop */}
              <div className="flex items-center gap-3 shrink-0">
                {telethonStatus?.isRunning ? (
                  <button
                    type="button"
                    onClick={handleStopTelethon}
                    disabled={isStoppingTelethon}
                    className="px-5 py-3 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 text-xs font-black transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-red-500/10"
                  >
                    {isStoppingTelethon ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Parando...</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 fill-current" />
                        <span>Pausar Motor Fantasma</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartTelethon}
                    disabled={isStartingTelethon}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#0088cc] to-[#00b4d8] hover:from-[#0077b5] hover:to-[#0096c7] text-white text-xs font-black shadow-xl shadow-[#0088cc]/30 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isStartingTelethon ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Iniciando Motor...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Iniciar Motor Fantasma (Telethon)</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={fetchTelethonStatus}
                  className="p-3 rounded-2xl bg-[#181d28] hover:bg-[#202738] text-neutral-300 hover:text-white border border-[#283248] transition cursor-pointer"
                  title="Atualizar Status do Processo"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Feedback message banner */}
            {telethonActionFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in ${
                  telethonActionFeedback.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                    : telethonActionFeedback.type === 'info'
                    ? 'bg-[#0088cc]/15 border border-[#0088cc]/40 text-[#29b6f6]'
                    : 'bg-red-500/15 border border-red-500/40 text-red-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {telethonActionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : telethonActionFeedback.type === 'info' ? (
                    <Info className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{telethonActionFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTelethonActionFeedback(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Code / 2FA Interactive Card (High Priority when Telethon requests auth) */}
            {(telethonStatus?.status === 'waiting_code' || telethonStatus?.status === 'waiting_2fa' || telethonStatus?.isRunning) && (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#181d28] to-[#0088cc]/10 border-2 border-amber-500/50 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold shrink-0">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white flex items-center gap-2">
                        <span>
                          {telethonStatus?.status === 'waiting_2fa'
                            ? '🔐 Senha 2FA do Telegram Necessária'
                            : '📲 Código de Login do Telegram Necessário'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                          Ação Necessária
                        </span>
                      </h3>
                      <p className="text-xs text-neutral-300 mt-0.5">
                        {telethonStatus?.status === 'waiting_2fa'
                          ? 'Sua conta possui verificação em duas etapas (2FA). Digite sua senha abaixo para liberar a escuta.'
                          : 'O Telegram enviou um código de 5 dígitos para o seu aplicativo no celular. Digite-o abaixo para autenticar instantaneamente!'}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSendTelethonCode} className="flex flex-col sm:flex-row gap-3 pt-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={telethonCodeInput}
                      onChange={(e) => setTelethonCodeInput(e.target.value)}
                      placeholder={
                        telethonStatus?.status === 'waiting_2fa'
                          ? 'Digite sua senha 2FA do Telegram...'
                          : 'Digite o código de 5 dígitos (ex: 83921)...'
                      }
                      className="w-full px-4 py-3.5 rounded-xl bg-[#0f1218] border border-amber-500/40 text-white font-mono text-sm tracking-wider focus:outline-none focus:border-amber-400 placeholder:text-neutral-500 shadow-inner"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingTelethonCode || !telethonCodeInput.trim()}
                    className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF5722] hover:from-amber-600 hover:to-[#e64a19] text-white text-xs font-black shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSendingTelethonCode ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Código ao Motor</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-neutral-400 gap-2 pt-1 border-t border-white/5">
                  <span>💡 Você também pode abrir no navegador: <strong className="text-[#29b6f6] font-mono">http://localhost:3000/api/telegram/enviar-codigo/SEU_CODIGO</strong></span>
                  <span className="text-neutral-500">O Python captura o código a cada 3s automaticamente via Webhook Bridge.</span>
                </div>
              </div>
            )}

            {/* Grid 2 Columns: Credentials Configuration & Live Terminal Console */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Column 1: Credentials Form (5 Cols) */}
              <div className="lg:col-span-5 p-6 rounded-2xl bg-[#16181f] border border-[#242938] space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#242938]">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#29b6f6]" />
                    <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Credenciais do Telethon
                    </h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#0088cc]/15 text-[#29b6f6] font-mono font-bold">
                    .env Auto-Sync
                  </span>
                </div>

                <form onSubmit={handleSaveTelethonConfig} className="space-y-4">
                  {/* API ID */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                      <span>TELEGRAM_API_ID</span>
                      <span className="text-[10px] text-neutral-500">Apenas números</span>
                    </label>
                    <input
                      type="text"
                      value={telethonForm.apiId}
                      onChange={(e) => setTelethonForm({ ...telethonForm, apiId: e.target.value })}
                      placeholder="Ex: 23819482"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1117] border border-[#2c3244] text-white font-mono text-xs focus:outline-none focus:border-[#0088cc]"
                    />
                  </div>

                  {/* API HASH */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                      <span>TELEGRAM_API_HASH</span>
                      <button
                        type="button"
                        onClick={() => setShowApiHash(!showApiHash)}
                        className="text-[10px] text-[#29b6f6] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {showApiHash ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        <span>{showApiHash ? 'Ocultar' : 'Mostrar'}</span>
                      </button>
                    </label>
                    <input
                      type={showApiHash ? 'text' : 'password'}
                      value={telethonForm.apiHash}
                      onChange={(e) => setTelethonForm({ ...telethonForm, apiHash: e.target.value })}
                      placeholder={telethonStatus?.config?.hasApiHash ? '(Hash já salvo - digite para alterar)' : 'Ex: 9a8b7c6d5e4f3a2b1c...'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1117] border border-[#2c3244] text-white font-mono text-xs focus:outline-none focus:border-[#0088cc]"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                      <span>TELEGRAM_PHONE</span>
                      <span className="text-[10px] text-neutral-500">Com DDI + DDD</span>
                    </label>
                    <div className="relative">
                      <Smartphone className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={telethonForm.phone}
                        onChange={(e) => setTelethonForm({ ...telethonForm, phone: e.target.value })}
                        placeholder="+5511999999999"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0f1117] border border-[#2c3244] text-white font-mono text-xs focus:outline-none focus:border-[#0088cc]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSavingTelethonConfig}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#0088cc]/20 disabled:opacity-50"
                    >
                      {isSavingTelethonConfig ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Salvar Credenciais</span>
                    </button>
                  </div>
                </form>

                {/* Quick Helper Box */}
                <div className="p-3.5 rounded-xl bg-[#0f121a] border border-[#1e2436] space-y-2 text-[11px]">
                  <div className="flex items-center justify-between text-neutral-300 font-bold">
                    <span>Como obter seu API ID e Hash:</span>
                    <a
                      href="https://my.telegram.org/auth"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#29b6f6] hover:underline flex items-center gap-1 font-mono text-[10px]"
                    >
                      <span>my.telegram.org</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-neutral-400 leading-relaxed">
                    <li>Acesse <strong>my.telegram.org</strong> e faça login com seu telefone.</li>
                    <li>Clique em <strong>API development tools</strong>.</li>
                    <li>Crie um app rápido (ex: nome <em>Bot Ofertas</em>) e copie o <strong>App api_id</strong> e <strong>App api_hash</strong>.</li>
                  </ol>
                </div>
              </div>

              {/* Column 2: Live Python Logs Console (7 Cols) */}
              <div className="lg:col-span-7 p-6 rounded-2xl bg-[#0c0e14] border border-[#1e2332] flex flex-col justify-between space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e2332]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>Console ao Vivo do Python</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {(telethonStatus?.recentLogs || []).length} linhas
                    </span>
                    <button
                      type="button"
                      onClick={handleClearTelethonLogs}
                      className="px-2.5 py-1 rounded-lg bg-[#161a24] hover:bg-[#202636] text-neutral-400 hover:text-white text-[10px] font-bold border border-[#252c3e] transition cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Console Log Output */}
                <div className="h-72 overflow-y-auto bg-[#07080c] rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-neutral-300 border border-[#161a26] space-y-1 select-text">
                  {(!telethonStatus?.recentLogs || telethonStatus.recentLogs.length === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-600 text-center space-y-1.5 p-4">
                      <Terminal className="w-6 h-6 opacity-40 text-neutral-500" />
                      <p>Nenhum log registrado ainda.</p>
                      <p className="text-[10px] text-neutral-600">
                        Clique em <strong>"Iniciar Motor Fantasma"</strong> acima para ver a inicialização e escuta das mensagens em tempo real.
                      </p>
                    </div>
                  ) : (
                    telethonStatus.recentLogs.map((line, idx) => {
                      const isError = line.includes('❌') || line.includes('Erro') || line.includes('error') || line.includes('STDERR');
                      const isSuccess = line.includes('✅') || line.includes('Sucesso') || line.includes('CONECTADO');
                      const isWarn = line.includes('⚠️') || line.includes('Aviso') || line.includes('CÓDIGO') || line.includes('2FA');
                      const isDeal = line.includes('📡') || line.includes('🎯') || line.includes('LINK DETECTADO') || line.includes('Oferta');

                      return (
                        <div
                          key={idx}
                          className={`break-all py-0.5 ${
                            isError
                              ? 'text-red-400 bg-red-500/5 px-1 rounded'
                              : isSuccess
                              ? 'text-emerald-400 font-bold'
                              : isWarn
                              ? 'text-amber-300'
                              : isDeal
                              ? 'text-[#29b6f6] font-bold'
                              : 'text-neutral-400'
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalBottomRef} />
                </div>

                {/* Console Status Footer */}
                <div className="pt-2 border-t border-[#181d2a] flex items-center justify-between text-[11px] text-neutral-400">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-500">Script:</span>
                    <span className="text-neutral-300 font-mono">scripts/escuta_grupos.py</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-500">PID:</span>
                    <span className="text-emerald-400 font-mono">{telethonStatus?.pid || 'Inativo'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Simulation Telegram -> WhatsApp */}
            <div className="p-6 rounded-2xl bg-[#141720] border border-[#202738] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#202738]">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#FF5722]" />
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                    Simulador Rápido: Telegram ➔ WhatsApp VIP
                  </h3>
                </div>
                <span className="text-[10px] text-neutral-400">
                  Testa se o pipeline converte os links e envia para o WhatsApp
                </span>
              </div>

              {simulateTgNotice && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    simulateTgNotice.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  {simulateTgNotice.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{simulateTgNotice.message}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <textarea
                  rows={3}
                  value={simulatedTgText}
                  onChange={(e) => setSimulatedTgText(e.target.value)}
                  placeholder="Cole aqui o texto da mensagem com link que seria postada no canal do Telegram..."
                  className="flex-1 p-3 bg-[#0d0f14] border border-[#283044] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-[#0088cc]"
                />
                <button
                  type="button"
                  onClick={handleTestSimulateTelegramIncoming}
                  disabled={isTestingSimulateTg || !simulatedTgText.trim()}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#0088cc] to-[#29b6f6] hover:from-[#0077b5] hover:to-[#0288d1] text-white text-xs font-black shadow-lg shadow-[#0088cc]/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 sm:w-48 shrink-0"
                >
                  {isTestingSimulateTg ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Replicando...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Testar Replicação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FILTRO ANTI-MARCA D'ÁGUA */}
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
                      Filtro Anti-Marca d'Água do Concorrente
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

            {/* AÇÃO PRINCIPAL: SUBSTITUIR POR FOTO LIMPA HD OFICIAL */}
            <div className="p-4 sm:p-5 rounded-2xl border border-[#FF5722] bg-[#1e1f24] text-xs shadow-md space-y-2">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-[#FF5722] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-sm">
                      📸 Substituir por Foto Limpa HD Oficial
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                      ATIVO PERMANENTE
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Busca automaticamente a foto original sem marca d'água direto na página do produto do marketplace (Mercado Livre, Shopee, Amazon, AliExpress, Magalu), substituindo a mídia antes do disparo.
                  </p>
                </div>
              </div>
            </div>

            {/* GRUPOS DE ATUAÇÃO (FONTES MONITORADAS) - COMPACTO NA MESMA ABA */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#18191d] border border-[#262832] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#23252d]">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-[#FF5722]" />
                    <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Grupos Fontes de Atuação do Filtro
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                        watermarkConfig.allGroupsActive
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : (watermarkConfig.appliedGroups || []).length > 0
                          ? 'bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {watermarkConfig.allGroupsActive
                        ? 'Todas as Fontes'
                        : (watermarkConfig.appliedGroups || []).length > 0
                        ? `${watermarkConfig.appliedGroups?.length || 0} fonte(s) selecionada(s)`
                        : 'Nenhuma fonte selecionada'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    O filtro de foto limpa HD vai atuar e substituir a imagem <strong>somente quando a mensagem vier dos grupos/canais fontes</strong> (concorrentes) adicionados abaixo.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAllGroupsActive(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      !watermarkConfig.allGroupsActive
                        ? 'bg-[#FF5722] text-white border-[#FF5722]'
                        : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
                    }`}
                  >
                    Fontes Específicas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleAllGroupsActive(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      watermarkConfig.allGroupsActive
                        ? 'bg-[#FF5722] text-white border-[#FF5722]'
                        : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
                    }`}
                  >
                    Todas as Fontes
                  </button>
                </div>
              </div>

              {!watermarkConfig.allGroupsActive && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Seletor dropdown de grupos fontes disponíveis */}
                    {allAvailableGroups.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddGroupWatermark(e.target.value);
                          }
                        }}
                        className="px-3 py-2 bg-[#121316] border border-[#2a2c36] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF5722] cursor-pointer"
                      >
                        <option value="">+ Selecionar grupo/canal fonte monitorado...</option>
                        {allAvailableGroups
                          .filter((g) => !(watermarkConfig.appliedGroups || []).includes(g.name))
                          .map((g) => (
                            <option key={g.id} value={g.name}>
                              [{g.type}] {g.name}
                            </option>
                          ))}
                      </select>
                    )}

                    {/* Campo de texto livre para adicionar qualquer grupo fonte por nome */}
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={customGroupInput}
                        onChange={(e) => setCustomGroupInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomGroup()}
                        placeholder="Ou digite o nome do grupo fonte para adicionar..."
                        className="flex-1 px-3.5 py-2 bg-[#121316] border border-[#2a2c36] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomGroup}
                        className="px-3.5 py-2 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Fonte</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Grupos Ativos (Tags/Chips com X para remover) */}
                  <div className="p-3 bg-[#121316] border border-[#22242a] rounded-xl min-h-[56px] flex flex-wrap gap-2 items-center">
                    {(watermarkConfig.appliedGroups || []).length === 0 ? (
                      <span className="text-xs text-neutral-500 italic p-1">
                        Nenhum grupo fonte selecionado. Selecione no dropdown acima ou digite para adicionar fontes com marcas d'água.
                      </span>
                    ) : (
                      (watermarkConfig.appliedGroups || []).map((grpName) => (
                        <span
                          key={grpName}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e2027] border border-[#FF5722]/40 text-white text-xs font-medium shadow-xs"
                        >
                          <Users2 className="w-3 h-3 text-[#FF5722]" />
                          <span className="font-semibold">{grpName}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGroupWatermark(grpName)}
                            className="ml-1 text-neutral-400 hover:text-red-400 transition cursor-pointer p-0.5 rounded"
                            title="Remover grupo fonte"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {(watermarkConfig.appliedGroups || []).length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                      <span>
                        🛡️ O filtro de foto limpa HD atuará exclusivamente nas mensagens que tiverem como <strong>origem (fonte)</strong> os <strong>{watermarkConfig.appliedGroups?.length || 0}</strong> grupo(s) selecionado(s) acima.
                      </span>
                      <button
                        type="button"
                        onClick={handleClearAllGroups}
                        className="text-neutral-500 hover:text-red-400 transition cursor-pointer underline text-[11px]"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FILTRO DE CHAT */}
      {activeTab === 'chat_filter' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#22242a]">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF5722] to-amber-500 flex items-center justify-center text-white shadow-lg shadow-[#FF5722]/20">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Filtro de Chat
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Exclui chamadas promocionais, frases e linhas indesejadas de mensagens nos grupos selecionados.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-neutral-300">Status do Filtro:</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !chatFilterConfig.enabled;
                    setChatFilterConfig((p) => ({ ...p, enabled: nextVal }));
                    handleSaveChatFilterConfig({ enabled: nextVal });
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    chatFilterConfig.enabled ? 'bg-[#FF5722]' : 'bg-neutral-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      chatFilterConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {chatFilterSaveNotice && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Configurações do Filtro de Chat salvas com sucesso!</span>
              </div>
            )}

            {/* AÇÃO PRINCIPAL */}
            <div className="p-4 sm:p-5 rounded-2xl border border-[#FF5722] bg-[#1e1f24] text-xs shadow-md space-y-2">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-[#FF5722] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <Scissors className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-sm">
                      ✂️ Excluir Linhas em *exemplo* (com * no Início e no Final)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                      ATIVO PERMANENTE
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Apaga automaticamente toda linha ou chamada do concorrente que tiver <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-bold">*</code> no início e no final (ex: <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">*exemplo*</code>, <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">*SÓ R$11,66 CADA 😱*</code>, <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">*CORRE*</code>), preservando o nome real do produto, preço e seu link de afiliado oficial.
                  </p>
                </div>
              </div>
            </div>

            {/* GRUPOS DE ATUAÇÃO (FONTES MONITORADAS) - COMPACTO NA MESMA ABA */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#18191d] border border-[#262832] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#23252d]">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-[#FF5722]" />
                    <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Grupos Fontes de Atuação do Filtro
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                        chatFilterConfig.allGroupsActive
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : (chatFilterConfig.appliedGroups || []).length > 0
                          ? 'bg-[#FF5722]/20 text-[#FF5722] border-[#FF5722]/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {chatFilterConfig.allGroupsActive
                        ? 'Todas as Fontes'
                        : (chatFilterConfig.appliedGroups || []).length > 0
                        ? `${chatFilterConfig.appliedGroups?.length || 0} fonte(s) selecionada(s)`
                        : 'Nenhuma fonte selecionada'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    O filtro de chat vai atuar e apagar linhas em *exemplo* <strong>somente quando a mensagem vier dos grupos/canais fontes</strong> (concorrentes) adicionados abaixo.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAllChatGroupsActive(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      !chatFilterConfig.allGroupsActive
                        ? 'bg-[#FF5722] text-white border-[#FF5722]'
                        : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
                    }`}
                  >
                    Fontes Específicas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleAllChatGroupsActive(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      chatFilterConfig.allGroupsActive
                        ? 'bg-[#FF5722] text-white border-[#FF5722]'
                        : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
                    }`}
                  >
                    Todas as Fontes
                  </button>
                </div>
              </div>

              {!chatFilterConfig.allGroupsActive && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Seletor dropdown de grupos/canais disponíveis */}
                    {allAvailableGroups.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddGroupChatFilter(e.target.value);
                          }
                        }}
                        className="px-3 py-2 bg-[#121316] border border-[#2a2c36] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF5722] cursor-pointer"
                      >
                        <option value="">+ Selecionar grupo/canal fonte monitorado...</option>
                        {allAvailableGroups
                          .filter((g) => !(chatFilterConfig.appliedGroups || []).includes(g.name))
                          .map((g) => (
                            <option key={g.id} value={g.name}>
                              [{g.type}] {g.name}
                            </option>
                          ))}
                      </select>
                    )}

                    {/* Campo de texto livre para adicionar qualquer grupo por nome */}
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={customChatGroupInput}
                        onChange={(e) => setCustomChatGroupInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomChatGroup()}
                        placeholder="Ou digite o nome do grupo fonte para adicionar..."
                        className="flex-1 px-3.5 py-2 bg-[#121316] border border-[#2a2c36] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomChatGroup}
                        className="px-3.5 py-2 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Fonte</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Grupos Ativos (Tags/Chips com X para remover) */}
                  <div className="p-3 bg-[#121316] border border-[#22242a] rounded-xl min-h-[56px] flex flex-wrap gap-2 items-center">
                    {(chatFilterConfig.appliedGroups || []).length === 0 ? (
                      <span className="text-xs text-neutral-500 italic p-1">
                        Nenhum grupo fonte selecionado. Selecione no dropdown acima ou digite para adicionar fontes com linhas a serem filtradas.
                      </span>
                    ) : (
                      (chatFilterConfig.appliedGroups || []).map((grpName) => (
                        <span
                          key={grpName}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e2027] border border-[#FF5722]/40 text-white text-xs font-medium shadow-xs"
                        >
                          <Users2 className="w-3 h-3 text-[#FF5722]" />
                          <span className="font-semibold">{grpName}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGroupChatFilter(grpName)}
                            className="ml-1 text-neutral-400 hover:text-red-400 transition cursor-pointer p-0.5 rounded"
                            title="Remover grupo fonte"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {(chatFilterConfig.appliedGroups || []).length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                      <span>
                        🛡️ O filtro de chat atuará exclusivamente nas mensagens que tiverem como <strong>origem (fonte)</strong> os <strong>{chatFilterConfig.appliedGroups?.length || 0}</strong> grupo(s) selecionado(s) acima.
                      </span>
                      <button
                        type="button"
                        onClick={handleClearAllChatGroups}
                        className="text-neutral-500 hover:text-red-400 transition cursor-pointer underline text-[11px]"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* LISTA DE LINHAS / FRASES PARA EXCLUIR */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#18191d] border border-[#262832] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#23252d]">
                <div>
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                    Linhas & Chamadas para Exclusão
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Cadastre linhas exatas, frases ou padrões que o robô deve remover do texto antes de replicar a oferta.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chatFilterConfig.removeAsteriskHeaders !== false}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setChatFilterConfig((p) => ({ ...p, removeAsteriskHeaders: val }));
                        handleSaveChatFilterConfig({ removeAsteriskHeaders: val });
                      }}
                      className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                    />
                    <span>Apagar toda linha em <strong className="text-amber-300 font-mono">*exemplo*</strong></span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chatFilterConfig.removeUnitPriceHooks}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setChatFilterConfig((p) => ({ ...p, removeUnitPriceHooks: val }));
                        handleSaveChatFilterConfig({ removeUnitPriceHooks: val });
                      }}
                      className="w-4 h-4 accent-[#FF5722] rounded cursor-pointer"
                    />
                    <span>Auto-detectar preço unitário (*SÓ R$... CADA*)</span>
                  </label>
                </div>
              </div>

              {/* Input para adicionar nova linha/frase */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExcludedPhraseInput}
                  onChange={(e) => setNewExcludedPhraseInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExcludedPhrase()}
                  placeholder="Ex: *exemplo*, *SÓ R$11,66 CADA 😱* ou qualquer frase/linha indesejada"
                  className="flex-1 px-3.5 py-2.5 bg-[#121316] border border-[#272930] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722]"
                />
                <button
                  type="button"
                  onClick={handleAddExcludedPhrase}
                  className="px-4 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Linha</span>
                </button>
              </div>

              {/* Lista de frases/linhas cadastradas */}
              <div className="p-3 bg-[#121316] border border-[#22242a] rounded-xl min-h-[60px] flex flex-wrap gap-2 items-center">
                {(chatFilterConfig.excludedPhrases || []).length === 0 ? (
                  <span className="text-xs text-neutral-500 italic p-1">
                    Nenhuma frase cadastrada. Digite no campo acima para adicionar frases a serem excluídas.
                  </span>
                ) : (
                  (chatFilterConfig.excludedPhrases || []).map((phrase, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1e2027] border border-amber-500/30 text-amber-300 text-xs font-mono shadow-xs"
                    >
                      <Scissors className="w-3 h-3 text-[#FF5722]" />
                      <span className="font-semibold">{phrase}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludedPhrase(phrase)}
                        className="ml-1 text-neutral-400 hover:text-red-400 transition cursor-pointer p-0.5 rounded"
                        title="Remover frase"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
          </div>
        </div>
      )}
    </div>
  );
};
