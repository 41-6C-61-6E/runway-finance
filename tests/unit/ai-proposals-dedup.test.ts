import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pruneDuplicateProposals, analyzeUncategorized } from '@/lib/services/ai-categorizer';

const mockDbState = vi.hoisted(() => ({
  executeCalls: [] as any[],
  rowCountPerCall: [3, 2, 1, 0] as number[],
}));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    execute: vi.fn(async (query: any) => {
      mockDbState.executeCalls.push(query);
      const rowCount = mockDbState.rowCountPerCall.shift() ?? 0;
      return { rowCount };
    }),
  })),
}));

vi.mock('@/lib/sharing', () => ({
  resolveDataUserId: vi.fn(async (userId: string) => userId),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AI Proposal Deduplication', () => {
  beforeEach(() => {
    mockDbState.executeCalls = [];
    mockDbState.rowCountPerCall = [3, 2, 1, 0];
    vi.clearAllMocks();
  });

  describe('pruneDuplicateProposals', () => {
    it('executes deduplication and stale proposal cleanup queries', async () => {
      const totalPruned = await pruneDuplicateProposals('user-123');

      // 4 queries: dedup categorize, mark applied for categorized, dedup create_category, dedup create_rule
      expect(mockDbState.executeCalls.length).toBe(4);
      expect(totalPruned).toBe(6); // 3 + 2 + 1 + 0
    });

    it('returns 0 on database error without throwing', async () => {
      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValueOnce({
        execute: vi.fn().mockRejectedValueOnce(new Error('DB failure')),
      } as any);

      const result = await pruneDuplicateProposals('user-123');
      expect(result).toBe(0);
    });
  });

  describe('analyzeUncategorized with transactionIds', () => {
    it('returns early when an empty transactionIds array is provided', async () => {
      const onLog = vi.fn();
      const result = await analyzeUncategorized(
        'user-123',
        undefined,
        onLog,
        undefined,
        undefined,
        [] // empty transactionIds
      );

      expect(result.proposalsCreated).toBe(0);
      expect(result.autoApproved).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(onLog).toHaveBeenCalledWith('No uncategorized transactions to analyze.');
    });
  });
});
