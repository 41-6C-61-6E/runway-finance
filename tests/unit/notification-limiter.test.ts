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

vi.mock('@/lib/services/wealth-flow', () => ({
  calculateWealthFlow: vi.fn(async () => ({ summary: { netWorthChange: 0 } })),
}));

function getTableName(table: any): string | null {
  if (!table) return null;
  const symbols = Object.getOwnPropertySymbols(table);
  const nameSymbol = symbols.find((s) => s.toString() === 'Symbol(drizzle:Name)');
  if (nameSymbol) return table[nameSymbol];
  if (table._ && typeof table._.name === 'string') return table._.name;
  if (table.key && typeof table.key.name === 'string') return table.key.name;
  return null;
}

let mockSettingsResponse: any = {};
let mockSubscriptionsResponse: any[] = [];
let mockSelectResponses: Record<string, any[]> = {};

// Result of the atomic limiter INSERT ... ON CONFLICT ... RETURNING id.
// - [{ id }]            -> inserted (within limiter window, no dedup)
// - []                 -> not inserted (dedup hit or window full)
let mockExecuteResult: any[] = [];

// Recorded inserts by table name, so tests can assert whether an inbox row
// was created.
const mockInsertCalls: Record<string, any> = {};

let mockInsertByTable: Record<string, any[]> = {};

class MockDbQueryBuilder {
  private table: any;
  private isInsert = false;
  private limitArg: number | null = null;

  constructor(table?: any) {
    this.table = table;
    if (table) this.isInsert = true;
  }

  select(..._args: any[]) {
    this.isInsert = false;
    return this;
  }

  from(table: any) {
    this.table = table;
    return this;
  }

  where(..._args: any[]) {
    return this;
  }

  orderBy(..._args: any[]) {
    return this;
  }

  limit(_n: number) {
    this.limitArg = _n;
    return this;
  }

  insert(table: any) {
    this.table = table;
    this.isInsert = true;
    return this;
  }

  values(data: any) {
    const tableName = getTableName(this.table);
    if (tableName) {
      mockInsertCalls[tableName] = data;
    }
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
      result = mockInsertByTable[tableName ?? ''] ?? [{ id: 'mock_inbox_id' }];
    } else if (tableName && mockSelectResponses[tableName]) {
      result = mockSelectResponses[tableName] as any[];
      // A .limit(1) select is a single-row lookup; the caller destructures
      // one element, so return a single element to match.
      if (this.limitArg === 1 && result.length > 0) result = [result[0]];
    }

    if (onfulfilled) return onfulfilled(result);
    return result;
  }
}

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: (...args: any[]) => new MockDbQueryBuilder().select(...args),
    insert: (table: any) => new MockDbQueryBuilder(table),
    // The atomic limiter statement. Configurable per-test via mockExecuteResult.
    execute: vi.fn(async () => mockExecuteResult),
    delete: vi.fn(() => undefined),
  })),
}));

import { sendPushNotification } from '@/lib/services/notifications';

describe('Notification Limiter (sendPushNotification)', () => {
  function resetSelects() {
    mockSelectResponses = {
      user_settings: [mockSettingsResponse],
      push_subscriptions: mockSubscriptionsResponse,
      user_notifications: [],
      sent_notifications: [],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertByTable = {};
    (Object.keys(mockInsertCalls) as string[]).forEach((k) => delete mockInsertCalls[k]);
    mockExecuteResult = [];
    mockSettingsResponse = {
      userId: 'user_1',
      maxNotificationsPerPeriod: 5,
      notificationLimiterPeriodMinutes: 60,
    };
    mockSubscriptionsResponse = [
      {
        id: 'sub_1',
        userId: 'user_1',
        endpoint: 'https://example.com/push/1',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      },
    ];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
  });

  it('sends the push and creates an inbox row when inserted within the limiter window', async () => {
    mockExecuteResult = [{ id: 'sent_row_1' }];
    resetSelects();

    const result = await sendPushNotification(
      'user_1',
      'Title',
      'Body',
      '/budgets',
      'budget_alert',
      'budget:2026-08:cat1'
    );

    expect(result.sent).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    // R11: inbox row id is used as the push tag.
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.tag).toBe('mock_inbox_id');
    // Inbox row created.
    expect(mockInsertCalls['user_notifications']).toBeDefined();
    expect(mockInsertCalls['user_notifications'].title).toBe('Title');
  });

  it('suppresses the push at the limiter cap but still saves the in-app inbox row (R2)', async () => {
    // No row returned from the atomic insert, and no existing row for the key
    // -> disambiguates as rate-limited rather than a dedup hit.
    mockExecuteResult = [];
    resetSelects();
    mockSelectResponses.sent_notifications = [];

    const result = await sendPushNotification(
      'user_1',
      'Title',
      'Body',
      '/budgets',
      'budget_alert',
      'budget:2026-08:cat1'
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('Rate limit exceeded.');
    expect(mockSendNotification).not.toHaveBeenCalled();
    // R2: financial alert is still visible in-app even when the push is
    // throttled.
    expect(mockInsertCalls['user_notifications']).toBeDefined();
  });

  it('suppresses on permanent dedup hit without creating another inbox row', async () => {
    mockExecuteResult = [];
    resetSelects();
    // The disambiguation lookup on (user_id, key) finds an existing sent row.
    mockSelectResponses.sent_notifications = [{ id: 'existing_sent_row' }];

    const result = await sendPushNotification(
      'user_1',
      'Title',
      'Body',
      '/budgets',
      'budget_alert',
      'budget:2026-08:cat1'
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('Duplicate notification suppressed.');
    expect(mockSendNotification).not.toHaveBeenCalled();
    // No duplicate inbox row for an already-sent alert.
    expect(mockInsertCalls['user_notifications']).toBeUndefined();
  });
});
