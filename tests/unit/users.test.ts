import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createUserEncryptionKeys, updatePassword, rewrapDekForUser } from '@/lib/users';
import bcrypt from 'bcryptjs';

const mockUsers: any[] = [];
const mockEncryptionKeys: any[] = [];

// Mock deriveKeyFromPassword to avoid 600k PBKDF2 iteration CPU timeouts in unit tests
vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    deriveKeyFromPassword: vi.fn(async () => new Uint8Array(32).fill(0x77)),
  };
});

vi.mock('@/lib/db', () => ({
  getPool: () => ({
    connect: async () => ({
      query: async (sql: string, params: any[]) => {
        if (sql.includes('SELECT password_hash FROM users WHERE username')) {
          const user = mockUsers.find((u) => u.username === params[0]);
          return { rows: user ? [user] : [] };
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          const user = mockUsers.find((u) => u.username === params[1]);
          if (user) user.password_hash = params[0];
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  }),
  getDb: () => {
    const chain: any = {
      _table: null,
      select: vi.fn(() => chain),
      from: vi.fn((t: any) => {
        chain._table = t;
        return chain;
      }),
      where: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn((t: any) => ({
        values: vi.fn((val: any) => {
          mockEncryptionKeys.push({ ...val });
          return Promise.resolve();
        }),
      })),
      update: vi.fn((t: any) => ({
        set: vi.fn((val: any) => ({
          where: vi.fn(() => {
            const keyRow = mockEncryptionKeys[0];
            if (keyRow) Object.assign(keyRow, val);
            return Promise.resolve();
          }),
        })),
      })),
      then: (resolve: (v: any) => any) => {
        return Promise.resolve(mockEncryptionKeys).then(resolve);
      },
    };
    return chain;
  },
}));

describe('User Lifecycle & Key Management (lib/users.ts)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.length = 0;
    mockEncryptionKeys.length = 0;
  });

  it('creates valid user encryption keys with both password and server wrapping', async () => {
    await createUserEncryptionKeys('new_user', 'password123');

    expect(mockEncryptionKeys.length).toBe(1);
    const keyRow = mockEncryptionKeys[0];
    expect(keyRow.userId).toBe('new_user');
    expect(keyRow.wrappedDek).toBeDefined();
    expect(keyRow.serverWrappedDek).toBeDefined();
    expect(keyRow.salt).toBeDefined();
  });

  it('updates password and re-wraps DEK when current password is valid', async () => {
    const originalPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';
    const password_hash = await bcrypt.hash(originalPassword, 10);

    mockUsers.push({
      username: 'user_bob',
      password_hash,
    });

    // Create initial keys
    await createUserEncryptionKeys('user_bob', originalPassword);

    const result = await updatePassword('user_bob', originalPassword, newPassword);
    expect(result.success).toBe(true);

    const updatedUser = mockUsers.find((u) => u.username === 'user_bob');
    expect(await bcrypt.compare(newPassword, updatedUser.password_hash)).toBe(true);
  });

  it('rejects password update when current password is wrong', async () => {
    const originalPassword = 'CorrectPassword123!';
    const password_hash = await bcrypt.hash(originalPassword, 10);

    mockUsers.push({
      username: 'user_alice',
      password_hash,
    });

    const result = await updatePassword('user_alice', 'WrongPassword!', 'NewSecret!');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Current password is incorrect');
  });

  it('rewraps primary DEK for a new member joining a share group', async () => {
    // Primary user keys
    await createUserEncryptionKeys('primary_user', 'primaryPass123');

    // Rewrap for member
    await rewrapDekForUser('member_user', 'memberPass456', 'primary_user');

    expect(mockEncryptionKeys.length).toBe(2);
    const memberKey = mockEncryptionKeys[1];
    expect(memberKey.userId).toBe('member_user');
    expect(memberKey.primaryUserId).toBe('primary_user');
    expect(memberKey.wrappedDek).toBeDefined();
    expect(memberKey.serverWrappedDek).toBeDefined();
  });
});
