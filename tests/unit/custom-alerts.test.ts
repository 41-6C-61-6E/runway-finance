import { vi, describe, it, expect, beforeEach } from 'vitest';
import { inspect } from 'node:util';

const { mockSendNotification } = vi.hoisted(() => ({
  mockSendNotification: vi.fn<(sub: any, payload: string) => any>(async () => ({ statusCode: 201 })),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(async (val) => val),
  encryptField: vi.fn(async (val) => val),
}));

function getTableName(table: any): string | null {
  if (!table) return null;
  if (table.key && typeof table.key.name === 'string') return table.key.name;
  if (table._ && typeof table._.name === 'string') return table._.name;
  const symbols = Object.getOwnPropertySymbols(table);
  const nameSymbol = symbols.find((s) => s.toString() === 'Symbol(drizzle:Name)');
  if (nameSymbol) return table[nameSymbol];
  return null;
}

// Mock DB queries
let mockRulesResponse: any[] = [];
let mockAccountsResponse: any[] = [];
let mockCashFlowResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [{ id: 'sub_1', endpoint: 'https://fcm.googleapis.com/...', keys: { p256dh: 'p256', auth: 'auth' } }];
let mockSentResponse: any[] = [];

class MockDbQueryBuilder {
  private table: any;
  private filterId: string | null = null;

  constructor(table?: any) {
    this.table = table;
  }

  select(...args: any[]) {
    return this;
  }

  from(table: any) {
    this.table = table;
    return this;
  }

  leftJoin(...args: any[]) {
    return this;
  }

  where(...args: any[]) {
    const str = inspect(args, { depth: null });
    if (str.includes('checking_id')) {
      this.filterId = 'checking_id';
    } else if (str.includes('credit_id')) {
      this.filterId = 'credit_id';
    }
    return this;
  }

  orderBy(...args: any[]) {
    return this;
  }

  limit(n: number) {
    return this;
  }

  insert(table: any) {
    this.table = table;
    return this;
  }

  values(data: any) {
    return this;
  }

  update(table: any) {
    this.table = table;
    return this;
  }

  set(data: any) {
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);
    console.log('[DEBUG MockDB] Table Name:', tableName, 'Filter ID:', this.filterId);

    if (tableName === 'custom_alert_rules') {
      result = mockRulesResponse;
    } else if (tableName === 'accounts') {
      if (this.filterId) {
        result = mockAccountsResponse.filter((a) => a.id === this.filterId);
      } else {
        result = mockAccountsResponse;
      }
    } else if (tableName === 'monthly_cash_flow') {
      result = mockCashFlowResponse;
    } else if (tableName === 'push_subscriptions') {
      result = mockSubscriptionsResponse;
    } else if (tableName === 'sent_notifications') {
      result = mockSentResponse;
    } else if (tableName === 'user_settings') {
      result = [{ maxNotificationsPerPeriod: 5, notificationLimiterPeriodMinutes: 60 }];
    }

