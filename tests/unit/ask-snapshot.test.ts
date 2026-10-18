import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatSnapshotMarkdown, getAskSnapshot, type SnapshotData } from '@/lib/ask/snapshot';
import { clearServerCache, getCached, setCached } from '@/lib/server-cache';
import { estimateTokens, ASK_CONFIG } from '@/lib/ask/config';
import type { FinanceContext } from '@/lib/finance/context';

const SAMPLE_SNAPSHOT_DATA: SnapshotData = {
  asOfDate: '2026-10-15',
  currency: 'USD',
  lastSyncAt: '2026-10-14',
  uncategorized90dCount: 2,
  total90dCount: 50,
  uncategorizedPct: 4.0,
  netWorthNow: 750000,
  netWorth1mChange: 15000,
  netWorth3mChange: 35000,
  netWorth12mChange: 120000,
  totalAssets: 800000,
  totalLiabilities: 50000,
  assetBreakdown: {
    'Cash & Checking': 50000,
    'Taxable Brokerage': 300000,
    Retirement: 450000,
  },
  liabilityBreakdown: {
    'Credit Cards': 5000,
    Mortgage: 45000,
  },
  lastFullMonth: {
    yearMonth: '2026-09',
    income: 12000,
    expenses: 7000,
    net: 5000,
    savingsRate: 41.7,
  },
  trailing3m: {
    incomeAvg: 11500,
    expensesAvg: 7200,
    netAvg: 4300,
    savingsRate: 37.4,
  },
  trailing12m: {
    incomeAvg: 11000,
    expensesAvg: 7000,
    netAvg: 4000,
    savingsRate: 36.4,
  },
  topCategories: [
    { name: 'Housing', avg12m: 2500, avg3m: 2500, delta3mVs12m: 0 },
    { name: 'Groceries', avg12m: 800, avg3m: 850, delta3mVs12m: 50 },
    { name: 'Dining', avg12m: 500, avg3m: 600, delta3mVs12m: 100 },
  ],
  recurring: {
    monthlyTotal: 3000,
    count: 8,
  },
  emergencyFundMonths: 6.9,
  goals: {
    count: 2,
    totalTarget: 60000,
    totalCurrent: 45000,
    fundedPct: 75.0,
  },
  fireHeadline: {
    planName: 'Early FI 2035',
    plannedRetirementAge: 50,
    fiNumber: 1500000,
    investableAssets: 800000,
    pctToFi: 53.3,
    projectedFiAge: 48,
    success: true,
    depletionAge: null,
    endingNetWorth: 3500000,
  },
  gaps: ['No monthly budgets configured'],
};

describe('Ask Snapshot', () => {
  beforeEach(() => {
    clearServerCache();
  });

  it('formats all required sections into compact markdown', () => {
    const md = formatSnapshotMarkdown(SAMPLE_SNAPSHOT_DATA);

    // Section 1: As of & Status
    expect(md).toContain('## Snapshot (as of 2026-10-15, Currency: USD)');
    expect(md).toContain('Last sync: 2026-10-14');
    expect(md).toContain('2 uncategorized transactions');

    // Section 2: Net Worth
    expect(md).toContain('### Net Worth: $750,000');
    expect(md).toContain('Assets: $800,000');
    expect(md).toContain('Liabilities: $50,000');
    expect(md).toContain('12-mo: $120,000');

    // Section 3: Cash Flow
    expect(md).toContain('### Cash Flow');
    expect(md).toContain('Last Month (2026-09): Income $12,000');
    expect(md).toContain('Savings Rate 41.7%');

    // Section 4: Top Categories
    expect(md).toContain('### Top Spending Categories');
    expect(md).toContain('Housing: $2,500/mo');

    // Section 5: Obligations & Liquidity
    expect(md).toContain('### Obligations & Liquidity');
    expect(md).toContain('Fixed Recurring Obligations: $3,000/mo across 8 items');
    expect(md).toContain('Emergency Fund: 6.9 months of expenses');

    // Section 6: Goals
    expect(md).toContain('### Goals');
    expect(md).toContain('Active Goals: 2 total, $45,000 funded of $60,000 (75.0%)');

    // Section 7: FIRE Headline
    expect(md).toContain('### FIRE / Retirement Headline');
    expect(md).toContain('Plan: Early FI 2035 (Retire at age 50)');
    expect(md).toContain('FI Target: $1,500,000');
    expect(md).toContain('Projected FI Age: Age 48');

    // Section 8: Gaps
    expect(md).toContain('### Missing Data / Gaps');
    expect(md).toContain('No monthly budgets configured');
  });

  it('strictly respects the snapshot token budget (<= 1500 tokens)', () => {
    const md = formatSnapshotMarkdown(SAMPLE_SNAPSHOT_DATA);
    const tokens = estimateTokens(md);
    expect(tokens).toBeLessThanOrEqual(ASK_CONFIG.SNAPSHOT_BUDGET);
    expect(tokens).toBeLessThan(700); // Efficiently compacted
  });

  it('caches the snapshot result per user for 5 minutes', async () => {
    const dummyCtx = {
      userId: 'user-abc',
      dataUserId: 'data-user-xyz',
      dek: new Uint8Array(32),
      role: 'primary',
      hiddenAccountIds: new Set(),
      settings: {} as any,
      now: new Date('2026-10-15T12:00:00Z'),
      getAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as FinanceContext;

    // Pre-populate cache
    const cacheKey = `user:${dummyCtx.dataUserId}:ask:snapshot:${dummyCtx.userId}`;
    const cachedContent = '## Cached Snapshot Content';
    clearServerCache();

    // Verify cache miss initially
    expect(getCached(cacheKey)).toBeNull();

    // Populate cache
    setCached(cacheKey, cachedContent, 300_000);

    // Call getAskSnapshot - should immediately return cached content without touching DB
    const res = await getAskSnapshot(dummyCtx);
    expect(res).toBe(cachedContent);
    expect(getCached(cacheKey)).toBe(cachedContent);

    // Clear cache
    clearServerCache();
    expect(getCached(cacheKey)).toBeNull();
  });
});

