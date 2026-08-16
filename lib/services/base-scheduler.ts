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
  protected logTag = '[scheduler]';

  get isRunning(): boolean {
    return this._isRunning;
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
    logger.info(`${this.logTag} Scheduler shut down`);
  }
}
