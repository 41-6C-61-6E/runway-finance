import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; model?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' });
  }

  const endpoint = body.endpoint?.replace(/\/$/, '');
  const model = body.model || 'unknown';
  const apiKey = body.apiKey || '';

  if (!endpoint) {
    return NextResponse.json({ ok: false, message: 'No endpoint provided. Enter the URL and try again.' });
  }

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
        messages: [{ role: 'user', content: 'Reply with "ok" if you receive this message.' }],
        max_tokens: 10,
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

    return NextResponse.json({ ok: true, message: `Connected to ${model} at ${endpoint} (${elapsed}ms)` });
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
