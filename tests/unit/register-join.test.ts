import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  order: [] as string[],
  clients: [] as any[],
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn((req: Request) => req.headers.get('x-forwarded-for') ?? 'unknown'),
}));

vi.mock('@/lib/db', () => ({
  getPool: () => ({
    connect: async () => {
      const client = {
        query: async (sql: string) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            state.order.push(sql);
          }
          return { rows: [] };
        },
        release: vi.fn(),
      };
      state.clients.push(client);
      return client;
    },
  }),
  getDb: () => ({
    insert: () => ({ values: () => Promise.resolve() }),
  }),
}));

vi.mock('@/lib/users', () => ({
  addUser: vi.fn(async (user: any, client: any) => {
    state.order.push(client ? 'addUser(client)' : 'addUser(pool)');
    return { username: user.username };
  }),
  findUser: vi.fn(async () => undefined),
  rewrapDekForUser: vi.fn(async () => {
    state.order.push('rewrapDekForUser');
  }),
  createUserEncryptionKeys: vi.fn(async () => {}),
}));

vi.mock('@/lib/sharing', () => ({
  validateInvitation: vi.fn(async (email: string) => {
    state.order.push(`validate(${email})`);
    return { valid: true, invitationId: 'inv_1', inviterUserId: 'primary_user' };
  }),
  acceptInvitation: vi.fn(async () => {
    state.order.push('acceptInvitation');
  }),
  validateJoinToken: vi.fn(async (token: string) => {
    state.order.push(`validateToken(${token})`);
    return { valid: true, invitationId: 'inv_1', inviterUserId: 'primary_user', inviteeEmail: 'primary@example.com' };
  }),
}));

vi.mock('@/lib/db/seed-categories', () => ({ seedUserCategories: vi.fn(async () => {}) }));
vi.mock('@/lib/db/seed-default-rules', () => ({ seedUserDefaultRules: vi.fn(async () => {}) }));
vi.mock('@/lib/db/seed-ai-providers', () => ({ seedUserAiProviders: vi.fn(async () => {}) }));

import { POST } from '@/app/api/register/route';
import { rewrapDekForUser } from '@/lib/users';
import { acceptInvitation, validateInvitation } from '@/lib/sharing';

function makeRequest(body: Record<string, unknown>, ip: string) {
  return new NextRequest('http://localhost:3000/api/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('register API shared-account join (atomic transaction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.order.length = 0;
    state.clients.length = 0;
  });

  it('runs user insert, DEK rewrap and membership accept in a single transaction', async () => {
    const res = await POST(
      makeRequest(
        {
          username: 'new_member',
          password: 'password123',
          sharingEmail: ' Primary@Example.COM ',
          sharingPin: '12345678',
        },
        '203.0.113.1'
      )
    );

    expect(res.status).toBe(201);

    // Invitation validation happens BEFORE the transaction, with the
    // lowercased/trimmed sharing email (fix 5).
    expect(state.order[0]).toBe('validate(primary@example.com)');
    expect(state.order[1]).toBe('BEGIN');
    expect(state.order[2]).toBe('addUser(client)');
    expect(state.order[3]).toBe('rewrapDekForUser');
    expect(state.order[4]).toBe('acceptInvitation');
    expect(state.order[5]).toBe('COMMIT');
    expect(state.order).not.toContain('ROLLBACK');

    // The DEK rewrap and membership accept received a transactional db handle
    expect(rewrapDekForUser).toHaveBeenCalledWith('new_member', 'password123', 'primary_user', expect.anything());
    expect(acceptInvitation).toHaveBeenCalledWith('inv_1', 'primary_user', 'new_member', expect.anything());
    expect(validateInvitation).toHaveBeenCalledWith('primary@example.com', '12345678');

    // The pool client was released
    expect(state.clients.length).toBe(1);
    expect(state.clients[0].release).toHaveBeenCalledTimes(1);
  });

  it('rolls back the whole transaction when the DEK rewrap fails', async () => {
    vi.mocked(rewrapDekForUser).mockRejectedValueOnce(new Error('dek rewrap failed'));

    const res = await POST(
      makeRequest(
        {
          username: 'new_member2',
          password: 'password123',
          sharingEmail: 'primary@example.com',
          sharingPin: '12345678',
        },
        '203.0.113.2'
      )
    );

    expect(res.status).toBe(500);
    expect(state.order).toContain('BEGIN');
    expect(state.order).toContain('ROLLBACK');
    expect(state.order).not.toContain('COMMIT');
    expect(state.clients[0].release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when acceptInvitation reports a group size violation', async () => {
    vi.mocked(acceptInvitation).mockResolvedValueOnce({
      error: `Share groups are limited to 4 users.`,
    } as any);

    const res = await POST(
      makeRequest(
        {
          username: 'new_member3',
          password: 'password123',
          sharingEmail: 'primary@example.com',
          sharingPin: '12345678',
        },
        '203.0.113.3'
      )
    );

    expect(res.status).toBe(500);
    expect(state.order).toContain('ROLLBACK');
    expect(state.order).not.toContain('COMMIT');
  });
});
