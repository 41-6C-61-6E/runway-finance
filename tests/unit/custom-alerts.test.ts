import { vi, describe, it, expect, beforeEach } from 'vitest';

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

let mockRulesResponse: any[] = [];
let mockAccountsResponse: any[] = [];
let mockCashFlowResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [{ id: 'sub_1', endpoint: 'https://fcm.googleapis.com/...', keys: { p256dh: 'p256', auth: 'auth' } }];
let mockSentResponse: any[] = [];

class MockDbQueryBuilder {
  private table: any;
  private accountQueryIndex = 0;

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

  returning() {
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);

    if (tableName === 'custom_alert_rules') {
      result = mockRulesResponse;
    } else if (tableName === 'accounts') {
      const idx = this.accountQueryIndex++;
      result = idx < mockAccountsResponse.length ? [mockAccountsResponse[idx]] : [];
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

import {
  checkTransactionAlerts,
  checkAccountBalanceAlerts,
  checkSavingsGoalAlerts,
  checkCashFlowAlerts,
  evaluateConditionTree,
} from '@/lib/services/notifications';

describe('Custom Event Alert Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRulesResponse = [];
    mockAccountsResponse = [];
    mockCashFlowResponse = [];
    mockSentResponse = [];
  });

  // ── Transaction Alerts ──────────────────────────────────────────────────

