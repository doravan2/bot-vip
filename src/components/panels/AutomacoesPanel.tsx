import React, { useState } from 'react';
import {
  Cpu,
  Clock,
  ShieldCheck,
  Send,
  Check,
  RotateCcw,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { AutomationSettings } from '../../types/index.ts';
import { OFFICIAL_USER_AFFILIATE_ID, DEFAULT_VIP_GROUP_LINK } from '../../utils/affiliateEngine.ts';

interface AutomacoesPanelProps {
  toolId: string;
  source: string;
  vipGroupLink: string;
  onOpenReplicaModal: () => void;
}

export const AutomacoesPanel: React.FC<AutomacoesPanelProps> = ({
  toolId,
  source,
  vipGroupLink,
  onOpenReplicaModal,
}) => {
  const [isRunning, setIsRunning] = useState(true);
  const [startHour, setStartHour] = useState('08:00');
  const [endHour, setEndHour] = useState('23:00');
  const [minInterval, setMinInterval] = useState(15);
  const [maxInterval, setMaxInterval] = useState(35);
  const [antiBanJitter, setAntiBanJitter] = useState(true);
  const [autoReplicaZap, setAutoReplicaZap] = useState(true);
  const [filterCompetitors, setFilterCompetitors] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Template editor
  const [templateCopy, setTemplateCopy] = useState(
`🎁 *[Título Empolgante e Limpo do Produto]*

💰 ~De R$ [Preço Antigo]~
💥 *Por R$ [Preço Atual]* (Com desconto!)
🎟️ Cupom: *[Se houver]*

🔗 Link oficial:
[LINK_COM_ID_${toolId}]

👉 Entre no nosso grupo VIP:
${vipGroupLink}`
  );

  const handleSaveSettings = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleResetTemplate = () => {
    setTemplateCopy(
`🎁 *[Título Empolgante e Limpo do Produto]*

💰 ~De R$ [Preço Antigo]~
💥 *Por R$ [Preço Atual]* (Com desconto!)
🎟️ Cupom: *[Se houver]*

🔗 Link oficial:
[LINK_COM_ID_${toolId}]

👉 Entre no nosso grupo VIP:
${vipGroupLink}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
              }`}
            ></span>
            <h2 className="text-lg font-extrabold text-white">
              Motor Central de Automação & Disparos
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Configure janelas de horários, intervalos anti-ban, regras do Replica Zap e o template oficial das mensagens.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-lg ${
              isRunning
                ? 'bg-emerald-500 text-neutral-950 shadow-emerald-500/20 hover:bg-emerald-400'
                : 'bg-neutral-800 text-neutral-300 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>{isRunning ? 'MOTOR ATIVO (DISPARANDO)' : 'MOTOR PAUSADO'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Operational Windows & Schedules (6 Cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Operating Window */}
          <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#22242a]">
              <Clock className="w-4 h-4 text-[#FF5722]" />
              <h3 className="font-bold text-sm text-white">Janela de Horário de Funcionamento</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Início dos Disparos:</label>
                <input
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Término dos Disparos:</label>
                <input
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>
            </div>

            <p className="text-[11px] text-neutral-400">
              O robô só enviará promoções entre <strong className="text-white">{startHour}</strong> e{' '}
              <strong className="text-white">{endHour}</strong>, respeitando o descanso da sua audiência e evitando banimentos.
            </p>
          </div>

          {/* Anti-Ban Intervals */}
          <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#22242a]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Intervalo Randômico Anti-Ban (Jitter)</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Tempo Mínimo (Minutos):</label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={minInterval}
                  onChange={(e) => setMinInterval(parseInt(e.target.value, 10) || 5)}
                  className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Tempo Máximo (Minutos):</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={maxInterval}
                  onChange={(e) => setMaxInterval(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-3.5 py-2.5 bg-[#18191d] border border-[#22242a] rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#FF5722]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-neutral-300">Variação Randômica de Segundos:</span>
              <button
                onClick={() => setAntiBanJitter(!antiBanJitter)}
                className={`text-xs font-bold px-3 py-1 rounded-lg border transition ${
                  antiBanJitter
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                }`}
              >
                {antiBanJitter ? 'ATIVADO (+/- 45s aleatórios)' : 'DESATIVADO'}
              </button>
            </div>
          </div>

          {/* ReplicaZap Pipeline Controls */}
          <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242a]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#FF5722]" />
                <h3 className="font-bold text-sm text-white">Regras do Módulo Replica Zap</h3>
              </div>
              <button
                onClick={onOpenReplicaModal}
                className="text-xs text-[#FF5722] hover:underline font-semibold cursor-pointer"
              >
                Abrir Simulador
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#18191d] border border-[#22242a] cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-white block">
                    Clonagem Automática de Grupos Fonte
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Captura mensagens concorrentes e reescreve em background
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoReplicaZap}
                  onChange={(e) => setAutoReplicaZap(e.target.checked)}
                  className="w-4 h-4 accent-[#FF5722]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#18191d] border border-[#22242a] cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-white block">
                    Filtro Estrito de Concorrentes
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Remove menções (ex: "Canal da Ana", "Achados da Ju") e injeta BOT VIP OFERTAS
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={filterCompetitors}
                  onChange={(e) => setFilterCompetitors(e.target.checked)}
                  className="w-4 h-4 accent-[#FF5722]"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Template Customization & Preview (6 Cols) */}
        <div className="lg:col-span-6 space-y-5">
          <div className="p-5 rounded-2xl bg-[#141517] border border-[#22242a] shadow-md space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242a]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FF5722]" />
                <h3 className="font-bold text-sm text-white">Template Obrigatório de Disparo</h3>
              </div>
              <button
                onClick={handleResetTemplate}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Restaurar Padrão
              </button>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Estrutura visual obrigatória conforme as diretrizes do BOT VIP OFERTAS. O robô preenche dinamicamente cada campo com emojis persuasivos.
            </p>

            <div className="relative">
              <textarea
                value={templateCopy}
                onChange={(e) => setTemplateCopy(e.target.value)}
                rows={11}
                className="w-full p-4 bg-[#121214] border border-[#22242a] rounded-xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722] resize-none leading-relaxed"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[#18191d] border border-[#22242a] space-y-2 text-xs">
              <div className="font-semibold text-neutral-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Validações Automáticas Ativas:</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-400 list-disc list-inside">
                <li>
                  ID de Afiliado: <code className="text-[#FF5722] font-bold font-mono">{toolId}</code>
                </li>
                <li>Origem: <code className="text-[#FF5722] font-mono">{source}</code></li>
                <li>Link do Grupo VIP: <code className="text-neutral-300 font-mono truncate">{vipGroupLink}</code></li>
                <li>Omissão automática de linhas de cupom ou preço antigo quando vazios</li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-bold text-xs transition shadow-lg shadow-[#FF5722]/20 cursor-pointer"
              >
                {savedSuccess ? <Check className="w-4 h-4 stroke-[3]" /> : null}
                {savedSuccess ? 'Automação Salva com Sucesso!' : 'Salvar Regras de Automação'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
