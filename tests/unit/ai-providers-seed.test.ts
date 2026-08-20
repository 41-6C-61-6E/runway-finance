import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readEnvProvider, seedUserAiProviders } from '@/lib/db/seed-ai-providers';

const state = vi.hoisted(() => ({
  aiProvidersRows: [] as any[],
  userSettingsRows: [] as any[],
  encryptedKeys: new Map<string, string>(),
  authSession: { user: { id: 'user1' } } as any,
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => state.authSession),
}));

vi.mock('@/lib/utils/ssrf', () => ({
  validateEndpointUrl: vi.fn(async (url: string) => ({ ok: true, url: new URL(url.startsWith('http') ? url : `https://${url}`) })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/crypto-context', () => ({
  getServerDEK: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  getSessionDEK: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
}));

vi.mock('@/lib/crypto', () => ({
  encryptField: vi.fn(async (val: string) => `encrypted:${val}`),
  decryptField: vi.fn(async (val: string) => val.startsWith('encrypted:') ? val.replace('encrypted:', '') : val),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (n: number) => Promise.resolve(state.aiProvidersRows.slice(0, n)),
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (values: any) => ({
        returning: () => {
          const row = { id: 'prov_' + Math.random().toString(36).slice(2, 8), ...values };
          state.aiProvidersRows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: (table: any) => ({
      set: (updates: any) => ({
        where: () => {
          // Handle aiProviders update
          const updatedRows: any[] = [];
          for (const row of state.aiProvidersRows) {
            Object.assign(row, updates);
            updatedRows.push(row);
          }
          // Handle userSettings update
          if (updates.aiActiveProviderId !== undefined) {
            state.userSettingsRows.push(updates);
          }
          return {
            returning: () => Promise.resolve(updatedRows),
            then: (onfulfilled?: (v: any) => any) => Promise.resolve(updatedRows).then(onfulfilled),
          };
        },
      }),
    }),
  }),
}));

describe('AI Providers Seeding & Sanitization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    state.aiProvidersRows = [];
    state.userSettingsRows = [];
    state.authSession = { user: { id: 'user1' } };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('readEnvProvider', () => {
    it('returns null if any required environment variable is missing', () => {
      process.env.AI_PROVIDER_NAME = 'OpenAI';
      process.env.AI_PROVIDER_ENDPOINT = '';
      process.env.AI_PROVIDER_MODEL = 'gpt-4o-mini';
      expect(readEnvProvider()).toBeNull();
    });

    it('sanitizes quotes and trims whitespace from env vars', () => {
      process.env.AI_PROVIDER_NAME = '  "OpenAI" ';
      process.env.AI_PROVIDER_ENDPOINT = ' "https://api.openai.com/v1/" \n';
      process.env.AI_PROVIDER_MODEL = ' \'gpt-4o-mini\' ';
      process.env.AI_PROVIDER_API_KEY = ' "sk-proj-test123xyz" \r\n';

      const provider = readEnvProvider();
      expect(provider).toEqual({
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'sk-proj-test123xyz',
      });
    });

    it('allows API key to be optional for local providers like Ollama', () => {
      process.env.AI_PROVIDER_NAME = 'Ollama';
      process.env.AI_PROVIDER_ENDPOINT = 'http://localhost:11434/v1/';
      process.env.AI_PROVIDER_MODEL = 'llama3';
      delete process.env.AI_PROVIDER_API_KEY;

      const provider = readEnvProvider();
      expect(provider).toEqual({
        name: 'Ollama',
        endpoint: 'http://localhost:11434/v1',
        model: 'llama3',
        apiKey: null,
      });
    });
  });

  describe('seedUserAiProviders', () => {
    it('seeds a provider when none exists and sets it active', async () => {
      process.env.AI_PROVIDER_NAME = 'OpenAI';
      process.env.AI_PROVIDER_ENDPOINT = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-4o-mini';
      process.env.AI_PROVIDER_API_KEY = 'sk-test-key';

      await seedUserAiProviders('user1');

      expect(state.aiProvidersRows.length).toBe(1);
      expect(state.aiProvidersRows[0]).toMatchObject({
        userId: 'user1',
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKeyEncrypted: 'encrypted:sk-test-key',
        isActive: true,
      });
      expect(state.userSettingsRows.some(s => s.aiActiveProviderId === state.aiProvidersRows[0].id)).toBe(true);
    });

    it('is strictly idempotent and does not overwrite existing user-modified keys', async () => {
      // Simulate existing provider with user's manually updated key
      state.aiProvidersRows = [
        {
          id: 'prov_existing',
          userId: 'user1',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKeyEncrypted: 'encrypted:user-manual-key',
          isActive: true,
        },
      ];

      // Env vars have a different key or old key
      process.env.AI_PROVIDER_NAME = 'OpenAI';
      process.env.AI_PROVIDER_ENDPOINT = 'https://api.openai.com/v1/';
      process.env.AI_PROVIDER_MODEL = 'gpt-4o-mini';
      process.env.AI_PROVIDER_API_KEY = 'sk-env-key';

      await seedUserAiProviders('user1');

      // The provider list was not duplicated or overwritten
      expect(state.aiProvidersRows.length).toBe(1);
      expect(state.aiProvidersRows[0].apiKeyEncrypted).toBe('encrypted:user-manual-key');
    });

    it('seeds provider with null apiKeyEncrypted if no API key is provided in env', async () => {
      process.env.AI_PROVIDER_NAME = 'Ollama';
      process.env.AI_PROVIDER_ENDPOINT = 'http://localhost:11434/v1';
      process.env.AI_PROVIDER_MODEL = 'llama3';
      delete process.env.AI_PROVIDER_API_KEY;

      await seedUserAiProviders('user2');

      expect(state.aiProvidersRows.length).toBe(1);
      expect(state.aiProvidersRows[0].apiKeyEncrypted).toBeNull();
      expect(state.aiProvidersRows[0].isActive).toBe(true);
    });
  });

  describe('PATCH /api/ai/providers/[id] masked key protection', () => {
    it('ignores masked API keys and retains existing encrypted key', async () => {
      const { PATCH } = await import('@/app/api/ai/providers/[id]/route');

      state.aiProvidersRows = [
        {
          id: 'prov_123',
          userId: 'user1',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKeyEncrypted: 'encrypted:original-key',
          isActive: true,
          jsonMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Client sends masked key placeholder
      const req = new Request('http://localhost/api/ai/providers/prov_123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'OpenAI Updated',
          apiKey: 'sk-...1234', // masked key
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'prov_123' }) });
      expect(res.status).toBe(200);
      expect(state.aiProvidersRows[0].apiKeyEncrypted).toBe('encrypted:original-key');
      expect(state.aiProvidersRows[0].name).toBe('OpenAI Updated');
    });

    it('updates apiKeyEncrypted when a real new key is provided', async () => {
      const { PATCH } = await import('@/app/api/ai/providers/[id]/route');

      state.aiProvidersRows = [
        {
          id: 'prov_123',
          userId: 'user1',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKeyEncrypted: 'encrypted:old-key',
          isActive: true,
          jsonMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const req = new Request('http://localhost/api/ai/providers/prov_123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'sk-new-valid-secret',
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'prov_123' }) });
      expect(res.status).toBe(200);
      expect(state.aiProvidersRows[0].apiKeyEncrypted).toBe('encrypted:sk-new-valid-secret');
    });
  });

  describe('POST /api/ai/models route', () => {
    it('uses stored credentials when providerId is provided without apiKey', async () => {
      const { POST } = await import('@/app/api/ai/models/route');

      state.aiProvidersRows = [
        {
          id: 'prov_saved',
          userId: 'user1',
          name: 'OpenAI',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKeyEncrypted: 'encrypted:sk-saved-secret-key',
          isActive: true,
          jsonMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock global fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
        }),
      } as any);

      const req = new Request('http://localhost/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'prov_saved',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.models).toEqual(['gpt-4o', 'gpt-4o-mini']);

      expect(fetchSpy).toHaveBeenCalledWith(
        new URL('https://api.openai.com/v1/models'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-saved-secret-key',
          }),
        })
      );

      fetchSpy.mockRestore();
    });
  });
});
