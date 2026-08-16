import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDekAvailable, BaseScheduler } from '@/lib/services/base-scheduler';
import { syncScheduler } from '@/lib/services/sync-scheduler';

class TestScheduler extends BaseScheduler<string> {
  constructor() {
    super();
    this.logTag = '[test-scheduler]';
  }

  setTimer(id: string, ms: number, callback: () => void) {
    this.cancel(id);
    const timer = setTimeout(callback, ms);
    this.timers.set(id, timer);
  }

  getTimerCount() {
    return this.timers.size;
  }
}

vi.mock('@/lib/crypto-context', () => ({
  getServerDEK: vi.fn(async (userId: string) => {
    if (userId === 'user_valid') return new Uint8Array(32);
    if (userId === 'user_short_dek') return new Uint8Array(8);
    throw new Error('No server-wrapped DEK found');
  }),
}));

describe('BaseScheduler & Schedulers Suite (base-scheduler.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isDekAvailable', () => {
    it('returns false for null, undefined, or empty DEK', () => {
      expect(isDekAvailable(null)).toBe(false);
      expect(isDekAvailable(undefined)).toBe(false);
      expect(isDekAvailable(new Uint8Array(0))).toBe(false);
      expect(isDekAvailable(new Uint8Array(15))).toBe(false);
    });

    it('returns true for 16-byte and 32-byte DEKs', () => {
      expect(isDekAvailable(new Uint8Array(16))).toBe(true);
      expect(isDekAvailable(new Uint8Array(32))).toBe(true);
    });
  });

  describe('canSyncUser', () => {
    it('returns true when valid server DEK is returned', async () => {
      const scheduler = new TestScheduler();
      expect(await scheduler.canSyncUser('user_valid')).toBe(true);
    });

    it('returns false when DEK is shorter than 16 bytes', async () => {
      const scheduler = new TestScheduler();
      expect(await scheduler.canSyncUser('user_short_dek')).toBe(false);
    });

    it('returns false when getServerDEK throws an error', async () => {
      const scheduler = new TestScheduler();
      expect(await scheduler.canSyncUser('user_no_dek')).toBe(false);
    });
  });

  describe('Timer lifecycle management (cancel & shutdown)', () => {
    it('cancels individual timers and clears all on shutdown', () => {
      const scheduler = new TestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      scheduler.setTimer('conn_1', 1000, fn1);
      scheduler.setTimer('conn_2', 2000, fn2);
      expect(scheduler.getTimerCount()).toBe(2);

      scheduler.cancel('conn_1');
      expect(scheduler.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(1500);
      expect(fn1).not.toHaveBeenCalled();

      scheduler.shutdown();
      expect(scheduler.getTimerCount()).toBe(0);
      expect(scheduler.isRunning).toBe(false);

      vi.advanceTimersByTime(3000);
      expect(fn2).not.toHaveBeenCalled();
    });

    it('identifies DEK unavailable errors accurately', () => {
      const scheduler = new TestScheduler();
      expect(scheduler.isDekUnavailableError(new Error('server-wrapped DEK missing'))).toBe(true);
      expect(scheduler.isDekUnavailableError(new Error('Encryption key unavailable'))).toBe(true);
      expect(scheduler.isDekUnavailableError(new Error('Connection timed out'))).toBe(false);
    });
  });
});
