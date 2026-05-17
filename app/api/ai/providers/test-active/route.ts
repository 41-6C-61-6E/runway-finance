import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProviders, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { prompt?: string } = {};
  try { body = await request.json(); } catch { /* no body */ }

  const db = getDb();
  const dek = await getSessionDEK();

  const settingsRow = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settingsRow.length || !settingsRow[0].aiActiveProviderId) {
    return NextResponse.json({ ok: false, message: 'No active AI provider configured.' });
  }

  const providerId = settingsRow[0].aiActiveProviderId;

  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, providerId))
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ ok: false, message: 'Active provider not found.' });
  }

  const provider = rows[0];
  let apiKey = '';
  if (provider.apiKeyEncrypted) {
    try { apiKey = await decryptField(provider.apiKeyEncrypted, dek); } catch { /* empty */ }
  }

  const endpoint = provider.endpoint.replace(/\/$/, '');
  const model = provider.model;
  const userPrompt = body.prompt || 'Reply with "ok" if you receive this message.';

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const startTime = Date.now();
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 200,
      }),
    });
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text();
      let detail = text.slice(0, 300);
      try { const json = JSON.parse(text); detail = json.error?.message || json.error || json.message || detail; } catch {}
      return NextResponse.json({ ok: false, message: `API returned ${res.status} after ${elapsed}ms: ${detail}` });
    }

    const data = await res.json();
    const responseContent = data.choices?.[0]?.message?.content || '(empty response)';

    return NextResponse.json({
      ok: true,
      message: `Connected to ${model} at ${endpoint} (${elapsed}ms)`,
      response: responseContent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    logger.error('[ai/providers/test-active] Failed', { userId: session.user.id, providerId, error: message });

    let userMessage = message;
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('fetch')) {
      userMessage = `Cannot reach ${endpoint}. Check that the server is running and the URL is correct.`;
    } else if (message.includes('aborted')) {
      userMessage = 'Request timed out.';
    } else if (message.includes('401') || message.includes('Unauthorized')) {
      userMessage = 'Authentication failed. Check the API key.';
    }
    return NextResponse.json({ ok: false, message: userMessage });
  }
}
