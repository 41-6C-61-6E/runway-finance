import type { EnginePlan } from '@/lib/services/retirement-engine';

export function createEnginePlan(overrides: Partial<EnginePlan> = {}): EnginePlan {
  return {
    id: 'plan_test_01',
    name: 'Standard Test FIRE Plan',
    hasSpouse: false,
    primaryBirthYear: 1990,
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60,
    lifeExpectancyAge: 85,
    primarySalary: 100000,
    primarySalaryYear: 2026,
    primarySalaryRaisePct: 3.0,
    withdrawalMethod: 'textbook',
    accounts: [
      {
        id: 'acc_taxable_01',
        name: 'Taxable Brokerage',
        type: 'taxable',
        owner: 'primary',
        balance: 100000,
        costBasis: 80000,
        expectedGrowthRate: 7.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
        contributionMode: 'percentage',
        contributionValue: 15.0,
      },
      {
        id: 'acc_roth_01',
        name: 'Roth IRA',
        type: 'roth_ira',
        owner: 'primary',
        balance: 50000,
        costBasis: 30000,
        expectedGrowthRate: 7.0,
        dividendYield: 0,
        reinvestDividends: true,
        contributionMode: 'fixed_amount',
        contributionValue: 7000,
      },
    ],
    events: [],
    liabilities: [],
    flows: [],
    settings: {
      fixedInflationRate: 2.5,
      incomeTaxModifier: 0,
      enableAmt: false,
      projectionMode: 'inflationEscalated',
    },
    ...overrides,
  };
}

export function createAccount(overrides: Record<string, any> = {}) {
  return {
    id: 'acc_mock_' + Math.random().toString(36).substring(7),
    userId: 'usr_mock_123',
    name: 'Checking Account',
    type: 'depository',
    subtype: 'checking',
    balance: 5000,
    currency: 'USD',
    isIncluded: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTransaction(overrides: Record<string, any> = {}) {
  return {
    id: 'tx_mock_' + Math.random().toString(36).substring(7),
    userId: 'usr_mock_123',
    accountId: 'acc_mock_checking',
    amount: -45.5,
    date: '2026-03-15',
    name: 'Grocery Store',
    category: 'Groceries',
    pending: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createBudget(overrides: Record<string, any> = {}) {
  return {
    id: 'bgt_mock_' + Math.random().toString(36).substring(7),
    userId: 'usr_mock_123',
    categoryId: 'cat_mock_groceries',
    amount: 600,
    month: 3,
    year: 2026,
    ...overrides,
  };
}

export function createHolding(overrides: Record<string, any> = {}) {
  return {
    id: 'hld_mock_' + Math.random().toString(36).substring(7),
    userId: 'usr_mock_123',
    accountId: 'acc_mock_brokerage',
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    quantity: 100,
    costBasis: 20000,
    currentValue: 24500,
    asOfDate: '2026-03-15',
    ...overrides,
  };
}
