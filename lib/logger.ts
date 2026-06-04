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

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  try {
    return ' ' + JSON.stringify(metadata);
  } catch {
    return ' [Error stringifying metadata]';
  }
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    const formattedMeta = formatMetadata(metadata);
    const logLineConsole = `[INFO ${ts()}] ${message}`;
    const logLineFile = `[${ts()}] [INFO] ${message}${formattedMeta}`;

    console.log('%s', logLineConsole, metadata ?? '');
    if (fileLogger) {
      fileLogger.write(logLineFile);
    }
  },

  warn(message: string, metadata?: Record<string, unknown>) {
    const formattedMeta = formatMetadata(metadata);
    const logLineConsole = `[WARN ${ts()}] ${message}`;
    const logLineFile = `[${ts()}] [WARN] ${message}${formattedMeta}`;

    console.warn('%s', logLineConsole, metadata ?? '');
    if (fileLogger) {
      fileLogger.write(logLineFile);
    }
  },

  error(message: string, metadata?: Record<string, unknown>) {
    const formattedMeta = formatMetadata(metadata);
    const logLineConsole = `[ERROR ${ts()}] ${message}`;
    const logLineFile = `[${ts()}] [ERROR] ${message}${formattedMeta}`;

    console.error('%s', logLineConsole, metadata ?? '');
    if (fileLogger) {
      fileLogger.write(logLineFile);
    }
  },

  debug(message: string, metadata?: Record<string, unknown>) {
    if (DEBUG_ENABLED) {
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
