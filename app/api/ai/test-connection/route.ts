import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

  const settings = await getDb()
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings.length || !settings[0].aiEndpoint) {
    return NextResponse.json({ error: 'AI endpoint not configured' }, { status: 400 });
  }

  const endpoint = settings[0].aiEndpoint.replace(/\/$/, '');
  const model = settings[0].aiModel || 'unknown';

  // Decrypt API key
  const dek = await getSessionDEK();
  let apiKey = '';
  if (settings[0].apiKeys) {
    try {
      const decrypted = await decryptField(settings[0].apiKeys, dek);
      const parsed = JSON.parse(decrypted);
      apiKey = parsed.aiApiKey ?? '';
    } catch { /* no key */ }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with "ok" if you receive this message.' }],
        max_tokens: 10,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        ok: false,
        message: `API returned ${res.status}: ${text.slice(0, 200)}`,
      });
    }

    return NextResponse.json({ ok: true, message: `Connected to ${model} at ${endpoint}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    logger.error('AI connection test failed', { userId, endpoint, error: message });
    return NextResponse.json({ ok: false, message });
  }
}
