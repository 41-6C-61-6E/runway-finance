import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAuth, withAuthAndDek, requireDeleteConfirmation, getUserId, getDataUserId } from '@/lib/utils/require-auth';
import { DEK_ERRORS } from './mocks/crypto-context';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Security & Auth Wrappers (require-auth.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireDeleteConfirmation', () => {
    it('throws 400 when X-Confirm-Delete is missing or false', () => {
      const req1 = new Request('http://localhost/api/test', { method: 'DELETE' });
      expect(() => requireDeleteConfirmation(req1)).toThrow();

      const req2 = new Request('http://localhost/api/test', {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete': 'false' },
      });
      expect(() => requireDeleteConfirmation(req2)).toThrow();
    });

    it('passes when X-Confirm-Delete is true', () => {
      const req = new Request('http://localhost/api/test', {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete': 'true' },
      });
      expect(() => requireDeleteConfirmation(req)).not.toThrow();
    });
  });

  describe('getUserId and getDataUserId helpers', () => {
    it('returns null when session or user is missing', () => {
      expect(getUserId(null)).toBeNull();
      expect(getUserId({})).toBeNull();
      expect(getDataUserId(null)).toBeNull();
      expect(getDataUserId({})).toBeNull();
    });

    it('extracts primary user id and data user id for standard sessions', () => {
      const session = { user: { id: 'user_abc' } };
      expect(getUserId(session)).toBe('user_abc');
      expect(getDataUserId(session)).toBe('user_abc');
    });

    it('extracts distinct dataUserId for shared member sessions', () => {
      const session = { user: { id: 'member_123', dataUserId: 'primary_owner' } };
      expect(getUserId(session)).toBe('member_123');
      expect(getDataUserId(session)).toBe('primary_owner');
    });
  });

  describe('withAuth middleware', () => {
    it('returns 401 Unauthorized when session is null', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth).mockResolvedValue(null);

      const handler = vi.fn();
      const wrapped = withAuth(handler);

      const res = await wrapped(new Request('http://localhost/api/test'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns 401 when session user is undefined (revoked share)', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth).mockResolvedValue({ user: undefined } as any);

      const handler = vi.fn();
      const wrapped = withAuth(handler);

      const res = await wrapped(new Request('http://localhost/api/test'));
      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('calls inner handler with auth context on valid session', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth).mockResolvedValue({ user: { id: 'user_1', dataUserId: 'owner_1' } } as any);

      const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const wrapped = withAuth(handler);

      const req = new Request('http://localhost/api/test');
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(req, expect.objectContaining({
        userId: 'user_1',
        dataUserId: 'owner_1',
      }));
    });
  });

  describe('withAuthAndDek middleware', () => {
    it('returns 500 encryption_error when getSessionDEK throws', async () => {
      const { auth } = await import('@/lib/auth');
      const { getSessionDEK } = await import('@/lib/crypto-context');

      vi.mocked(auth).mockResolvedValue({ user: { id: 'user_1' } } as any);
      vi.mocked(getSessionDEK).mockRejectedValue(DEK_ERRORS.noKeyRow('user_1'));

      const handler = vi.fn();
      const wrapped = withAuthAndDek(handler);

      const res = await wrapped(new Request('http://localhost/api/test'));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('encryption_error');
      expect(handler).not.toHaveBeenCalled();
    });

    it('provides DEK Uint8Array to inner handler on success', async () => {
      const { auth } = await import('@/lib/auth');
      const { getSessionDEK } = await import('@/lib/crypto-context');
      const testDek = new Uint8Array(32).fill(0x55);

      vi.mocked(auth).mockResolvedValue({ user: { id: 'user_1', dataUserId: 'user_1' } } as any);
      vi.mocked(getSessionDEK).mockResolvedValue(testDek);

      const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
      const wrapped = withAuthAndDek(handler);

      const req = new Request('http://localhost/api/test');
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(req, expect.objectContaining({
        userId: 'user_1',
        dataUserId: 'user_1',
        dek: testDek,
      }));
    });
  });
});
