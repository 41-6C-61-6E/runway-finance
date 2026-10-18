import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/ai/ask/route';
import { logger } from '@/lib/logger';
import * as rateLimitModule from '@/lib/rate-limit';
import * as aiClientModule from '@/lib/ai/client';
import * as financeContextModule from '@/lib/finance/context';
import * as orchestratorModule from '@/lib/ask/orchestrator';

vi.mock('@/lib/auth', () => ({
  auth: () =>
    Promise.resolve({
      user: { id: 'test-user-id', dataUserId: 'test-data-user-id' },
    }),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

describe('POST /api/ai/ask Route', () => {
  const dummyProvider: aiClientModule.ResolvedProvider = {
    providerId: 'p1',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    fallbacks: [],
    apiKey: 'secret',
    host: 'openrouter.ai',
    isOpenRouter: true,
  };

  const baseSettings = {
    aiEnabled: true,
    aiSuggestionsEnabled: true,
    aiAskEnabled: true,
    aiAskModel: null,
    aiAskIncludeAccountNames: false,
    aiAskConsentHost: 'openrouter.ai',
    aiAskConsentAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(financeContextModule, 'buildFinanceContext').mockResolvedValue({
      userId: 'test-user-id',
      dataUserId: 'test-data-user-id',
      dek: new Uint8Array(32),
      role: 'primary',
      hiddenAccountIds: new Set(),
      settings: { ...baseSettings } as any,
      now: new Date(),
      getAccounts: vi.fn().mockResolvedValue([]),
    });

    vi.spyOn(aiClientModule, 'resolveAiProvider').mockResolvedValue(dummyProvider);
    vi.spyOn(rateLimitModule, 'checkRateLimit').mockResolvedValue(true);
  });

  async function readSSEStream(res: Response): Promise<string> {
    const text = await res.text();
    return text;
  }

  it('rejects invalid requests with invalid_request error', async () => {
    // 1. Last message not user
    const reqNotUser = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'assistant', content: 'Hello' }],
      }),
    });
    const res1 = await POST(reqNotUser);
    const text1 = await readSSEStream(res1);
    expect(text1).toContain('invalid_request');

    // 2. Disallowed page path
    const reqBadPath = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        page: { path: '/admin/secret' },
      }),
    });
    const res2 = await POST(reqBadPath);
    const text2 = await readSSEStream(res2);
    expect(text2).toContain('invalid_request');
  });

  it('enforces Gate 1: returns not_available when aiAskEnabled is false', async () => {
    vi.spyOn(financeContextModule, 'buildFinanceContext').mockResolvedValue({
      userId: 'test-user-id',
      dataUserId: 'test-data-user-id',
      dek: new Uint8Array(32),
      role: 'primary',
      hiddenAccountIds: new Set(),
      settings: { ...baseSettings, aiAskEnabled: false } as any,
      now: new Date(),
      getAccounts: vi.fn().mockResolvedValue([]),
    });

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is my net worth?' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('not_available');
  });

  it('enforces Gate 1: returns not_available when master aiEnabled is false', async () => {
    vi.spyOn(financeContextModule, 'buildFinanceContext').mockResolvedValue({
      userId: 'test-user-id',
      dataUserId: 'test-data-user-id',
      dek: new Uint8Array(32),
      role: 'primary',
      hiddenAccountIds: new Set(),
      settings: { ...baseSettings, aiEnabled: false } as any,
      now: new Date(),
      getAccounts: vi.fn().mockResolvedValue([]),
    });

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is my net worth?' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('not_available');
  });

  it('enforces Gate 2: returns not_available for role member (v1)', async () => {
    vi.spyOn(financeContextModule, 'buildFinanceContext').mockResolvedValue({
      userId: 'test-user-id',
      dataUserId: 'test-data-user-id',
      dek: new Uint8Array(32),
      role: 'member',
      hiddenAccountIds: new Set(),
      settings: { ...baseSettings } as any,
      now: new Date(),
      getAccounts: vi.fn().mockResolvedValue([]),
    });

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is my budget?' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('not_available');
  });

  it('enforces Gate 3: returns not_configured when no AI provider exists', async () => {
    vi.spyOn(aiClientModule, 'resolveAiProvider').mockResolvedValue(null);

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('not_configured');
  });

  it('enforces Gate 4: returns consent_required when host does not match consented host', async () => {
    vi.spyOn(financeContextModule, 'buildFinanceContext').mockResolvedValue({
      userId: 'test-user-id',
      dataUserId: 'test-data-user-id',
      dek: new Uint8Array(32),
      role: 'primary',
      hiddenAccountIds: new Set(),
      settings: { ...baseSettings, aiAskConsentHost: 'old-host.com' } as any,
      now: new Date(),
      getAccounts: vi.fn().mockResolvedValue([]),
    });

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is my net worth?' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('consent_required');
  });

  it('enforces Gate 5: returns rate_limited when rate limit is exceeded', async () => {
    vi.spyOn(rateLimitModule, 'checkRateLimit').mockResolvedValue(false);

    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is my budget?' }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);
    expect(text).toContain('rate_limited');
  });

  it('streams orchestrator events and logs safely without prompt or message content', async () => {
    const infoSpy = vi.spyOn(logger, 'info');

    vi.spyOn(orchestratorModule, 'runAskOrchestrator').mockImplementation(async function* () {
      yield { type: 'status', phase: 'gathering' };
      yield {
        type: 'sources',
        items: [{ packId: 'cash_flow_monthly', label: 'Cash Flow', href: '/flows' }],
      };
      yield { type: 'token', text: 'You have a surplus.' };
      yield {
        type: 'done',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        providerCalls: 1,
      };
    });

    const secretQuestion = 'CONFIDENTIAL_QUESTION_SECRET_ABOUT_EXPENSES';
    const req = new Request('http://localhost:3001/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: secretQuestion }],
      }),
    });

    const res = await POST(req);
    const text = await readSSEStream(res);

    expect(text).toContain('event: status');
    expect(text).toContain('event: sources');
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');

    // Safe logging check
    expect(infoSpy).toHaveBeenCalled();
    for (const call of infoSpy.mock.calls) {
      const logMessage = call[0] || '';
      const logMeta = JSON.stringify(call[1] || {});
      expect(logMessage).not.toContain(secretQuestion);
      expect(logMeta).not.toContain(secretQuestion);
      expect(logMeta).not.toContain('You have a surplus.');
    }
  });
});
