import { describe, expect, it, vi, beforeEach } from 'vitest';
import { syncPlaidConnection } from '@/lib/services/plaid-sync';
import { plaidConnections, accounts, syncLogs, transactions, userSettings, holdings } from '@/lib/db/schema';

let lastTableOrOperation: any = null;
let insertedHoldings: any[] = [];

class MockDbQueryBuilder {
  select(...args: any[]) {
    return this;
  }

  from(table: any) {
    lastTableOrOperation = table;
    return this;
  }

  where(...args: any[]) {
    return this;
  }

  limit(n: number) {
    return this;
  }

  insert(table: any) {
    lastTableOrOperation = table;
    return this;
  }

  values(data: any) {
    if (lastTableOrOperation === holdings) {
      insertedHoldings.push(data);
    }
    return this;
  }

  onConflictDoUpdate(config: any) {
    return this;
  }

  update(table: any) {
    lastTableOrOperation = table;
    return this;
  }

  delete(table: any) {
    lastTableOrOperation = table;
    return this;
  }

  set(data: any) {
    return this;
  }

  returning() {
    return this;
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    let result: any = [];
    if (lastTableOrOperation === syncLogs) {
      result = [{ id: 'log_123', startedAt: new Date() }];
    } else if (lastTableOrOperation === plaidConnections) {
      result = [{ id: 'conn_123', userId: 'user_123', lastSyncAt: null, accessTokenEncrypted: 'enc_token' }];
    } else if (lastTableOrOperation === accounts) {
      result = [{ id: 'acct_brokerage_id', externalId: 'acct_brokerage' }];
    } else if (lastTableOrOperation === userSettings) {
      result = [{ aiAutoAnalyze: false }];
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

// Mock DB module
vi.mock('@/lib/db', () => {
  return {
    getDb: vi.fn(() => new MockDbQueryBuilder()),
  };
});

// Mock sharing module
vi.mock('@/lib/sharing', () => ({
  resolveDataUserId: vi.fn((uid) => Promise.resolve(uid)),
}));

// Mock crypto context
vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
}));

// Mock crypto module
vi.mock('@/lib/crypto', () => ({
  encryptField: vi.fn((val) => Promise.resolve(`enc_${val}`)),
  decryptField: vi.fn((val) => Promise.resolve(`dec_${val}`)),
}));

// Mock Plaid helper client builder
vi.mock('@/lib/plaid', () => ({
  getPlaidClient: vi.fn(),
}));

// Mock seed-categories
vi.mock('@/lib/db/seed-categories', () => ({
  ensureCompoundCategories: vi.fn(),
  ensureEmployerContributions: vi.fn(),
}));

// Mock sync helper
vi.mock('@/lib/services/sync', () => ({
  createNetWorthSnapshot: vi.fn(),
  createAccountSnapshots: vi.fn(),
  updateMonthlyCashFlowSummaries: vi.fn(),
  updateCategorySpendingSummaries: vi.fn(),
  updateCategoryIncomeSummaries: vi.fn(),
  deleteOldPendingTransactions: vi.fn().mockResolvedValue(undefined),
}));

// Mock account history
vi.mock('@/lib/services/account-history', () => ({
  generateHistoricalAccountSnapshots: vi.fn(),
  getEarliestTransactionDate: vi.fn().mockResolvedValue('2026-05-01'),
}));

import { getPlaidClient } from '@/lib/plaid';

