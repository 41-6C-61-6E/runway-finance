import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { removeMember } from '@/lib/sharing';
import { rewrapDekForUser, updatePassword } from '@/lib/users';
import { generateDEK, wrapKey, unwrapKey, getServerKey, deriveKeyFromPassword } from '@/lib/crypto';
import { invalidateUserDEKCache } from '@/lib/crypto-context';
import bcrypt from 'bcryptjs';

const mockState: Record<string, any[]> = {
  users: [],
  user_encryption_keys: [],
  account_share_members: [],
  account_sharing_invitations: [],
  simplifin_connections: [],
  plaid_connections: [],
  accounts: [],
  sync_logs: [],
  dek_versions: [],
  dek_version_wraps: [],
};

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/crypto-context', () => ({
  invalidateUserDEKCache: vi.fn(),
}));

// Replace drizzle's SQL builders with plain predicate objects so the fake db
// below can evaluate where-clauses against in-memory rows.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<any>('drizzle-orm');
  return {
    ...actual,
    eq: (col: any, val: any) => ({ type: 'eq', col, val }),
    ne: (col: any, val: any) => ({ type: 'ne', col, val }),
    and: (...args: any[]) => ({ type: 'and', args }),
    or: (...args: any[]) => ({ type: 'or', args }),
  };
});