  describe('checkTransactionAlerts', () => {
    it('should trigger alert when transaction matches legacy rule filters', async () => {
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

      const tx = {
        externalId: 'tx_123',
        accountId: 'checking_id',
        description: 'Netflix subscription renewal',
        payee: 'Netflix Inc',
        memo: null,
        amount: '-150.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Transaction Alert: Netflix Checking Alert');
      expect(payload.body).toContain('$150.00');
    });

    it('should not trigger if transaction does not match legacy criteria', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Netflix Checking Alert',
          triggerType: 'transaction',
          criteria: {
            accountId: 'checking_id',
            amountMin: 200,
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

    it('should trigger with multi-conditions (AND - all match)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Large food expense',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'amount_min', value: 50, goalId: undefined },
            { field: 'keyword', value: 'restaurant', goalId: undefined },
          ],
          conditionOperator: 'AND',
        },
      ];

      const tx = {
        externalId: 'tx_456',
        accountId: 'acct_1',
        description: 'Italian restaurant dinner',
        payee: 'Mario Ristorante',
        memo: null,
        amount: '-120.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Large food expense');
    });

    it('should trigger with multi-conditions (OR - one matches)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Big or Amazon',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'amount_min', value: 5000, goalId: undefined },
            { field: 'keyword', value: 'amazon', goalId: undefined },
          ],
          conditionOperator: 'OR',
        },
      ];

      const tx = {
        externalId: 'tx_789',
        accountId: 'acct_1',
        description: 'Amazon.com purchase',
        payee: 'Amazon',
        memo: null,
        amount: '-45.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it('should not trigger with AND conditions when one fails', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Large food expense',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'amount_min', value: 100, goalId: undefined },
            { field: 'keyword', value: 'restaurant', goalId: undefined },
          ],
          conditionOperator: 'AND',
        },
      ];

      const tx = {
        externalId: 'tx_999',
        accountId: 'acct_1',
        description: 'Small coffee purchase',
        payee: 'Starbucks',
        memo: null,
        amount: '-5.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should not trigger with OR conditions when none match', async () => {
      mockRulesResponse = [
        {
          id: 'rule_1',
          name: 'Big or Amazon',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'amount_min', value: 5000, goalId: undefined },
            { field: 'keyword', value: 'netflix', goalId: undefined },
          ],
          conditionOperator: 'OR',
        },
      ];

      const tx = {
        externalId: 'tx_abc',
        accountId: 'acct_1',
        description: 'Small grocery purchase',
        payee: 'Kroger',
        memo: null,
        amount: '-35.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ── Account Balance Alerts ─────────────────────────────────────────────

  describe('checkAccountBalanceAlerts', () => {
    it('should trigger when account balance falls below a fixed threshold (legacy)', async () => {
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

    it('should trigger when account balance is higher than another account (legacy)', async () => {
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

    it('should trigger with multi-conditions (balance_below_value)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_6',
          name: 'Low balance alert',
          triggerType: 'account_balance',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'balance_below_value', value: 300 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockAccountsResponse = [
        { id: 'checking_id', name: 'Checking Account' },
      ];

      const dek = new Uint8Array(32);
      await checkAccountBalanceAlerts('user_123', 'checking_id', 250, dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('fell below $300');
    });

    it('should trigger with multi-conditions (balance_above_account)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_7',
          name: 'Checking above savings',
          triggerType: 'account_balance',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'balance_above_account', value: 'savings_id' },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockAccountsResponse = [
        { id: 'checking_id', name: 'Checking Account', balance: '2000.00' },
        { id: 'savings_id', name: 'Savings Account', balance: '1500.00' },
      ];

      const dek = new Uint8Array(32);
      await checkAccountBalanceAlerts('user_123', 'checking_id', 2000, dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('rose above');
    });

    it('should not trigger when conditions are not met', async () => {
      mockRulesResponse = [
        {
          id: 'rule_6',
          name: 'Low balance alert',
          triggerType: 'account_balance',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'balance_below_value', value: 300 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockAccountsResponse = [
        { id: 'checking_id', name: 'Checking Account' },
      ];

      const dek = new Uint8Array(32);
      await checkAccountBalanceAlerts('user_123', 'checking_id', 500, dek);

      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ── Savings Goal Alerts ────────────────────────────────────────────────

  describe('checkSavingsGoalAlerts', () => {
    it('should trigger when goal newly reaches threshold percentage (legacy)', async () => {
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

      await checkSavingsGoalAlerts('user_123', 'goal_123', 'House Fund', 500, 1000, 400);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('House Fund');
      expect(payload.body).toContain('reached 50% of its target');
    });

    it('should not trigger if goal was already above percentage threshold (legacy)', async () => {
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

      await checkSavingsGoalAlerts('user_123', 'goal_123', 'House Fund', 600, 1000, 550);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should trigger with multi-conditions (goal_reached_percentage)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_8',
          name: 'Halfway alert',
          triggerType: 'savings_goal',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'goal_reached_percentage', value: 50, goalId: 'goal_123' },
          ],
          conditionOperator: 'AND',
        },
      ];

      await checkSavingsGoalAlerts('user_123', 'goal_123', 'Vacation Fund', 500, 1000, 400);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('Vacation Fund');
      expect(payload.body).toContain('reached 50%');
    });

    it('should trigger with multi-conditions (goal_reached_amount)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_9',
          name: 'Reached $1000',
          triggerType: 'savings_goal',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'goal_reached_amount', value: 1000, goalId: 'goal_456' },
          ],
          conditionOperator: 'AND',
        },
      ];

      await checkSavingsGoalAlerts('user_123', 'goal_456', 'Emergency Fund', 1100, 5000, 900);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('reached $1000');
    });

    it('should not trigger with multi-conditions when threshold not newly crossed', async () => {
      mockRulesResponse = [
        {
          id: 'rule_8',
          name: 'Halfway alert',
          triggerType: 'savings_goal',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'goal_reached_percentage', value: 50, goalId: 'goal_123' },
          ],
          conditionOperator: 'AND',
        },
      ];

      // Already past 50%, previous was also past 50%
      await checkSavingsGoalAlerts('user_123', 'goal_123', 'Vacation Fund', 700, 1000, 600);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ── Cash Flow Alerts ───────────────────────────────────────────────────

  describe('checkCashFlowAlerts', () => {
    it('should trigger when net savings is negative for N consecutive months (legacy)', async () => {
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

    it('should trigger with multi-conditions (cf_net_savings_below)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_10',
          name: 'Negative cash flow',
          triggerType: 'cash_flow',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'cf_net_savings_below', value: 0, consecutiveMonths: 1 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockCashFlowResponse = [
        { yearMonth: '2026-06', netCashFlow: '-150.00', totalIncome: '3000.00', totalExpenses: '3150.00' },
        { yearMonth: '2026-05', netCashFlow: '200.00', totalIncome: '3000.00', totalExpenses: '2800.00' },
      ];

      const dek = new Uint8Array(32);
      await checkCashFlowAlerts('user_123', dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('below $0');
    });

    it('should trigger with multi-conditions (cf_savings_rate_below consecutive months)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_11',
          name: 'Low savings rate',
          triggerType: 'cash_flow',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'cf_savings_rate_below', value: 10, consecutiveMonths: 2 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockCashFlowResponse = [
        { yearMonth: '2026-06', netCashFlow: '100.00', totalIncome: '3000.00', totalExpenses: '2900.00' },
        { yearMonth: '2026-05', netCashFlow: '200.00', totalIncome: '3000.00', totalExpenses: '2800.00' },
      ];

      const dek = new Uint8Array(32);
      await checkCashFlowAlerts('user_123', dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('below 10% for 2 consecutive months');
    });

    it('should trigger with multi-conditions (cf_net_savings_above)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_12',
          name: 'Good cash flow',
          triggerType: 'cash_flow',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'cf_net_savings_above', value: 500, consecutiveMonths: 1 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockCashFlowResponse = [
        { yearMonth: '2026-06', netCashFlow: '800.00', totalIncome: '4000.00', totalExpenses: '3200.00' },
      ];

      const dek = new Uint8Array(32);
      await checkCashFlowAlerts('user_123', dek);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toContain('above $500');
    });

    // ── Full integration: conditionTree-based transaction alerts ────────

    it('should trigger using conditionTree (single level AND)', async () => {
      mockRulesResponse = [
        {
          id: 'rule_tree_1',
          name: 'Tree AND rule',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditionTree: {
            operator: 'AND',
            conditions: [
              { field: 'amount_min', value: 50 },
              { field: 'keyword', value: 'restaurant' },
            ],
            subGroups: [],
          },
        },
      ];

      const tx = {
        externalId: 'tx_tree_1',
        accountId: 'acct_1',
        description: 'Fancy restaurant dinner',
        payee: 'French Bistro',
        memo: null,
        amount: '-120.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Tree AND rule');
    });

    it('should trigger using conditionTree with nested OR group inside AND', async () => {
      mockRulesResponse = [
        {
          id: 'rule_tree_2',
          name: 'Nested tree rule',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditionTree: {
            operator: 'AND',
            conditions: [
              { field: 'amount_min', value: 50 },
            ],
            subGroups: [
              {
                operator: 'OR',
                conditions: [
                  { field: 'keyword', value: 'restaurant' },
                  { field: 'keyword', value: 'uber' },
                ],
                subGroups: [],
              },
            ],
          },
        },
      ];

      // Matches amount_min (AND) and keyword 'uber' (OR sub-group)
      const tx = {
        externalId: 'tx_tree_2',
        accountId: 'acct_1',
        description: 'Uber ride to airport',
        payee: 'Uber Technologies',
        memo: null,
        amount: '-65.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toContain('Nested tree rule');
    });

    it('should not trigger when cash flow conditions not met', async () => {
      mockRulesResponse = [
        {
          id: 'rule_10',
          name: 'Negative cash flow',
          triggerType: 'cash_flow',
          criteria: {},
          isEnabled: true,
          conditions: [
            { field: 'cf_net_savings_below', value: 0, consecutiveMonths: 1 },
          ],
          conditionOperator: 'AND',
        },
      ];

      mockCashFlowResponse = [
        { yearMonth: '2026-06', netCashFlow: '500.00', totalIncome: '3000.00', totalExpenses: '2500.00' },
      ];

      const dek = new Uint8Array(32);
      await checkCashFlowAlerts('user_123', dek);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should NOT trigger with conditionTree when nested OR group fails', async () => {
      mockRulesResponse = [
        {
          id: 'rule_tree_3',
          name: 'Nested fail',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditionTree: {
            operator: 'AND',
            conditions: [
              { field: 'amount_min', value: 50 },
            ],
            subGroups: [
              {
                operator: 'OR',
                conditions: [
                  { field: 'keyword', value: 'restaurant' },
                  { field: 'keyword', value: 'uber' },
                ],
                subGroups: [],
              },
            ],
          },
        },
      ];

      const tx = {
        externalId: 'tx_tree_3',
        accountId: 'acct_1',
        description: 'Grocery store run',
        payee: 'Kroger',
        memo: null,
        amount: '-120.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should trigger using conditionTree with deeply nested groups', async () => {
      mockRulesResponse = [
        {
          id: 'rule_tree_4',
          name: 'Deep nest',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditionTree: {
            operator: 'AND',
            conditions: [],
            subGroups: [
              {
                operator: 'OR',
                conditions: [
                  { field: 'keyword', value: 'amazon' },
                ],
                subGroups: [
                  {
                    operator: 'AND',
                    conditions: [
                      { field: 'amount_min', value: 20 },
                      { field: 'amount_max', value: 200 },
                    ],
                    subGroups: [],
                  },
                ],
              },
            ],
          },
        },
      ];

      const tx = {
        externalId: 'tx_tree_4',
        accountId: 'acct_1',
        description: 'Amazon order',
        payee: 'Amazon.com',
        memo: null,
        amount: '-45.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it('should not trigger when conditionTree conditions are empty', async () => {
      mockRulesResponse = [
        {
          id: 'rule_tree_5',
          name: 'Empty tree',
          triggerType: 'transaction',
          criteria: {},
          isEnabled: true,
          conditionTree: {
            operator: 'AND',
            conditions: [],
            subGroups: [],
          },
        },
      ];

      const tx = {
        externalId: 'tx_tree_5',
        accountId: 'acct_1',
        description: 'Any transaction',
        payee: 'Whoever',
        memo: null,
        amount: '-10.00',
      };

      await checkTransactionAlerts('user_123', tx);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ── Condition Tree Unit Tests (no DB mocks needed) ─────────────────────

  describe('evaluateConditionTree', () => {
    const mockEvaluator = (cond: any, ctx: any) => {
      if (cond.field === 'always_true') return true;
      if (cond.field === 'always_false') return false;
      if (cond.field === 'keyword') {
        return ctx.text?.toLowerCase().includes(String(cond.value).toLowerCase());
      }
      return false;
    };

    it('should return true when AND tree has all matching conditions', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [
          { field: 'always_true', value: '' },
          { field: 'always_true', value: '' },
        ],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(true);
    });

    it('should return false when AND tree has one failing condition', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [
          { field: 'always_true', value: '' },
          { field: 'always_false', value: '' },
        ],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(false);
    });

    it('should return true when OR tree has at least one matching condition', () => {
      const tree = {
        operator: 'OR' as const,
        conditions: [
          { field: 'always_false', value: '' },
          { field: 'always_true', value: '' },
        ],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(true);
    });

    it('should return false when OR tree has no matching conditions', () => {
      const tree = {
        operator: 'OR' as const,
        conditions: [
          { field: 'always_false', value: '' },
          { field: 'always_false', value: '' },
        ],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(false);
    });

    it('should return false for empty tree', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(false);
    });

    it('should correctly evaluate nested AND under OR', () => {
      const tree = {
        operator: 'OR' as const,
        conditions: [{ field: 'always_false', value: '' }],
        subGroups: [
          {
            operator: 'AND' as const,
            conditions: [
              { field: 'always_true', value: '' },
              { field: 'always_true', value: '' },
            ],
            subGroups: [],
          },
        ],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(true);
    });

    it('should correctly evaluate nested OR under AND', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [{ field: 'always_true', value: '' }],
        subGroups: [
          {
            operator: 'OR' as const,
            conditions: [
              { field: 'always_false', value: '' },
              { field: 'always_true', value: '' },
            ],
            subGroups: [],
          },
        ],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(true);
    });

    it('should return false when nested OR under AND fails', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [{ field: 'always_true', value: '' }],
        subGroups: [
          {
            operator: 'OR' as const,
            conditions: [
              { field: 'always_false', value: '' },
              { field: 'always_false', value: '' },
            ],
            subGroups: [],
          },
        ],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(false);
    });

    it('should evaluate deep nesting', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [{ field: 'always_true', value: '' }],
        subGroups: [
          {
            operator: 'OR' as const,
            conditions: [],
            subGroups: [
              {
                operator: 'AND' as const,
                conditions: [
                  { field: 'always_true', value: '' },
                  { field: 'always_true', value: '' },
                ],
                subGroups: [],
              },
            ],
          },
        ],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, {})).toBe(true);
    });

    it('should use context in evaluator', () => {
      const tree = {
        operator: 'AND' as const,
        conditions: [
          { field: 'keyword', value: 'hello' },
        ],
        subGroups: [],
      };
      expect(evaluateConditionTree(tree, mockEvaluator, { text: 'hello world' })).toBe(true);
      expect(evaluateConditionTree(tree, mockEvaluator, { text: 'goodbye' })).toBe(false);
    });
  });
});
