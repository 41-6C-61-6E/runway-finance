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

let mockWealthFlowDiff = 100;
vi.mock('@/lib/services/wealth-flow', () => ({
  calculateWealthFlow: vi.fn(async (_userId, _start, _end, _dek, _accs, timeframe) => {
    return { summary: { netWorthChange: mockWealthFlowDiff } };
  }),
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
let mockSnapshotsResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [];
let mockSentResponse: any[] = [];

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

  limit(n: number) {
    return this;
  }

  insert(table: any) {
    this.table = table;
    this.isInsert = true;
    return this;
  }

  values(data: any) {
    return this;
  }

  onConflictDoNothing(config?: any) {
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
    } else if (tableName === 'net_worth_snapshots') {
      result = mockSnapshotsResponse;
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
  })),
}));

import { checkWeeklyNetWorthChangeAndNotify } from '@/lib/services/notifications';

describe('Weekly Net Worth Change Alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWealthFlowDiff = 100;
    mockSettingsResponse = {
      userId: 'user_1',
      notifyWeeklyNetWorthChange: true,
      weeklyNetWorthAlertDay: 'sunday',
      timezone: 'America/New_York',
      currency: 'USD',
      locale: 'en-US',
    };
    mockSnapshotsResponse = [
      { snapshotDate: '2026-08-02', netWorth: '10500' },
      { snapshotDate: '2026-07-26', netWorth: '10400' },
    ];
    mockSubscriptionsResponse = [
      {
        id: 'sub_1',
        userId: 'user_1',
        endpoint: 'https://example.com/push/1',
        keys: {
          p256dh: 'test-p256dh',
          auth: 'test-auth',
        },
      },
    ];
    mockSentResponse = [];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
  });

  it('should not notify if notifyWeeklyNetWorthChange is disabled', async () => {
    mockSettingsResponse.notifyWeeklyNetWorthChange = false;
    await checkWeeklyNetWorthChangeAndNotify('user_1', new Uint8Array());
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should not notify if current weekday does not match weeklyNetWorthAlertDay setting', async () => {
    // Current day is whatever day vitest runs on; test with a day that doesn't match
    const todayDay = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }).toLowerCase();
    const nonMatchingDay = todayDay === 'sunday' ? 'monday' : 'sunday';
    mockSettingsResponse.weeklyNetWorthAlertDay = nonMatchingDay;

    await checkWeeklyNetWorthChangeAndNotify('user_1', new Uint8Array());
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should notify if current weekday matches weeklyNetWorthAlertDay setting', async () => {
    const todayDay = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }).toLowerCase();
    mockSettingsResponse.weeklyNetWorthAlertDay = todayDay;

    await checkWeeklyNetWorthChangeAndNotify('user_1', new Uint8Array());
    expect(mockSendNotification).toHaveBeenCalledTimes(1);

    const callArgs = mockSendNotification.mock.calls[0];
    const payload = JSON.parse(callArgs[1]);
    expect(payload.title).toContain('Weekly Net Worth Alert');
    expect(payload.body).toContain('Your net worth increased by $100.00');
    expect(payload.url).toContain('/flows?timeframe=7d_discrete&date=2026-08-02');
  });

  it('should not notify if net worth change is below 1 cent', async () => {
    const todayDay = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }).toLowerCase();
    mockSettingsResponse.weeklyNetWorthAlertDay = todayDay;
    mockWealthFlowDiff = 0.004;

    await checkWeeklyNetWorthChangeAndNotify('user_1', new Uint8Array());
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
