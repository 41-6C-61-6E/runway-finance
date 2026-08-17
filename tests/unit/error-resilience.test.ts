import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleApiError,
  guarded,
  apiSuccess,
  apiValidation,
  apiTooManyRequests,
  apiUpstream,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiUnauthorized,
} from '@/lib/api/response';
import { UpdateIssueStatusSchema } from '@/lib/validations/issue';
import { logger } from '@/lib/logger';
import { reconcileStuckRunningJobs, pruneOldJobLogs } from '@/lib/services/scheduler-logger';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}));

describe('Error Resilience & Standardization Suite', () => {
  describe('lib/api/response.ts - handleApiError', () => {
    it('maps Postgres 23503 foreign key error to 409 conflict', async () => {
      const pgError = { code: '23503', message: 'violates foreign key constraint' };
      const response = handleApiError(pgError);
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error).toBe('conflict');
      expect(json.message).toContain('reference in your data is invalid');
    });

    it('maps Postgres 23505 unique constraint error to 409 duplicate', async () => {
      const pgError = { code: '23505', message: 'duplicate key value violates unique constraint' };
      const response = handleApiError(pgError);
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error).toBe('duplicate');
      expect(json.message).toContain('Duplicate record detected');
    });

    it('maps Postgres 22P02 invalid value error to 400 invalid_value', async () => {
      const pgError = { code: '22P02', message: 'invalid input syntax for type integer' };
      const response = handleApiError(pgError);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_value');
    });

    it('maps Drizzle Failed query foreign key string to 409 conflict', async () => {
      const err = new Error('Failed query: insert into accounts ... violates foreign key constraint');
      const response = handleApiError(err);
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error).toBe('conflict');
    });

    it('maps Drizzle Failed query date syntax to 400 invalid_date', async () => {
      const err = new Error('Failed query: select ... invalid input syntax for type date');
      const response = handleApiError(err);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_date');
    });

    it('sanitizes unexpected internal errors to generic 500 without leaking stack or raw SQL', async () => {
      const err = new Error('FATAL: raw database secret or schema details inside internal error message');
      const response = handleApiError(err, 'An unexpected error occurred');
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('internal_error');
      expect(json.message).toBe('An unexpected error occurred');
      expect(JSON.stringify(json)).not.toContain('FATAL');
      expect(JSON.stringify(json)).not.toContain('database secret');
    });
  });

  describe('lib/api/response.ts - guarded wrapper', () => {
    it('returns successful response without catching', async () => {
      const handler = guarded(async () => {
        return apiSuccess({ ok: true });
      });

      const response = await handler();
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
    });

    it('traps thrown errors and returns standardized NextResponse', async () => {
      const handler = guarded(async () => {
        throw new Error('Something broke inside handler');
      });

      const response = await handler();
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('internal_error');
    });
  });

  describe('lib/api/response.ts - status helper functions', () => {
    it('returns expected status codes for helpers', async () => {
      expect(apiUnauthorized().status).toBe(401);
      expect(apiForbidden().status).toBe(403);
      expect(apiNotFound().status).toBe(404);
      expect(apiBadRequest().status).toBe(400);
      expect(apiValidation({ field: 'invalid' }).status).toBe(400);
      expect(apiTooManyRequests().status).toBe(429);
      expect(apiUpstream().status).toBe(502);
    });
  });

  describe('lib/validations/issue.ts - UpdateIssueStatusSchema', () => {
    it('accepts valid issue statuses', () => {
      const validStatuses = ['reported', 'requested', 'in_progress', 'resolved', 'closed', 'dismissed'];
      for (const status of validStatuses) {
        const result = UpdateIssueStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects arbitrary unapproved statuses', () => {
      const invalidStatuses = ['deleted', 'hacked', 'admin', '', 'unknown_status'];
      for (const status of invalidStatuses) {
        const result = UpdateIssueStatusSchema.safeParse({ status });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('lib/services/scheduler-logger.ts - DB maintenance helpers', () => {
    it('reconcileStuckRunningJobs executes without unhandled exceptions on mock DB', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({
        update: mockUpdate,
      } as any);

      await expect(reconcileStuckRunningJobs()).resolves.toBe(0);
    });

    it('pruneOldJobLogs executes without unhandled exceptions on mock DB', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({
        delete: mockDelete,
      } as any);

      await expect(pruneOldJobLogs(30)).resolves.toBe(0);
    });
  });
});
