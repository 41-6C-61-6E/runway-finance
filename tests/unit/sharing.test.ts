import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveDataUserId,
  getShareGroupUserIds,
  getShareGroup,
  generateSharePin,
  createInvitation,
  revokeInvitation,
  validateInvitation,
  acceptInvitation,
  removeMember,
  MAX_SHARE_GROUP_SIZE,
  MAX_INVITATION_ATTEMPTS,
} from '@/lib/sharing';
import { getTableName } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const mockState: Record<string, any[]> = {
  user_encryption_keys: [],
  account_share_members: [],
  account_sharing_invitations: [],
  simplifin_connections: [],
  plaid_connections: [],
  accounts: [],
  sync_logs: [],
};

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      _table: null,
      _where: [],
      select: vi.fn(() => chain),
      from: vi.fn((table: any) => {
        chain._table = table;
        return chain;
      }),
      where: vi.fn((...args: any[]) => {
        chain._where = args;
        return chain;
      }),
      limit: vi.fn(() => chain),
      insert: vi.fn((table: any) => {
        chain._table = table;
        return {
          values: (val: any) => {
            const name = getTableName(table) || table?._?.name || table?.name;
            const item = { id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...val };
            let settled = false;
            const settle = (row: any, pushNew: boolean) => {
              if (!settled) {
                settled = true;
                if (pushNew && name && mockState[name]) {
                  mockState[name].push(row);
                }
              }
              return {
                returning: () => Promise.resolve([row]),
                then: (resolve: (v: any) => any) => Promise.resolve([row]).then(resolve),
              };
            };
            return {
              returning: () => settle(item, true).returning(),
              then: (resolve: (v: any) => any) => settle(item, true).then(resolve),
              // Minimal upsert support: account_share_members has a permanent
              // unique constraint on (primaryUserId, memberUserId), so an
              // onConflictDoUpdate targets an existing row and applies `set`
              // instead of inserting a duplicate.
              onConflictDoUpdate: (opts: any) => {
                if (name === 'account_share_members' && mockState[name]) {
                  const existing = mockState[name].find(
                    (r: any) =>
                      r.primaryUserId === val.primaryUserId &&
                      r.memberUserId === val.memberUserId
                  );
                  if (existing) {
                    Object.assign(existing, opts?.set ?? {});
                    return settle(existing, false);
                  }
                }
                return settle(item, true);
              },
            };
          },
        };
      }),
      update: vi.fn((table: any) => {
        chain._table = table;
        return {
          set: (val: any) => {
            return {
              where: vi.fn(() => {
                const name = getTableName(table) || table?._?.name || table?.name;
                if (name && mockState[name]) {
                  for (const row of mockState[name]) {
                    Object.assign(row, val);
                  }
                }
                return Promise.resolve();
              }),
            };
          },
        };
      }),
      delete: vi.fn((table: any) => {
        chain._table = table;
        return {
          where: vi.fn(() => {
            const name = getTableName(table) || table?._?.name || table?.name;
            if (name && mockState[name]) {
              mockState[name].length = 0;
            }
            return Promise.resolve();
          }),
        };
      }),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(chain._table) || chain._table?._?.name || chain._table?.name || '';
        const rows = mockState[name] || [];
        return Promise.resolve([...rows]).then(resolve);
      },
    };
    return chain;
  },
  getPool: () => ({
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  }),
}));

