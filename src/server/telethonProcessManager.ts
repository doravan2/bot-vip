import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TelethonConfig {
  apiId: string;
  apiHash: string;
  phone: string;
  autoStart?: boolean;
}

export interface TelethonStatus {
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
}

const CONFIG_FILE = path.join(process.cwd(), 'bot_vip_telethon_config.json');
const ENV_FILE = path.join(process.cwd(), '.env');

let currentProcess: ChildProcess | null = null;
let telethonStatus: TelethonStatus['status'] = 'idle';
let telethonStatusMessage: string = 'Motor Telethon Fantasma inativo.';
let lastCodeRequestedAt: string | undefined = undefined;
let lastConnectedAt: string | undefined = undefined;
const recentLogs: string[] = [];
const MAX_LOGS = 200;

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const line = `[${timestamp}] ${message}`;
  recentLogs.push(line);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

export function getTelethonConfig(): TelethonConfig {
  let conf: TelethonConfig = {
    apiId: process.env.TELEGRAM_API_ID || '',
    apiHash: process.env.TELEGRAM_API_HASH || '',
    phone: process.env.TELEGRAM_PHONE || '',
    autoStart: false,
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      conf = { ...conf, ...data };
    } catch {}
  }

  return conf;
}

export function saveTelethonConfig(newConfig: Partial<TelethonConfig>): TelethonConfig {
  const current = getTelethonConfig();
  const merged: TelethonConfig = {
    ...current,
    ...newConfig,
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar bot_vip_telethon_config.json:', err);
  }

  // Update process.env
  if (merged.apiId) process.env.TELEGRAM_API_ID = merged.apiId;
  if (merged.apiHash) process.env.TELEGRAM_API_HASH = merged.apiHash;
  if (merged.phone) process.env.TELEGRAM_PHONE = merged.phone;
  process.env.MODO_ESCUTA = 'TELEGRAM';

  // Also sync with .env file if it exists
  try {
    let envContent = '';
    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    }

    const setEnvVar = (content: string, key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${val}`);
      }
      return content ? `${content.trim()}\n${key}=${val}` : `${key}=${val}`;
    };

    if (merged.apiId) envContent = setEnvVar(envContent, 'TELEGRAM_API_ID', merged.apiId);
    if (merged.apiHash) envContent = setEnvVar(envContent, 'TELEGRAM_API_HASH', merged.apiHash);
    if (merged.phone) envContent = setEnvVar(envContent, 'TELEGRAM_PHONE', merged.phone);
    envContent = setEnvVar(envContent, 'MODO_ESCUTA', 'TELEGRAM');

    fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
  } catch {}

  return merged;
}

export function getTelethonStatus(): TelethonStatus {
  const conf = getTelethonConfig();
  const isRunning = currentProcess !== null && !currentProcess.killed;

  return {
    isRunning,
    status: isRunning ? telethonStatus : 'idle',
    statusMessage: isRunning ? telethonStatusMessage : 'Motor Fantasma desligado.',
    lastCodeRequestedAt,
    lastConnectedAt,
    pid: currentProcess?.pid,
    config: {
      apiId: conf.apiId,
      apiHashMasked: conf.apiHash
        ? conf.apiHash.length > 8
          ? `${conf.apiHash.slice(0, 4)}••••••••${conf.apiHash.slice(-4)}`
          : '••••••••'
        : '',
      phone: conf.phone,
      hasApiHash: !!conf.apiHash,
    },
    recentLogs: [...recentLogs],
  };
}

export function startTelethonProcess(): { success: boolean; message: string } {
  const conf = getTelethonConfig();

  if (!conf.apiId || !conf.apiHash || !conf.phone) {
    return {
      success: false,
      message: 'Preencha TELEGRAM_API_ID, TELEGRAM_API_HASH e TELEGRAM_PHONE antes de iniciar o Motor Fantasma.',
    };
  }

  if (currentProcess && !currentProcess.killed) {
    return {
      success: true,
      message: 'O Motor Fantasma (Telethon) já está em execução.',
    };
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'escuta_grupos.py');
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      message: `Script de escuta não encontrado em ${scriptPath}`,
    };
  }

  telethonStatus = 'starting';
  telethonStatusMessage = 'Iniciando processo Python do Telethon...';
  addLog('🚀 Iniciando processo Python (scripts/escuta_grupos.py) no modo TELEGRAM...');

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    MODO_ESCUTA: 'TELEGRAM',
    TELEGRAM_API_ID: conf.apiId,
    TELEGRAM_API_HASH: conf.apiHash,
    TELEGRAM_PHONE: conf.phone,
  };

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  try {
    currentProcess = spawn(pythonCmd, [scriptPath], {
      cwd: process.cwd(),
      env,
    });

    currentProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        addLog(line);
        console.log(`[Telethon Python] ${line}`);

        if (line.includes('CÓDIGO') || line.includes('enviar-codigo') || line.includes('código')) {
          telethonStatus = 'waiting_code';
          telethonStatusMessage = 'Aguardando código de autenticação do Telegram...';
          lastCodeRequestedAt = new Date().toLocaleTimeString('pt-BR');
        } else if (line.includes('2FA') || line.includes('SENHA')) {
          telethonStatus = 'waiting_2fa';
          telethonStatusMessage = 'Conta com 2FA. Aguardando senha em duas etapas.';
          lastCodeRequestedAt = new Date().toLocaleTimeString('pt-BR');
        } else if (line.includes('FANTASMA CONECTADO') || line.includes('Escuta ativada') || line.includes('conectado com sucesso')) {
          telethonStatus = 'connected';
          telethonStatusMessage = '✅ Fantasma Conectado! Escutando canais do Telegram.';
          lastConnectedAt = new Date().toLocaleTimeString('pt-BR');
        } else if (line.includes('Sucesso: O Node.js enviou para o WhatsApp')) {
          addLog('🎉 Oferta replicada com sucesso do Telegram para o WhatsApp!');
        }
      }
    });

    currentProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        addLog(`⚠️ ${line}`);
        console.warn(`[Telethon Python STDERR] ${line}`);
      }
    });

    currentProcess.on('error', (err) => {
      telethonStatus = 'error';
      telethonStatusMessage = `Erro ao iniciar Python: ${err.message}`;
      addLog(`❌ Erro no processo: ${err.message}`);
      currentProcess = null;
    });

    currentProcess.on('exit', (code, signal) => {
      telethonStatus = 'stopped';
      telethonStatusMessage = `Processo finalizado (código ${code || signal || 0}).`;
      addLog(`🛑 Processo Python finalizado com código ${code || signal || 0}.`);
      currentProcess = null;
    });

    return {
      success: true,
      message: 'Motor Fantasma do Telegram iniciado com sucesso!',
    };
  } catch (err: any) {
    telethonStatus = 'error';
    telethonStatusMessage = err?.message || 'Falha ao executar comando python.';
    return {
      success: false,
      message: `Erro ao iniciar processo: ${err?.message || err}`,
    };
  }
}

export function stopTelethonProcess(): { success: boolean; message: string } {
  if (!currentProcess || currentProcess.killed) {
    currentProcess = null;
    telethonStatus = 'stopped';
    telethonStatusMessage = 'Motor Fantasma parado.';
    return {
      success: true,
      message: 'O Motor Fantasma já estava parado.',
    };
  }

  try {
    currentProcess.kill('SIGTERM');
    setTimeout(() => {
      if (currentProcess && !currentProcess.killed) {
        currentProcess.kill('SIGKILL');
      }
      currentProcess = null;
    }, 2000);

    telethonStatus = 'stopped';
    telethonStatusMessage = 'Motor Fantasma parado pelo usuário.';
    addLog('🛑 Motor Fantasma do Telegram finalizado.');

    return {
      success: true,
      message: 'Motor Fantasma pausado com sucesso.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao parar processo: ${err?.message || err}`,
    };
  }
}

export function clearTelethonLogs(): void {
  recentLogs.length = 0;
}
