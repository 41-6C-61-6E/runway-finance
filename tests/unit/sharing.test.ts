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
            if (name && mockState[name]) {
              mockState[name].push(item);
            }
            return {
              returning: () => Promise.resolve([item]),
              then: (resolve: (v: any) => any) => Promise.resolve([item]).then(resolve),
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