describe('Plaid Sync Service', () => {
  const mockConnectionId = 'conn_123';
  const mockUserId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    lastTableOrOperation = null;
    insertedHoldings = [];
  });

  it('syncs investment transactions when investment accounts are present', async () => {
    const mockPlaidClient = {
      transactionsSync: vi.fn().mockResolvedValue({
        data: {
          added: [],
          modified: [],
          removed: [],
          next_cursor: 'cursor_abc',
          has_more: false,
          accounts: [
            {
              account_id: 'acct_brokerage',
              name: 'Brokerage Account',
              type: 'investment',
              balances: { current: 15000 },
            },
          ],
        },
      }),
      investmentsHoldingsGet: vi.fn().mockResolvedValue({
        data: {
          holdings: [
            {
              account_id: 'acct_brokerage',
              security_id: 'sec_1',
              institution_price: 150.25,
              institution_value: 1502.5,
              cost_basis: 1200,
              quantity: 10,
              iso_currency_code: 'USD',
            },
          ],
          securities: [
            {
              security_id: 'sec_1',
              ticker_symbol: 'AAPL',
              name: 'Apple Inc.',
              close_price: 150.25,
            },
          ],
        },
      }),
      investmentsTransactionsGet: vi.fn().mockResolvedValue({
        data: {
          investment_transactions: [
            {
              investment_transaction_id: 'inv_tx_1',
              account_id: 'acct_brokerage',
              date: '2026-06-01',
              name: 'BUY 10 SHARES AAPL',
              amount: 1200,
              type: 'buy',
              subtype: 'buy',
            },
          ],
          total_investment_transactions: 1,
        },
      }),
    };

    (getPlaidClient as any).mockResolvedValue(mockPlaidClient);

    const result = await syncPlaidConnection(mockConnectionId, mockUserId);

    expect(result.status).toBe('success');
    expect(mockPlaidClient.investmentsHoldingsGet).toHaveBeenCalled();
    expect(mockPlaidClient.investmentsTransactionsGet).toHaveBeenCalled();
    expect(result.transactionsFetched).toBe(1); // 1 investment transaction was mapped and fetched
  });

  it('aggregates duplicate holdings for the same security_id and syncs them', async () => {
    const mockPlaidClient = {
      transactionsSync: vi.fn().mockResolvedValue({
        data: {
          added: [],
          modified: [],
          removed: [],
          next_cursor: 'cursor_abc',
          has_more: false,
          accounts: [
            {
              account_id: 'acct_brokerage',
              name: 'Brokerage Account',
              type: 'investment',
              balances: { current: 15000 },
            },
          ],
        },
      }),
      investmentsHoldingsGet: vi.fn().mockResolvedValue({
        data: {
          holdings: [
            {
              account_id: 'acct_brokerage',
              security_id: 'sec_1',
              institution_price: 150.25,
              institution_value: 1502.5,
              cost_basis: 1200,
              quantity: 10,
              iso_currency_code: 'USD',
            },
            {
              account_id: 'acct_brokerage',
              security_id: 'sec_1',
              institution_price: 150.25,
              institution_value: 751.25,
              cost_basis: 600,
              quantity: 5,
              iso_currency_code: 'USD',
            },
          ],
          securities: [
            {
              security_id: 'sec_1',
              ticker_symbol: 'AAPL',
              name: 'Apple Inc.',
              close_price: 150.25,
            },
          ],
        },
      }),
      investmentsTransactionsGet: vi.fn().mockResolvedValue({
        data: {
          investment_transactions: [],
          total_investment_transactions: 0,
        },
      }),
    };

    (getPlaidClient as any).mockResolvedValue(mockPlaidClient);

    const result = await syncPlaidConnection(mockConnectionId, mockUserId);

    expect(result.status).toBe('success');
    expect(insertedHoldings.length).toBe(1); // Duplicates should have been aggregated into one holding

    // Verify aggregated values
    const holding = insertedHoldings[0];
    expect(holding.securityId).toBe('sec_1');
    expect(holding.ticker).toBe('AAPL');
    expect(holding.quantity).toBe('enc_15'); // 10 + 5 = 15
    expect(holding.value).toBe('enc_2253.75'); // 1502.5 + 751.25 = 2253.75
    expect(holding.costBasis).toBe('enc_1800'); // 1200 + 600 = 1800
    expect(holding.price).toBe('enc_150.25'); // institutionPrice
  });
});
