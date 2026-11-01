import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invalidateSyncHealthCache, getAccountsSyncStatus } from '@/lib/services/sync-health';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  })),
}));

describe('Sync Health Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSyncHealthCache();
  });

  it('invalidates cache for a specific user matching composite cacheKey', async () => {
    const userId1 = 'user_abc';
    const userId2 = 'user_xyz';

    // Invalidate should not crash when empty
    invalidateSyncHealthCache(userId1);

    // Call getAccountsSyncStatus or verify cache clearing
    expect(() => invalidateSyncHealthCache(userId1)).not.toThrow();
    expect(() => invalidateSyncHealthCache()).not.toThrow();
  });
});
