import { clientEnv } from './env.client';

/**
 * Lightweight client-side logger that wraps browser console methods
 * and coordinates telemetry dispatch to `/api/logs/client`.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function logToConsole(level: LogLevel, message: string, ...args: unknown[]) {
  if (clientEnv.NODE_ENV === 'test') return;
  const prefix = `[${level.toUpperCase()}]`;
  switch (level) {
    case 'error':
      // eslint-disable-next-line no-console
      console.error(prefix, message, ...args);
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(prefix, message, ...args);
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.info(prefix, message, ...args);
      break;
    case 'debug':
      if (clientEnv.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug(prefix, message, ...args);
      }
      break;
  }
}

export const clientLogger = {
  debug: (message: string, ...args: unknown[]) => logToConsole('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => logToConsole('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => logToConsole('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => {
    logToConsole('error', message, ...args);
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        fetch('/api/logs/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: 'error',
            message,
            details: args.length > 0 ? args : undefined,
            url: window.location.href,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      } catch {
        // Ignore telemetry dispatch failures
      }
    }
  },
};

