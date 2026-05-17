import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProviders, userSettings } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  let body: { name?: string; endpoint?: string; model?: string; apiKey?: string; isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const db = getDb();
  const dek = await getSessionDEK();

  const existing = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, session.user.id)))
    .limit(1);

  if (!existing.length) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.endpoint !== undefined) updates.endpoint = body.endpoint;
  if (body.model !== undefined) updates.model = body.model;
  if (body.apiKey !== undefined) {
    updates.apiKeyEncrypted = body.apiKey ? await encryptField(body.apiKey, dek) : null;
  }
  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
    if (body.isActive) {
      await db
        .update(aiProviders)
        .set({ isActive: false })
        .where(and(eq(aiProviders.userId, session.user.id), ne(aiProviders.id, id)));
      await db
        .update(userSettings)
        .set({ aiActiveProviderId: id, updatedAt: new Date() })
        .where(eq(userSettings.userId, session.user.id));
    } else {
      await db
        .update(userSettings)
        .set({ aiActiveProviderId: null, updatedAt: new Date() })
        .where(eq(userSettings.userId, session.user.id));
    }
  }
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(aiProviders)
    .set(updates)
    .where(eq(aiProviders.id, id))
    .returning();

  logger.info('[ai/providers] Updated provider', { userId: session.user.id, providerId: id });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    endpoint: updated.endpoint,
    model: updated.model,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const existing = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, session.user.id)))
    .limit(1);

  if (!existing.length) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  const wasActive = existing[0].isActive;

  await db.delete(aiProviders).where(eq(aiProviders.id, id));

  // If the deleted provider was active, clear the reference in user_settings
  if (wasActive) {
    await db
      .update(userSettings)
      .set({ aiActiveProviderId: null, updatedAt: new Date() })
      .where(eq(userSettings.userId, session.user.id));
  }

  logger.info('[ai/providers] Deleted provider', { userId: session.user.id, providerId: id });

  return NextResponse.json({ ok: true });
}
