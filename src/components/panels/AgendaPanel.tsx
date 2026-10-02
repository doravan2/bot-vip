import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Save,
  Check,
  AlertCircle,
  X,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

export interface DaySchedule {
  dayId: 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
  dayName: string;
  active: boolean;
  runAllDay: boolean;
  startHour: string;
  endHour: string;
}

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { dayId: 'domingo', dayName: 'Domingo', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'segunda', dayName: 'Segunda', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'terca', dayName: 'Terça', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'quarta', dayName: 'Quarta', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'quinta', dayName: 'Quinta', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'sexta', dayName: 'Sexta', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
  { dayId: 'sabado', dayName: 'Sábado', active: true, runAllDay: false, startHour: '08:00', endHour: '00:00' },
];

export const AgendaPanel: React.FC = () => {
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    try {
      const saved = localStorage.getItem('bot_vip_agenda');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 7) return parsed;
      }
    } catch {}
    return DEFAULT_SCHEDULE;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load from server on mount
  useEffect(() => {
    fetch('/api/settings/schedule')
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule && Array.isArray(data.schedule) && data.schedule.length === 7) {
          setSchedule(data.schedule);
          try {
            localStorage.setItem('bot_vip_agenda', JSON.stringify(data.schedule));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleDayActive = (dayId: string) => {
    setSchedule((prev) =>
      prev.map((day) => (day.dayId === dayId ? { ...day, active: !day.active } : day))
    );
  };

  const handleToggleRunAllDay = (dayId: string) => {
    setSchedule((prev) =>
      prev.map((day) => (day.dayId === dayId ? { ...day, runAllDay: !day.runAllDay } : day))
    );
  };

  const handleHourChange = (dayId: string, field: 'startHour' | 'endHour', value: string) => {
    setSchedule((prev) =>
      prev.map((day) => (day.dayId === dayId ? { ...day, [field]: value } : day))
    );
  };

  const handleSaveSchedule = async () => {
    setIsSaving(true);
    setFeedback(null);

    try {
      localStorage.setItem('bot_vip_agenda', JSON.stringify(schedule));

      const res = await fetch('/api/settings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          message: 'Configurações da Agenda salvas com sucesso! A automação respeitará os novos horários.',
        });
      } else {
        setFeedback({
          type: 'success',
          message: 'Agenda salva localmente com sucesso!',
        });
      }
    } catch {
      setFeedback({
        type: 'success',
        message: 'Agenda salva localmente no navegador!',
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleQuickPreset = (preset: 'all' | 'weekdays' | 'allDay') => {
    if (preset === 'all') {
      setSchedule((prev) => prev.map((day) => ({ ...day, active: true })));
    } else if (preset === 'weekdays') {
      setSchedule((prev) =>
        prev.map((day) => ({
          ...day,
          active: day.dayId !== 'domingo' && day.dayId !== 'sabado',
        }))
      );
    } else if (preset === 'allDay') {
      setSchedule((prev) => prev.map((day) => ({ ...day, active: true, runAllDay: true })));
    }
  };

  const handleResetDefault = () => {
    setSchedule(DEFAULT_SCHEDULE);
    setFeedback({ type: 'success', message: 'Horários restaurados para o padrão (08:00 às 00:00).' });
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto pb-16 text-neutral-200 animate-in fade-in">
      {/* Header Area matching Image 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#22242a]">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Agenda / Tempo
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Configure os dias, horários e intervalos de execução
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleResetDefault}
            className="px-3.5 py-2 rounded-xl bg-[#1e2026] hover:bg-[#282a34] text-neutral-300 hover:text-white text-xs font-bold border border-[#2e313c] transition cursor-pointer flex items-center gap-1.5"
            title="Restaurar padrão"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            onClick={handleSaveSchedule}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#f4511e] text-white text-xs font-extrabold shadow-lg shadow-[#FF5722]/30 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Configurações'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Section Title matching Image 2 */}
      <div className="space-y-1">
        <h2 className="text-base font-extrabold text-white">Dias da Semana</h2>
        <p className="text-xs text-neutral-400">Selecione os dias em que a automação deve rodar</p>
      </div>

      {/* Quick Presets Toolbar */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-neutral-400 font-medium mr-1">Atalhos:</span>
        <button
          onClick={() => handleQuickPreset('all')}
          className="px-3 py-1.5 rounded-lg bg-[#18191d] hover:bg-[#22242a] text-neutral-300 hover:text-white border border-[#272930] transition cursor-pointer font-bold"
        >
          Todos os Dias
        </button>
        <button
          onClick={() => handleQuickPreset('weekdays')}
          className="px-3 py-1.5 rounded-lg bg-[#18191d] hover:bg-[#22242a] text-neutral-300 hover:text-white border border-[#272930] transition cursor-pointer font-bold"
        >
          Apenas Seg a Sex
        </button>
        <button
          onClick={() => handleQuickPreset('allDay')}
          className="px-3 py-1.5 rounded-lg bg-[#18191d] hover:bg-[#22242a] text-neutral-300 hover:text-white border border-[#272930] transition cursor-pointer font-bold"
        >
          24 Horas Todos os Dias
        </button>
      </div>

      {/* Days List matching Image 2 */}
      <div className="space-y-4">
        {schedule.map((day) => {
          return (
            <div
              key={day.dayId}
              className={`p-5 rounded-2xl bg-[#141517] border shadow-xl transition-all space-y-4 ${
                day.active
                  ? 'border-[#262832] hover:border-[#383b48]'
                  : 'border-[#1e1f26] opacity-60 bg-[#101113]'
              }`}
            >
              {/* Day Header with Checkbox and Name */}
              <div className="flex items-center justify-between">
                <div
                  onClick={() => handleToggleDayActive(day.dayId)}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                      day.active
                        ? 'bg-[#FF5722] text-white shadow-md shadow-[#FF5722]/30'
                        : 'border border-neutral-600 bg-neutral-800 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span className="text-sm font-extrabold text-white tracking-tight group-hover:text-[#FF5722] transition">
                    {day.dayName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-medium">Rodar o dia todo</span>
                  <button
                    type="button"
                    onClick={() => handleToggleRunAllDay(day.dayId)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-1 cursor-pointer ${
                      day.runAllDay ? 'bg-[#FF5722]' : 'bg-[#22242a]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform shadow-md ${
                        day.runAllDay ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Subtext explanation matching Image 2 */}
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {day.runAllDay
                  ? 'A automação funcionará 24 horas ininterruptas neste dia.'
                  : 'A automação funcionará somente no período escolhido abaixo. Mantenha este switch desativado para esses horários valerem.'}
              </p>

              {/* Hours Selector matching Image 2 */}
              {!day.runAllDay && (
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 font-medium">Início:</span>
                    <div className="relative flex items-center">
                      <input
                        type="time"
                        value={day.startHour}
                        onChange={(e) => handleHourChange(day.dayId, 'startHour', e.target.value)}
                        disabled={!day.active}
                        className="px-3 py-1.5 bg-[#18191d] border border-[#282a32] rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#FF5722] disabled:opacity-50"
                      />
                      <Clock className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 font-medium">Fim:</span>
                    <div className="relative flex items-center">
                      <input
                        type="time"
                        value={day.endHour}
                        onChange={(e) => handleHourChange(day.dayId, 'endHour', e.target.value)}
                        disabled={!day.active}
                        className="px-3 py-1.5 bg-[#18191d] border border-[#282a32] rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-[#FF5722] disabled:opacity-50"
                      />
                      <Clock className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Save Button */}
      <div className="pt-4">
        <button
          onClick={handleSaveSchedule}
          disabled={isSaving}
          className="w-full py-4 rounded-2xl bg-[#FF5722] hover:bg-[#f4511e] text-white font-extrabold text-sm shadow-xl shadow-[#FF5722]/30 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>Salvar Todas as Configurações da Agenda</span>
        </button>
      </div>
    </div>
  );
};
