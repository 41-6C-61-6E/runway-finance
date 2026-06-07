import { vi, describe, it, expect, beforeEach } from 'vitest';

// Drizzle stores table names under a Symbol. We find it dynamically to avoid
// type issues with different drizzle versions.
const TABLE_NAME_SYMBOL = (() => {
  const { pgTable, uuid } = require('drizzle-orm/pg-core') as typeof import('drizzle-orm/pg-core');
  const dummy = pgTable('_resolve_name_symbol', { id: uuid('id').primaryKey() });
  for (const key of Object.getOwnPropertySymbols(dummy)) {
    if (key.toString().includes('Name') && !key.toString().includes('BaseName') && !key.toString().includes('OriginalName')) {
      return key;
    }
  }
  return Symbol('Name');
})();

function getTableName(table: any): string | undefined {
  if (!table) return undefined;
  return table[TABLE_NAME_SYMBOL];
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(),
}));

vi.mock('@/lib/crypto', () => {
  return {
    decryptField: vi.fn(async (val) => val),
    encryptField: vi.fn(async (val) => val),
    encryptRow: vi.fn(async (table, row) => row),
    decryptRows: vi.fn(async (table, rows) => rows),
  };
});

// Mock database return values
let mockAccountsResponse: any[] = [];
let mockHoldingsResponse: any[] = [];
let mockTransactionsResponse: any[] = [];
let mockPricesResponse: any[] = [];
let mockSnapshotsResponse: any[] = [];

// Simple Mock DB Query Builder for tests
class MockDbQueryBuilder {
  private currentTable: any = null;

  select(...args: any[]) {
    return this;
  }

  from(table: any) {
    this.currentTable = table;
    return this;
  }

  where(...args: any[]) {
    return this;
  }

  orderBy(...args: any[]) {
    return this;
  }

  limit(n: number) {
    return this;
  }

  insert(table: any) {
    return this;
  }

  values(data: any) {
    return this;
  }

  onConflictDoUpdate(config: any) {
    return this;
  }

  update(table: any) {
    return this;
  }

  set(data: any) {
    return this;
  }

  returning() {
    return this;
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.currentTable);
    
    // Determine which mock response to return based on the query state
    if (tableName === 'accounts') {
      result = mockAccountsResponse;
    } else if (tableName === 'investment_holdings') {
      result = mockHoldingsResponse;
    } else if (tableName === 'investment_transactions') {
      result = mockTransactionsResponse;
    } else if (tableName === 'security_prices') {
      result = mockPricesResponse;
    } else if (tableName === 'account_snapshots') {
      result = mockSnapshotsResponse;
    }

    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
    getPool: () => ({
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    }),
  };
});

// Mock financial provider
const mockSearch = vi.fn(async () => []);
const mockQuotes = vi.fn(async () => []);
const mockHistory = vi.fn(async () => []);

vi.mock('@/lib/services/financial-provider', () => {
  return {
    getFinancialProvider: vi.fn(async () => ({
      searchTicker: mockSearch,
      fetchQuotes: mockQuotes,
      fetchHistory: mockHistory,
    })),
  };
});

import { getPortfolioHoldings } from '@/lib/services/investments';

