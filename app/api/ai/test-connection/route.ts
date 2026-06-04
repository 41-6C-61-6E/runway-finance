import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DEFAULT_TEST_PROMPT } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { validateEndpointUrl } from '@/lib/utils/ssrf';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; model?: string; apiKey?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' });
  }

  const rawEndpoint = body.endpoint?.replace(/\/$/, '');
  const model = body.model || 'unknown';
  const apiKey = body.apiKey || '';
  const userPrompt = body.prompt || DEFAULT_TEST_PROMPT;

  if (!rawEndpoint) {
    return NextResponse.json({ ok: false, message: 'No endpoint provided. Enter the URL and try again.' });
  }

  const validated = await validateEndpointUrl(rawEndpoint);
  if ('error' in validated) {
    return NextResponse.json({ ok: false, message: validated.error });
  }

  const endpoint = validated.url.toString().replace(/\/$/, '');

  logger.info('Testing AI connection', { endpoint, model, hasKey: !!apiKey });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const startTime = Date.now();
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond directly and quickly. Do NOT output any thinking, reasoning, explanation, or <think> tags.' },
          { role: 'user', content: userPrompt }
        ],
        chat_id: 'test-connection',
      }),
    });
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text();
      let detail = text.slice(0, 300);
      try {
        const json = JSON.parse(text);
        detail = json.error?.message || json.error || json.message || detail;
      } catch {}
      return NextResponse.json({
        ok: false,
        message: `API returned ${res.status} after ${elapsed}ms: ${detail}`,
      });
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const responseContent = msg?.content || msg?.reasoning || msg?.reasoning_content || '(empty response)';

    return NextResponse.json({
      ok: true,
      message: `Connected to ${model} at ${endpoint} (${elapsed}ms)`,
      response: responseContent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    logger.error('AI connection test failed', { endpoint, error: message });

    let userMessage = message;
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('fetch')) {
      userMessage = `Cannot reach ${endpoint}. Check that the server is running and the URL is correct.`;
    } else if (message.includes('aborted')) {
      userMessage = 'Request timed out. Check that the endpoint is correct and responsive.';
    } else if (message.includes('401') || message.includes('Unauthorized')) {
      userMessage = 'Authentication failed. Check the API key.';
    }
    return NextResponse.json({ ok: false, message: userMessage });
  }
}
