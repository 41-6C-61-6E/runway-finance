import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAdviceOrchestrator } from '@/lib/advice/orchestrator';
import type { FinanceContext } from '@/lib/finance/context';
import type { ResolvedProvider } from '@/lib/ai/client';

const mockStreamChat = vi.fn();

vi.mock('@/lib/ai/client', () => ({
  streamChat: (args: any) => mockStreamChat(args),
}));

vi.mock('@/lib/advice/snapshot', () => ({
  getAdviceSnapshot: vi.fn().mockResolvedValue('## Snapshot\nNet Worth: $500,000'),
}));

describe('Advice Orchestrator', () => {
  const dummyCtx = {
    userId: 'u1',
    dek: new Uint8Array(32),
    settings: {} as any,
    now: new Date('2026-10-15T12:00:00Z'),
    getAccounts: vi.fn().mockResolvedValue([]),
  } as unknown as FinanceContext;

  const dummyProvider: ResolvedProvider = {
    providerId: 'p1',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    fallbacks: [],
    apiKey: 'secret',
    host: 'openrouter.ai',
    isOpenRouter: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function collectEvents(generator: AsyncGenerator<any>) {
    const events: any[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }
    return events;
  }

  it('runs a normal 1-call stream when model provides direct answer', async () => {
    mockStreamChat.mockImplementation(async function* () {
      yield { type: 'text', text: 'You have a healthy savings rate ' };
      yield { type: 'text', text: 'of 25% this year.' };
    });

    const stream = runAdviceOrchestrator({
      ctx: dummyCtx,
      provider: dummyProvider,
      messages: [{ role: 'user', content: 'What is my savings rate?' }],
    });

    const events = await collectEvents(stream);

    expect(mockStreamChat).toHaveBeenCalledTimes(1);

    const tokenTexts = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(tokenTexts).toBe('You have a healthy savings rate of 25% this year.');

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.providerCalls).toBe(1);
  });

  it('buffers @@NEED on call #1, fetches extra pack, and makes call #2 without leaking @@NEED', async () => {
    let callIndex = 0;
    mockStreamChat.mockImplementation(async function* () {
      callIndex++;
      if (callIndex === 1) {
        // Call #1 requests extra data pack
        yield { type: 'text', text: '@@NEED ' };
        yield { type: 'text', text: '{"packs":[{"id":"category_spending"}]}' };
      } else {
        // Call #2 answers with the extra data
        yield { type: 'text', text: 'Based on your category spending data, ' };
        yield { type: 'text', text: 'dining was your largest expense.' };
      }
    });

    const stream = runAdviceOrchestrator({
      ctx: dummyCtx,
      provider: dummyProvider,
      messages: [{ role: 'user', content: 'Break down my dining spending' }],
    });

    const events = await collectEvents(stream);

    // Assert exactly 2 provider calls were made
    expect(mockStreamChat).toHaveBeenCalledTimes(2);

    // Assert @@NEED was NOT yielded to the client
    const tokenTexts = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(tokenTexts).not.toContain('@@NEED');
    expect(tokenTexts).toBe('Based on your category spending data, dining was your largest expense.');

    // Assert status transition included fetching_more
    expect(events.some((e) => e.type === 'status' && e.phase === 'fetching_more')).toBe(true);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent.providerCalls).toBe(2);
  });

  it('falls back gracefully if call #2 still returns @@NEED without looping', async () => {
    mockStreamChat.mockImplementation(async function* () {
      yield { type: 'text', text: '@@NEED {"packs":[{"id":"category_spending"}]}' };
    });

    const stream = runAdviceOrchestrator({
      ctx: dummyCtx,
      provider: dummyProvider,
      messages: [{ role: 'user', content: 'What is my budget?' }],
    });

    const events = await collectEvents(stream);

    // Guaranteed max 2 provider calls
    expect(mockStreamChat).toHaveBeenCalledTimes(2);

    const tokenTexts = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(tokenTexts).toContain("I couldn't get the data needed for that question.");
    expect(tokenTexts).not.toContain('@@NEED');
  });

  it('handles invalid @@NEED JSON on call #1 and makes call #2 with fallback prompt', async () => {
    let callIndex = 0;
    mockStreamChat.mockImplementation(async function* () {
      callIndex++;
      if (callIndex === 1) {
        yield { type: 'text', text: '@@NEED { malformed json syntax ' };
      } else {
        yield { type: 'text', text: 'Answering with available snapshot data.' };
      }
    });

    const stream = runAdviceOrchestrator({
      ctx: dummyCtx,
      provider: dummyProvider,
      messages: [{ role: 'user', content: 'Show my flows' }],
    });

    const events = await collectEvents(stream);

    expect(mockStreamChat).toHaveBeenCalledTimes(2);
    const tokenTexts = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(tokenTexts).toBe('Answering with available snapshot data.');
  });
});
