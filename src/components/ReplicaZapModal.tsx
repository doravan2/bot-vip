import React, { useState, useEffect } from 'react';
import {
  Zap,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Send,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Flame,
  Globe,
  Loader2,
} from 'lucide-react';
import { processReplicaZap, buildOfficialCopy, DealData } from '../utils/affiliateEngine.ts';
import { GroupChannel } from '../types/index.ts';

interface ReplicaZapModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolId: string;
  vipGroupLink: string;
  groups?: GroupChannel[];
}

const PRESET_COMPETITORS = [
  {
    name: '🎧 Fone Havit Gamenote (meli.la/2rycBD7)',
    text: `🔥 Fone Havit Gamenote Fuxi H6 Black
💰 De R$ 199,00
💥 Por R$ 139,00 (Desconto imperdível)

Link: https://meli.la/2rycBD7

👉 Entre no canal: https://t.me/concorrente_ofertas`,
  },
  {
    name: '👗 Vestido Infantil Skye (meli.la/2dcm9f7)',
    text: `🎁 👗 CRISE DO LOOKINHO RESOLVIDA COM ESSE VESTIDO DA SKYE BAIXOU MUUUITO 🐾✨

🚨 Vestido Infantil Skye Patrulha Canina

💰 De R$ 81,88
💥 Por R$ 75,62 (-8% OFF)

🎟 Cupom: SAIUBARATO

🔗 Link do produto:
https://meli.la/2dcm9f7

👉 Compartilhe com os amigos:
https://achadinho.pro/atacadovipofertas`,
  },
  {
    name: 'Canal da Ana (Air Fryer c/ Cupom)',
    text: `[Canal da Ana Promoções]
Fritadeira Sem Óleo Air Fryer Mondial 4L 1500W Preto
De R$ 349,90 por R$ 199,90 (42% OFF)
Use o cupom: COZINHA10
Pegue aqui: https://www.mercadolivre.com.br/airfryer?seller=999&concorrente_id=ana123`,
  },
  {
    name: 'Achados da Ju (Smartphone S24)',
    text: `🚨 ACHADOS DA JU OFICIAL 🚨
Galaxy S24 256GB 5G Samsung
De R$ 5.999 por R$ 3.899 com cupom GALAXY300
Link oficial: https://www.amazon.com.br/dp/B0CS812XYZ?tag=juachados-20
Entrem no meu grupo vip: https://chat.whatsapp.com/GrupoDaJu123`,
  },
  {
    name: 'Grupo Tech Deals (Headset Gamer)',
    text: `🔥 Headset Gamer Redragon Zeus X RGB 7.1
Apenas R$ 219,00
Cupom: GAMER20
Compre rápido: https://shopee.com.br/product/123/456?aff_id=techdeals99`,
  },
];

