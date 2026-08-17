import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIDBPersister, clearQueryPersistence, queryClient } from '@/lib/query-client';
import * as idbKeyval from 'idb-keyval';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

describe('Query Persistence (IndexedDB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists client state to IndexedDB via idb-keyval set', async () => {
    const persister = createIDBPersister('TEST_IDB_KEY');
    const mockClient = {
      timestamp: Date.now(),
      buster: 'v1',
      clientState: {
        mutations: [],
        queries: [
          {
            state: { data: { netWorth: 50000 }, status: 'success' },
            queryKey: ['net-worth'],
            queryHash: '["net-worth"]',
          },
        ],
      },
    } as any;

    await persister.persistClient(mockClient);
    expect(idbKeyval.set).toHaveBeenCalledWith('TEST_IDB_KEY', mockClient);
  });

  it('restores client state from IndexedDB via idb-keyval get', async () => {
    const mockClient = {
      timestamp: Date.now(),
      buster: 'v1',
      clientState: { queries: [] },
    } as any;

    (idbKeyval.get as any).mockResolvedValueOnce(mockClient);

    const persister = createIDBPersister('TEST_IDB_KEY');
    const restored = await persister.restoreClient();
    expect(idbKeyval.get).toHaveBeenCalledWith('TEST_IDB_KEY');
    expect(restored).toEqual(mockClient);
  });

  it('clears persistent cache and empties in-memory query client on logout/cleanup', async () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');
    await clearQueryPersistence('TEST_IDB_KEY');
    expect(idbKeyval.del).toHaveBeenCalledWith('TEST_IDB_KEY');
    expect(clearSpy).toHaveBeenCalled();
  });
});
