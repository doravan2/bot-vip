import fs from 'fs';
import path from 'path';

export interface ConversionStepResult {
  status: 'success' | 'failed' | 'skipped' | 'pending';
  detail?: string;
  value?: string;
  durationMs?: number;
}

export interface ConversionLogEntry {
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
    step1_expansion: ConversionStepResult;
    step2_cleaning: ConversionStepResult;
    step3_monetization: ConversionStepResult;
  };
  rawApiResponse?: Record<string, any>;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const logFilePath = path.resolve(storageDir, 'conversion_logs.json');

const MAX_LOGS = 150;
let inMemoryLogs: ConversionLogEntry[] = [];

// Initialize logs from file
try {
  if (fs.existsSync(logFilePath)) {
    const raw = fs.readFileSync(logFilePath, 'utf-8');
    inMemoryLogs = JSON.parse(raw);
  }
} catch (e) {
  inMemoryLogs = [];
}

function persistLogs() {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(logFilePath, JSON.stringify(inMemoryLogs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ConversionLogger] Erro ao persistir conversion_logs.json:', err);
  }
}

export function recordConversionLog(entry: Omit<ConversionLogEntry, 'id' | 'timestamp' | 'epoch'>): ConversionLogEntry {
  const fullEntry: ConversionLogEntry = {
    id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    epoch: Date.now(),
    ...entry,
  };

  inMemoryLogs.unshift(fullEntry);
  if (inMemoryLogs.length > MAX_LOGS) {
    inMemoryLogs = inMemoryLogs.slice(0, MAX_LOGS);
  }

  persistLogs();
  return fullEntry;
}

export function getConversionLogs(limit: number = 50): ConversionLogEntry[] {
  return inMemoryLogs.slice(0, limit);
}

export function clearConversionLogs(): void {
  inMemoryLogs = [];
  persistLogs();
}