export const ReplicaZapModal: React.FC<ReplicaZapModalProps> = ({
  isOpen,
  onClose,
  toolId,
  vipGroupLink,
}) => {
  const [rawText, setRawText] = useState(PRESET_COMPETITORS[0].text);
  const [copied, setCopied] = useState(false);
  const [asyncCopy, setAsyncCopy] = useState<string>('');
  const [canonicalLongUrl, setCanonicalLongUrl] = useState<string>('');
  const [monetizedUrl, setMonetizedUrl] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);

  // Sync fallback calculation
  const syncResult = processReplicaZap(rawText, toolId, vipGroupLink);
  const currentCopy = asyncCopy || syncResult.copy;

  // Auto-resolve via Python Headless Browser backend endpoint
  useEffect(() => {
    if (!isOpen || !rawText.trim()) return;

    let active = true;
    setIsResolving(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/replica-zap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: rawText, toolId, vipGroupLink }),
        });
        if (res.ok && active) {
          const data = await res.json();
          if (data.formattedCopy) {
            setAsyncCopy(data.formattedCopy);
          }
          if (data.deal?.productUrl) {
            setCanonicalLongUrl(data.deal.productUrl);
          }
          if (data.linkResult?.monetizedUrl) {
            setMonetizedUrl(data.linkResult.monetizedUrl);
          }
        }
      } catch {
        // use sync copy
      } finally {
        if (active) setIsResolving(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, rawText, toolId, vipGroupLink]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyPreset = (text: string) => {
    setRawText(text);
    setAsyncCopy('');
    setCanonicalLongUrl('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#141517] border border-[#22242a] rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#22242a] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF5722] to-orange-600 flex items-center justify-center text-white shadow-lg shadow-[#FF5722]/30">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Módulo Replica Zap &bull; Clonador & Reescritor
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF5722]/15 text-[#FF5722] border border-[#FF5722]/30">
                  ID: {toolId}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Cole a mensagem copiada de qualquer canal concorrente para limpar marcas e gerar a copy oficial.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-[#18191d] transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Watermark AI Shield Banner */}
        <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-orange-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-[11px] text-emerald-200">
              Filtro Anti-Marca d'Água Ativo (Visão IA) &bull; Remove avatares, usernames (@gustavohoffmannofc) e busca foto limpa HD oficial no marketplace
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            PROTEÇÃO IA
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
          <span className="text-[11px] text-neutral-400 font-semibold whitespace-nowrap">
            Testar Concorrentes:
          </span>
          {PRESET_COMPETITORS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleApplyPreset(preset.text)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#18191d] hover:bg-[#202227] text-neutral-300 hover:text-white border border-[#22242a] whitespace-nowrap transition cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Two Columns: Input (Left) vs Output Preview (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 overflow-y-auto pr-1">
          {/* Left: Input Textarea */}
          <div className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                Mensagem Bruta do Concorrente:
              </label>
              <button
                onClick={() => setRawText('')}
                className="text-[11px] text-neutral-500 hover:text-red-400 cursor-pointer"
              >
                Limpar
              </button>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              placeholder="Cole aqui a mensagem do grupo concorrente..."
              className="w-full flex-1 p-3.5 bg-[#121214] border border-[#22242a] rounded-2xl text-xs font-mono text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#FF5722] resize-none leading-relaxed"
            />

            {/* Competitor detected badge */}
            {syncResult.competitorDetected && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Removido do concorrente: <strong className="font-mono">{syncResult.competitorDetected}</strong>
                </span>
              </div>
            )}

            {/* Headless Browser Resolution Status */}
            {canonicalLongUrl && (
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-start gap-2">
                <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="overflow-hidden">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>URL Canônica Longa Extraída (Headless):</span>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-300 truncate mt-0.5">
                    {canonicalLongUrl}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Output WhatsApp Simulator */}
          <div className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Copy Oficial Gerada (Pronta para Envio):
              </label>
              <div className="flex items-center gap-2">
                {isResolving && (
                  <span className="text-[10px] text-cyan-400 font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Resolvendo link...
                  </span>
                )}
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  100% Monetizada
                </span>
              </div>
            </div>

            {/* WhatsApp Speech Bubble */}
            <div className="flex-1 p-4 rounded-2xl bg-[#0b141a] border border-[#1f2c34] flex flex-col justify-between space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#1f2c34] text-white text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-lg relative border-l-4 border-[#25d366]">
                {currentCopy}
              </div>

              {/* Link Verification Pill */}
              <div className="p-2.5 rounded-xl bg-[#141517] border border-[#22242a] text-[11px] text-neutral-400 flex items-center justify-between">
                <span>Link Oficial Gerado:</span>
                <span className="text-emerald-400 font-mono font-bold truncate max-w-[280px]">
                  {monetizedUrl || (currentCopy.match(/https?:\/\/[^\s\n]+/)?.[0] || 'https://meli.la/1njPhaS')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-[#22242a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-neutral-500 font-mono">
            Template: 🎁 [Título] &bull; 💰 [De] &bull; 💥 [Por] &bull; 🎟️ [Cupom] &bull; 🔗 [Link] &bull; 👉 [Grupo VIP]
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(currentCopy)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Disparar no WhatsApp</span>
            </a>

            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer ${
                copied
                  ? 'bg-white text-neutral-950 shadow-white/10'
                  : 'bg-[#FF5722] hover:bg-[#f4511e] text-white shadow-[#FF5722]/25'
              }`}
            >
              {copied ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copy Copiada!' : 'Copiar Copy Pronta'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
