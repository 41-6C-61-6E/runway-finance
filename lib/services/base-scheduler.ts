import { getServerDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';
import { SYNC_INTERVALS } from '@/lib/utils/sync';

export { SYNC_INTERVALS };

/**
 * Checks if a Data Encryption Key (DEK) is present, valid in length, and initialized.
 */
export function isDekAvailable(dek: Uint8Array | null | undefined): boolean {
  if (!dek) return false;
  return dek.length >= 16;
}

export abstract class BaseScheduler<TId = string> {
  protected timers = new Map<TId, ReturnType<typeof setTimeout>>();
  protected _isRunning = false;
  protected _isInitialized = false;
  protected _lastInitAt: Date | null = null;
  protected _lastTickAt: Date | null = null;
  protected _lastError: { time: Date; error: string } | null = null;
  protected logTag = '[scheduler]';

  get isRunning(): boolean {
    return this._isRunning;
  }

  get armedCount(): number {
    return this.timers.size;
  }

  get lastInitAt(): Date | null {
    return this._lastInitAt;
  }

  get lastTickAt(): Date | null {
    return this._lastTickAt;
  }

  get lastError(): { time: Date; error: string } | null {
    return this._lastError;
  }

  /**
   * Safe timer setup: catches any unhandled rejections from the job execution function,
   * preventing unhandled promise rejections from bubbling up to the Node process.
   */
  protected startTimer(id: TId, fn: () => Promise<void>, delayMs: number): void {
    this.cancel(id);
    const timer = setTimeout(() => {
      this._lastTickAt = new Date();
      void fn().catch((err: unknown) => {
        this.onJobError(id, err);
      });
    }, delayMs);
    this.timers.set(id, timer);
  }

  /**
   * Default job error handler when an execution chain fails outside of its local try/catch.
   */
  protected onJobError(id: TId, err: unknown): void {
    const errorMsg = err instanceof Error ? err.message : String(err);
    this._lastError = { time: new Date(), error: errorMsg };
    logger.error(`${this.logTag} Unhandled job execution error`, {
      id: String(id),
      error: errorMsg,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  async canSyncUser(userId: string): Promise<boolean> {
    try {
      const dek = await getServerDEK(userId);
      return isDekAvailable(dek);
    } catch {
      return false;
    }
  }

  isDekUnavailableError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('server-wrapped') ||
      msg.includes('Encryption key unavailable') ||
      msg.includes('No server-wrapped') ||
      msg.includes('No encryption keys')
    );
  }

  cancel(id: TId): void {
    const existing = this.timers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(id);
    }
  }

  shutdown(): void {
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this._isRunning = false;
    this._isInitialized = false;
    logger.info(`${this.logTag} Scheduler shut down`);
  }
}
