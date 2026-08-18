import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import {
  generateJoinToken,
  createInvitation,
  validateJoinToken,
} from '@/lib/sharing';
import { getTableName } from 'drizzle-orm';

const mockState: Record<string, any[]> = {
  user_encryption_keys: [],
  account_share_members: [],
  account_sharing_invitations: [],
  simplifin_connections: [],
  plaid_connections: [],
  accounts: [],
  sync_logs: [],
};

// drizzle SQL-object → conditions: where(eq(col, v)) / and(...) produce SQL
// nodes whose queryChunks contain Column objects (.name = snake_case) and
// Param objects (.value). Walk the tree and pair each Param with the last
// Column seen.
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
  },
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      _table: null,
      _conds: null as any,
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
          set: (val: any) => ({
            where: vi.fn(() => {
              const name = getTableName(table) || table?._?.name || table?.name;
              if (name && mockState[name]) {
                for (const row of mockState[name]) {
                  Object.assign(row, val);
                }
              }
              return Promise.resolve();
            }),
          }),
        };
      }),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(chain._table) || chain._table?._?.name || chain?.table?.name || '';
        const rows = mockState[name] || [];
        const conds = chain._conds || [];
        const matched = rows.filter((row) => conds.every((c) => row[camel(c.column)] === c.value));
        const limited = chain._limit !== undefined ? matched.slice(0, chain._limit) : matched;
        return Promise.resolve(limited).then(resolve);
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

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function seedInvitation(overrides: Record<string, any> = {}) {
  const row = {
    id: 'inv_tok_1',
    inviterUserId: 'owner_user',
    inviteeEmail: 'invited@example.com',
    pinHash: '$2a$12$fakepinhash',
    pin: null,
    status: 'pending',
    attempts: 0,
    joinTokenHash: sha256('the-secret-token'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  mockState.account_sharing_invitations.push(row);
  return row;
}

describe('Join token (single-use link secret)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockState)) {
      mockState[key].length = 0;
    }
  });

  describe('generateJoinToken', () => {
    it('produces a 43-char base64url string (256 bits)', () => {
      const token = generateJoinToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('is unique across calls', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateJoinToken()));
      expect(tokens.size).toBe(50);
    });
  });

  describe('createInvitation', () => {
    it('returns a join token and stores only its sha256 hash', async () => {
      const result = await createInvitation('owner_user', 'spouse@example.com');
      expect('token' in result).toBe(true);
      expect('pin' in result).toBe(true);
      if ('token' in result && 'pin' in result) {
        expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(result.token).not.toBe(result.pin);
        expect(mockState.account_sharing_invitations.length).toBe(1);
        const stored = mockState.account_sharing_invitations[0];
        expect(stored.joinTokenHash).toBe(sha256(result.token));
        // The plaintext token must never be persisted
        expect(stored.token).toBeUndefined();
        expect(JSON.stringify(stored)).not.toContain(result.token);
        // PIN path unchanged
        expect(stored.pin).toBeNull();
      }
    });
  });

  describe('validateJoinToken', () => {
    it('accepts a valid token for a pending invitation', async () => {
      seedInvitation();
      const result = await validateJoinToken('the-secret-token');
      expect(result).toMatchObject({
        valid: true,
        invitationId: 'inv_tok_1',
        inviterUserId: 'owner_user',
        inviteeEmail: 'invited@example.com',
      });
    });

    it('rejects an unknown token', async () => {
      seedInvitation();
      const result = await validateJoinToken('not-the-token');
      expect(result.valid).toBe(false);
    });

    it('rejects a consumed (accepted) invitation', async () => {
      seedInvitation({ status: 'accepted' });
      const result = await validateJoinToken('the-secret-token');
      expect(result.valid).toBe(false);
    });

    it('rejects a revoked invitation', async () => {
      seedInvitation({ status: 'revoked' });
      const result = await validateJoinToken('the-secret-token');
      expect(result.valid).toBe(false);
    });

    it('rejects and lazily expires an invitation older than 7 days', async () => {
      seedInvitation({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
      const result = await validateJoinToken('the-secret-token');
      expect(result.valid).toBe(false);
      expect(mockState.account_sharing_invitations[0].status).toBe('expired');
    });

    it('accepts an invitation at exactly under 7 days old', async () => {
      seedInvitation({ createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) });
      const result = await validateJoinToken('the-secret-token');
      expect(result.valid).toBe(true);
    });

    it('does not increment attempts on failed token validation', async () => {
      const row = seedInvitation();
      await validateJoinToken('wrong-token');
      await validateJoinToken('also-wrong');
      expect(row.attempts).toBe(0);
      expect(row.status).toBe('pending');
    });

    it('returns an identical error for unknown, consumed, and expired tokens (no oracle)', async () => {
      seedInvitation({ id: 'inv_a' });
      const unknown = await validateJoinToken('unknown-token');
      const consumed = await validateJoinToken('the-secret-token'); // status flipped below
      expect(unknown.valid).toBe(false);
      expect(consumed.valid).toBe(true);
      mockState.account_sharing_invitations[0].status = 'accepted';
      const accepted = await validateJoinToken('the-secret-token');
      mockState.account_sharing_invitations[0].status = 'revoked';
      const revoked = await validateJoinToken('the-secret-token');
      mockState.account_sharing_invitations[0].status = 'pending';
      mockState.account_sharing_invitations[0].createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const expired = await validateJoinToken('the-secret-token');
      const expectedError = 'Invalid or expired join link.';
      for (const r of [unknown, accepted, revoked, expired]) {
        expect(r.valid).toBe(false);
        if (r.valid === false) {
          expect(r.error).toBe(expectedError);
        }
      }
    });
  });
});
