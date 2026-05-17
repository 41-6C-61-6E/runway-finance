import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProviders, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = getDb();
  const dek = await getSessionDEK();
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, session.user.id))
    .orderBy(aiProviders.createdAt);

  const providers = await Promise.all(rows.map(async (row) => {
    let apiKey = '';
    if (row.apiKeyEncrypted) {
      try {
        apiKey = await decryptField(row.apiKeyEncrypted, dek);
      } catch { /* empty */ }
    }
    return {
      id: row.id,
      name: row.name,
      endpoint: row.endpoint,
      model: row.model,
      apiKey,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }));

  return NextResponse.json(providers);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { name?: string; endpoint?: string; model?: string; apiKey?: string; setActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.name || !body.endpoint || !body.model) {
    return NextResponse.json({ error: 'name, endpoint, and model are required' }, { status: 400 });
  }

  const db = getDb();

  // If setActive is true, deactivate all other providers first
  if (body.setActive) {
    try {
      await db
        .update(aiProviders)
        .set({ isActive: false })
        .where(eq(aiProviders.userId, session.user.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database error';
      logger.error('[ai/providers] Failed to deactivate providers', { userId: session.user.id, error: message });
      return NextResponse.json({ error: 'Failed to save provider', detail: message }, { status: 500 });
    }
  }

  const dek = await getSessionDEK();
  const apiKeyEncrypted = body.apiKey ? await encryptField(body.apiKey, dek) : null;

  try {
    const [created] = await db
      .insert(aiProviders)
      .values({
        userId: session.user.id,
        name: body.name,
        endpoint: body.endpoint,
        model: body.model,
        apiKeyEncrypted,
        isActive: body.setActive ?? false,
      })
      .returning();

    logger.info('[ai/providers] Created provider', { userId: session.user.id, providerId: created.id, name: body.name });

    // Update user_settings active provider reference if set as active
    if (body.setActive) {
      await db
        .update(userSettings)
        .set({ aiActiveProviderId: created.id, updatedAt: new Date() })
        .where(eq(userSettings.userId, session.user.id));
    }

    return NextResponse.json({
      id: created.id,
      name: created.name,
      endpoint: created.endpoint,
      model: created.model,
      apiKey: body.apiKey ?? '',
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    logger.error('[ai/providers] Failed to create provider', { userId: session.user.id, error: message });
    return NextResponse.json({ error: 'Failed to save provider', detail: message }, { status: 500 });
  }
}
