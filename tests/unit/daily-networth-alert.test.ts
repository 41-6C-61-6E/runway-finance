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

let mockSettingsResponse: any = {};
let mockSnapshotsResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [];
let mockSentResponse: any[] = [];

class MockDbQueryBuilder {
  private table: any;

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

  returning() {
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);

    if (tableName === 'user_settings') {
      result = [mockSettingsResponse];
    } else if (tableName === 'net_worth_snapshots') {
      result = mockSnapshotsResponse;
    } else if (tableName === 'push_subscriptions') {
      result = mockSubscriptionsResponse;
    } else if (tableName === 'sent_notifications') {
      result = mockSentResponse;
    }

    return Promise.resolve(result).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

import { checkDailyNetWorthChangeAndNotify } from '@/lib/services/notifications';

describe('Daily Net Worth Change Alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsResponse = {
      userId: 'user_1',
      notifyDailyNetWorthChange: true,
      locale: 'en-US',
      currency: 'USD',
      maxNotificationsPerPeriod: 5,
      notificationLimiterPeriodMinutes: 60,
    };
    mockSnapshotsResponse = [];
    mockSubscriptionsResponse = [{ id: 'sub_1', endpoint: 'https://fcm.googleapis.com/...', keys: { p256dh: 'p256', auth: 'auth' } }];
    mockSentResponse = [];
  });

  it('should not notify if notifyDailyNetWorthChange is disabled', async () => {
    mockSettingsResponse.notifyDailyNetWorthChange = false;
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should not notify if there are less than 2 snapshots', async () => {
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should not notify if net worth has not changed', async () => {
    mockSnapshotsResponse = [
      { netWorth: '100000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should send a positive notification if net worth increased', async () => {
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalled();
    const [sub, payload] = mockSendNotification.mock.calls[0];
    const parsedPayload = JSON.parse(payload);
    expect(parsedPayload.title).toContain('Daily Net Worth Alert 📈');
    expect(parsedPayload.body).toContain('increased by $5,000.00');
  });

  it('should send a negative notification if net worth decreased', async () => {
    mockSnapshotsResponse = [
      { netWorth: '95000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalled();
    const [sub, payload] = mockSendNotification.mock.calls[0];
    const parsedPayload = JSON.parse(payload);
    expect(parsedPayload.title).toContain('Daily Net Worth Alert 📉');
    expect(parsedPayload.body).toContain('decreased by $5,000.00');
  });

  it('should not notify if snapshots are not consecutive days (e.g. 3 days apart)', async () => {
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-25' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should notify if snapshots are 2 days apart (e.g. to handle timezone shifts)', async () => {
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-26' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalled();
    const [sub, payload] = mockSendNotification.mock.calls[0];
    const parsedPayload = JSON.parse(payload);
    expect(parsedPayload.title).toContain('Daily Net Worth Alert 📈');
    expect(parsedPayload.body).toContain('increased by $5,000.00');
  });

  it('should not notify if net worth change is below 1 cent (floating point noise)', async () => {
    mockSnapshotsResponse = [
      { netWorth: '100000.000000001', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should not notify for negative floating point noise', async () => {
    mockSnapshotsResponse = [
      { netWorth: '99999.999999999', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('should not notify if current time is before the dailyNetWorthAlertTime setting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T16:00:00Z')); // 12:00 PM America/New_York (UTC-4)
    
    mockSettingsResponse.timezone = 'America/New_York';
    mockSettingsResponse.dailyNetWorthAlertTime = '13:00'; // 1:00 PM
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should notify if current time is at or after the dailyNetWorthAlertTime setting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T18:00:00Z')); // 2:00 PM America/New_York (UTC-4)
    
    mockSettingsResponse.timezone = 'America/New_York';
    mockSettingsResponse.dailyNetWorthAlertTime = '13:00'; // 1:00 PM
    mockSnapshotsResponse = [
      { netWorth: '105000', snapshotDate: '2026-06-28' },
      { netWorth: '100000', snapshotDate: '2026-06-27' },
    ];

    await checkDailyNetWorthChangeAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
