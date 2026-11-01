import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, apiFetch, ApiError } from '@/lib/utils/api-client';

describe('api-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('performs successful GET requests and parses JSON', async () => {
    const mockData = { success: true, count: 42 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '30' }),
      json: async () => mockData,
    });

    const res = await api.get('/api/test');
    expect(res).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
  });

  it('performs POST requests with JSON serialization', async () => {
    const payload = { name: 'Emergency Fund', target: 10000 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-length': '10' }),
      json: async () => ({ id: 'goal-123', ...payload }),
    });

    const res = await api.post('/api/goals', payload);
    expect(res).toEqual({ id: 'goal-123', ...payload });
    expect(global.fetch).toHaveBeenCalledWith('/api/goals', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  });

  it('throws ApiError with error details on HTTP error status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      json: async () => ({ error: 'Invalid payload parameters' }),
    });

    await expect(api.get('/api/bad-request')).rejects.toThrow(ApiError);
    try {
      await api.get('/api/bad-request');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(400);
      expect(err.message).toBe('Invalid payload parameters');
      expect(err.details).toEqual({ error: 'Invalid payload parameters' });
    }
  });

  it('handles 204 No Content gracefully without parsing JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const res = await api.delete('/api/accounts/123');
    expect(res).toEqual({});
  });
});

