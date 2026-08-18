import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

const state = vi.hoisted(() => ({
  mockState: {} as Record<string, any[]>,
}));

// ── drizzle SQL-object → conditions ──────────────────────────────────────────
// where(eq(col, v)) / and(eq(a, b), ...) produce SQL nodes whose queryChunks
// contain Column objects (.name = snake_case) and Param objects (.value).
// Walk the tree and pair each Param with the last Column seen.
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

const camel = (s: string) => s.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());

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
}));

import { getSensitiveAccountIds, getHiddenAccountIdsForUser, isAccountHiddenFromUser } from '@/lib/data-visibility';

function reset() {
  state.mockState = {
    user_encryption_keys: [],
    account_share_members: [],
    accounts: [],
  };
}

function seedKey(userId: string, primaryUserId: string | null) {
  state.mockState.user_encryption_keys.push({ userId, primaryUserId });
}

function seedAsm(primaryUserId: string, memberUserId: string, status = 'active', role = 'member') {
  state.mockState.account_share_members.push({
    id: `asm_${memberUserId}`,
    primaryUserId,
    memberUserId,
    status,
    role,
  });
}

function seedAccounts() {
  state.mockState.accounts.push(
    { id: 'acc-public', userId: 'owner', sensitive: false },
    { id: 'acc-sensitive', userId: 'owner', sensitive: true },
    { id: 'acc-other-sensitive', userId: 'other-owner', sensitive: true },
  );
}

beforeEach(reset);

describe('getSensitiveAccountIds', () => {
  it('returns only the data owner\'s sensitive accounts', async () => {
    seedAccounts();
    await expect(getSensitiveAccountIds('owner')).resolves.toEqual(['acc-sensitive']);
  });

  it('returns [] when the owner has no sensitive accounts', async () => {
    state.mockState.accounts.push({ id: 'acc-public', userId: 'owner', sensitive: false });
    await expect(getSensitiveAccountIds('owner')).resolves.toEqual([]);
  });

  it('returns [] for an unknown data owner', async () => {
    seedAccounts();
    await expect(getSensitiveAccountIds('nobody')).resolves.toEqual([]);
  });
});

describe('getHiddenAccountIdsForUser', () => {
  const seedWorld = () => {
    seedKey('owner', null);
    seedKey('member1', 'owner');
    seedAsm('owner', 'member1', 'active', 'member');
    seedKey('admin1', 'owner');
    seedAsm('owner', 'admin1', 'active', 'admin');
    seedKey('revoked1', 'owner');
    seedAsm('owner', 'revoked1', 'revoked', 'member');
    seedAccounts();
  };

  it('hides sensitive accounts from plain members', async () => {
    seedWorld();
    await expect(getHiddenAccountIdsForUser('member1', 'owner')).resolves.toEqual(['acc-sensitive']);
  });

  it('treats revoked members as plain members (safe default)', async () => {
    seedWorld();
    await expect(getHiddenAccountIdsForUser('revoked1', 'owner')).resolves.toEqual(['acc-sensitive']);
  });

  it('treats unknown users as plain members (safe default)', async () => {
    seedWorld();
    await expect(getHiddenAccountIdsForUser('stranger', 'owner')).resolves.toEqual(['acc-sensitive']);
  });

  it('shows everything to the primary (key row with null primaryUserId)', async () => {
    seedWorld();
    await expect(getHiddenAccountIdsForUser('owner', 'owner')).resolves.toEqual([]);
  });

  it('shows everything to the primary (key row pointing at self)', async () => {
    seedWorld();
    seedKey('selfkey', 'selfkey');
    await expect(getHiddenAccountIdsForUser('selfkey', 'selfkey')).resolves.toEqual([]);
  });

  it('shows everything to admins', async () => {
    seedWorld();
    await expect(getHiddenAccountIdsForUser('admin1', 'owner')).resolves.toEqual([]);
  });

  it('returns [] when there are no sensitive accounts', async () => {
    seedWorld();
    state.mockState.accounts = state.mockState.accounts.filter((a) => a.id !== 'acc-sensitive');
    await expect(getHiddenAccountIdsForUser('member1', 'owner')).resolves.toEqual([]);
  });
});

describe('isAccountHiddenFromUser', () => {
  const seedWorld = () => {
    seedKey('owner', null);
    seedKey('member1', 'owner');
    seedAsm('owner', 'member1', 'active', 'member');
    seedKey('admin1', 'owner');
    seedAsm('owner', 'admin1', 'active', 'admin');
    seedAccounts();
  };

  it('hides a sensitive account from a plain member', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('member1', 'owner', 'acc-sensitive')).resolves.toBe(true);
  });

  it('does not hide public accounts from members', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('member1', 'owner', 'acc-public')).resolves.toBe(false);
  });

  it('is owner-scoped: other owners\' sensitive accounts are not "hidden"', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('member1', 'owner', 'acc-other-sensitive')).resolves.toBe(false);
  });

  it('shows sensitive accounts to admins', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('admin1', 'owner', 'acc-sensitive')).resolves.toBe(false);
  });

  it('shows sensitive accounts to the primary', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('owner', 'owner', 'acc-sensitive')).resolves.toBe(false);
  });

  it('returns false for null or unknown account ids', async () => {
    seedWorld();
    await expect(isAccountHiddenFromUser('member1', 'owner', null)).resolves.toBe(false);
    await expect(isAccountHiddenFromUser('member1', 'owner', 'acc-missing')).resolves.toBe(false);
  });
});
