import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/connections/[id]/route';

const mockInvalidateUserSearchCache = vi.fn();
const mockInvalidateSyncHealthCache = vi.fn();
const mockCreateNetWorthSnapshot = vi.fn().mockResolvedValue({});
const mockCreateAccountSnapshots = vi.fn().mockResolvedValue({});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'user_1' } })),
}));

vi.mock('@/lib/services/search-cache', () => ({
  invalidateUserSearchCache: (...args: any[]) => mockInvalidateUserSearchCache(...args),
}));

vi.mock('@/lib/services/sync-health', () => ({
  invalidateSyncHealthCache: (...args: any[]) => mockInvalidateSyncHealthCache(...args),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(async () => new Uint8Array(32)),
}));

vi.mock('@/lib/services/sync', () => ({
  createNetWorthSnapshot: (...args: any[]) => mockCreateNetWorthSnapshot(...args),
  createAccountSnapshots: (...args: any[]) => mockCreateAccountSnapshots(...args),
  updateMonthlyCashFlowSummaries: vi.fn().mockResolvedValue({}),
  updateCategorySpendingSummaries: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/services/sync-scheduler', () => ({
  syncScheduler: {
    cancel: vi.fn(),
  },
}));

let mockDbData: any = {
  simplifinConnections: [{ id: 'conn_1', userId: 'user_1' }],
  plaidConnections: [],
};

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: () => mockDbData.simplifinConnections,
        }),
      }),
    }),
    delete: () => ({
      where: vi.fn().mockResolvedValue({}),
    }),
    update: () => ({
      set: () => ({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
  }),
}));

describe('DELETE /api/connections/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes connection, invalidates caches, and triggers background snapshot rebuild', async () => {
    const req = new Request('http://localhost/api/connections/conn_1', {
      method: 'DELETE',
      headers: {
        'X-Confirm-Delete': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keepData: false }),
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'conn_1' }) });
    expect(res.status).toBe(204);

    expect(mockInvalidateUserSearchCache).toHaveBeenCalledWith('user_1');
    expect(mockInvalidateSyncHealthCache).toHaveBeenCalledWith('user_1');
    expect(mockCreateNetWorthSnapshot).toHaveBeenCalled();
    expect(mockCreateAccountSnapshots).toHaveBeenCalled();
  });
});
