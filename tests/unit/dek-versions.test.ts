import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { getTableName } from 'drizzle-orm';
import {
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  wrapKey,
  getServerKey,
  setDekFallbacks,
  getDekFallbacks,
} from '@/lib/crypto';
import { getServerDEK, invalidateUserDEKCache } from '@/lib/crypto-context';

const mockState: Record<string, any[]> = {
  user_encryption_keys: [],
  dek_versions: [],
};

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

// Minimal chainable select-only db fake. where() clauses built with eq() are
// evaluated by inspecting drizzle's queryChunks (column chunk has .name,
// value chunk is a Param with .value); orderBy sorts dek_versions by
// version desc.
vi.mock('@/lib/db', () => ({
  getDb: () => {
    const state: { table: any; where: any; limit: number | null; orderBy: boolean } = {
      table: null,
      where: null,
      limit: null,
      orderBy: false,
    };
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn((table: any) => {
        state.table = table;
        return chain;
      }),
      where: vi.fn((clause: any) => {
        state.where = clause;
        return chain;
      }),
      orderBy: vi.fn(() => {
        state.orderBy = true;
        return chain;
      }),
      limit: vi.fn((n: any) => {
        state.limit = n;
        return chain;
      }),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(state.table) || state.table?._?.name || state.table?.name || '';
        const rows = mockState[name] || [];
        let filtered = rows.filter((row: any) => matchesEq(row, state.where));
        if (state.orderBy && name === 'dek_versions') {
          filtered = [...filtered].sort((a: any, b: any) => (b.version ?? 0) - (a.version ?? 0));
        }
        if (state.limit != null) {
          filtered = filtered.slice(0, state.limit);
        }
        return Promise.resolve([...filtered]).then(resolve);
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

function extractEq(clause: any): { column: string; value: unknown } | null {
  const chunks: any[] = Array.isArray(clause?.queryChunks) ? clause.queryChunks : [];
  let column: string | undefined;
  let value: unknown;
  let hasValue = false;
  for (const chunk of chunks) {
    if (chunk == null || typeof chunk === 'function' || Array.isArray(chunk)) continue;
    const ctorName = chunk.constructor?.name ?? '';
    if (ctorName === 'StringChunk' || ctorName === 'SQL') continue;
    if (typeof chunk === 'string' || typeof chunk === 'number') {
      if (!hasValue) {
        value = chunk;
        hasValue = true;
      }
      continue;
    }
    if (chunk instanceof String || chunk instanceof Number) {
      if (!hasValue) {
        value = chunk as unknown as string | number;
        hasValue = true;
      }
      continue;
    }
    if (typeof chunk === 'object') {
      if (typeof chunk.name === 'string' && column === undefined) {
        column = chunk.name;
        continue;
      }
      if ('value' in chunk && !hasValue) {
        value = chunk.value;
        hasValue = true;
      }
    }
  }
  if (column === undefined || !hasValue) return null;
  return { column, value };
}

function toCamelCase(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function matchesEq(row: any, clause: any): boolean {
  if (clause == null) return true;
  const eq = extractEq(clause);
  if (!eq) return true;
  return row[toCamelCase(eq.column)] === eq.value;
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

const DEK_A_HEX = 'a1'.repeat(32);
const DEK_B_HEX = 'b2'.repeat(32);
const DEK_C_HEX = 'c3'.repeat(32);
const DEK_D_HEX = 'd4'.repeat(32);
const DEK_A = hexToBytes(DEK_A_HEX);
const DEK_B = hexToBytes(DEK_B_HEX);
const DEK_C = hexToBytes(DEK_C_HEX);
const DEK_D = hexToBytes(DEK_D_HEX);

async function seedUserServerKey(userId: string, dek: Uint8Array, primaryUserId: string | null = null): Promise<void> {
  const wrapped = await wrapKey(dek, getServerKey());
  mockState.user_encryption_keys.push({
    userId,
    wrappedDek: 'password-wrapped-dek',
    wrappingIv: 'aa'.repeat(12),
    wrappingTag: '',
    serverWrappedDek: wrapped.ciphertext,
    serverWrappingIv: wrapped.iv,
    serverWrappingTag: wrapped.tag,
    salt: '00'.repeat(32),
    primaryUserId,
  });
}

async function seedDekVersion(primaryUserId: string, version: number, dek: Uint8Array): Promise<void> {
  const wrapped = await wrapKey(dek, getServerKey());
  mockState.dek_versions.push({
    id: `dv-${primaryUserId}-v${version}`,
    primaryUserId,
    version,
    dekWrappedServer: wrapped.ciphertext,
    wrappingIv: wrapped.iv,
    wrappingTag: wrapped.tag,
  });
}

describe('DEK fallback chain (decrypt retry + getServerDEK wiring)', () => {
  beforeAll(() => {
    // Set a valid ENCRYPTION_KEY for getServerKey to work
    process.env.ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  });

  beforeEach(() => {
    mockState.user_encryption_keys.length = 0;
    mockState.dek_versions.length = 0;
    invalidateUserDEKCache();
    setDekFallbacks([]);
  });

  it('decrypt retries with fallback DEKs when the primary key fails', async () => {
    const payload = await encrypt('fallback-secret', DEK_A);

    await (async () => {
      setDekFallbacks([DEK_A]);
      const result = await decrypt(payload, DEK_B);
      expect(result).toBe('fallback-secret');
    })();
  });

  it('decrypt throws when the primary key fails and there are no fallbacks', async () => {
    const payload = await encrypt('fallback-secret', DEK_A);

    await (async () => {
      setDekFallbacks([]);
      await expect(decrypt(payload, DEK_B)).rejects.toThrow('Decryption failed');
    })();
  });

  // M-10: when the primary key and all fallbacks fail, decryptField throws
  // (logs server-side) instead of returning "", so callers surface a
  // visible generic error via handleApiError rather than empty data.
  it('decryptField uses fallback DEKs, or throws without them (M-10)', async () => {
    const field = await encryptField('field-value', DEK_A);

    await (async () => {
      setDekFallbacks([DEK_A]);
      await expect(decryptField(field, DEK_B)).resolves.toBe('field-value');
    })();

    await (async () => {
      setDekFallbacks([]);
      await expect(decryptField(field, DEK_B)).rejects.toThrow('could not be decrypted');
    })();
  });

  it('getServerDEK returns the current DEK and exposes newest-first household fallbacks', async () => {
    await seedUserServerKey('alice', DEK_A, null);
    await seedDekVersion('alice', 1, DEK_A); // equals current DEK -> must be excluded
    await seedDekVersion('alice', 2, DEK_B);
    await seedDekVersion('alice', 3, DEK_C);
    await seedDekVersion('bob', 7, DEK_D); // different household -> must be excluded

    const ctC = await encrypt('payload-encrypted-with-dek-c', DEK_C);
    const ctB = await encrypt('payload-encrypted-with-dek-b', DEK_B);
    const ctD = await encrypt('payload-encrypted-with-dek-d', DEK_D);

    await (async () => {
      const dek = await getServerDEK('alice');
      expect(Buffer.from(dek).toString('hex')).toBe(DEK_A_HEX);

      const fallbacks = getDekFallbacks();
      expect(fallbacks).toHaveLength(2);
      expect(Buffer.from(fallbacks[0]).toString('hex')).toBe(DEK_C_HEX);
      expect(Buffer.from(fallbacks[1]).toString('hex')).toBe(DEK_B_HEX);

      expect(await decrypt(ctC, dek)).toBe('payload-encrypted-with-dek-c');
      expect(await decrypt(ctB, dek)).toBe('payload-encrypted-with-dek-b');

      // bob's key was never registered as a fallback
      await expect(decrypt(ctD, dek)).rejects.toThrow('Decryption failed');
    })();
  });

  it('legacy household without DEK versions gets no fallbacks', async () => {
    await seedUserServerKey('carol', DEK_D, null);
    const ct = await encrypt('legacy-secret', DEK_A);

    await (async () => {
      const dek = await getServerDEK('carol');
      expect(Buffer.from(dek).toString('hex')).toBe(DEK_D_HEX);
      expect(getDekFallbacks()).toHaveLength(0);
      await expect(decrypt(ct, dek)).rejects.toThrow('Decryption failed');
    })();
  });
});
