import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getVersion } from '@/app/api/version/route';

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  })),
}));

describe('/api/health & /api/version Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/health returns 200 and healthy status without authentication', async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.database).toBe('connected');
    expect(typeof json.uptime).toBe('number');
    expect(typeof json.timestamp).toBe('string');
  });

  it('GET /api/version returns version info without exposing commit author details', async () => {
    const res = await getVersion();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('buildNumber');
    expect(json).toHaveProperty('buildTime');
    expect(json).toHaveProperty('hash');
    expect(json).not.toHaveProperty('commits');
    expect(json).not.toHaveProperty('history');
  });
});

