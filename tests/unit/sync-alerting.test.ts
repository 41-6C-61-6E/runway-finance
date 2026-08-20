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
  decryptRows: vi.fn(async (_table, rows) => rows),
}));

vi.mock('@/lib/sharing', () => ({
  getShareGroup: vi.fn(async () => null),
  getShareGroupUserIds: vi.fn(async (userId: string) => [userId]),
  resolveDataUserId: vi.fn(async (userId: string) => userId),
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

let mockSelectResponses: Record<string, any[]> = {};
let mockInsertCalls: Record<string, any[]> = {};
let mockUpdateCalls: Record<string, any[]> = {};
let mockDeleteCalls: Record<string, any[]> = {};
let mockExecuteResult: any[] = [];

class MockDbQueryBuilder {
  private table: any;
  private isInsert = false;
  private isUpdate = false;
  private isDelete = false;
  private updateValues: any = null;
  private limitArg: number | null = null;

  constructor(table?: any) {
    this.table = table;
    if (table) this.isInsert = true;
  }

  select(..._args: any[]) {
    this.isInsert = false;
    this.isUpdate = false;
    this.isDelete = false;
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

  limit(n: number) {
    this.limitArg = n;
    return this;
  }

  insert(table: any) {
    this.table = table;
    this.isInsert = true;
    return this;
  }

  update(table: any) {
    this.table = table;
    this.isUpdate = true;
    return this;
  }

  delete(table: any) {
    this.table = table;
    this.isDelete = true;
    return this;
  }

  set(values: any) {
    this.updateValues = values;
    const tableName = getTableName(this.table);
    if (tableName) {
      mockUpdateCalls[tableName] = mockUpdateCalls[tableName] || [];
      mockUpdateCalls[tableName].push(values);
    }
    return this;
  }

  values(data: any) {
    const tableName = getTableName(this.table);
    if (tableName) {
      mockInsertCalls[tableName] = mockInsertCalls[tableName] || [];
      mockInsertCalls[tableName].push(data);
    }
    return this;
  }

  onConflictDoNothing(_config?: any) {
    return this;
  }

  returning(_cols?: any) {
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: any[] = [];
    const tableName = getTableName(this.table);

    if (this.isInsert) {
      result = [{ id: 'mock_inserted_id' }];
    } else if (this.isUpdate) {
      result = [{ id: 'mock_updated_id' }];
    } else if (this.isDelete) {
      result = [];
    } else if (tableName && mockSelectResponses[tableName]) {
      result = mockSelectResponses[tableName] as any[];
      if (this.limitArg === 1 && result.length > 0) {
        result = [result[0]];
      }
    }

    if (onfulfilled) return onfulfilled(result);
    return result;
  }
}

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: (...args: any[]) => new MockDbQueryBuilder().select(...args),
    insert: (table: any) => new MockDbQueryBuilder(table),
    update: (table: any) => new MockDbQueryBuilder(table).update(table),
    delete: (table: any) => new MockDbQueryBuilder(table).delete(table),
    execute: vi.fn(async () => mockExecuteResult),
  })),
}));

import { logJobEnd } from '@/lib/services/scheduler-logger';
import { getAccountsSyncStatus } from '@/lib/services/sync-health';
import { checkStaleConnectionsAndNotify, healSyncAlerts } from '@/lib/services/notifications';