describe('Investments Service - Portfolio Engine', () => {
  beforeEach(() => {
    mockAccountsResponse = [];
    mockHoldingsResponse = [];
    mockTransactionsResponse = [];
    mockPricesResponse = [];
    mockSnapshotsResponse = [];

    mockSearch.mockClear();
    mockQuotes.mockClear();
    mockHistory.mockClear();
  });

  it('aggregates static stock positions correctly in positions mode', async () => {
    // 1. Arrange
    mockAccountsResponse = [
      {
        id: 'acc_invest_1',
        userId: 'user_1',
        name: 'Manual Brokerage',
        type: 'investment',
        balance: '5000',
        metadata: JSON.stringify({
          trackingMode: 'positions',
          cashReconciliationMode: 'manual',
        }),
      },
    ];

    mockHoldingsResponse = [
      {
        id: 'hold_1',
        accountId: 'acc_invest_1',
        ticker: 'AAPL',
        shares: '10',
        costBasis: '150',
      },
      {
        id: 'hold_2',
        accountId: 'acc_invest_1',
        ticker: 'MSFT',
        shares: '5',
        costBasis: '300',
      },
    ];

    mockPricesResponse = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        currentPrice: '180',
        dailyChange: '1.5',
        dailyChangePercent: '0.84',
        sector: 'Technology',
        assetClass: 'Equity',
      },
      {
        ticker: 'MSFT',
        name: 'Microsoft Corp.',
        currentPrice: '350',
        dailyChange: '-2.1',
        dailyChangePercent: '-0.6',
        sector: 'Technology',
        assetClass: 'Equity',
      },
    ];

    // 2. Act
    const portfolio = await getPortfolioHoldings('user_1');

    // 3. Assert
    expect(portfolio.totalValue).toBe(3550); // (10 * 180) + (5 * 350) = 1800 + 1750 = 3550
    expect(portfolio.totalCost).toBe(3000); // (10 * 150) + (5 * 300) = 1500 + 1500 = 3000
    expect(portfolio.totalGainLoss).toBe(550);
    expect(portfolio.totalGainLossPercent).toBeCloseTo(18.33, 2);

    expect(portfolio.accounts).toHaveLength(1);
    const acc = portfolio.accounts[0];
    expect(acc.holdings).toHaveLength(2);
    expect(acc.holdings[0].ticker).toBe('AAPL');
    expect(acc.holdings[0].shares).toBe(10);
    expect(acc.holdings[0].currentValue).toBe(1800);
  });

  it('rolls up buy/sell/split transactions in ledger mode correctly', async () => {
    // 1. Arrange
    mockAccountsResponse = [
      {
        id: 'acc_invest_2',
        userId: 'user_1',
        name: 'Ledger IRA',
        type: 'brokerage',
        balance: '0',
        metadata: JSON.stringify({
          trackingMode: 'transactions',
          cashReconciliationMode: 'manual',
        }),
      },
    ];

    // Buys 10 shares @ 150, splits 2-for-1 (now 20 shares @ 75 basis), sells 5 shares
    mockTransactionsResponse = [
      {
        id: 'tx_1',
        accountId: 'acc_invest_2',
        ticker: 'AAPL',
        type: 'buy',
        shares: '10',
        pricePerShare: '150',
        commission: '5',
        transactionDate: '2026-06-01',
      },
      {
        id: 'tx_2',
        accountId: 'acc_invest_2',
        ticker: 'AAPL',
        type: 'split',
        shares: '2', // 2-for-1 split ratio
        pricePerShare: '0',
        commission: '0',
        transactionDate: '2026-06-02',
      },
      {
        id: 'tx_3',
        accountId: 'acc_invest_2',
        ticker: 'AAPL',
        type: 'sell',
        shares: '5',
        pricePerShare: '190',
        commission: '0',
        transactionDate: '2026-06-03',
      },
    ];

    mockPricesResponse = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        currentPrice: '100', // active current price post-split
        dailyChange: '0',
        dailyChangePercent: '0',
        sector: 'Technology',
        assetClass: 'Equity',
      },
    ];

    // 2. Act
    const portfolio = await getPortfolioHoldings('user_1');

    // 3. Assert
    const acc = portfolio.accounts[0];
    expect(acc.holdings).toHaveLength(1);
    
    const holding = acc.holdings[0];
    expect(holding.ticker).toBe('AAPL');
    
    // 10 shares bought -> split * 2 = 20 -> sell 5 = 15 remaining shares.
    expect(holding.shares).toBe(15);
    
    // Initial cost: 10 * 150 + 5 commission = 1505
    // Post-split shares: 20, basis: 1505 / 20 = 75.25
    // Sell 5: cost basis stays 75.25. Remaining cost: 15 * 75.25 = 1128.75
    expect(holding.costBasis).toBeCloseTo(75.25, 2);
    expect(holding.totalCost).toBeCloseTo(1128.75, 2);
    expect(holding.currentValue).toBe(1500); // 15 * 100
  });

  it('calculates cash sweeps correctly in automated cash reconciliation mode', async () => {
    // 1. Arrange
    mockAccountsResponse = [
      {
        id: 'acc_invest_3',
        userId: 'user_1',
        name: 'Synced Brokerage',
        type: 'retirement',
        balance: '10000', // Synced total balance
        connectionId: 'conn_1',
        metadata: JSON.stringify({
          trackingMode: 'positions',
          cashReconciliationMode: 'automated',
        }),
      },
    ];

    // stock value: 10 * 800 = 8000
    mockHoldingsResponse = [
      {
        id: 'hold_3',
        accountId: 'acc_invest_3',
        ticker: 'GOOGL',
        shares: '10',
        costBasis: '700',
      },
    ];

    mockPricesResponse = [
      {
        ticker: 'GOOGL',
        name: 'Alphabet Inc.',
        currentPrice: '800',
        dailyChange: '0',
        dailyChangePercent: '0',
        sector: 'Technology',
        assetClass: 'Equity',
      },
    ];

    // 2. Act
    const portfolio = await getPortfolioHoldings('user_1');

    // 3. Assert
    const acc = portfolio.accounts[0];
    
    // Total balance is 10000. Stock holdings value is 8000.
    // Reconciled virtual cash should be 10000 - 8000 = 2000.
    expect(acc.totalComputedValue).toBe(10000);
    expect(acc.reconciledCash).toBe(2000);
    
    // Reconciled cash should be present in computed positions list
    expect(acc.holdings).toHaveLength(2);
    const cashHolding = acc.holdings.find(h => h.isVirtualCash === true);
    expect(cashHolding).toBeDefined();
    expect(cashHolding?.ticker).toBe('CASH');
    expect(cashHolding?.currentValue).toBe(2000);
  });
});
