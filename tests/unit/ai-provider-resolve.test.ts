import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAiProvider } from '@/lib/ai/client';
import { aiProviders } from '@/lib/db/schema';

const state = vi.hoisted(() => ({
  providers: [] as any[],
  dataUserId: 'household-user-id',
}));

vi.mock('@/lib/sharing', () => ({
  resolveDataUserId: vi.fn(async () => state.dataUserId),
}));

vi.mock('@/lib/db/seed-ai-providers', () => ({
  seedUserAiProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(async (val: string) => `decrypted-${val}`),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (condition: any) => ({
          limit: (n: number) => {
            // Find rows matching userId filter if simulated
            return Promise.resolve(state.providers.slice(0, n));
          },
        }),
      }),
    }),
  }),
}));

describe('resolveAiProvider', () => {
  const dek = new Uint8Array([1, 2, 3]);

  beforeEach(() => {
    state.providers = [];
    state.dataUserId = 'household-user-id';
  });

  it('returns null when no providers are configured', async () => {
    state.providers = [];
    const provider = await resolveAiProvider('user-1', dek);
    expect(provider).toBeNull();
  });

  it('resolves active provider with normalized endpoint, host, and fallbacks', async () => {
    state.providers = [
      {
        id: 'prov-1',
        userId: 'user-1',
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1///',
        model: 'anthropic/claude-3.5-sonnet',
        fallbackModels: '["openai/gpt-4o-mini"]',
        apiKeyEncrypted: 'enc-key',
        isActive: true,
      },
    ];

    const provider = await resolveAiProvider('user-1', dek);
    expect(provider).not.toBeNull();
    expect(provider?.providerId).toBe('prov-1');
    expect(provider?.endpoint).toBe('https://openrouter.ai/api/v1');
    expect(provider?.host).toBe('openrouter.ai');
    expect(provider?.model).toBe('anthropic/claude-3.5-sonnet');
    expect(provider?.fallbacks).toEqual(['openai/gpt-4o-mini']);
    expect(provider?.apiKey).toBe('decrypted-enc-key');
    expect(provider?.isOpenRouter).toBe(true);
  });
});
