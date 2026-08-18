import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

const state = vi.hoisted(() => ({
  mockState: {} as Record<string, any[]>,
  txQueries: [] as { sql: string; params: any[] }[],
  failAuditInsert: false,
  invalidateCalls: 0,
}));

const TABLES = [
  'user_encryption_keys',
  'account_share_members',
  'account_sharing_invitations',
  'dek_versions',
  'dek_version_wraps',
  'share_audit_log',
  'simplefin_connections',
  'plaid_connections',
  'accounts',
  'recurring_transactions',
  'transactions',
];

// ── drizzle SQL-object → conditions ──────────────────────────────────────────
// where(eq(col, v)) / and(eq(a, b), eq(c, d)) produce SQL nodes whose
// queryChunks contain Column objects (.name = snake_case) and Param objects
// (.values array). Walk the tree and pair each Param with the last Column seen.
function extractConds(node: any): { column: string; value: any }[] {
  const out: { column: string; value: any }[] = [];
  const seen = new Set<any>();
  const walk = (n: any, lastColumn: string | null): string | null => {
    if (!n || typeof n !== 'object' || seen.has(n)) return lastColumn;
    seen.add(n);
    const chunks = n.queryChunks;
    if (!Array.isArray(chunks)) return lastColumn;
    let lc = lastColumn;
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (typeof chunk.name === 'string' && chunk.table !== undefined) {
        lc = chunk.name;
        continue;
      }
      if (chunk.encoder !== undefined) {
        if (lc) out.push({ column: lc, value: chunk.value });
        continue;
      }
      lc = walk(chunk, lc);
    }
    return lc;
  };
  walk(node, null);
  return out;
}

// ── raw SQL text (transactional client) ──────────────────────────────────────

const camel = (s: string) => s.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());

function parseWhereConds(whereSql: string, params: any[]): [string, any][] {
  return [...whereSql.matchAll(/(?:"[a-z_]+"\.)?"([a-z_]+)"\s*=\s*\$(\d+)/g)].map(
    (m) => [camel(m[1]), params[Number(m[2]) - 1]] as [string, any]
  );
}

function makeTxClient() {
  return {
    query: async (raw: any, params: any[] = []) => {
      // drizzle's node-postgres driver passes a rawQueryConfig object ({ text });
      // direct BEGIN/COMMIT/ROLLBACK calls pass a plain string.
      const sqlText = typeof raw === 'string' ? raw : raw?.text ?? '';
      const sql = sqlText.replace(/\s+/g, ' ').trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) {
        return { rows: [] };
      }
      state.txQueries.push({ sql, params });

      const updateM = sql.match(/^update "([^"]+)" set (.+?) where (.+)$/);
      if (updateM) {
        const rows = state.mockState[updateM[1]];
        if (rows) {
          const setPairs = [...updateM[2].matchAll(/"([a-z_]+)"\s*=\s*\$(\d+)/g)].map(
            (m) => [camel(m[1]), params[Number(m[2]) - 1]] as [string, any]
          );
          const conds = parseWhereConds(updateM[3], params);
          for (const row of rows) {
            if (conds.every(([c, v]) => row[c] === v)) {
              for (const [c, v] of setPairs) row[c] = v;
            }
          }
        }
        return { rows: [] };
      }

      const deleteM = sql.match(/^delete from "([^"]+)" where (.+)$/);
      if (deleteM) {
        const rows = state.mockState[deleteM[1]];
        if (rows) {
          const conds = parseWhereConds(deleteM[2], params);
          state.mockState[deleteM[1]] = rows.filter(
            (row) => !conds.every(([c, v]) => row[c] === v)
          );
        }
        return { rows: [] };
      }

      throw new Error(`Mock tx client: unhandled SQL: ${sql}`);
    },
    release: vi.fn(),
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(async () => new Uint8Array(32)),
  getServerDEK: vi.fn(async () => new Uint8Array(32)),
  invalidateUserDEKCache: vi.fn(async () => {
    state.invalidateCalls += 1;
  }),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      _table: null,
      _conds: null,
      _limit: undefined as number | undefined,
      select: vi.fn(() => chain),
      from: vi.fn((table: any) => {
        chain._table = table;
        return chain;
      }),
      where: vi.fn((sql: any) => {
        chain._conds = extractConds(sql);
        return chain;
      }),
      limit: vi.fn((n: number) => {
        chain._limit = n;
        return chain;
      }),
      insert: vi.fn((table: any) => ({
        values: (val: any) => {
          const name = getTableName(table);
          if (name === 'share_audit_log' && state.failAuditInsert) {
            throw new Error('audit insert failed');
          }
          if (name && state.mockState[name]) {
            state.mockState[name].push({ id: `gen_${Math.random().toString(36).slice(2)}`, ...val });
          }
          return Promise.resolve();
        },
      })),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(chain._table) || '';
        const rows = state.mockState[name] || [];
        const conds = chain._conds || [];
        const matched = rows.filter((row) => conds.every((c) => row[camel(c.column)] === c.value));
        const limited = chain._limit !== undefined ? matched.slice(0, chain._limit) : matched;
        return Promise.resolve(limited).then(resolve);
      },
    };
    return chain;
  },
  getPool: () => ({
    connect: async () => makeTxClient(),
  }),
}));