describe('Sync Problem Alerting Suite', () => {
  const userId = 'user_test_123';
  const dummyDek = new Uint8Array(32);

  beforeEach(() => {
    mockSelectResponses = {};
    mockInsertCalls = {};
    mockUpdateCalls = {};
    mockDeleteCalls = {};
    mockExecuteResult = [{ id: 'sent_notif_1' }];
    vi.clearAllMocks();
  });

  describe('1. logJobEnd (Transient Background Failures)', () => {
    it('records failed job status in DB but does not immediately send a push notification', async () => {
      await logJobEnd('job_log_1', 'failed', '503 Service Unavailable', { connectionId: 'conn_1' });

      expect(mockUpdateCalls['scheduler_job_logs']).toBeDefined();
      expect(mockUpdateCalls['scheduler_job_logs'][0]).toMatchObject({
        status: 'failed',
        errorMessage: '503 Service Unavailable',
      });
      // No immediate in-app inbox row inserted from logJobEnd
      expect(mockInsertCalls['user_notifications']).toBeUndefined();
    });
  });

  describe('2. getAccountsSyncStatus (3-day threshold)', () => {
    it('returns warning (not error) for a connection failure that happened less than 3 days ago', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockSelectResponses = {
        simplefin_connections: [
          {
            id: 'conn_sf_1',
            label: 'Chase',
            syncFrequency: 'daily',
            lastSyncAt: oneDayAgo,
            lastSyncStatus: 'error',
            lastSyncError: 'Temporary 500 error',
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
        plaid_connections: [],
        account_snapshots: [],
      };

      const accounts = [
        {
          id: 'acc_1',
          name: 'Checking',
          connectionId: 'conn_sf_1',
          type: 'checking',
          metadata: '{}',
        },
      ];

      const statuses = await getAccountsSyncStatus(userId, userId, dummyDek, accounts);
      expect(statuses['acc_1']).toBeDefined();
      expect(statuses['acc_1'].status).toBe('warning');
      expect(statuses['acc_1'].reason).toBe('Temporary 500 error');
    });

    it('returns error for a connection failure that has persisted for >= 3 days', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      mockSelectResponses = {
        simplefin_connections: [
          {
            id: 'conn_sf_1',
            label: 'Chase',
            syncFrequency: 'daily',
            lastSyncAt: fourDaysAgo,
            lastSyncStatus: 'error',
            lastSyncError: 'Invalid credentials',
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
        plaid_connections: [],
        account_snapshots: [],
      };

      const accounts = [
        {
          id: 'acc_1',
          name: 'Checking',
          connectionId: 'conn_sf_1',
          type: 'checking',
          metadata: '{}',
        },
      ];

      const statuses = await getAccountsSyncStatus(userId, userId, dummyDek, accounts);
      expect(statuses['acc_1']).toBeDefined();
      expect(statuses['acc_1'].status).toBe('error');
      expect(statuses['acc_1'].reason).toBe('Invalid credentials');
    });

    it('returns warning for manual API account with error < 3 days, and error for >= 3 days', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

      mockSelectResponses = {
        simplefin_connections: [],
        plaid_connections: [],
        account_snapshots: [],
      };

      const accounts = [
        {
          id: 'acc_crypto_recent',
          name: 'BTC Wallet',
          type: 'crypto',
          balanceDate: oneDayAgo,
          metadata: JSON.stringify({ xpub: 'xpub123', syncError: 'Rate limit' }),
        },
        {
          id: 'acc_crypto_stale',
          name: 'Old BTC Wallet',
          type: 'crypto',
          balanceDate: fourDaysAgo,
          metadata: JSON.stringify({ xpub: 'xpub456', syncError: 'Invalid xpub' }),
        },
      ];

      const statuses = await getAccountsSyncStatus(userId, userId, dummyDek, accounts);
      expect(statuses['acc_crypto_recent'].status).toBe('warning');
      expect(statuses['acc_crypto_stale'].status).toBe('error');
    });
  });

  describe('3. checkStaleConnectionsAndNotify (Aggregation & Anti-Spam)', () => {
    it('does not send an alert if notifySyncErrors is false', async () => {
      mockSelectResponses = {
        user_settings: [{ notifySyncErrors: false }],
      };

      await checkStaleConnectionsAndNotify(userId, dummyDek);
      expect(mockInsertCalls['user_notifications']).toBeUndefined();
    });

    it('does not send an alert if connection error is under 3 days old', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockSelectResponses = {
        user_settings: [{ notifySyncErrors: true, locale: 'en-US', currency: 'USD' }],
        accounts: [
          {
            id: 'acc_1',
            name: 'Checking',
            connectionId: 'conn_1',
            type: 'checking',
            isHidden: false,
            isExcludedFromNetWorth: false,
            metadata: '{}',
          },
        ],
        simplefin_connections: [
          {
            id: 'conn_1',
            label: 'Chase',
            syncFrequency: 'daily',
            lastSyncAt: oneDayAgo,
            lastSyncStatus: 'error',
            lastSyncError: 'API Error',
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
        plaid_connections: [],
        account_snapshots: [],
        sent_notifications: [],
      };

      await checkStaleConnectionsAndNotify(userId, dummyDek);
      expect(mockInsertCalls['user_notifications']).toBeUndefined();
    });

    it('sends exactly ONE aggregated notification for a connection with multiple accounts broken for >= 3 days', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      mockSelectResponses = {
        user_settings: [{ notifySyncErrors: true, locale: 'en-US', currency: 'USD' }],
        accounts: [
          {
            id: 'acc_1',
            name: 'Checking',
            connectionId: 'conn_1',
            type: 'checking',
            isHidden: false,
            isExcludedFromNetWorth: false,
            metadata: '{}',
          },
          {
            id: 'acc_2',
            name: 'Savings',
            connectionId: 'conn_1',
            type: 'savings',
            isHidden: false,
            isExcludedFromNetWorth: false,
            metadata: '{}',
          },
          {
            id: 'acc_3',
            name: 'Credit Card',
            connectionId: 'conn_1',
            type: 'credit',
            isHidden: false,
            isExcludedFromNetWorth: false,
            metadata: '{}',
          },
        ],
        simplefin_connections: [
          {
            id: 'conn_1',
            label: 'Chase',
            syncFrequency: 'daily',
            lastSyncAt: fourDaysAgo,
            lastSyncStatus: 'error',
            lastSyncError: 'Invalid credentials',
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
        plaid_connections: [],
        account_snapshots: [],
        sent_notifications: [],
      };

      await checkStaleConnectionsAndNotify(userId, dummyDek);

      // Exactly 1 in-app notification should be created for Chase connection, not 3
      expect(mockInsertCalls['user_notifications']).toBeDefined();
      expect(mockInsertCalls['user_notifications'].length).toBe(1);
      expect(mockInsertCalls['user_notifications'][0].title).toContain('Chase');
      expect(mockInsertCalls['user_notifications'][0].urlPath).toBe('/settings?tab=advanced&connection=conn_1');
      expect(mockInsertCalls['user_notifications'][0].type).toBe('sync_error');
    });

    it('throttles notifications so subsequent checks within 7 days do not re-send alerts', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      mockSelectResponses = {
        user_settings: [{ notifySyncErrors: true, locale: 'en-US', currency: 'USD' }],
        accounts: [
          {
            id: 'acc_1',
            name: 'Checking',
            connectionId: 'conn_1',
            type: 'checking',
            isHidden: false,
            isExcludedFromNetWorth: false,
            metadata: '{}',
          },
        ],
        simplefin_connections: [
          {
            id: 'conn_1',
            label: 'Chase',
            syncFrequency: 'daily',
            lastSyncAt: fourDaysAgo,
            lastSyncStatus: 'error',
            lastSyncError: 'Invalid credentials',
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
        plaid_connections: [],
        account_snapshots: [],
        // An alert was already sent 2 days ago for this connection
        sent_notifications: [
          {
            id: 'recent_alert_1',
            sentAt: twoDaysAgo,
          },
        ],
      };

      await checkStaleConnectionsAndNotify(userId, dummyDek);
      // Suppressed due to 7-day cooldown
      expect(mockInsertCalls['user_notifications']).toBeUndefined();
    });
  });

  describe('4. healSyncAlerts', () => {
    it('deletes sent notification records and marks in-app inbox rows as read for the target connection or account', async () => {
      await healSyncAlerts(userId, 'conn_1');

      expect(mockUpdateCalls['user_notifications']).toBeDefined();
      expect(mockUpdateCalls['user_notifications'][0]).toMatchObject({
        isRead: true,
      });
    });
  });
});
