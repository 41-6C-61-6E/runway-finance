import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user_123' },
  }),
}));

vi.mock('@/lib/sharing', () => ({
  resolveDataUserId: vi.fn().mockImplementation((id: string) => Promise.resolve(id)),
}));

vi.mock('@/lib/services/sync-scheduler', () => ({
  syncScheduler: {
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  },
}));

vi.mock('@/lib/crypto', () => ({
  encryptField: vi.fn().mockResolvedValue('encrypted_payload_new'),
  decryptField: vi.fn().mockResolvedValue('decrypted_payload'),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('@/lib/simplefin', () => ({
  claimAccessUrl: vi.fn().mockImplementation((token: string) => {
    if (token === 'valid_token') {
      return Promise.resolve('https://simplefin.example.com/access/claimed_123');
    }
    throw new Error('Claim failed: invalid token');
  }),
}));

vi.mock('@/lib/utils/ssrf', () => ({
  validateEndpointUrl: vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('https://')) return Promise.resolve({ ok: true });
    return Promise.resolve({ ok: false, error: 'HTTPS required' });
  }),
}));

// Mock DB
const mockConnection = {
  id: 'conn_sf_1',
  userId: 'user_123',
  accessUrlEncrypted: 'old_encrypted_payload',
  label: 'My SimpleFIN',
  syncFrequency: 'daily',
  lastSyncAt: null,
  lastSyncError: 'Expired token',
};

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockReturning = vi.fn();

const mockDb: any = {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  limit: mockLimit,
  update: mockUpdate,
  set: mockSet,
  returning: mockReturning,
};

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}));

describe('PATCH /api/connections/[id] - SimpleFIN URL/Token Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(mockDb);
    mockFrom.mockReturnValue(mockDb);
    mockWhere.mockReturnValue(mockDb);
    mockLimit.mockReturnValue(mockDb);
    mockUpdate.mockReturnValue(mockDb);
    mockSet.mockReturnValue(mockDb);
    mockReturning.mockReturnValue(mockDb);
  });

  it('updates SimpleFIN connection with a new setup token', async () => {
    mockLimit.mockResolvedValueOnce([mockConnection]);
    mockReturning.mockResolvedValueOnce([{
      ...mockConnection,
      accessUrlEncrypted: 'encrypted_payload_new',
      lastSyncError: null,
    }]);

    const { PATCH } = await import('@/app/api/connections/[id]/route');
    const req = new Request('http://localhost:3000/api/connections/conn_sf_1', {
      method: 'PATCH',
      body: JSON.stringify({
        setupToken: 'valid_token',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'conn_sf_1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.accessUrlEncrypted).toBe('encrypted_payload_new');
    expect(data.lastSyncError).toBeNull();
  });

  it('updates SimpleFIN connection with a direct HTTPS access URL', async () => {
    mockLimit.mockResolvedValueOnce([mockConnection]);
    mockReturning.mockResolvedValueOnce([{
      ...mockConnection,
      accessUrlEncrypted: 'encrypted_payload_new',
      lastSyncError: null,
    }]);

    const { PATCH } = await import('@/app/api/connections/[id]/route');
    const req = new Request('http://localhost:3000/api/connections/conn_sf_1', {
      method: 'PATCH',
      body: JSON.stringify({
        accessUrl: 'https://user:pass@simplefin.example.com/access/direct_url',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'conn_sf_1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.accessUrlEncrypted).toBe('encrypted_payload_new');
  });

  it('returns 400 when claiming an invalid setup token fails', async () => {
    mockLimit.mockResolvedValueOnce([mockConnection]);

    const { PATCH } = await import('@/app/api/connections/[id]/route');
    const req = new Request('http://localhost:3000/api/connections/conn_sf_1', {
      method: 'PATCH',
      body: JSON.stringify({
        setupToken: 'bad_token',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'conn_sf_1' }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('claim_failed');
  });
});
