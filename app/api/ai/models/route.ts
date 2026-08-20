import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { validateEndpointUrl } from '@/lib/utils/ssrf';

import { getDb } from '@/lib/db';
import { aiProviders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; apiKey?: string; providerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let rawEndpoint = body.endpoint?.replace(/\/$/, '');
  let apiKey = body.apiKey || '';

  // Disregard masked API keys
  if (apiKey && (/^[•*]+$/.test(apiKey) || /\.{3}/.test(apiKey))) {
    apiKey = '';
  }

  if (body.providerId && (!apiKey || !rawEndpoint)) {
    try {
      const db = getDb();
      const dek = await getSessionDEK();
      const rows = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, body.providerId), eq(aiProviders.userId, session.user.id)))
        .limit(1);

      if (rows.length > 0) {
        if (!rawEndpoint) {
          rawEndpoint = rows[0].endpoint.replace(/\/$/, '');
        }
        if (!apiKey && rows[0].apiKeyEncrypted) {
          apiKey = await decryptField(rows[0].apiKeyEncrypted, dek);
        }
      }
    } catch (err) {
      logger.warn('[ai/models] Failed to load credentials for providerId', { providerId: body.providerId, error: String(err) });
    }
  }

  if (!rawEndpoint) {
    return NextResponse.json({ error: 'No endpoint provided' }, { status: 400 });
  }

  const validated = await validateEndpointUrl(rawEndpoint);
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const endpoint = validated.url.toString();
  const basePath = validated.url.pathname.endsWith('/')
    ? validated.url.pathname.slice(0, -1)
    : validated.url.pathname;
  const targetUrl = new URL(`${basePath}/models`, validated.url.origin);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API returned status ${res.status}: ${text}` }, { status: res.status });
    }

    const resData = await res.json();
    let models: string[] = [];
    if (resData && typeof resData === 'object') {
      if (Array.isArray(resData.data)) {
        models = resData.data.map((m: any) => m.id || m.name).filter(Boolean);
      } else if (Array.isArray(resData.models)) {
        models = resData.models.map((m: any) => m.name || m.id).filter(Boolean);
      } else if (Array.isArray(resData)) {
        models = resData.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
      }
    }

    // Sort models alphabetically for better UX
    models.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch models';
    logger.error('Failed to fetch AI models', { endpoint, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
