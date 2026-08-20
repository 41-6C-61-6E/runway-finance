import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/net-worth/benchmarks/route';
import { NextRequest } from 'next/server';
import { standardSession, unauthed } from './mocks/session';
import { createMockDb } from './mocks/db';

let authFn: () => Promise<any>;
const mockDb = createMockDb({
  accounts: [],
  categories: [],
  budgets: [],
  transactions: [],
  user_settings: [],
});

vi.mock('@/lib/auth', () => ({
  auth: () => authFn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn((_table: string, rows: any[]) => Promise.resolve(rows.map((r: any) => ({ ...r })))),
  decryptRow: vi.fn((_table: string, row: any) => Promise.resolve({ ...row })),
  decryptField: vi.fn((val: any) => Promise.resolve(String(val ?? ''))),
  encryptRow: vi.fn((_t: string, d: any) => Promise.resolve(d)),
  encryptField: vi.fn((v: any) => Promise.resolve(String(v ?? ''))),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb.db,
}));

const now = new Date();
const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

function baseAccounts() {
  return [
    { id: 'acc-checking', userId: 'test-user-id', type: 'checking', balance: '5000.00', isHidden: false, isExcludedFromNetWorth: false },
    { id: 'acc-mortgage', userId: 'test-user-id', type: 'mortgage', balance: '-200000.00', isHidden: false, isExcludedFromNetWorth: false },
  ];
}

function baseCategories() {
  return [
    { id: 'cat-housing', userId: 'test-user-id', name: 'Housing', isDiscretionary: false, isIncome: false, categoryType: 'standard', parentId: null, excludeFromReports: false },
    { id: 'cat-mortgage', userId: 'test-user-id', name: 'Mortgage', isDiscretionary: true, isIncome: false, categoryType: 'standard', parentId: 'cat-housing', excludeFromReports: false },
    { id: 'cat-rent', userId: 'test-user-id', name: 'Rent', isDiscretionary: false, isIncome: false, categoryType: 'standard', parentId: null, excludeFromReports: false },
    { id: 'cat-utilities', userId: 'test-user-id', name: 'Utilities', isDiscretionary: false, isIncome: false, categoryType: 'standard', parentId: null, excludeFromReports: false },
    { id: 'cat-dining', userId: 'test-user-id', name: 'Dining Out', isDiscretionary: true, isIncome: false, categoryType: 'standard', parentId: null, excludeFromReports: false },
    { id: 'cat-salary', userId: 'test-user-id', name: 'Salary', isDiscretionary: true, isIncome: true, categoryType: 'standard', parentId: null, excludeFromReports: false },
    { id: 'cat-transfer', userId: 'test-user-id', name: 'Transfer', isDiscretionary: true, isIncome: false, categoryType: 'transfer', parentId: null, excludeFromReports: false },
  ];
}

