import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDekAvailable, BaseScheduler } from '@/lib/services/base-scheduler';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { computeNextSync } from '@/components/features/settings/accounts/sync-intervals';

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

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'user_1' } })),
}));

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

  describe('Node Instrumentation Singleton Guard (Finding 9)', () => {
    it('prevents multiple registrations on Next.js HMR reloads', async () => {
      const globalNodeInit = globalThis as unknown as { __runwayNodeInstrumentationInitialized?: boolean };
      delete globalNodeInit.__runwayNodeInstrumentationInitialized;

      const { registerNodeInstrumentation } = await import('@/instrumentation-node');
      await registerNodeInstrumentation();
      expect(globalNodeInit.__runwayNodeInstrumentationInitialized).toBe(true);

      // Second invocation should return early without re-executing
      await registerNodeInstrumentation();
      expect(globalNodeInit.__runwayNodeInstrumentationInitialized).toBe(true);
    });
  });

  describe('Scheduler Health Check (Finding 12)', () => {
    it('includes stalenessScheduler in health response', async () => {
      const { GET } = await import('@/app/api/health/scheduler/route');
      const response = await GET();
      const body = await response.json();

      expect(body.schedulers).toBeDefined();
      expect(body.schedulers.stalenessScheduler).toBeDefined();
      expect(body.schedulers.stalenessScheduler).toHaveProperty('isRunning');
      expect(body.schedulers.stalenessScheduler).toHaveProperty('armedCount');
    });
  });

  describe('SimpleFIN sync intervals (4h, 12h, and hourly -> daily coercion)', () => {
    it('schedules 4h and 12h intervals and coerces legacy hourly to daily', async () => {
      const lastSync = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
      expect(await syncScheduler.schedule('conn_4h', '4h', lastSync)).toBe(true);
      expect(await syncScheduler.schedule('conn_12h', '12h', lastSync)).toBe(true);
      expect(await syncScheduler.schedule('conn_hourly', 'hourly', lastSync)).toBe(true);
      expect(syncScheduler.armedCount).toBe(3);

      const next4h = computeNextSync('4h', lastSync.toISOString());
      const next12h = computeNextSync('12h', lastSync.toISOString());
      const nextHourlyCoerced = computeNextSync('hourly', lastSync.toISOString());
      const nextDaily = computeNextSync('daily', lastSync.toISOString());

      expect(next4h?.getTime()).toBe(lastSync.getTime() + 4 * 60 * 60 * 1000);
      expect(next12h?.getTime()).toBe(lastSync.getTime() + 12 * 60 * 60 * 1000);
      expect(nextHourlyCoerced?.getTime()).toBe(nextDaily?.getTime());

      syncScheduler.shutdown();
    });
  });
});
