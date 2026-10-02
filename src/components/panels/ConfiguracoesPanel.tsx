import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Upload,
  Copy,
  CheckCircle2,
  AlertCircle,
  FileJson,
  RefreshCw,
  Sparkles,
  ShoppingBag,
  Users2,
  Megaphone,
  Radio,
  Zap,
  Eye,
  Check,
  Code2,
  FileText,
  HelpCircle,
  Play,
  Pause,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Layers,
  Plus,
} from 'lucide-react';
import { GroupChannel, SourceGroup } from '../../types/index.ts';

interface ConfiguracoesPanelProps {
  groups?: GroupChannel[];
  sourceGroups?: SourceGroup[];
  vipGroupLink?: string;
  onUpdateVipGroupLink?: (link: string) => void;
  onImportComplete?: () => void;
  onAddSourceGroup?: (source: SourceGroup) => void;
  onUpdateSourceGroup?: (source: SourceGroup) => void;
  onToggleSourceGroupStatus?: (id: string) => void;
  onDeleteSourceGroup?: (id: string) => void;
  onSaveSourceGroups?: (sources: SourceGroup[]) => void;
}

export const ConfiguracoesPanel: React.FC<ConfiguracoesPanelProps> = ({
  groups = [],
  sourceGroups = [],
  vipGroupLink = '',
  onUpdateVipGroupLink,
  onImportComplete,
  onAddSourceGroup,
  onUpdateSourceGroup,
  onToggleSourceGroupStatus,
  onDeleteSourceGroup,
  onSaveSourceGroups,
}) => {
  const [backupJson, setBackupJson] = useState<string>('Carregando configurações...');
  const [backupObject, setBackupObject] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingFontes, setIsSavingFontes] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeView, setActiveView] = useState<'visual' | 'code'>('visual');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Salvar fontes especificamente em configurações
  const handleSaveFontesInConfig = async () => {
    setIsSavingFontes(true);
    setFeedback(null);
    try {
      // 1. Salva no endpoint dedicado do backend
      const res = await fetch('/api/configuracoes/salvar-fontes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceRules: sourceGroups }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar fontes no servidor');
      }

      // 2. Salva no localStorage para sincronização persistente
      try {
        localStorage.setItem('bot_vip_sources', JSON.stringify(sourceGroups));
      } catch {}

      if (onSaveSourceGroups) {
        onSaveSourceGroups(sourceGroups);
      }

      // 3. Atualiza o backup consolidado
      await loadFullConfiguration();

      setFeedback({
        type: 'success',
        message: `✅ ${sourceGroups.length} fontes e regras de monitoramento salvas com sucesso em Configurações!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Erro ao salvar fontes em configurações: ${err?.message || err}`,
      });
    } finally {
      setIsSavingFontes(false);
    }
  };

  // Carrega todas as configurações de todas as abas
  const loadFullConfiguration = async () => {
    setIsLoading(true);
    try {
      // 1. Busca configs do backend
      const res = await fetch('/api/backup/export');
      let serverBackup: any = {};
      if (res.ok) {
        const data = await res.json();
        serverBackup = data.backup || {};
      }

      // 2. Mescla com os dados do frontend (localStorage/props)
      const completeBackup = {
        app: 'BOT VIP OFERTAS - AUTOMAÇÃO',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedAtFormatted: new Date().toLocaleString('pt-BR'),
        // Marketplaces & Afiliados
        marketplacesConfig: serverBackup.marketplacesConfig || {},
        affiliateSettings: serverBackup.affiliateSettings || {},
        // Agenda & Cooldown
        agendaConfig: serverBackup.agendaConfig || {},
        // Grupos & Canais
        groups: groups,
        telegramChannels: serverBackup.telegramChannels || [],
        // Conexões & Links VIP
        vipGroupLink: vipGroupLink || serverBackup.vipGroupLink || '',
        // Fontes & Regras de Direcionamento
        sourceRules: serverBackup.sourceRules && serverBackup.sourceRules.length > 0 ? serverBackup.sourceRules : sourceGroups,
        // Filtro Anti-Marca d'Água
        watermarkConfig: serverBackup.watermarkConfig || {},
        // Filtro de Chat (Linhas com *exemplo*)
        chatFilterConfig: serverBackup.chatFilterConfig || {},
        // Telegram Bot Config
        telegramConfig: serverBackup.telegramConfig || {},
      };

      setBackupObject(completeBackup);
      setBackupJson(JSON.stringify(completeBackup, null, 2));
    } catch (err: any) {
      console.error('Erro ao carregar configurações para exportação:', err);
      setFeedback({
        type: 'error',
        message: 'Falha ao consolidar configurações de todas as abas.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFullConfiguration();
  }, [groups, sourceGroups, vipGroupLink]);

  // 1. Download do arquivo JSON
  const handleDownloadJson = () => {
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `configuracoes-bot-vip-${dateStr}.json`;

      const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback({
        type: 'success',
        message: `Arquivo "${fileName}" baixado com sucesso! Salve em um local seguro.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Erro ao gerar arquivo de download: ${err?.message || err}`,
      });
    }
  };

  // 2. Copiar JSON para área de transferência
  const handleCopyJson = () => {
    navigator.clipboard.writeText(backupJson);
    setIsCopied(true);
    setFeedback({
      type: 'success',
      message: 'JSON com todas as configurações copiado para a área de transferência!',
    });
    setTimeout(() => setIsCopied(false), 3000);
  };

  // 3. Importar e Restaurar JSON (via arquivo ou texto)
  const applyImportedJson = async (rawJsonString: string) => {
    setIsImporting(true);
    setFeedback(null);

    try {
      const parsed = JSON.parse(rawJsonString);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('O conteúdo fornecido não é um objeto JSON válido.');
      }

      // Envia para o servidor persistir todas as configurações
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: parsed }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'O servidor recusou a restauração do arquivo.');
      }

      // Atualiza localStorage se houver dados locais
      if (parsed.agendaConfig) {
        try {
          localStorage.setItem('bot_vip_agenda', JSON.stringify(parsed.agendaConfig));
        } catch {}
      }
      if (Array.isArray(parsed.groups)) {
        try {
          localStorage.setItem('bot_vip_groups', JSON.stringify(parsed.groups));
        } catch {}
      }
      if (Array.isArray(parsed.sourceRules)) {
        try {
          localStorage.setItem('bot_vip_sources', JSON.stringify(parsed.sourceRules));
        } catch {}
      }
      if (typeof parsed.vipGroupLink === 'string' && parsed.vipGroupLink.trim()) {
        try {
          localStorage.setItem('bot_vip_link', parsed.vipGroupLink.trim());
          if (onUpdateVipGroupLink) onUpdateVipGroupLink(parsed.vipGroupLink.trim());
        } catch {}
      }

      setFeedback({
        type: 'success',
        message: 'Todas as configurações de todas as abas foram importadas e aplicadas com sucesso!',
      });
      setPastedJson('');

      // Recarrega o estado atual
      await loadFullConfiguration();

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Erro na importação: ${err?.message || 'Arquivo JSON corrompido ou formato inválido.'}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Handler para upload de arquivo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        await applyImportedJson(content);
      }
    };
    reader.readAsText(file);
    // Limpa o input para permitir selecionar o mesmo arquivo novamente se desejar
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in pb-12">
      {/* Banner Principal */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#FF5722]/10 via-[#FF5722]/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF5722] to-amber-500 flex items-center justify-center text-white shadow-lg shadow-[#FF5722]/20 shrink-0">
              <FileJson className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2.5">
                <span>Backup & Exportação de Configurações</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30">
                  JSON UNIFICADO
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Salve, baixe ou importe todas as configurações de todas as abas do bot em um único arquivo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadFullConfiguration}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#18191d] hover:bg-[#202228] border border-[#2a2c36] text-xs font-bold text-neutral-300 hover:text-white transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF5722]' : ''}`} />
            <span>Atualizar Dados</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-3 animate-in fade-in shadow-md ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* SEÇÃO PRINCIPAL: GERENCIADOR E SALVAMENTO DE FONTES EM CONFIGURAÇÕES */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#22242a]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF5722]/15 text-[#FF5722] flex items-center justify-center font-bold">
                <Radio className="w-4 h-4" />
              </div>
              <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2.5">
                <span>Fontes & Regras de Reenvio em Configurações</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30">
                  {sourceGroups.length} {sourceGroups.length === 1 ? 'REGRA' : 'REGRAS'}
                </span>
              </h3>
            </div>
            <p className="text-xs text-neutral-400">
              Gerencie e salve todas as fontes de grupos concorrentes e direcionamento para os seus grupos VIP diretamente nas configurações do sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveFontesInConfig}
            disabled={isSavingFontes}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-black transition shadow-lg shadow-[#FF5722]/20 cursor-pointer self-start sm:self-auto shrink-0"
          >
            {isSavingFontes ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 stroke-[3]" />
            )}
            <span>{isSavingFontes ? 'Salvando Fontes...' : 'Salvar Fontes em Configurações'}</span>
          </button>
        </div>

        {/* Resumo Rápido das Fontes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#18191d] border border-[#262832]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold block">Total de Fontes</span>
            <span className="text-lg font-black text-white">{sourceGroups.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#18191d] border border-[#262832]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold block">Monitorando</span>
            <span className="text-lg font-black text-emerald-400">
              {sourceGroups.filter((s) => s.status !== 'paused').length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#18191d] border border-[#262832]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold block">Pausadas</span>
            <span className="text-lg font-black text-amber-400">
              {sourceGroups.filter((s) => s.status === 'paused').length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#18191d] border border-[#262832]">
            <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold block">Destinos VIP</span>
            <span className="text-lg font-black text-sky-400">
              {new Set(sourceGroups.flatMap((s) => s.targetGroups || [s.targetGroup])).size}
            </span>
          </div>
        </div>

        {/* Lista de Regras de Fontes */}
        {sourceGroups.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#18191d] border border-dashed border-[#2d303b] text-center space-y-2">
            <Radio className="w-8 h-8 text-neutral-600 mx-auto" />
            <p className="text-xs font-bold text-neutral-300">Nenhuma fonte cadastrada nas configurações.</p>
            <p className="text-[11px] text-neutral-500">
              Acesse a aba "Fontes" no menu lateral para adicionar os grupos concorrentes que você deseja monitorar.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {sourceGroups.map((rule, idx) => {
              const isPaused = rule.status === 'paused';
              const srcNames = rule.sourceNames && rule.sourceNames.length > 0 ? rule.sourceNames : [rule.sourceName];
              const tgtNames = rule.targetGroups && rule.targetGroups.length > 0 ? rule.targetGroups : [rule.targetGroup];

              return (
                <div
                  key={rule.id || `rule-${idx}`}
                  className={`p-4 rounded-xl border transition ${
                    isPaused
                      ? 'bg-[#15161a] border-[#22242a] opacity-75'
                      : 'bg-[#18191e] border-[#2a2c36] hover:border-[#383a48]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Fontes Origem */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase text-neutral-400 mr-1">
                          FONTE:
                        </span>
                        {srcNames.map((s, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#22242c] text-white border border-[#323542]"
                          >
                            <Radio className="w-3 h-3 text-[#FF5722]" />
                            <span className="truncate max-w-[200px]">{s}</span>
                          </span>
                        ))}
                      </div>

                      {/* Destinos */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase text-neutral-400 mr-1 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-sky-400" />
                          <span>DESTINO:</span>
                        </span>
                        {tgtNames.map((t, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-300 border border-sky-500/25"
                          >
                            <span className="truncate max-w-[200px]">{t}</span>
                          </span>
                        ))}
                      </div>

                      {/* Opções e Tags */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono text-neutral-400">
                        {rule.autoFetchProductImage !== false && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            FOTO LIMPA HD
                          </span>
                        )}
                        {rule.validateMeliStock !== false && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            ESTOQUE MERCADO LIVRE
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações da Regra */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                      {onToggleSourceGroupStatus && (
                        <button
                          type="button"
                          onClick={() => onToggleSourceGroupStatus(rule.id)}
                          title={isPaused ? 'Ativar monitoramento' : 'Pausar monitoramento'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            isPaused
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                        >
                          {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                          <span>{isPaused ? 'Pausado' : 'Ativo'}</span>
                        </button>
                      )}

                      {onDeleteSourceGroup && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Deseja excluir a regra de fontes [${rule.sourceName}]?`)) {
                              onDeleteSourceGroup(rule.id);
                            }
                          }}
                          title="Excluir regra de fontes"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
          <span>* As fontes salvas aqui permanecem gravadas permanentemente no arquivo do servidor.</span>
          <button
            type="button"
            onClick={handleSaveFontesInConfig}
            disabled={isSavingFontes}
            className="text-[#FF5722] hover:text-[#ff7043] font-bold underline cursor-pointer"
          >
            {isSavingFontes ? 'Gravando alterações...' : 'Confirmar & Gravar no Disco'}
          </button>
        </div>
      </div>

      {/* PAINEL DE AÇÕES: BAIXAR E EXPORTAR JSON */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CARD 1: EXPORTAR / BAIXAR JSON */}
        <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF5722]/15 text-[#FF5722] flex items-center justify-center font-bold">
                <Download className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-extrabold text-white">Baixar / Exportar Configurações</h3>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Gera um arquivo <code className="text-amber-300 font-mono font-bold">.json</code> com todos os dados: Marketplaces, Grupos, Canais, Conexões, Fontes, Filtros Anti-Marca e Filtro de Chat.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              disabled={isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] text-white text-xs font-extrabold transition shadow-lg shadow-[#FF5722]/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Arquivo JSON (.json)</span>
            </button>

            <button
              type="button"
              onClick={handleCopyJson}
              disabled={isLoading}
              className="px-4 py-3 rounded-xl bg-[#1e2026] hover:bg-[#282b33] border border-[#2f323e] text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{isCopied ? 'Copiado!' : 'Copiar JSON'}</span>
            </button>
          </div>
        </div>

        {/* CARD 2: IMPORTAR / RESTAURAR JSON */}
        <div className="p-6 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-extrabold text-white">Importar / Restaurar Arquivo</h3>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Carregue um arquivo JSON exportado anteriormente para restaurar instantaneamente todas as abas e regras do sistema.
            </p>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-extrabold transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isImporting ? 'Restaurando...' : 'Selecionar e Carregar Arquivo JSON'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RESUMO DOS DADOS INCLUÍDOS NO JSON */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#22242a]">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-[#FF5722]" />
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Conteúdo Consolidado no JSON de Exportação
            </h3>
          </div>
          <span className="text-[11px] text-neutral-400 font-mono">
            {backupObject ? `${Object.keys(backupObject).length} seções inclusas` : 'Consolidando...'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Card Marketplaces */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>Marketplaces</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                INCLUSO
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Tool ID oficial (<code>{backupObject?.affiliateSettings?.mercadoLivre?.toolId || 'sf20250625192813'}</code>), Shopee, Amazon e instâncias ativas.
            </p>
          </div>

          {/* Card Grupos & Canais */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Grupos & Canais</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {groups.length} GRUPOS
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Lista de grupos do WhatsApp, canais de transmissão e canais do Telegram.
            </p>
          </div>

          {/* Card Fontes */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#FF5722]" />
                <span>Fontes Monitoradas</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FF5722]/10 text-[#FF5722] border border-[#FF5722]/20">
                {sourceGroups.length} REGRAS
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Grupos concorrentes monitorados e regras de encaminhamento para grupos VIP.
            </p>
          </div>

          {/* Card Anti-Marca d'Água */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Anti-Marca d'Água</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FOTO LIMPA HD
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Grupos fontes configurados para substituição automática de foto oficial.
            </p>
          </div>

          {/* Card Filtro de Chat */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Filtro de Chat</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                *EXEMPLO*
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Regras para apagar linhas entre asteriscos e frases cadastradas de fontes.
            </p>
          </div>

          {/* Card Conexões & VIP */}
          <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#262832] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5 text-purple-400" />
                <span>Links VIP & Telegram</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                CONFIGURADO
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Link de convite do WhatsApp, Telegram e credenciais de bots.
            </p>
          </div>
        </div>
      </div>

      {/* VISUALIZADOR DE CÓDIGO JSON & ÁREA PARA COLAR */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#141517] border border-[#22242a] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#22242a]">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#FF5722]" />
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                Visualizador & Editor de Código JSON
              </h3>
            </div>
            <p className="text-[11px] text-neutral-400">
              Você pode inspecionar o JSON atual ou colar um JSON para restaurar manualmente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('visual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                activeView === 'visual'
                  ? 'bg-[#FF5722] text-white border-[#FF5722]'
                  : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
              }`}
            >
              Visualizar JSON Atual
            </button>
            <button
              type="button"
              onClick={() => setActiveView('code')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                activeView === 'code'
                  ? 'bg-[#FF5722] text-white border-[#FF5722]'
                  : 'bg-[#121316] text-neutral-400 border-[#2a2c36] hover:text-white'
              }`}
            >
              Colar JSON para Aplicar
            </button>
          </div>
        </div>

        {activeView === 'visual' ? (
          <div className="relative">
            <pre className="p-4 bg-[#0e0f12] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-300 max-h-96 overflow-y-auto overflow-x-auto leading-relaxed select-all">
              {backupJson}
            </pre>
            <button
              type="button"
              onClick={handleCopyJson}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#1e2027] hover:bg-[#282b35] border border-[#303340] text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer shadow-md"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              placeholder="Cole aqui o conteúdo completo do seu arquivo .json de backup..."
              rows={10}
              className="w-full p-4 bg-[#0e0f12] border border-[#262832] rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF5722] leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Certifique-se de colar o JSON completo com todas as chaves válidas.
              </span>
              <button
                type="button"
                onClick={() => applyImportedJson(pastedJson)}
                disabled={!pastedJson.trim() || isImporting}
                className="px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#e64a19] disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Aplicando...' : 'Aplicar Configurações Coladas'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