import { roleAtLeast, getEffectiveRole, requireMinRole } from '@/lib/utils/require-auth';
import { logShareAudit, SHARE_AUDIT_ACTIONS } from '@/lib/share-audit';
import { transferOwnership } from '@/lib/sharing-transfer';
import { logger } from '@/lib/logger';

// ── seed helpers ──────────────────────────────────────────────────────────────

function seedKeyRow(userId: string, primaryUserId: string | null, wrappedDek = 'wrap') {
  state.mockState.user_encryption_keys.push({
    userId,
    primaryUserId,
    wrappedDek,
    wrappingIv: 'iv',
    wrappingTag: 'tag',
    serverWrappedDek: primaryUserId ? null : 'server_wrap',
    serverWrappingIv: primaryUserId ? null : 'server_iv',
    serverWrappingTag: primaryUserId ? null : 'server_tag',
    salt: 'salt',
  });
}

function seedAsm(primaryUserId: string, memberUserId: string, status = 'active', role = 'member') {
  state.mockState.account_share_members.push({
    id: `asm_${primaryUserId}_${memberUserId}`,
    primaryUserId,
    memberUserId,
    status,
    role,
  });
}

function seedTransferWorld() {
  seedKeyRow('P', null, 'wrap_P');
  seedKeyRow('M', 'P', 'wrap_M');
  seedKeyRow('X', 'P', 'wrap_X');
  seedKeyRow('Z', null, 'wrap_Z');
  seedAsm('P', 'M', 'active', 'member');
  seedAsm('P', 'X', 'active', 'admin');
  state.mockState.dek_versions.push({
    id: 'dv1',
    primaryUserId: 'P',
    version: 1,
    dekWrappedServer: 'wrapped',
    wrappingIv: 'iv',
    wrappingTag: 'tag',
  });
  state.mockState.dek_version_wraps.push(
    { id: 'dw_P', versionId: 'dv1', memberUserId: 'P', wrappedDek: 'w' },
    { id: 'dw_M', versionId: 'dv1', memberUserId: 'M', wrappedDek: 'w' },
    { id: 'dw_X', versionId: 'dv1', memberUserId: 'X', wrappedDek: 'w' }
  );
  state.mockState.account_sharing_invitations.push(
    { id: 'inv_pending', inviterUserId: 'P', inviteeEmail: 'p@x.co', pinHash: 'h', status: 'pending' },
    { id: 'inv_accepted', inviterUserId: 'P', inviteeEmail: 'a@x.co', pinHash: 'h', status: 'accepted' }
  );
  state.mockState.simplefin_connections.push({ id: 'sc1', userId: 'P' });
  state.mockState.plaid_connections.push({ id: 'pc1', userId: 'P' });
  state.mockState.accounts.push({ id: 'acc1', userId: 'P' });
  state.mockState.recurring_transactions.push({ id: 'rec1', userId: 'P' });
  state.mockState.transactions.push({ id: 'txn1', userId: 'P' });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Share roles, audit, and ownership transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.txQueries.length = 0;
    state.failAuditInsert = false;
    state.invalidateCalls = 0;
    for (const t of TABLES) {
      state.mockState[t] = [];
    }
  });

  describe('roleAtLeast', () => {
    it('ranks member < admin < primary', () => {
      expect(roleAtLeast('member', 'member')).toBe(true);
      expect(roleAtLeast('admin', 'member')).toBe(true);
      expect(roleAtLeast('primary', 'member')).toBe(true);
      expect(roleAtLeast('admin', 'admin')).toBe(true);
      expect(roleAtLeast('primary', 'admin')).toBe(true);
      expect(roleAtLeast('member', 'admin')).toBe(false);
      expect(roleAtLeast('member', 'primary')).toBe(false);
      expect(roleAtLeast('admin', 'primary')).toBe(false);
      expect(roleAtLeast('primary', 'primary')).toBe(true);
    });
  });

  describe('getEffectiveRole', () => {
    it('returns primary for a user who owns their own data', async () => {
      seedKeyRow('P', null);
      expect(await getEffectiveRole('P')).toBe('primary');
    });

    it('returns the stored role for active members', async () => {
      seedKeyRow('P', null);
      seedKeyRow('M', 'P');
      seedKeyRow('X', 'P');
      seedAsm('P', 'M', 'active', 'admin');
      seedAsm('P', 'X', 'active', 'member');
      expect(await getEffectiveRole('M')).toBe('admin');
      expect(await getEffectiveRole('X')).toBe('member');
    });

    it('falls back to member for removed or unknown rows', async () => {
      seedKeyRow('P', null);
      seedKeyRow('X', 'P');
      seedAsm('P', 'X', 'removed', 'admin');
      expect(await getEffectiveRole('X')).toBe('member');
      expect(await getEffectiveRole('stranger')).toBe('member');
    });
  });

  describe('requireMinRole', () => {
    it('returns 403 when the role is below the minimum', async () => {
      seedKeyRow('P', null);
      seedKeyRow('X', 'P');
      seedAsm('P', 'X', 'active', 'member');
      const res = await requireMinRole('admin', 'X');
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
      const body = await res!.json();
      expect(body.error).toBe('forbidden');
    });

    it('returns null for admin and primary', async () => {
      seedKeyRow('P', null);
      seedKeyRow('M', 'P');
      seedAsm('P', 'M', 'active', 'admin');
      expect(await requireMinRole('admin', 'M')).toBeNull();
      expect(await requireMinRole('admin', 'P')).toBeNull();
    });
  });

  describe('logShareAudit', () => {
    it('writes an audit row', async () => {
      await logShareAudit('P', 'P', SHARE_AUDIT_ACTIONS.INVITATION_CREATED, 'account_sharing_invitations', 'inv1');
      expect(state.mockState.share_audit_log).toHaveLength(1);
      expect(state.mockState.share_audit_log[0]).toMatchObject({
        dataUserId: 'P',
        actorUserId: 'P',
        action: 'INVITATION_CREATED',
        targetTable: 'account_sharing_invitations',
        targetId: 'inv1',
      });
    });

    it('swallows db failures and warns', async () => {
      state.failAuditInsert = true;
      await expect(logShareAudit('P', 'P', SHARE_AUDIT_ACTIONS.MEMBER_REMOVED)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    it('moves the whole household to the new primary', async () => {
      seedTransferWorld();

      const result = await transferOwnership('P', 'M');
      expect(result).toBeUndefined();

      const keyRow = (u: string) => state.mockState.user_encryption_keys.find((r) => r.userId === u)!;

      // New primary owns the data; remaining member re-points; old primary wiped
      expect(keyRow('M').primaryUserId).toBeNull();
      expect(keyRow('X').primaryUserId).toBe('M');
      expect(keyRow('P').primaryUserId).toBeNull();
      expect(keyRow('P').wrappedDek).toBe('');
      expect(keyRow('P').wrappingIv).toBe('');
      expect(keyRow('P').wrappingTag).toBe('');
      expect(keyRow('P').serverWrappedDek).toBeNull();

      // Membership: P's self-row gone, X now under M
      expect(state.mockState.account_share_members).toHaveLength(1);
      expect(state.mockState.account_share_members[0]).toMatchObject({
        primaryUserId: 'M',
        memberUserId: 'X',
      });

      // DEK chain re-keyed; old primary's wrap dropped
      expect(state.mockState.dek_versions[0].primaryUserId).toBe('M');
      const wrapMembers = state.mockState.dek_version_wraps.map((w) => w.memberUserId).sort();
      expect(wrapMembers).toEqual(['M', 'X']);

      // Pending invitations revoked, accepted untouched
      expect(state.mockState.account_sharing_invitations.find((i) => i.id === 'inv_pending')!.status).toBe('revoked');
      expect(state.mockState.account_sharing_invitations.find((i) => i.id === 'inv_accepted')!.status).toBe('accepted');

      // Household data re-pointed
      expect(state.mockState.simplefin_connections[0].userId).toBe('M');
      expect(state.mockState.plaid_connections[0].userId).toBe('M');
      expect(state.mockState.accounts[0].userId).toBe('M');
      expect(state.mockState.recurring_transactions[0].userId).toBe('M');
      expect(state.mockState.transactions[0].userId).toBe('M');

      // Standalone user Z untouched
      expect(keyRow('Z').wrappedDek).toBe('wrap_Z');
      expect(keyRow('Z').primaryUserId).toBeNull();

      expect(state.invalidateCalls).toBe(1);
    });

    it('rejects transfer to self', async () => {
      seedTransferWorld();
      const result = await transferOwnership('P', 'P');
      expect(result).toEqual({ error: 'You are already the account owner.' });
      expect(state.txQueries).toHaveLength(0);
    });

    it('rejects transfer by a non-primary member', async () => {
      seedTransferWorld();
      const result = await transferOwnership('M', 'X');
      expect(result).toEqual({ error: 'Only the account owner can transfer ownership.' });
      // No writes happened
      expect(state.mockState.user_encryption_keys.find((r) => r.userId === 'P')!.wrappedDek).toBe('wrap_P');
      expect(state.txQueries).toHaveLength(0);
    });

    it('rejects transfer to a non-member', async () => {
      seedTransferWorld();
      const result = await transferOwnership('P', 'Z');
      expect(result).toEqual({ error: 'That user is not an active member of your share group.' });
      expect(state.txQueries).toHaveLength(0);
    });

    it('rejects transfer to a member who has never signed in', async () => {
      seedTransferWorld();
      state.mockState.account_share_members.push({
        id: 'asm_N',
        primaryUserId: 'P',
        memberUserId: 'N',
        status: 'active',
        role: 'member',
      });
      const result = await transferOwnership('P', 'N');
      expect(result).toEqual({
        error: 'That user has not signed in yet. Ask them to sign in once before transferring ownership.',
      });
      expect(state.txQueries).toHaveLength(0);
    });
  });
});