// Route transactional drizzle instances at the same in-memory store so the
// removeMember transaction body has real effects to assert on.
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: () => makeFakeDb(),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => makeFakeDb(),
  getPool: () => ({
    connect: async () => ({
      query: async (text: string, values?: any[]) => {
        if (/^\s*SELECT password_hash FROM users/i.test(text)) {
          return { rows: mockState.users.filter((u: any) => u.username === values?.[0]) };
        }
        if (/^\s*UPDATE users SET password_hash/i.test(text)) {
          const u = mockState.users.find((x: any) => x.username === values?.[1]);
          if (u) u.password_hash = values?.[0];
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  }),
}));

let idCounter = 0;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

function colKey(table: any, col: any): string {
  for (const [k, v] of Object.entries(table)) {
    if (v === col) return k;
  }
  throw new Error(`mock db: column ${col?.name} not found on table`);
}

function evalWhere(node: any, table: any, row: any): boolean {
  if (node == null) return true;
  switch (node.type) {
    case 'eq':
      return row[colKey(table, node.col)] === node.val;
    case 'ne':
      return row[colKey(table, node.col)] !== node.val;
    case 'and':
      return node.args.every((a: any) => evalWhere(a, table, row));
    case 'or':
      return node.args.some((a: any) => evalWhere(a, table, row));
    default:
      return false;
  }
}

function makeFakeDb(): any {
  const st = { table: null as any, where: null as any, limit: null as number | null, fields: null as any };
  const chain: any = {
    select: (fields?: any) => {
      st.fields = fields ?? null;
      st.where = null;
      st.limit = null;
      return chain;
    },
    from: (table: any) => {
      st.table = table;
      st.where = null;
      st.limit = null;
      return chain;
    },
    where: (w: any) => {
      st.where = w;
      return chain;
    },
    limit: (n: number) => {
      st.limit = n;
      return chain;
    },
    insert: (table: any) => ({
      values: (val: any) => {
        const name = getTableName(table);
        const row = { id: `mock-id-${++idCounter}`, createdAt: new Date(), ...val };
        (mockState[name] ??= []).push(row);
        const promise = Promise.resolve([row]);
        return {
          returning: () => Promise.resolve([row]),
          then: (resolve: (v: any) => any) => promise.then(resolve),
        };
      },
    }),
    update: (table: any) => ({
      set: (val: any) => ({
        where: (w: any) => {
          const name = getTableName(table);
          for (const row of mockState[name] ?? []) {
            if (evalWhere(w, table, row)) Object.assign(row, val);
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: any) => ({
      where: (w: any) => {
        const name = getTableName(table);
        const rows = mockState[name] ?? [];
        for (let i = rows.length - 1; i >= 0; i--) {
          if (evalWhere(w, table, rows[i])) rows.splice(i, 1);
        }
        return Promise.resolve();
      },
    }),
    then: (resolve: (v: any) => any) => {
      const name = getTableName(st.table);
      const rows = mockState[name] ?? [];
      let out = st.where ? rows.filter((r) => evalWhere(st.where, st.table, r)) : [...rows];
      if (st.limit != null) out = out.slice(0, st.limit);
      if (st.fields) {
        out = out.map((r) =>
          Object.fromEntries(
            Object.entries(st.fields).map(([alias, col]) => [alias, r[colKey(st.table, col as any)]])
          )
        );
      }
      return Promise.resolve(out).then(resolve);
    },
  };
  return chain;
}

const serverKey = getServerKey();

async function seedKeyRow(
  userId: string,
  opts: { dek?: Uint8Array; password?: string; primaryUserId?: string | null; serverWrap?: boolean; staleDek?: Uint8Array } = {}
): Promise<Uint8Array> {
  const dek = opts.dek ?? generateDEK();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const pwdKek = await deriveKeyFromPassword(opts.password ?? 'pw', salt);
  const pwdWrapped = await wrapKey(opts.staleDek ?? dek, pwdKek);
  const row: any = {
    userId,
    wrappedDek: pwdWrapped.ciphertext,
    wrappingIv: pwdWrapped.iv,
    wrappingTag: pwdWrapped.tag,
    salt: bytesToHex(salt),
    primaryUserId: opts.primaryUserId ?? null,
  };
  if (opts.serverWrap !== false) {
    const serverWrapped = await wrapKey(dek, serverKey);
    row.serverWrappedDek = serverWrapped.ciphertext;
    row.serverWrappingIv = serverWrapped.iv;
    row.serverWrappingTag = serverWrapped.tag;
  } else {
    row.serverWrappedDek = null;
    row.serverWrappingIv = null;
    row.serverWrappingTag = null;
  }
  mockState.user_encryption_keys.push(row);
  return dek;
}

describe('DEK rotation / join / login key-version chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const rows of Object.values(mockState)) rows.length = 0;
  });

  describe('removeMember rotation', () => {
    it('anchors the old DEK as v1 and issues a fresh v2, re-wrapping the primary', async () => {
      const dekA = generateDEK();
      const primary = 'primary_user';
      const member = 'leaving_member';
      await seedKeyRow(primary, { dek: dekA, password: 'primary-pw' });
      await seedKeyRow(member, { dek: dekA, password: 'member-pw', primaryUserId: primary });
      mockState.account_share_members.push({
        id: 'asm-1',
        primaryUserId: primary,
        memberUserId: member,
        status: 'active',
      });
      // Leaver's wrap of a version they will no longer be allowed to use
      mockState.dek_version_wraps.push({
        id: 'dvw-leaver',
        versionId: 'dv-stale',
        memberUserId: member,
        wrappedDek: 'x',
        wrappingIv: 'y',
        wrappingTag: 'z',
      });

      const result = await removeMember(member, primary);
      expect(result.error).toBeUndefined();

      expect(mockState.dek_versions).toHaveLength(2);
      const [v1, v2] = [...mockState.dek_versions].sort((a, b) => a.version - b.version);
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v1.primaryUserId).toBe(primary);
      expect(v2.primaryUserId).toBe(primary);

      const oldDek = await unwrapKey(
        { ciphertext: v1.dekWrappedServer, iv: v1.wrappingIv, tag: v1.wrappingTag },
        serverKey
      );
      const newDek = await unwrapKey(
        { ciphertext: v2.dekWrappedServer, iv: v2.wrappingIv, tag: v2.wrappingTag },
        serverKey
      );
      expect(bytesToHex(oldDek)).toBe(bytesToHex(dekA));
      expect(bytesToHex(newDek)).not.toBe(bytesToHex(dekA));

      const primaryKeyRow = mockState.user_encryption_keys.find((r) => r.userId === primary)!;
      const primaryDek = await unwrapKey(
        {
          ciphertext: primaryKeyRow.serverWrappedDek,
          iv: primaryKeyRow.serverWrappingIv,
          tag: primaryKeyRow.serverWrappingTag,
        },
        serverKey
      );
      expect(bytesToHex(primaryDek)).toBe(bytesToHex(newDek));

      const memberKeyRow = mockState.user_encryption_keys.find((r) => r.userId === member)!;
      expect(memberKeyRow.primaryUserId).toBeNull();
      expect(memberKeyRow.wrappedDek).toBe('');
      expect(memberKeyRow.serverWrappedDek).toBeNull();
      expect(memberKeyRow.serverWrappingIv).toBeNull();
      expect(memberKeyRow.serverWrappingTag).toBeNull();

      expect(mockState.account_share_members[0].status).toBe('removed');
      expect(mockState.dek_version_wraps).toHaveLength(0);
      expect(invalidateUserDEKCache).toHaveBeenCalledTimes(1);
      expect(invalidateUserDEKCache).toHaveBeenCalledWith();
    });

    it('appends version max+1 to an existing chain without duplicates', async () => {
      const dekA = generateDEK();
      const dekV1 = generateDEK();
      const primary = 'primary_user';
      const member = 'leaving_member';
      await seedKeyRow(primary, { dek: dekA, password: 'primary-pw' });
      await seedKeyRow(member, { dek: dekA, password: 'member-pw', primaryUserId: primary });
      mockState.account_share_members.push({
        id: 'asm-1',
        primaryUserId: primary,
        memberUserId: member,
        status: 'active',
      });
      const w1 = await wrapKey(dekV1, serverKey);
      const w2 = await wrapKey(dekA, serverKey);
      mockState.dek_versions.push(
        { id: 'dv-1', primaryUserId: primary, version: 1, dekWrappedServer: w1.ciphertext, wrappingIv: w1.iv, wrappingTag: w1.tag },
        { id: 'dv-2', primaryUserId: primary, version: 2, dekWrappedServer: w2.ciphertext, wrappingIv: w2.iv, wrappingTag: w2.tag }
      );

      const result = await removeMember(member, primary);
      expect(result.error).toBeUndefined();

      expect(mockState.dek_versions).toHaveLength(3);
      expect(mockState.dek_versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);

      const v3 = mockState.dek_versions.find((v) => v.version === 3)!;
      const newDek = await unwrapKey(
        { ciphertext: v3.dekWrappedServer, iv: v3.wrappingIv, tag: v3.wrappingTag },
        serverKey
      );
      expect(bytesToHex(newDek)).not.toBe(bytesToHex(dekA));

      // Pre-existing rows untouched
      expect(mockState.dek_versions.find((v) => v.version === 1)!.dekWrappedServer).toBe(w1.ciphertext);
      expect(mockState.dek_versions.find((v) => v.version === 2)!.dekWrappedServer).toBe(w2.ciphertext);

      const primaryKeyRow = mockState.user_encryption_keys.find((r) => r.userId === primary)!;
      const primaryDek = await unwrapKey(
        {
          ciphertext: primaryKeyRow.serverWrappedDek,
          iv: primaryKeyRow.serverWrappingIv,
          tag: primaryKeyRow.serverWrappingTag,
        },
        serverKey
      );
      expect(bytesToHex(primaryDek)).toBe(bytesToHex(newDek));
    });

    it('skips rotation when the primary key row has no server wrap', async () => {
      const primary = 'primary_user';
      const member = 'leaving_member';
      await seedKeyRow(primary, { password: 'primary-pw', serverWrap: false });
      await seedKeyRow(member, { password: 'member-pw', primaryUserId: primary });
      mockState.account_share_members.push({
        id: 'asm-1',
        primaryUserId: primary,
        memberUserId: member,
        status: 'active',
      });

      const result = await removeMember(member, primary);
      expect(result.error).toBeUndefined();
      expect(mockState.dek_versions).toHaveLength(0);
      expect(mockState.dek_version_wraps).toHaveLength(0);
      expect(invalidateUserDEKCache).not.toHaveBeenCalled();

      const memberKeyRow = mockState.user_encryption_keys.find((r) => r.userId === member)!;
      expect(memberKeyRow.primaryUserId).toBeNull();
      expect(memberKeyRow.wrappedDek).toBe('');
    });
  });

  describe('rewrapDekForUser', () => {
    it('creates the joiner key row and a wrap of the latest version for a versioned household', async () => {
      const dekV = generateDEK();
      const primary = 'primary_user';
      await seedKeyRow(primary, { dek: dekV, password: 'primary-pw' });
      const w = await wrapKey(dekV, serverKey);
      mockState.dek_versions.push({
        id: 'dv-latest',
        primaryUserId: primary,
        version: 4,
        dekWrappedServer: w.ciphertext,
        wrappingIv: w.iv,
        wrappingTag: w.tag,
      });

      await rewrapDekForUser('joiner', 'joiner-pw', primary);

      const joinerRow = mockState.user_encryption_keys.find((r) => r.userId === 'joiner')!;
      expect(joinerRow).toBeDefined();
      expect(joinerRow.primaryUserId).toBe(primary);

      const wraps = mockState.dek_version_wraps.filter((r) => r.memberUserId === 'joiner');
      expect(wraps).toHaveLength(1);
      expect(wraps[0].versionId).toBe('dv-latest');
      const joinerKek = await deriveKeyFromPassword('joiner-pw', hexToBytes(joinerRow.salt));
      const d = await unwrapKey(
        { ciphertext: wraps[0].wrappedDek, iv: wraps[0].wrappingIv, tag: wraps[0].wrappingTag },
        joinerKek
      );
      expect(bytesToHex(d)).toBe(bytesToHex(dekV));
    });

    it('creates only the key row for a legacy household with no version rows', async () => {
      const primary = 'primary_user';
      await seedKeyRow(primary, { password: 'primary-pw' });

      await rewrapDekForUser('joiner', 'joiner-pw', primary);

      const joinerRow = mockState.user_encryption_keys.find((r) => r.userId === 'joiner')!;
      expect(joinerRow).toBeDefined();
      expect(joinerRow.primaryUserId).toBe(primary);
      expect(mockState.dek_version_wraps).toHaveLength(0);
    });
  });

  describe('updatePassword', () => {
    it('sources the DEK from the server wrap and refreshes the version wrap under the new KEK', async () => {
      const dekOLD = generateDEK();
      const dekNEW = generateDEK();
      const user = 'bob';
      mockState.users.push({ username: user, password_hash: await bcrypt.hash('old-pw', 4) });

      const salt = crypto.getRandomValues(new Uint8Array(32));
      const oldKek = await deriveKeyFromPassword('old-pw', salt);
      const staleWrap = await wrapKey(dekOLD, oldKek);
      const serverWrap = await wrapKey(dekNEW, serverKey);
      mockState.user_encryption_keys.push({
        userId: user,
        wrappedDek: staleWrap.ciphertext,
        wrappingIv: staleWrap.iv,
        wrappingTag: staleWrap.tag,
        serverWrappedDek: serverWrap.ciphertext,
        serverWrappingIv: serverWrap.iv,
        serverWrappingTag: serverWrap.tag,
        salt: bytesToHex(salt),
        primaryUserId: null,
      });

      const vWrap = await wrapKey(dekNEW, serverKey);
      mockState.dek_versions.push({
        id: 'dv-9',
        primaryUserId: user,
        version: 9,
        dekWrappedServer: vWrap.ciphertext,
        wrappingIv: vWrap.iv,
        wrappingTag: vWrap.tag,
      });
      const staleVersionWrap = await wrapKey(dekNEW, oldKek);
      mockState.dek_version_wraps.push({
        id: 'dvw-stale',
        versionId: 'dv-9',
        memberUserId: user,
        wrappedDek: staleVersionWrap.ciphertext,
        wrappingIv: staleVersionWrap.iv,
        wrappingTag: staleVersionWrap.tag,
      });

      const res = await updatePassword(user, 'old-pw', 'new-pw');
      expect(res.success).toBe(true);

      const keyRow = mockState.user_encryption_keys.find((r) => r.userId === user)!;
      const newKek = await deriveKeyFromPassword('new-pw', hexToBytes(keyRow.salt));

      const pwdDek = await unwrapKey(
        { ciphertext: keyRow.wrappedDek, iv: keyRow.wrappingIv, tag: keyRow.wrappingTag },
        newKek
      );
      expect(bytesToHex(pwdDek)).toBe(bytesToHex(dekNEW));
      expect(bytesToHex(pwdDek)).not.toBe(bytesToHex(dekOLD));

      const serverDek = await unwrapKey(
        {
          ciphertext: keyRow.serverWrappedDek,
          iv: keyRow.serverWrappingIv,
          tag: keyRow.serverWrappingTag,
        },
        serverKey
      );
      expect(bytesToHex(serverDek)).toBe(bytesToHex(dekNEW));

      const rows = mockState.dek_version_wraps.filter(
        (r) => r.versionId === 'dv-9' && r.memberUserId === user
      );
      expect(rows).toHaveLength(1);
      const vDek = await unwrapKey(
        { ciphertext: rows[0].wrappedDek, iv: rows[0].wrappingIv, tag: rows[0].wrappingTag },
        newKek
      );
      expect(bytesToHex(vDek)).toBe(bytesToHex(dekNEW));

      expect(await bcrypt.compare('new-pw', mockState.users[0].password_hash)).toBe(true);
    });
  });
});
