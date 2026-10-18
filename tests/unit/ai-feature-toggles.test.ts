import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserSettings: any[] = [];

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockUserSettings),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

describe('AI Master and Feature Toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserSettings.length = 0;
  });

  it('validates defaults for aiEnabled and aiSuggestionsEnabled', async () => {
    const { AI_DEFAULTS, DEFAULTS } = await import('@/config/defaults');
    expect(AI_DEFAULTS.aiEnabled).toBe(true);
    expect(AI_DEFAULTS.aiSuggestionsEnabled).toBe(true);
    expect(DEFAULTS.aiEnabled).toBe(true);
    expect(DEFAULTS.aiSuggestionsEnabled).toBe(true);
  });

  it('blocks analyzeUncategorized when master aiEnabled is false', async () => {
    mockUserSettings.push({
      userId: 'test-user',
      aiEnabled: false,
      aiSuggestionsEnabled: true,
      aiAutoAnalyze: true,
    });

    const { analyzeUncategorized } = await import('@/lib/services/ai-categorizer');
    const logs: string[] = [];
    const res = await analyzeUncategorized(
      'test-user',
      undefined,
      (m) => logs.push(m)
    );

    expect(res.proposalsCreated).toBe(0);
    expect(res.errors).toContain('AI Suggestions are disabled in settings');
    expect(logs.some((l) => l.includes('AI Suggestions are disabled in settings'))).toBe(true);
  });

  it('blocks analyzeUncategorized when aiSuggestionsEnabled is false', async () => {
    mockUserSettings.push({
      userId: 'test-user',
      aiEnabled: true,
      aiSuggestionsEnabled: false,
      aiAutoAnalyze: true,
    });

    const { analyzeUncategorized } = await import('@/lib/services/ai-categorizer');
    const logs: string[] = [];
    const res = await analyzeUncategorized(
      'test-user',
      undefined,
      (m) => logs.push(m)
    );

    expect(res.proposalsCreated).toBe(0);
    expect(res.errors).toContain('AI Suggestions are disabled in settings');
  });

  it('blocks POST /api/ai/analyze when aiEnabled or aiSuggestionsEnabled is false', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as any).mockResolvedValue({ user: { id: 'test-user' } });

    mockUserSettings.push({
      userId: 'test-user',
      aiEnabled: false,
      aiSuggestionsEnabled: true,
    });

    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST();
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('AI Suggestions are disabled in settings');
  });
});
