import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user_123' },
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user_123' },
  }),
}));

const mockInstitutionsGet = vi.fn();
vi.mock('plaid', () => {
  class MockPlaidApi {
    institutionsGet = mockInstitutionsGet;
  }
  return {
    Configuration: vi.fn(),
    PlaidApi: MockPlaidApi,
    PlaidEnvironments: {
      sandbox: 'https://sandbox.plaid.com',
      production: 'https://production.plaid.com',
    },
    CountryCode: {
      Us: 'US',
    },
  };
});

describe('POST /api/plaid/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid: true when credentials are accepted by Plaid', async () => {
    mockInstitutionsGet.mockResolvedValue({ data: { institutions: [{ institution_id: 'ins_1' }] } });

    const { POST } = await import('@/app/api/plaid/validate/route');
    const req = new Request('http://localhost:3000/api/plaid/validate', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'client_123',
        secret: 'secret_123',
        environment: 'sandbox',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.valid).toBe(true);
    expect(mockInstitutionsGet).toHaveBeenCalled();
  });

  it('returns 400 with error message when Plaid credentials are invalid', async () => {
    mockInstitutionsGet.mockRejectedValue({
      response: {
        data: {
          error_message: 'provided client_id and secret do not match',
          error_code: 'INVALID_CREDENTIALS',
        },
      },
    });

    const { POST } = await import('@/app/api/plaid/validate/route');
    const req = new Request('http://localhost:3000/api/plaid/validate', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'bad_client',
        secret: 'bad_secret',
        environment: 'sandbox',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.error).toBe('provided client_id and secret do not match');
  });

  it('returns 400 when clientId or secret is missing', async () => {
    const { POST } = await import('@/app/api/plaid/validate/route');
    const req = new Request('http://localhost:3000/api/plaid/validate', {
      method: 'POST',
      body: JSON.stringify({
        clientId: '',
        secret: 'secret_123',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.error).toContain('required');
  });
});
