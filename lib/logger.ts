let _devMode = false;

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
    console.log(`[INFO ${ts()}] ${message}`, metadata ?? '');
  },

  warn(message: string, metadata?: Record<string, unknown>) {
    console.warn(`[WARN ${ts()}] ${message}`, metadata ?? '');
  },

  error(message: string, metadata?: Record<string, unknown>) {
    console.error(`[ERROR ${ts()}] ${message}`, metadata ?? '');
  },

  debug(message: string, metadata?: Record<string, unknown>) {
    if (DEBUG_ENABLED) {
      console.debug(`[DEBUG ${ts()}] ${message}`, metadata ?? '');
    }
  },
};