function essentialBudgets() {
  return [
    { id: 'b1', userId: 'test-user-id', categoryId: 'cat-mortgage', amount: '1500.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: true, parentId: 'cat-housing' },
    { id: 'b2', userId: 'test-user-id', categoryId: 'cat-rent', amount: '1000.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: null, periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: false, parentId: null },
    { id: 'b3', userId: 'test-user-id', categoryId: 'cat-utilities', amount: '750.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'quarterly', periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: false, parentId: null },
    { id: 'b4', userId: 'test-user-id', categoryId: 'cat-salary', amount: '5000.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: true, categoryType: 'standard', isDiscretionary: true, parentId: null },
    { id: 'b5', userId: 'test-user-id', categoryId: 'cat-dining', amount: '300.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: true, parentId: null },
    { id: 'b6', userId: 'test-user-id', categoryId: 'cat-dining', amount: '400.00', isRecurring: false, effectiveFrom: null, effectiveTo: null, yearMonth: prevYearMonth, periodType: 'monthly', periodKey: prevYearMonth, isIncome: false, categoryType: 'standard', isDiscretionary: true, parentId: null },
  ];
}

function benchmarkTxns() {
  return [
    { id: 't1', userId: 'test-user-id', accountId: 'acc-checking', categoryId: 'cat-salary', amount: '2000.00', date: `${currentYearMonth}-05`, ignored: false, deleted: false, source: null },
    { id: 't2', userId: 'test-user-id', accountId: 'acc-checking', categoryId: 'cat-dining', amount: '-600.00', date: `${currentYearMonth}-10`, ignored: false, deleted: false, source: null },
    { id: 't3', userId: 'test-user-id', accountId: 'acc-checking', categoryId: 'cat-transfer', amount: '-500.00', date: `${currentYearMonth}-12`, ignored: false, deleted: false, source: null },
  ];
}

function setFixtures(overrides: Record<string, any[]> = {}) {
  mockDb.setTables({
    accounts: baseAccounts(),
    categories: baseCategories(),
    budgets: essentialBudgets(),
    transactions: benchmarkTxns(),
    user_settings: [{ paystubEnabled: false }],
    ...overrides,
  });
}

async function getBenchmarks() {
  authFn = standardSession();
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe('API Route: /api/net-worth/benchmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFixtures();
  });

  it('returns 401 when unauthenticated', async () => {
    authFn = unauthed();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('sums active budgets for Fixed categories (own flag and parent inheritance), rolling down quarters', async () => {
    const json = await getBenchmarks();
    // 1500 (mortgage, Fixed via Housing parent) + 1000 (rent, Fixed leaf) + 750/3 (quarterly utilities)
    expect(json.monthlyEssentialSpend).toBeCloseTo(2750, 5);
    // Budget covers the full mortgage payment
    expect(json.monthlyEssentialSpend).toBeGreaterThanOrEqual(1500);
  });

  it('ignores income, discretionary, and expired/other-month one-off budgets', async () => {
    const json = await getBenchmarks();
    // 2750 is above proves: +5000 salary, +300 dining, +400 last-month one-off were all excluded
    expect(json.monthlyEssentialSpend).not.toBeCloseTo(2750 + 5600, 5);
  });

  it('computes emergencyFundMonths as liquidCash / essential and drops the discretionary key', async () => {
    const json = await getBenchmarks();
    expect(json.liquidCash).toBeCloseTo(5000, 5);
    expect(json.emergencyFundMonths).toBeCloseTo(5000 / 2750, 5);
    expect(json).not.toHaveProperty('monthlyDiscretionarySpend');
  });

  it('returns null essential spend + null coverage when no Fixed budgets exist, while savings rate stays actuals-based', async () => {
    // Only discretionary / income budgets
    setFixtures({
      budgets: [
        { id: 'b5', userId: 'test-user-id', categoryId: 'cat-dining', amount: '300.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: true, parentId: null },
        { id: 'b4', userId: 'test-user-id', categoryId: 'cat-salary', amount: '5000.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: true, categoryType: 'standard', isDiscretionary: true, parentId: null },
      ],
    });
    const json = await getBenchmarks();
    expect(json.monthlyEssentialSpend).toBeNull();
    expect(json.emergencyFundMonths).toBeNull();
    // Income 2000, actual spend 600 (transfers excluded) → (2000-600)/2000 = 70%
    expect(json.savingsRate).toBeCloseTo(70, 5);
    expect(json.monthlyTotalSpend).toBeCloseTo(600 / 6, 5);
  });

  it('excludes budgets whose effective window no longer covers the current month', async () => {
    setFixtures({
      budgets: [
        { id: 'b1', userId: 'test-user-id', categoryId: 'cat-mortgage', amount: '1500.00', isRecurring: true, effectiveFrom: '2020-01-01', effectiveTo: '2021-06-30', yearMonth: null, periodType: 'monthly', periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: true, parentId: 'cat-housing' },
        { id: 'b2', userId: 'test-user-id', categoryId: 'cat-rent', amount: '800.00', isRecurring: true, effectiveFrom: null, effectiveTo: null, yearMonth: null, periodType: null, periodKey: null, isIncome: false, categoryType: 'standard', isDiscretionary: false, parentId: null },
      ],
    });
    const json = await getBenchmarks();
    expect(json.monthlyEssentialSpend).toBeCloseTo(800, 5);
  });

  it('counts liability payments (stored as positive amounts) as spend, and liability charges (negative) as spend offsets', async () => {
    setFixtures({
      accounts: [
        { id: 'acc-checking', userId: 'test-user-id', type: 'checking', balance: '5000.00', isHidden: false, isExcludedFromNetWorth: false },
        { id: 'acc-mortgage', userId: 'test-user-id', type: 'mortgage', balance: '-200000.00', isHidden: false, isExcludedFromNetWorth: false },
        { id: 'acc-credit', userId: 'test-user-id', type: 'credit', balance: '-1200.00', isHidden: false, isExcludedFromNetWorth: false },
      ],
      transactions: [
        { id: 't1', userId: 'test-user-id', accountId: 'acc-checking', categoryId: 'cat-salary', amount: '5000.00', date: `${currentYearMonth}-05`, ignored: false, deleted: false, source: null },
        // Liability convention: mortgage payment stored POSITIVE (debt reduction).
        { id: 't2', userId: 'test-user-id', accountId: 'acc-mortgage', categoryId: 'cat-mortgage', amount: '7350.00', date: `${currentYearMonth}-10`, ignored: false, deleted: false, source: null },
        // Liability convention: credit charge stored NEGATIVE (debt increase),
        // counted as 400 of spend via Math.abs, same as any expense.
        { id: 't3', userId: 'test-user-id', accountId: 'acc-credit', categoryId: 'cat-dining', amount: '-400.00', date: `${currentYearMonth}-12`, ignored: false, deleted: false, source: null },
      ],
    });
    const json = await getBenchmarks();
    // Income comes only from the salary category tx.
    expect(json.monthlyIncome).toBeCloseTo(5000 / 6, 5);
    // Spend = 7350 mortgage payment + 400 charge = 7750 over the window.
    // Pre-fix, the +7350 liability payment was dropped entirely (positive
    // amount on a non-income category was neither income nor spend) and only
    // the 400 showed up.
    expect(json.monthlyTotalSpend).toBeCloseTo(7750 / 6, 5);
    // (5000 - 7750) / 5000 = -55%
    expect(json.savingsRate).toBeCloseTo(-55, 5);
  });
});
