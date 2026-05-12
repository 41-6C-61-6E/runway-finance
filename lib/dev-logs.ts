// In-memory log store for dev_mode
// Only active when dev-logging is enabled (via enableDevLogging())

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, unknown>
}

let _enabled = false;

export function enableDevLogging() {
  _enabled = true;
}

export function disableDevLogging() {
  _enabled = false;
}

export function isDevLoggingEnabled(): boolean {
  return _enabled;
}

const LOGS: LogEntry[] = []
const MAX_LOGS = 2000
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024 * 1024 // 1GB

function estimateLogsSize(): number {
  let total = 0
  for (const log of LOGS) {
    total += JSON.stringify(log).length * 2 // rough estimate with overhead
  }
  return total
}

function rotateLogs() {
  // Remove oldest 50% when approaching limit
  const keep = Math.ceil(LOGS.length * 0.5)
  LOGS.splice(0, LOGS.length - keep)
}

export function addLog(
  level: LogEntry['level'],
  message: string,
  metadata?: Record<string, unknown>
): LogEntry | null {
  if (!_enabled) return null;
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  }
  LOGS.push(entry)
  // Trim old logs by count
  while (LOGS.length > MAX_LOGS) {
    LOGS.shift()
  }
  // Rotate by size when approaching 1GB
  if (estimateLogsSize() > MAX_LOG_SIZE_BYTES * 0.8) {
    rotateLogs()
  }
  return entry
}

export function getLogs(options?: {
  level?: LogEntry['level']
  limit?: number
  afterId?: string
}): LogEntry[] {
  let filtered = LOGS

  if (options?.level) {
    const levels = ['debug', 'info', 'warn', 'error']
    const minIdx = levels.indexOf(options.level)
    filtered = filtered.filter((l) => levels.indexOf(l.level) >= minIdx)
  }

  if (options?.afterId) {
    const idx = filtered.findIndex((l) => l.id === options.afterId)
    if (idx !== -1) {
      filtered = filtered.slice(idx + 1)
    }
  }

  const limit = options?.limit ?? 100
  return filtered.slice(-limit)
}

export function clearLogs() {
  LOGS.length = 0
}

// Patch console methods to capture logs
// Captures all console output by default. Skip patterns filter out only
// obvious Next.js build/dev noise (not runtime application logs).
let _patched = false
// Only skip obvious Next.js build/dev server noise — not runtime messages
const SKIP_PATTERNS = [
  'Creating an optimized',
  'Running TypeScript',
  'Ready in',
]

export function patchConsole() {
  if (_patched) return
  _patched = true

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }

  function shouldCapture(message: string): boolean {
    return !SKIP_PATTERNS.some((p) => message.includes(p))
  }

  console.log = (...args) => {
    const message = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (shouldCapture(message)) {
      addLog('info', message)
    }
    originalConsole.log(...args)
  }

  console.warn = (...args) => {
    const message = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (shouldCapture(message)) {
      addLog('warn', message)
    }
    originalConsole.warn(...args)
  }

  console.error = (...args) => {
    const message = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (shouldCapture(message)) {
      addLog('error', message)
    }
    originalConsole.error(...args)
  }

  console.debug = (...args) => {
    const message = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (shouldCapture(message)) {
      addLog('debug', message)
    }
    originalConsole.debug(...args)
  }
}