    return Promise.resolve(result).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

// Import target functions
import {
  checkTransactionAlerts,
  checkAccountBalanceAlerts,
  checkSavingsGoalAlerts,
  checkCashFlowAlerts
} from '@/lib/services/notifications';

describe('Custom Event Alert Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRulesResponse = [];
    mockAccountsResponse = [];
    mockCashFlowResponse = [];
    mockSentResponse = [];
  });

  describe('checkTransactionAlerts', () => {
    it('should trigger alert when transaction matches rule filters', async () => {
      // Setup transaction alert rule: checking account AND amount >= $100 AND keyword "netflix"
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Netflix Checking Alert',
          triggerType: 'transaction',
          criteria: {
            accountId: 'checking_id',
            amountMin: 100,
            keyword: 'netflix',
          },
          isEnabled: true,
        },
      ];

      // Test matching transaction
      const tx = {
        externalId: 'tx_123',
        accountId: 'checking_id',
        description: 'Netflix subscription renewal',
        payee: 'Netflix Inc',
        memo: null,
        amount: '-150.00', // absolute amount is 150
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Transaction Alert: Netflix Checking Alert');
      expect(payload.body).toContain('$150.00');
    });

    it('should not trigger if transaction does not match criteria', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Netflix Checking Alert',
          triggerType: 'transaction',
          criteria: {
            accountId: 'checking_id',
            amountMin: 200, // min amount $200
          },
          isEnabled: true,
        },
      ];

      const tx = {
        externalId: 'tx_123',
        accountId: 'checking_id',
        description: 'Netflix subscription renewal',
        payee: 'Netflix Inc',
        memo: null,
        amount: '-150.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  describe('checkAccountBalanceAlerts', () => {
    it('should trigger when account balance falls below a fixed threshold', async () => {
      mockRulesResponse = [
        {
          id: 'rule_2',
          name: 'Low Checking warning',
          triggerType: 'account_balance',
          criteria: {
            accountId: 'checking_id',
            compareType: 'value',
            operator: 'less_than',
            value: 500,
          },
          isEnabled: true,
        },
      ];

      mockAccountsResponse = [
        { id: 'checking_id', name: 'Checking Account' },
      ];

      const dek = new Uint8Array(32);
      await checkAccountBalanceAlerts('user_123', 'checking_id', 450, dek);
      
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('Checking Account');
      expect(payload.body).toContain('fell below $500');
    });

    it('should trigger when account balance is higher than another account balance', async () => {
      mockRulesResponse = [
        {
          id: 'rule_3',
          name: 'Credit card over checking warning',
          triggerType: 'account_balance',
          criteria: {
            accountId: 'credit_id',
            compareType: 'account',
            operator: 'greater_than',
            compareAccountId: 'checking_id',
          },
          isEnabled: true,
        },
      ];

      // Second database mock lookup inside for compare account balance
      mockAccountsResponse = [
        { id: 'credit_id', name: 'Credit Card', balance: '1200.00' },
        { id: 'checking_id', name: 'Checking Account', balance: '1000.00' },
      ];

      const dek = new Uint8Array(32);
      await checkAccountBalanceAlerts('user_123', 'credit_id', 1200, dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Credit card over checking warning');
      expect(payload.body).toContain('rose above Checking Account balance ($1000.00)');
    });
  });

  describe('checkSavingsGoalAlerts', () => {
    it('should trigger when goal newly reaches threshold percentage', async () => {
      mockRulesResponse = [
        {
          id: 'rule_4',
          name: 'Halfway funded savings goal',
          triggerType: 'savings_goal',
          criteria: {
            goalId: 'goal_123',
            operator: 'reached_percentage',
            value: 50,
          },
          isEnabled: true,
        },
      ];

      // Target reaches 50% (allocated 500 / target 1000)
      // Previous was 40% (allocated 400 / target 1000)
      await checkSavingsGoalAlerts('user_123', 'goal_123', 'House Fund', 500, 1000, 400);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('House Fund');
      expect(payload.body).toContain('reached 50% of its target');
    });

    it('should not trigger if goal was already above percentage threshold', async () => {
      mockRulesResponse = [
        {
          id: 'rule_4',
          name: 'Halfway funded savings goal',
          triggerType: 'savings_goal',
          criteria: {
            goalId: 'goal_123',
            operator: 'reached_percentage',
            value: 50,
          },
          isEnabled: true,
        },
      ];

      // Current 60%, Previous 55%
      await checkSavingsGoalAlerts('user_123', 'goal_123', 'House Fund', 600, 1000, 550);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  describe('checkCashFlowAlerts', () => {
    it('should trigger when net savings is negative for N consecutive months', async () => {
      mockRulesResponse = [
        {
          id: 'rule_5',
          name: 'Negative cash flow warning',
          triggerType: 'cash_flow',
          criteria: {
            metric: 'net_savings',
            operator: 'less_than',
            value: 0,
            consecutiveMonths: 2,
          },
          isEnabled: true,
        },
      ];

      // Last 2 months are negative
      mockCashFlowResponse = [
        { yearMonth: '2026-06', netCashFlow: '-200.00', totalIncome: '3000.00', totalExpenses: '3200.00' },
        { yearMonth: '2026-05', netCashFlow: '-100.00', totalIncome: '3000.00', totalExpenses: '3100.00' },
      ];

      const dek = new Uint8Array(32);
      await checkCashFlowAlerts('user_123', dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('below $0 for 2 consecutive months');
    });
  });
});
