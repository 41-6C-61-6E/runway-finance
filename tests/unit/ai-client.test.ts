import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat, AiClientError, type ResolvedProvider } from '@/lib/ai/client';
import { createThinkStripper } from '@/lib/ai/stream';

vi.mock('@/lib/utils/ssrf', () => ({
  fetchSecure: vi.fn(),
  validateEndpointUrl: vi.fn().mockResolvedValue({ ok: true }),
}));

import { fetchSecure } from '@/lib/utils/ssrf';

describe('createThinkStripper', () => {
  it('strips think blocks within a single chunk', () => {
    const stripper = createThinkStripper();
    const res = stripper.process('Hello <think>secret thoughts</think>World') + stripper.flush();
    expect(res).toBe('Hello World');
  });

  it('strips thinking blocks within a single chunk', () => {
    const stripper = createThinkStripper();
    const res = stripper.process('Before <thinking>deep reasoning</thinking> After') + stripper.flush();
    expect(res).toBe('Before  After');
  });

  it('strips think blocks split across arbitrary chunk boundaries', () => {
    const stripper = createThinkStripper();
    let res = '';
    res += stripper.process('Hello <th');
    res += stripper.process('ink>internal logic');
    res += stripper.process('</th');
    res += stripper.process('ink>World');
    res += stripper.flush();
    expect(res).toBe('Hello World');
  });

  it('strips thinking blocks split across arbitrary chunk boundaries', () => {
    const stripper = createThinkStripper();
    let res = '';
    res += stripper.process('Prefix <');
    res += stripper.process('thinking>pondering</');
    res += stripper.process('thinking>Suffix');
    res += stripper.flush();
    expect(res).toBe('Prefix Suffix');
  });

  it('preserves non-tag angle brackets', () => {
    const stripper = createThinkStripper();
    let res = '';
    res += stripper.process('2 <');
    res += stripper.process(' 5 is true');
    res += stripper.flush();
    expect(res).toBe('2 < 5 is true');
  });

  it('discards unclosed think block at stream end', () => {
    const stripper = createThinkStripper();
    let res = '';
    res += stripper.process('Answer: <think>still going...');
    res += stripper.flush();
    expect(res).toBe('Answer: ');
  });
});

describe('stripSafetyTags', () => {
  it('strips User Safety: safe prefaces', async () => {
    const { stripSafetyTags } = await import('@/lib/ai/stream');
    expect(stripSafetyTags('User Safety: safe\n\nHere is your financial advice.')).toBe(
      'Here is your financial advice.'
    );
    expect(stripSafetyTags('Safety: safe\nOverview of budget')).toBe('Overview of budget');
    expect(stripSafetyTags('User Safety: safe')).toBe('');
    expect(stripSafetyTags('Normal response without tags')).toBe('Normal response without tags');
  });
});

describe('streamChat', () => {
  const mockFetch = vi.mocked(fetchSecure);

  const openRouterProvider: ResolvedProvider = {
    providerId: 'prov-1',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'meta/llama-3:free',
    fallbacks: ['mistral/mistral-7b:free'],
    apiKey: 'sk-or-test',
    host: 'openrouter.ai',
    isOpenRouter: true,
  };

  const genericProvider: ResolvedProvider = {
    providerId: 'prov-2',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    fallbacks: [],
    apiKey: 'sk-test',
    host: 'api.openai.com',
    isOpenRouter: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends reasoning.exclude and models on OpenRouter', async () => {
    const sseResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(sseResponse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );

    const tokens: string[] = [];
    for await (const event of streamChat({
      provider: openRouterProvider,
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      if (event.type === 'text') tokens.push(event.text);
    }

    expect(tokens.join('')).toBe('Hi');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.reasoning).toEqual({ exclude: true });
    expect(body.models).toEqual(['meta/llama-3:free', 'mistral/mistral-7b:free']);
  });

  it('sends enable_thinking: false on non-OpenRouter backends', async () => {
    const sseResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello!"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(sseResponse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );

    for await (const _ of streamChat({
      provider: genericProvider,
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      // consume
    }

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.enable_thinking).toBe(false);
    expect(body.reasoning).toBeUndefined();
  });

  it('handles non-streaming JSON responses gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: 'Non-streaming response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    const events: any[] = [];
    for await (const event of streamChat({
      provider: genericProvider,
      messages: [{ role: 'user', content: 'test' }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'meta', servedModel: 'gpt-4o-mini' },
      { type: 'usage', promptTokens: 10, completionTokens: 5 },
      { type: 'text', text: 'Non-streaming response' },
    ]);
  });

  it('throws typed provider_rate_limited error on 429 after retries', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '1' },
        })
    );

    await expect(async () => {
      for await (const _ of streamChat({
        provider: genericProvider,
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }
    }).rejects.toThrowError(AiClientError);

    try {
      for await (const _ of streamChat({
        provider: genericProvider,
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }
    } catch (err: any) {
      expect(err.code).toBe('provider_rate_limited');
      expect(err.status).toBe(429);
    }
  });

  it('automatically fails over to fallback model on 429 rate limit', async () => {
    // 1st call for primary model (meta/llama-3:free) returns 429
    mockFetch.mockResolvedValueOnce(
      new Response('Rate limit reached', { status: 429 })
    );

    // 2nd call for fallback model (mistral/mistral-7b:free) succeeds
    const sseResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Recovered from fallback model!"}}]}\n\n')
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(sseResponse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );

    const tokens: string[] = [];
    const metaList: any[] = [];
    for await (const ev of streamChat({
      provider: openRouterProvider,
      messages: [{ role: 'user', content: 'test rate limit failover' }],
    })) {
      if (ev.type === 'text') tokens.push(ev.text);
      if (ev.type === 'meta') metaList.push(ev);
    }

    expect(tokens.join('')).toBe('Recovered from fallback model!');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(secondCallBody.model).toBe('mistral/mistral-7b:free');
    expect(metaList.some((m) => m.servedModel === 'mistral/mistral-7b:free')).toBe(true);
  });

  it('throws typed provider_auth on 401 without retry', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );

    try {
      for await (const _ of streamChat({
        provider: genericProvider,
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('provider_auth');
      expect(err.status).toBe(401);
      // Auth errors are not retryable
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('throws typed provider_not_found on 404', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Model not found', { status: 404 })
    );

    try {
      for await (const _ of streamChat({
        provider: genericProvider,
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('provider_not_found');
      expect(err.status).toBe(404);
    }
  });

  it('throws empty_response if stream ends with no text', async () => {
    const sseResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(sseResponse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );

    try {
      for await (const _ of streamChat({
        provider: genericProvider,
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('empty_response');
    }
  });
});
