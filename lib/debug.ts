/**
 * Debug logging utility
 * Logs are only output when DEBUG=true environment variable is set
 */

const isDebug = process.env.DEBUG === 'true';

export function debugLog(...args: any[]): void {
  if (isDebug) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}]`, ...args);
  }
}

export function debugInfo(...args: any[]): void {
  if (isDebug) {
    const timestamp = new Date().toISOString();
    console.info(`[INFO ${timestamp}]`, ...args);
  }
}

export function debugWarn(...args: any[]): void {
  if (isDebug) {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN ${timestamp}]`, ...args);
  }
}

export function debugError(...args: any[]): void {
  if (isDebug) {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR ${timestamp}]`, ...args);
  }
}
