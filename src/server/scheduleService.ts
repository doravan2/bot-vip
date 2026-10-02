import path from 'path';
import fs from 'fs';

export interface DayScheduleServer {
  dayId: 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
  dayName: string;
  active: boolean;
  runAllDay: boolean;
  startHour: string;
  endHour: string;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const scheduleFilePath = path.resolve(storageDir, 'schedule_settings.json');

const DEFAULT_SCHEDULE_SERVER: DayScheduleServer[] = [
  { dayId: 'domingo', dayName: 'Domingo', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'segunda', dayName: 'Segunda', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'terca', dayName: 'Terça', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'quarta', dayName: 'Quarta', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'quinta', dayName: 'Quinta', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'sexta', dayName: 'Sexta', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
  { dayId: 'sabado', dayName: 'Sábado', active: true, runAllDay: true, startHour: '00:00', endHour: '23:59' },
];

let cachedSchedule: DayScheduleServer[] = [...DEFAULT_SCHEDULE_SERVER];

try {
  if (fs.existsSync(scheduleFilePath)) {
    const raw = fs.readFileSync(scheduleFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 7) {
      cachedSchedule = parsed;
    }
  }
} catch {
  cachedSchedule = [...DEFAULT_SCHEDULE_SERVER];
}

export function getScheduleSettings(): DayScheduleServer[] {
  return cachedSchedule;
}

export function saveScheduleSettings(schedule: DayScheduleServer[]): DayScheduleServer[] {
  if (Array.isArray(schedule) && schedule.length === 7) {
    cachedSchedule = schedule;
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      fs.writeFileSync(scheduleFilePath, JSON.stringify(cachedSchedule, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Agenda Server] Erro ao salvar schedule_settings.json:', err);
    }
  }
  return cachedSchedule;
}

/**
 * Checks if the automation is allowed to run right now according to the Agenda schedule.
 */
export function isScheduleActiveNow(): { isAllowed: boolean; reason?: string } {
  try {
    const now = new Date();
    // JS getDay(): 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
    const dayMap: Record<number, DayScheduleServer['dayId']> = {
      0: 'domingo',
      1: 'segunda',
      2: 'terca',
      3: 'quarta',
      4: 'quinta',
      5: 'sexta',
      6: 'sabado',
    };

    const currentDayId = dayMap[now.getDay()];
    const dayConfig = cachedSchedule.find((d) => d.dayId === currentDayId);

    if (!dayConfig) {
      return { isAllowed: true };
    }

    if (!dayConfig.active) {
      return {
        isAllowed: false,
        reason: `Automação desativada para ${dayConfig.dayName} na Agenda.`,
      };
    }

    if (dayConfig.runAllDay) {
      return { isAllowed: true };
    }

    // Check time range
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (dayConfig.startHour || '08:00').split(':').map((n) => parseInt(n, 10) || 0);
    const startMinutes = startH * 60 + startM;

    let [endH, endM] = (dayConfig.endHour || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
    if (endH === 0 && endM === 0) {
      endH = 24;
      endM = 0;
    }
    const endMinutes = endH * 60 + endM;

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return {
        isAllowed: false,
        reason: `Horário atual (${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) fora da janela permitida para ${dayConfig.dayName} (${dayConfig.startHour} às ${dayConfig.endHour}).`,
      };
    }

    return { isAllowed: true };
  } catch {
    return { isAllowed: true };
  }
}
