import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { aiProviders } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { seedUserAiProviders, readEnvProvider } from '@/lib/db/seed-ai-providers';
import { validateEndpointUrl } from '@/lib/utils/ssrf';
import { isMaskedKey, normalizeEndpoint, parseStoredFallbacks, sanitizeFallbacks } from '@/lib/ai/openai-compat';

/**
 * Singular AI provider for the current user.
 * The table is retained for storage compat, but the API enforces one row:
 * prefer the active row, else the oldest. Extras are cleaned up on PUT.
 */
async function getSingleProvider(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, userId))
    .orderBy(asc(aiProviders.createdAt))
    .limit(10);
  if (!rows.length) return null;
  return rows.find((r) => r.isActive) ?? rows[0];
}

function toShape(row: any, hasApiKey: boolean) {
  return {
    endpoint: row.endpoint,
    model: row.model,
    fallbackModels: parseStoredFallbacks(row.fallbackModels),
    hasApiKey,
    updatedAt: row.updatedAt ?? null,
    managed: !!readEnvProvider(),
  };
}

export async function GET() {
  await cookies();
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = getDb();
  const dek = await getSessionDEK();

  try {
    await seedUserAiProviders(session.user.id, dek);
  } catch (err) {
    logger.error('[api/ai/provider] Failed to seed on GET', { error: String(err) });
  }

  const row = await getSingleProvider(session.user.id);
  if (!row) {
    return NextResponse.json({ endpoint: '', model: '', fallbackModels: [], hasApiKey: false, updatedAt: null, managed: !!readEnvProvider() });
  }

  let hasApiKey = false;
  if (row.apiKeyEncrypted) {
    try {
      hasApiKey = !!(await decryptField(row.apiKeyEncrypted, dek));
    } catch {
      /* treat as no key */
    }
  }
  return NextResponse.json(toShape(row, hasApiKey));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; model?: string; apiKey?: string; fallbackModels?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const endpointRaw = (body.endpoint ?? '').trim();
  const model = (body.model ?? '').trim();
  if (!endpointRaw || !model) {
    return NextResponse.json({ error: 'endpoint and model are required' }, { status: 400 });
  }

  // When the deployment enforces a provider via env, endpoint/model/key
  // always come from env. Fallbacks come from env when set, else the body.
  const envProvider = readEnvProvider();
  const effectiveEndpointRaw = envProvider ? envProvider.endpoint : endpointRaw;
  const effectiveModel = envProvider ? envProvider.model : model;
  if (envProvider?.apiKey) {
    body.apiKey = envProvider.apiKey;
  }
  const effectiveFallbacks = sanitizeFallbacks(
    effectiveModel,
    envProvider?.fallbacks !== undefined ? envProvider.fallbacks : body.fallbackModels ?? []
  );

  const validated = await validateEndpointUrl(effectiveEndpointRaw);
  if (!validated.ok) {
    return NextResponse.json({ error: `Invalid endpoint URL: ${validated.error}` }, { status: 400 });
  }
  const endpoint = normalizeEndpoint(validated.url.toString());

  const db = getDb();
  const dek = await getSessionDEK();
  const existing = await getSingleProvider(session.user.id);

  let apiKeyEncrypted: string | null | undefined;
  if (body.apiKey !== undefined) {
    const trimmed = body.apiKey.trim();
    if (trimmed === '' || isMaskedKey(trimmed)) {
      apiKeyEncrypted = undefined; // keep current
    } else {
      apiKeyEncrypted = await encryptField(trimmed, dek);
    }
  }

  try {
    if (!existing) {
      const [created] = await db
        .insert(aiProviders)
        .values({
          userId: session.user.id,
          name: envProvider?.name ?? 'Default',
          endpoint,
          model: effectiveModel,
          apiKeyEncrypted: apiKeyEncrypted ?? null,
          isActive: true,
          fallbackModels: effectiveFallbacks.length > 0 ? JSON.stringify(effectiveFallbacks) : null,
        })
        .returning();
      logger.info('[api/ai/provider] Created single provider', { userId: session.user.id });
      return NextResponse.json(toShape(created, !!created.apiKeyEncrypted));
    }

    const updates: Record<string, any> = {
      endpoint,
      model: effectiveModel,
      isActive: true,
      updatedAt: new Date(),
      fallbackModels: effectiveFallbacks.length > 0 ? JSON.stringify(effectiveFallbacks) : null,
    };
    if (envProvider) updates.name = envProvider.name;
    if (apiKeyEncrypted !== undefined) updates.apiKeyEncrypted = apiKeyEncrypted;

    const [updated] = await db
      .update(aiProviders)
      .set(updates)
      .where(eq(aiProviders.id, existing.id))
      .returning();

    // Clean up legacy extra rows so only one remains.
    try {
      const all = await db
        .select({ id: aiProviders.id })
        .from(aiProviders)
        .where(eq(aiProviders.userId, session.user.id))
        .limit(50);
      const extras = all.map((r) => r.id).filter((id) => id !== existing.id);
      for (const id of extras) {
        await db.delete(aiProviders).where(eq(aiProviders.id, id));
      }
    } catch (err) {
      logger.warn('[api/ai/provider] Failed to clean legacy rows', { error: String(err) });
    }

    let hasApiKey = false;
    if (updated.apiKeyEncrypted) {
      try {
        hasApiKey = !!(await decryptField(updated.apiKeyEncrypted, dek));
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(toShape(updated, hasApiKey));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    logger.error('[api/ai/provider] Failed to save provider', { userId: session.user.id, error: message });
    return NextResponse.json({ error: 'Failed to save provider' }, { status: 500 });
  }
}
