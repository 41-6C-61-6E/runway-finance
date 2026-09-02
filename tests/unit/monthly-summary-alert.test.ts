import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockSendNotification, mockCalculateWealthFlow } = vi.hoisted(() => ({
  mockSendNotification: vi.fn<(sub: any, payload: string) => any>(async () => ({ statusCode: 201 })),
  mockCalculateWealthFlow: vi.fn(),
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

let mockNetWorthChange = 123.45;
vi.mock('@/lib/services/wealth-flow', () => ({
  calculateWealthFlow: (...args: any[]) => mockCalculateWealthFlow(...args),
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

let mockSettingsResponse: any = {};
let mockCashFlowResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [];
let mockSentResponse: any[] = [];
let mockExecuteResult: any = { rows: [{ id: 'sent_1' }] };

class MockDbQueryBuilder {
  private table: any;
  private isInsert = false;

  constructor(table?: any) {
    this.table = table;
    if (table) this.isInsert = true;
  }

  select(...args: any[]) {
    this.isInsert = false;
    return this;
  }

  from(table: any) {
    this.table = table;
    return this;
  }

  where(...args: any[]) {
    return this;
  }

  orderBy(...args: any[]) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  insert(table: any) {
    this.table = table;
    this.isInsert = true;
    return this;
  }

  values(_data: any) {
    return this;
  }

  onConflictDoNothing(_config?: any) {
    return this;
  }

  returning() {
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);

    if (this.isInsert) {
      result = [{ id: 'mock_inserted_id' }];
    } else if (tableName === 'user_settings') {
      result = [mockSettingsResponse];
    } else if (tableName === 'monthly_cash_flow') {
      result = mockCashFlowResponse;
    } else if (tableName === 'push_subscriptions') {
      result = mockSubscriptionsResponse;
    } else if (tableName === 'sent_notifications') {
      result = mockSentResponse;
    }

    if (onfulfilled) {
      return onfulfilled(result);
    }
    return result;
  }
}

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: (...args: any[]) => new MockDbQueryBuilder().select(...args),
    insert: (table: any) => new MockDbQueryBuilder(table),
    execute: () => Promise.resolve(mockExecuteResult),
  })),
}));

import { checkMonthlySummaryAndNotify } from '@/lib/services/notifications';

// The summary covers the most recent *closed* month (computed exactly like
// the service does), so expected values are derived from the real clock.
function closedMonthSpec() {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const yearMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const [ey, em] = yearMonth.split('-').map(Number);
  const lastDay = String(new Date(Date.UTC(ey, em, 0)).getUTCDate());
  const monthLabel = new Date(Date.UTC(ey, em - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { yearMonth, startDate: `${yearMonth}-01`, endDate: `${yearMonth}-${lastDay}`, monthLabel };
}

describe('Monthly Summary Report (R12a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetWorthChange = 123.45;
    mockCalculateWealthFlow.mockImplementation(async () => ({ summary: { netWorthChange: mockNetWorthChange } }));
    mockSettingsResponse = {
      userId: 'user_1',
      notifyMonthlySummary: true,
      locale: 'en-US',
      currency: 'USD',
    };
    mockCashFlowResponse = [
      {
        yearMonth: 'ignored',
        totalIncome: '5000',
        totalExpenses: '3200',
        netCashFlow: '1800',
        transactionCount: '42',
      },
    ];
    mockSubscriptionsResponse = [
      {
        id: 'sub_1',
        userId: 'user_1',
        endpoint: 'https://example.com/push/1',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      },
    ];
    mockSentResponse = [];
    mockExecuteResult = { rows: [{ id: 'sent_1' }] };
  });

  it('reports the same net worth change the Flows sankey computes for the closed month', async () => {
    const spec = closedMonthSpec();

    await checkMonthlySummaryAndNotify('user_1', new Uint8Array());

    // The notification must be produced from the sankey's engine with the
    // closed calendar month as the exact window (matching the deep link).
    expect(mockCalculateWealthFlow).toHaveBeenCalledWith(
      'user_1',
      spec.startDate,
      spec.endDate,
      expect.any(Uint8Array),
      [],
      '1m',
    );

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const callArgs = mockSendNotification.mock.calls[0];
    const payload = JSON.parse(callArgs[1]);
    expect(payload.title).toBe(`Monthly Summary: ${spec.monthLabel}`);
    // The net worth figure must be the one the sankey shows for that month —
    // 2 decimals, matching formatCurrency on the chart.
    expect(payload.body).toContain('net worth increased by $123.45');
    // Net worth figure leads (old format led with raw income, which is the
    // mismatch that triggered this fix).
    expect(payload.body).not.toContain(spec.monthLabel + ': income $5,000');
    // The cash flow breakdown is still included, after the net worth figure.
    expect(payload.body).toContain('cash flow: income $5,000, expenses $3,200, net +$1,800');
    expect(payload.body).toContain('(savings rate 36%)');
  });

  it('reports a net worth decrease with the sankey figure when no cash flow aggregate exists', async () => {
    const spec = closedMonthSpec();
    mockNetWorthChange = -90.12;
    mockCashFlowResponse = [];

    await checkMonthlySummaryAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.body).toContain(`${spec.monthLabel}: net worth decreased by $90.12.`);
    expect(payload.body).not.toContain('cash flow');
    expect(payload.url).toBe(`/flows?timeframe=1m&date=${spec.yearMonth}`);
  });

  it('does not notify when notifyMonthlySummary is disabled', async () => {
    mockSettingsResponse.notifyMonthlySummary = false;

    await checkMonthlySummaryAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockCalculateWealthFlow).not.toHaveBeenCalled();
  });

  it('does not notify when there is neither a cash flow aggregate nor a meaningful net worth change', async () => {
    mockCashFlowResponse = [];
    mockNetWorthChange = 0.004;

    await checkMonthlySummaryAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not re-send when the monthly key was already sent (dedup)', async () => {
    // Atomic insert returns no row, and the disambiguation lookup finds an
    // existing dedup row for this month's key.
    mockExecuteResult = { rows: [] };
    mockSentResponse = [{ id: 'existing' }];

    await checkMonthlySummaryAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
