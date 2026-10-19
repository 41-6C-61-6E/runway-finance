import { describe, it, expect, vi, beforeEach } from 'vitest';
import { periodComparisonPack, PeriodComparisonParams } from '@/lib/advice/packs/period-comparison';
import type { FinanceContext } from '@/lib/finance/context';
import * as cashFlowModule from '@/lib/finance/cash-flow';
import * as categoriesModule from '@/lib/finance/categories';

describe('Period Comparison Data Pack', () => {
  const dummyCtx: FinanceContext = {
    userId: 'u-1',
    dataUserId: 'u-1',
    dek: new Uint8Array(32),
    role: 'primary',
    hiddenAccountIds: new Set(),
    settings: {} as any,
    now: new Date('2026-10-15T12:00:00Z'),
    getAccounts: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates params with default month_over_month', () => {
    const parsed = PeriodComparisonParams.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('month_over_month');
    }
  });

  it('builds month-over-month comparison accurately', async () => {
    vi.spyOn(cashFlowModule, 'getMonthlyCashFlow').mockResolvedValue([
      { yearMonth: '2026-08', income: 8000, expenses: 5000, netCashFlow: 3000 },
      { yearMonth: '2026-09', income: 9000, expenses: 5500, netCashFlow: 3500 },
    ]);

    vi.spyOn(categoriesModule, 'getCategorySpending').mockImplementation(async (_, opts) => {
      if (opts.startMonth === '2026-09') {
        return [
          { categoryId: 'cat-dining', name: 'Dining', amount: 800, transactionCount: 15 },
          { categoryId: 'cat-groceries', name: 'Groceries', amount: 700, transactionCount: 10 },
        ];
      }
      if (opts.startMonth === '2026-08') {
        return [
          { categoryId: 'cat-dining', name: 'Dining', amount: 600, transactionCount: 12 },
          { categoryId: 'cat-groceries', name: 'Groceries', amount: 750, transactionCount: 11 },
        ];
      }
      return [];
    });

    const result = await periodComparisonPack.build(dummyCtx, { type: 'month_over_month' });

    expect(result.text).toContain('### Financial Period Comparison (2026-09 vs 2026-08)');
    expect(result.text).toContain('| Total Income | $9,000 | $8,000 | +$1,000 | +12.5% |');
    expect(result.text).toContain('| Total Expenses | $5,500 | $5,000 | +$500 | +10.0% |');
    expect(result.text).toContain('| Net Cash Flow | $3,500 | $3,000 | +$500 | +16.7% |');

    // Category shifts: Dining increased by $200 (+33.3%)
    expect(result.text).toContain('| Dining | $800 | $600 | +$200 (+33.3%) |');
    // Groceries decreased by $50
    expect(result.text).toContain('| Groceries | $700 | $750 | -$50 (-6.7%) |');
  });

  it('builds year-over-year comparison accurately', async () => {
    vi.spyOn(cashFlowModule, 'getMonthlyCashFlow').mockResolvedValue([
      { yearMonth: '2025-09', income: 7500, expenses: 4800, netCashFlow: 2700 },
      { yearMonth: '2026-09', income: 9000, expenses: 5500, netCashFlow: 3500 },
    ]);

    vi.spyOn(categoriesModule, 'getCategorySpending').mockResolvedValue([]);

    const result = await periodComparisonPack.build(dummyCtx, { type: 'year_over_year' });

    expect(result.text).toContain('### Financial Period Comparison (2026-09 vs 2025-09)');
    expect(result.text).toContain('| Total Income | $9,000 | $7,500 | +$1,500 | +20.0% |');
  });
});
