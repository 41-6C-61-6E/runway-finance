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
import { formatTraceResult } from '@/components/financial-logic/calculation-trace';
import type { AccountData } from '@/lib/types/financial';

describe('Trace Engine (trace-engine.ts)', () => {
  const sampleAccounts: AccountData[] = [
    { id: 'acc-1', name: 'Checking', type: 'checking', balance: 5000, isHidden: false, isExcludedFromNetWorth: false },
    { id: 'acc-2', name: 'Brokerage', type: 'investment', balance: 25000, isHidden: false, isExcludedFromNetWorth: false },
    { id: 'acc-3', name: 'Credit Card', type: 'credit', balance: 2000, isHidden: false, isExcludedFromNetWorth: false },
    { id: 'acc-4', name: 'Mortgage', type: 'mortgage', balance: 180000, isHidden: false, isExcludedFromNetWorth: false },
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

  it('buildNetWorthTraces excludes hidden and excluded accounts from calculation', () => {
    const accountsWithHidden: AccountData[] = [
      { id: 'acc-1', name: 'Checking', type: 'checking', balance: 10000, isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-2', name: 'Hidden Savings', type: 'savings', balance: 50000, isHidden: true, isExcludedFromNetWorth: false },
      { id: 'acc-3', name: 'Excluded Vehicle', type: 'vehicle', balance: 20000, isHidden: false, isExcludedFromNetWorth: true },
      { id: 'acc-4', name: 'Credit Card', type: 'credit', balance: 2000, isHidden: false, isExcludedFromNetWorth: false },
    ];
    const traces = buildNetWorthTraces(accountsWithHidden);
    const [assets, liabilities, netWorth] = traces;

    expect(assets.result).toBe(10000);
    expect(liabilities.result).toBe(2000);
    expect(netWorth.result).toBe(8000);
  });

  it('buildDebtToAssetTrace returns Infinity for zero assets with positive liabilities and 0 for zero debt', () => {
    const zeroAssetIndebted: AccountData[] = [
      { id: 'cc-1', name: 'Credit Card', type: 'credit', balance: 1000 },
    ];
    const traceIndebted = buildDebtToAssetTrace(zeroAssetIndebted);
    expect(traceIndebted.result).toBe(Infinity);
    expect(formatTraceResult(traceIndebted.result, traceIndebted.format)).toBe('100%+ (∞)');

    const zeroAssetZeroDebt: AccountData[] = [];
    const traceZero = buildDebtToAssetTrace(zeroAssetZeroDebt);
    expect(traceZero.result).toBe(0);
    expect(formatTraceResult(traceZero.result, traceZero.format)).toBe('0.00');
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
    expect(trace.filters).toContain('excludeFromReports = false');
  });

  it('buildRealEstateTrace calculates equity, LTV, and preserves estimate flags', () => {
    const trace = buildRealEstateTrace({
      totalValue: 500000,
      totalMortgage: 350000,
      totalEquity: 150000,
      overallLtv: 70,
      properties: [
        { name: 'Primary Home', value: 500000, mortgageBalance: 350000, equity: 150000, isSynthetic: true },
      ],
    });
    expect(trace.result).toBe(150000);
    expect(trace.steps.find((s) => s.label === 'LTV Ratio')?.output).toBe(70);
    expect(trace.steps[0].isEstimate).toBe(true);
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
    expect(trace.steps.find((s) => s.label === 'Years to FI')?.isEstimate).toBe(true);
  });

  it('buildBudgetTrace handles income vs expense budget types and unbudgeted zero state', () => {
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

    // Unbudgeted spending scenario
    const unbudgetedTrace = buildBudgetTrace({
      totalBudgeted: 0,
      totalActual: 250,
      remaining: -250,
      percentUsed: 0,
      type: 'expense',
    });
    expect(unbudgetedTrace.steps.find((s) => s.label === '% Used')?.operation).toContain('unbudgeted');
  });

  it('buildGoalsTrace formats total targets and caps progress at 100%', () => {
    const trace = buildGoalsTrace({
      totalTarget: 50000,
      totalCurrent: 25000,
      overallProgress: 50,
      count: 3,
    });
    expect(trace.result).toBe(50);
    expect(trace.format).toBe('percentage');

    const overfundedTrace = buildGoalsTrace({
      totalTarget: 10000,
      totalCurrent: 15000,
    });
    expect(overfundedTrace.result).toBe(100);
  });

  it('buildInvestmentsTrace constructs account hierarchies with correct holding cost basis subtraction', () => {
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

    const gainStep = trace.children?.[0].steps.find((s) => s.label === 'Unrealized Gain/Loss');
    expect(gainStep?.operation).toBe('50000 − 35000');
    expect(gainStep?.output).toBe(15000);
  });
});
