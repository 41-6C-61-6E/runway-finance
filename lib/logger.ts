import { addLog } from './dev-logs';

let _devMode = false;

const _console = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export function setDevMode(v: boolean) {
  _devMode = v;
}

export function isDevMode(): boolean {
  return _devMode;
}

const DEBUG_ENABLED = process.env.DEBUG === 'true';

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    _console.log(`[INFO ${ts()}] ${message}`, metadata ?? '');
    if (_devMode) addLog('info', message, metadata);
  },

  warn(message: string, metadata?: Record<string, unknown>) {
    _console.warn(`[WARN ${ts()}] ${message}`, metadata ?? '');
    if (_devMode) addLog('warn', message, metadata);
  },

  error(message: string, metadata?: Record<string, unknown>) {
    _console.error(`[ERROR ${ts()}] ${message}`, metadata ?? '');
    if (_devMode) addLog('error', message, metadata);
  },

  debug(message: string, metadata?: Record<string, unknown>) {
    if (DEBUG_ENABLED || _devMode) {
      _console.debug(`[DEBUG ${ts()}] ${message}`, metadata ?? '');
      if (_devMode) addLog('debug', message, metadata);
    }
  },
};
