let _devMode = false;

export function setDevMode(v: boolean) {
  _devMode = v;
}

export function isDevMode(): boolean {
  return _devMode;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getActiveLogLevel(): number {
  if (process.env.DEBUG === 'true') return LOG_LEVELS.debug;
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
}

function ts(): string {
  return new Date().toISOString();
}

// Node-specific rotating logger class
class SimpleRotatingLogger {
  private logFilePath: string;
  private maxSizeBytes: number;
  private maxFiles: number;
  private currentSize: number = 0;
  private fs: any;
  private path: any;

  constructor(filePath: string, maxSizeMb: number, maxFiles: number) {
    if (typeof window !== 'undefined') return;
    this.fs = require('fs');
    this.path = require('path');
    
    this.logFilePath = this.path.resolve(filePath);
    this.maxSizeBytes = maxSizeMb * 1024 * 1024;
    this.maxFiles = maxFiles;

    try {
      const dir = this.path.dirname(this.logFilePath);
      if (!this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }
      this.updateCurrentSize();
    } catch (err) {
      console.error('[logger] Failed to initialize log directory:', err);
    }
  }

  private updateCurrentSize() {
    if (this.fs.existsSync(this.logFilePath)) {
      this.currentSize = this.fs.statSync(this.logFilePath).size;
    } else {
      this.currentSize = 0;
    }
  }

  public write(message: string) {
    try {
      const data = message + '\n';
      const dataSize = Buffer.byteLength(data);

      if (this.currentSize + dataSize > this.maxSizeBytes) {
        this.rotate();
      }

      this.fs.appendFileSync(this.logFilePath, data);
      this.currentSize += dataSize;
    } catch (err) {
      console.error('[logger] Error writing to log file:', err);
    }
  }

  private rotate() {
    try {
      // Rotate existing files (e.g. log.19 -> log.20, ..., log -> log.1)
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldPath = i === 1 ? this.logFilePath : `${this.logFilePath}.${i - 1}`;
        const newPath = `${this.logFilePath}.${i}`;
        if (this.fs.existsSync(oldPath)) {
          if (this.fs.existsSync(newPath)) {
            this.fs.unlinkSync(newPath);
          }
          this.fs.renameSync(oldPath, newPath);
        }
      }

      this.currentSize = 0;
    } catch (err) {
      console.error('[logger] File rotation failed:', err);
    }
  }
}

// Instantiate file logger if environment tells us to
let fileLogger: SimpleRotatingLogger | null = null;
if (typeof window === 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
  const logFilePath = process.env.LOG_FILE_PATH;
  if (logFilePath) {
    const maxSizeMb = parseInt(process.env.LOG_FILE_MAX_SIZE_MB || '100', 10);
    const maxFiles = parseInt(process.env.LOG_FILE_MAX_FILES || '20', 10);
    fileLogger = new SimpleRotatingLogger(logFilePath, maxSizeMb, maxFiles);
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const errorDetails: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    if ('cause' in err && err.cause !== undefined) {
      errorDetails.cause = err.cause instanceof Error ? serializeError(err.cause) : String(err.cause);
    }
    for (const key of Object.keys(err)) {
      errorDetails[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : (err as any)[key];
    }
    return errorDetails;
  }
  return { message: String(err) };
}

/**
 * M-11 (2026-08-27 security review): redact secret-looking keys from log
 * metadata before they reach the console or the (rolling) log file. One
 * careless `logger.error('x', { password, headers })` would otherwise dump
 * credentials into the log permanently.
 */
const SENSITIVE_KEY_RE = /(password|passphrase|pin|token|secret|api_?key|dek|kek|authorization|cookie|credential)/i;

function cleanMetadata(obj: unknown, seen = new WeakSet()): any {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Error) {
    return serializeError(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => cleanMetadata(item, seen));
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const isSecretish =
      SENSITIVE_KEY_RE.test(key) &&
      key !== 'token_count' && // non-secret counters
      typeof val !== 'boolean' &&
      typeof val !== 'number' &&
      typeof val !== 'object'; // redact scalars; recurse into containers
    clean[key] = isSecretish ? '[REDACTED]' : cleanMetadata(val, seen);
  }
  return clean;
}

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  try {
    const cleaned = cleanMetadata(metadata);
    return ' ' + JSON.stringify(cleaned);
  } catch {
    return ' [Error stringifying metadata]';
  }
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    if (getActiveLogLevel() <= LOG_LEVELS.info) {
      const formattedMeta = formatMetadata(metadata);
      const logLineConsole = `[INFO ${ts()}] ${message}`;
      const logLineFile = `[${ts()}] [INFO] ${message}${formattedMeta}`;

      console.log('%s', logLineConsole, metadata ?? '');
      if (fileLogger) {
        fileLogger.write(logLineFile);
      }
    }
  },

  warn(message: string, metadata?: Record<string, unknown>) {
    if (getActiveLogLevel() <= LOG_LEVELS.warn) {
      const formattedMeta = formatMetadata(metadata);
      const logLineConsole = `[WARN ${ts()}] ${message}`;
      const logLineFile = `[${ts()}] [WARN] ${message}${formattedMeta}`;

      console.warn('%s', logLineConsole, metadata ?? '');
      if (fileLogger) {
        fileLogger.write(logLineFile);
      }
    }
  },

  error(message: string, metadata?: Record<string, unknown>) {
    if (getActiveLogLevel() <= LOG_LEVELS.error) {
      const formattedMeta = formatMetadata(metadata);
      const logLineConsole = `[ERROR ${ts()}] ${message}`;
      const logLineFile = `[${ts()}] [ERROR] ${message}${formattedMeta}`;

      console.error('%s', logLineConsole, metadata ?? '');
      if (fileLogger) {
        fileLogger.write(logLineFile);
      }
    }
  },

  debug(message: string, metadata?: Record<string, unknown>) {
    if (getActiveLogLevel() <= LOG_LEVELS.debug) {
      const formattedMeta = formatMetadata(metadata);
      const logLineConsole = `[DEBUG ${ts()}] ${message}`;
      const logLineFile = `[${ts()}] [DEBUG] ${message}${formattedMeta}`;

      console.debug('%s', logLineConsole, metadata ?? '');
      if (fileLogger) {
        fileLogger.write(logLineFile);
      }
    }
  },
};
