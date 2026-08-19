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
let mockSnapshotsResponse: any[] = [];
let mockSubscriptionsResponse: any[] = [];

// Per-table select results. The milestone check + sendPushNotification issue
// several selects against the same tables (settings, snapshots,
// push_subscriptions, user_notifications, sent_notifications), so routing by
// table name is more flexible than a single fixed response.
let mockSelectResponses: Record<string, any[]> = {};
// Per-table insert results; defaults to a single inserted row.
let mockInsertByTable: Record<string, any[]> = {};

class MockDbQueryBuilder {
  private table: any;
  private isInsert = false;

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

  then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);

    if (this.isInsert) {
      result = mockInsertByTable[tableName ?? ''] ?? [{ id: 'mock_inbox_id' }];
    } else if (tableName && mockSelectResponses[tableName]) {
      result = mockSelectResponses[tableName] as any[];
    }

    if (onfulfilled) return onfulfilled(result);
    return result;
  }
}

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: (...args: any[]) => new MockDbQueryBuilder().select(...args),
    insert: (table: any) => new MockDbQueryBuilder(table),
    // No execute(): the atomic limiter SQL throws, exercising the fail-open
    // dedup-only fallback inside sendPushNotification. This keeps the tests
    // focused on the milestone logic rather than the limiter SQL.
  })),
}));

import { checkNetWorthMilestonesAndNotify } from '@/lib/services/notifications';

describe('Net Worth Milestones', () => {
  const INTERVAL = 100_000;

  function resetSelects() {
    mockSelectResponses = {
      user_settings: [mockSettingsResponse],
      net_worth_snapshots: mockSnapshotsResponse,
      push_subscriptions: mockSubscriptionsResponse,
      user_notifications: [],
      sent_notifications: [],
    };
  }

  function setSnapshots(current: number, previous: number) {
    mockSnapshotsResponse = [
      { netWorth: String(current), snapshotDate: '2026-08-02' },
      { netWorth: String(previous), snapshotDate: '2026-08-01' },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertByTable = {};
    mockSettingsResponse = {
      userId: 'user_1',
      notifyNetWorthMilestones: true,
      netWorthMilestoneInterval: INTERVAL,
      currency: 'USD',
      locale: 'en-US',
    };
    mockSubscriptionsResponse = [
      {
        id: 'sub_1',
        userId: 'user_1',
        endpoint: 'https://example.com/push/1',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      },
    ];
    mockSnapshotsResponse = [];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
  });

  it('notifies when the net worth crosses a milestone boundary', async () => {
    setSnapshots(150_000, 90_000); // crosses $100,000
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.title).toBe('Net Worth Milestone Reached!');
    expect(payload.body).toContain('$100,000');
    // R11: the inbox row id is used as the tray tag so distinct alerts
    // don't replace each other.
    expect(payload.tag).toBe('mock_inbox_id');
  });

  it('does not re-fire when net worth oscillates below the same boundary', async () => {
    setSnapshots(90_000, 110_000); // back under $100,000 — no upward cross
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends a single notification when a jump spans multiple boundaries', async () => {
    setSnapshots(350_000, 50_000); // jumps $100k / $200k / $300k at once
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    // Reports the highest boundary reached.
    expect(payload.body).toContain('$300,000');
  });

  it('does not notify for negative net worth', async () => {
    setSnapshots(-10_000, -20_000);
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the milestone interval is 0 (disabled)', async () => {
    mockSettingsResponse.netWorthMilestoneInterval = 0;
    setSnapshots(150_000, 90_000);
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not notify when notifyNetWorthMilestones is disabled', async () => {
    mockSettingsResponse.notifyNetWorthMilestones = false;
    setSnapshots(150_000, 90_000);
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not notify when fewer than two snapshots exist', async () => {
    mockSnapshotsResponse = [{ netWorth: '150000', snapshotDate: '2026-08-02' }];
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('falls back to the type as the tag when no inbox row is created', async () => {
    // inbox insert fails -> dbNotificationId undefined; the dedup insert
    // into sent_notifications still succeeds so the push is not suppressed.
    mockInsertByTable = { user_notifications: [] };
    setSnapshots(150_000, 90_000);
    resetSelects();

    await checkNetWorthMilestonesAndNotify('user_1', new Uint8Array());

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.tag).toBe('net_worth_milestone');
  });
});
