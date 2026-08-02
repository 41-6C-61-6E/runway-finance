import { getServerDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

export abstract class BaseScheduler<TId = string> {
  protected timers = new Map<TId, ReturnType<typeof setTimeout>>();
  protected _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async canSyncUser(userId: string): Promise<boolean> {
    try {
      await getServerDEK(userId);
      return true;
    } catch {
      return false;
    }
  }

  isDekUnavailableError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('server-wrapped') || msg.includes('Encryption key unavailable') || msg.includes('No server-wrapped');
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
  }
}
