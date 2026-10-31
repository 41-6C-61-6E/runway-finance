import { describe, it, expect, vi, beforeEach } from 'vitest';
import { topMerchantsPack, TopMerchantsParams } from '@/lib/advice/packs/top-merchants';
import type { FinanceContext } from '@/lib/finance/context';
import * as cryptoModule from '@/lib/crypto';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: mockSelect,
  }),
}));

describe('Top Merchants Data Pack', () => {
  const dummyCtx: FinanceContext = {
    userId: 'u-1',
    dek: new Uint8Array(32),
    settings: {} as any,
    now: new Date('2026-10-15T12:00:00Z'),
    getAccounts: vi.fn().mockResolvedValue([
      { id: 'acc-1', type: 'checking', balance: 5000 },
      { id: 'acc-2', type: 'credit', balance: -1200 },
    ]),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  it('validates params with safe fallbacks', () => {
    const parsed = TopMerchantsParams.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.months).toBe(3);
      expect(parsed.data.limit).toBe(10);
    }
  });

  it('aggregates transactions by normalized merchant and produces markdown table', async () => {
    // Mock db returns: 1. raw transactions, 2. categories
    const rawTxs = [
      {
        id: 'tx-1',
        accountId: 'acc-1',
        amount: 'enc-amt-1',
        payee: 'AMZN Mktp US*1234',
        description: 'AMZN MKTP US',
        categoryId: 'cat-1',
      },
      {
        id: 'tx-2',
        accountId: 'acc-1',
        amount: 'enc-amt-2',
        payee: 'Amazon.com*9876',
        description: 'Amazon.com',
        categoryId: 'cat-1',
      },
      {
        id: 'tx-3',
        accountId: 'acc-2',
        amount: 'enc-amt-3',
        payee: 'COSTCO WHSE #1234',
        description: 'COSTCO WHSE',
        categoryId: 'cat-1',
      },
      {
        id: 'tx-transfer',
        accountId: 'acc-1',
        amount: 'enc-amt-transfer',
        payee: 'Credit Card Payoff',
        description: 'Transfer',
        categoryId: 'cat-transfer',
      },
    ];

    const rawCats = [
      { id: 'cat-1', name: 'Shopping', excludeFromReports: false, categoryType: 'standard' },
      { id: 'cat-transfer', name: 'Transfer', excludeFromReports: false, categoryType: 'transfer' },
    ];

    mockWhere
      .mockResolvedValueOnce(rawTxs)
      .mockResolvedValueOnce(rawCats);

    // Mock decryptRows
    vi.spyOn(cryptoModule, 'decryptRows').mockImplementation(async (table, rows) => {
      if (table === 'categories') {
        return rawCats as any;
      }
      if (table === 'transactions') {
        return [
          {
            id: 'tx-1',
            accountId: 'acc-1',
            amount: '-150.00', // outflow on checking
            payee: 'AMZN Mktp US*1234',
            description: 'AMZN MKTP US',
            categoryId: 'cat-1',
          },
          {
            id: 'tx-2',
            accountId: 'acc-1',
            amount: '-50.00', // outflow on checking
            payee: 'Amazon.com*9876',
            description: 'Amazon.com',
            categoryId: 'cat-1',
          },
          {
            id: 'tx-3',
            accountId: 'acc-2',
            amount: '-120.00', // expense on credit card
            payee: 'COSTCO WHSE #1234',
            description: 'COSTCO WHSE',
            categoryId: 'cat-1',
          },
          {
            id: 'tx-transfer',
            accountId: 'acc-1',
            amount: '-1000.00',
            payee: 'Credit Card Payoff',
            description: 'Transfer',
            categoryId: 'cat-transfer',
          },
        ] as any;
      }
      return rows as any;
    });

    const result = await topMerchantsPack.build(dummyCtx, { months: 3, limit: 10 });

    expect(result.text).toContain('### Top Merchants & Payees');
    expect(result.text).toContain('| Merchant | Total Spent | Transactions | % of Total |');

    // Amazon ($150 + $50 = $200) should be normalized to 'Amazon'
    expect(result.text).toContain('| Amazon | $200 | 2 |');

    // Costco should be normalized to 'Costco Whse'
    expect(result.text).toContain('Costco Whse');
    expect(result.text).toContain('$120');

    // Transfer should be excluded
    expect(result.text).not.toContain('Credit Card Payoff');

    // Total should be $320 across 3 transactions
    expect(result.text).toContain('| **Total** | **$320** | **3** | **100.0%** |');
  });
});