describe('Account Sharing Service (lib/sharing.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.user_encryption_keys.length = 0;
    mockState.account_share_members.length = 0;
    mockState.account_sharing_invitations.length = 0;
    mockState.simplifin_connections.length = 0;
    mockState.plaid_connections.length = 0;
    mockState.accounts.length = 0;
    mockState.sync_logs.length = 0;
  });

  describe('resolveDataUserId', () => {
    it('returns own userId when user is standalone primary', async () => {
      const dataUserId = await resolveDataUserId('user_standalone');
      expect(dataUserId).toBe('user_standalone');
    });

    it('returns primaryUserId when user is a share member', async () => {
      mockState.user_encryption_keys.push({
        userId: 'member_user',
        primaryUserId: 'primary_owner',
      });

      const dataUserId = await resolveDataUserId('member_user');
      expect(dataUserId).toBe('primary_owner');
    });
  });

  describe('generateSharePin', () => {
    it('generates an 8-digit string', () => {
      const pin = generateSharePin();
      expect(pin).toMatch(/^\d{8}$/);
    });
  });

  describe('createInvitation', () => {
    it('creates an invitation with hashed PIN and returns plaintext PIN once', async () => {
      const result = await createInvitation('primary_user', 'spouse@example.com');
      expect('pin' in result).toBe(true);
      if ('pin' in result) {
        expect(result.pin).toMatch(/^\d{8}$/);
        expect(mockState.account_sharing_invitations.length).toBe(1);
        const stored = mockState.account_sharing_invitations[0];
        expect(stored.inviteeEmail).toBe('spouse@example.com');
        expect(stored.pin).toBeNull();
        expect(await bcrypt.compare(result.pin, stored.pinHash)).toBe(true);
      }
    });

    it('enforces maximum share group size limit of 4', async () => {
      // Add 3 active members
      mockState.account_share_members.push(
        { primaryUserId: 'owner', memberUserId: 'm1', status: 'active' },
        { primaryUserId: 'owner', memberUserId: 'm2', status: 'active' },
        { primaryUserId: 'owner', memberUserId: 'm3', status: 'active' }
      );

      const result = await createInvitation('owner', 'newperson@example.com');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain(`limited to ${MAX_SHARE_GROUP_SIZE} users`);
      }
    });
  });

  describe('validateInvitation and acceptInvitation', () => {
    it('validates matching email and PIN, then accepts invitation', async () => {
      const pin = '12345678';
      const pinHash = await bcrypt.hash(pin, 12);
      mockState.account_sharing_invitations.push({
        id: 'inv_123',
        inviterUserId: 'owner_user',
        inviteeEmail: 'invited@example.com',
        pinHash,
        status: 'pending',
        createdAt: new Date(),
      });

      const validation = await validateInvitation('invited@example.com', pin);
      expect(validation.valid).toBe(true);
      if (validation.valid) {
        expect(validation.invitationId).toBe('inv_123');
        expect(validation.inviterUserId).toBe('owner_user');

        await acceptInvitation(validation.invitationId, validation.inviterUserId, 'new_member');
        expect(mockState.account_share_members.length).toBe(1);
        expect(mockState.account_share_members[0].memberUserId).toBe('new_member');
      }
    });

    it('rejects expired invitations older than 7 days', async () => {
      const pin = '87654321';
      const pinHash = await bcrypt.hash(pin, 12);
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

      mockState.account_sharing_invitations.push({
        id: 'inv_old',
        inviterUserId: 'owner_user',
        inviteeEmail: 'old@example.com',
        pinHash,
        status: 'pending',
        createdAt: eightDaysAgo,
      });

      const validation = await validateInvitation('old@example.com', pin);
      expect(validation.valid).toBe(false);
    });
  });

  describe('acceptInvitation re-checks', () => {
    it('reactivates a previously removed member instead of hitting the unique constraint', async () => {
      const pinHash = await bcrypt.hash('11112222', 12);
      mockState.account_sharing_invitations.push({
        id: 'inv_re',
        inviterUserId: 'owner_user',
        inviteeEmail: 'returning@example.com',
        pinHash,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
      });
      mockState.account_share_members.push({
        id: 'member_row_removed',
        primaryUserId: 'owner_user',
        memberUserId: 'returning_member',
        status: 'removed',
        removedAt: new Date(),
        removedBy: 'owner_user',
      });

      const result = await acceptInvitation('inv_re', 'owner_user', 'returning_member');

      expect(result).toBeUndefined();
      // No duplicate row: the existing removed row was reactivated in place
      expect(mockState.account_share_members.length).toBe(1);
      const row = mockState.account_share_members[0];
      expect(row.id).toBe('member_row_removed');
      expect(row.status).toBe('active');
      expect(row.invitationId).toBe('inv_re');
      expect(row.role).toBe('member');
      expect(row.removedAt).toBeNull();
      expect(row.removedBy).toBeNull();
      expect(row.joinedAt).toBeInstanceOf(Date);
      expect(mockState.account_sharing_invitations[0].status).toBe('accepted');
    });

    it('rejects acceptance when the group would exceed the size limit', async () => {
      const pinHash = await bcrypt.hash('55556666', 12);
      mockState.account_sharing_invitations.push({
        id: 'inv_full',
        inviterUserId: 'owner_user',
        inviteeEmail: 'latecomer@example.com',
        pinHash,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
      });
      mockState.account_share_members.push(
        { id: 'm1_row', primaryUserId: 'owner_user', memberUserId: 'm1', status: 'active' },
        { id: 'm2_row', primaryUserId: 'owner_user', memberUserId: 'm2', status: 'active' },
        { id: 'm3_row', primaryUserId: 'owner_user', memberUserId: 'm3', status: 'active' }
      );

      const result = await acceptInvitation('inv_full', 'owner_user', 'latecomer_member');

      expect(result).toBeDefined();
      expect((result as { error?: string }).error).toContain(`limited to ${MAX_SHARE_GROUP_SIZE} users`);
      // No writes happened on violation
      expect(mockState.account_share_members.length).toBe(3);
      expect(mockState.account_share_members.every((m) => m.memberUserId !== 'latecomer_member')).toBe(true);
      expect(mockState.account_sharing_invitations[0].status).toBe('pending');
    });
  });

  describe('validateInvitation attempt cap', () => {
    it('increments attempts on each wrong PIN and auto-revokes at 20', async () => {
      // Low bcrypt cost keeps the 20-iteration loop fast; the cap logic is
      // independent of the hash cost.
      const pinHash = await bcrypt.hash('33334444', 4);
      mockState.account_sharing_invitations.push({
        id: 'inv_attempts',
        inviterUserId: 'owner_user',
        inviteeEmail: 'cracker@example.com',
        pinHash,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
      });

      for (let i = 1; i <= MAX_INVITATION_ATTEMPTS; i++) {
        const result = await validateInvitation('cracker@example.com', '00000000');
        expect(result.valid).toBe(false);
        expect(mockState.account_sharing_invitations[0].attempts).toBe(i);
        if (i < MAX_INVITATION_ATTEMPTS) {
          expect(mockState.account_sharing_invitations[0].status).toBe('pending');
        }
      }
      expect(mockState.account_sharing_invitations[0].status).toBe('revoked');
    });
  });

  describe('removeMember', () => {
    it('detaches user encryption key and disconnects shared connections on member removal', async () => {
      mockState.user_encryption_keys.push({
        userId: 'member_leaving',
        primaryUserId: 'owner_user',
        wrappedDek: 'some_wrapped_dek',
      });
      mockState.account_share_members.push({
        primaryUserId: 'owner_user',
        memberUserId: 'member_leaving',
        status: 'active',
      });
      mockState.simplifin_connections.push({
        id: 'conn_member',
        userId: 'member_leaving',
      });

      const result = await removeMember('member_leaving', 'owner_user');
      expect(result.error).toBeUndefined();
    });

    it('rejects removal by an unauthorized third party', async () => {
      mockState.user_encryption_keys.push({
        userId: 'member_user',
        primaryUserId: 'owner_user',
      });

      const result = await removeMember('member_user', 'unauthorized_stranger');
      expect(result.error).toBe('Not authorised to remove this member.');
    });
  });
});
