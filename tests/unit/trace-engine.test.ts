import { describe, it, expect } from 'vitest';
import {
  buildNetWorthTraces,
  buildDebtToAssetTrace,
  buildCashFlowTrace,
  buildRealEstateTrace,
  buildFireTrace,
  buildBudgetTrace,
  buildGoalsTrace,
  buildInvestmentsTrace,
} from '@/lib/services/trace-engine';
import type { AccountData } from '@/lib/types/financial';

describe('Trace Engine (trace-engine.ts)', () => {
  const sampleAccounts: AccountData[] = [
    { id: 'acc-1', name: 'Checking', type: 'checking', balance: 5000 },
    { id: 'acc-2', name: 'Brokerage', type: 'investment', balance: 25000 },
    { id: 'acc-3', name: 'Credit Card', type: 'credit', balance: 2000 },
    { id: 'acc-4', name: 'Mortgage', type: 'mortgage', balance: 180000 },
  ];

  it('buildNetWorthTraces computes net worth, assets, liabilities, and debt ratio', () => {
    const traces = buildNetWorthTraces(sampleAccounts);
    expect(traces.length).toBe(4);

    const [assets, liabilities, netWorth, debtRatio] = traces;
    expect(assets.result).toBe(30000); // 5000 + 25000
    expect(liabilities.result).toBe(182000); // 2000 + 180000
    expect(netWorth.result).toBe(-152000); // 30000 - 182000
    expect(debtRatio.result).toBeCloseTo(182000 / 30000, 4);
  });

  it('buildDebtToAssetTrace handles zero assets without dividing by zero', () => {
    const zeroAssetAccounts: AccountData[] = [
      { id: 'cc-1', name: 'Credit Card', type: 'credit', balance: 1000 },
    ];
    const trace = buildDebtToAssetTrace(zeroAssetAccounts);
    expect(trace.result).toBe(0);
    expect(Number.isFinite(trace.result)).toBe(true);
  });

  it('buildCashFlowTrace correctly produces net income and savings rate', () => {
    const trace = buildCashFlowTrace({
      totalIncome: 10000,
      totalExpenses: 6000,
      netIncome: 4000,
      savingsRate: 40,
    });
    expect(trace.result).toBe(4000);
    expect(trace.steps.find((s) => s.label === 'Savings Rate')?.output).toBe(40);
  });

  it('buildRealEstateTrace calculates equity and LTV', () => {
    const trace = buildRealEstateTrace({
      totalValue: 500000,
      totalMortgage: 350000,
      totalEquity: 150000,
      overallLtv: 70,
      properties: [
        { name: 'Primary Home', value: 500000, mortgageBalance: 350000, equity: 150000 },
      ],
    });
    expect(trace.result).toBe(150000);
    expect(trace.steps.find((s) => s.label === 'LTV Ratio')?.output).toBe(70);
  });

  it('buildFireTrace produces FIRE number and percent to target', () => {
    const trace = buildFireTrace({
      fireNumber: 1000000,
      currentInvestableAssets: 400000,
      percentToFire: 40,
      yearsToFI: 12.5,
      safeWithdrawalRate: 0.04,
      targetAnnualExpenses: 40000,
    });
    expect(trace.result).toBe(40);
    expect(trace.steps.find((s) => s.label === 'FIRE Number')?.output).toBe(1000000);
  });

  it('buildBudgetTrace handles income vs expense budget types', () => {
    const incomeTrace = buildBudgetTrace({
      totalBudgeted: 8000,
      totalActual: 8500,
      remaining: 500,
      percentUsed: 106.25,
      type: 'income',
    });
    expect(incomeTrace.title).toBe('Budget Income');
    expect(incomeTrace.result).toBe(500);

    const expenseTrace = buildBudgetTrace({
      totalBudgeted: 5000,
      totalActual: 4200,
      remaining: 800,
      percentUsed: 84,
      type: 'expense',
    });
    expect(expenseTrace.title).toBe('Budget Expenses');
    expect(expenseTrace.result).toBe(800);
  });

  it('buildGoalsTrace formats total targets and progress', () => {
    const trace = buildGoalsTrace({
      totalTarget: 50000,
      totalCurrent: 25000,
      overallProgress: 50,
      count: 3,
    });
    expect(trace.result).toBe(50);
    expect(trace.format).toBe('percentage');
  });

  it('buildInvestmentsTrace constructs account hierarchies with unrealized gains', () => {
    const trace = buildInvestmentsTrace({
      accounts: [
        { id: 'inv-1', name: 'Roth IRA', type: 'rothira', balance: 50000, institution: 'Vanguard' },
      ],
      holdings: [
        { accountId: 'inv-1', costBasis: 35000, unrealizedGainLoss: 15000 },
      ],
      summary: {
        totalBalance: 50000,
        totalCostBasis: 35000,
        totalUnrealizedGainLoss: 15000,
        totalUnrealizedReturnPct: 42.86,
        holdingsCount: 1,
      },
    });

    expect(trace.result).toBe(50000);
    expect(trace.children?.length).toBe(1);
    expect(trace.children?.[0].title).toContain('Roth IRA (Vanguard)');
  });
});
