import { describe, expect, it } from 'vitest';
import {
  buildAccountLink,
  buildBudgetLink,
  buildCashFlowLink,
  buildNetWorthChangeBarLink,
  buildTransactionsLink,
  buildWealthFlowLink,
} from '@/lib/utils/deep-links';

describe('deep-links builders', () => {
  it('builds wealth and cash flow links with explicit tab', () => {
    expect(buildWealthFlowLink({ timeframe: '1m', date: '2026-06' })).toBe(
      '/flows?tab=wealth&timeframe=1m&date=2026-06'
    );
    expect(buildWealthFlowLink({ startDate: '2026-11-22', endDate: '2026-11-26' })).toBe(
      '/flows?tab=wealth&startDate=2026-11-22&endDate=2026-11-26'
    );
    expect(buildCashFlowLink({ timeframe: '1m', date: '2026-06' })).toBe(
      '/flows?tab=cash&timeframe=1m&date=2026-06'
    );
  });

  it('maps every net worth change bar bucket size to the matching wealth flow period', () => {
    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-06-15', startDate: '2026-06-14', endDate: '2026-06-15', change: 500, startNetWorth: 1000, endNetWorth: 1500 },
        'daily'
      )
    ).toBe('/flows?tab=wealth&timeframe=1d_discrete&date=2026-06-15');

    // Full 7-day calendar week (diffDays === 6) uses 7d_discrete
    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-08-09', startDate: '2026-08-09', endDate: '2026-08-15', change: 800, startNetWorth: 1000, endNetWorth: 1800 },
        'weekly'
      )
    ).toBe('/flows?tab=wealth&timeframe=7d_discrete&date=2026-08-15');

    // Partial trailing week uses exact startDate/endDate range
    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-11-22', startDate: '2026-11-22', endDate: '2026-11-26', change: 300, startNetWorth: 1000, endNetWorth: 1300 },
        'weekly'
      )
    ).toBe('/flows?tab=wealth&startDate=2026-11-22&endDate=2026-11-26');

    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-30', change: 1000, startNetWorth: 50000, endNetWorth: 51000 },
        'monthly'
      )
    ).toBe('/flows?tab=wealth&timeframe=1m&date=2026-06');

    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-01-01', startDate: '2026-01-01', endDate: '2026-03-31', change: 2000, startNetWorth: 50000, endNetWorth: 52000 },
        'quarterly'
      )
    ).toBe('/flows?tab=wealth&timeframe=3m&date=2026-03');

    expect(
      buildNetWorthChangeBarLink(
        { date: '2026-07-01', startDate: '2026-07-01', endDate: '2026-09-30', change: 2000, startNetWorth: 50000, endNetWorth: 52000 },
        'quarterly'
      )
    ).toBe('/flows?tab=wealth&timeframe=3m&date=2026-09');

    expect(
      buildNetWorthChangeBarLink(
        { date: '2025-01-01', startDate: '2025-01-01', endDate: '2025-12-31', change: 10000, startNetWorth: 50000, endNetWorth: 60000 },
        'yearly'
      )
    ).toBe('/flows?tab=wealth&timeframe=1y&date=2025-12');
  });

  it('builds transactions, budget, and account links without emitting empty or undefined params', () => {
    expect(
      buildTransactionsLink({
        categoryIds: ['cat-1', 'cat-2'],
        excludeTagIds: [],
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        type: 'expense',
        pending: false,
        ignored: false,
      })
    ).toBe('/transactions?categoryIds=cat-1%2Ccat-2&type=expense&startDate=2026-06-01&endDate=2026-06-30&pending=false&ignored=false');

    expect(
      buildBudgetLink({ categoryId: 'cat-1', periodType: 'monthly', periodKey: '2026-06' })
    ).toBe('/budgets?categoryId=cat-1&periodType=monthly&periodKey=2026-06');

    expect(buildAccountLink('acc-1')).toBe('/accounts?accountId=acc-1');
  });
});
