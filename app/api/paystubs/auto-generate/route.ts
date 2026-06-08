import { auth } from 'auth';
import { getDb } from '@/lib/db';
import {
  paystubAutoGenerateSettings,
  paystubFieldMappings,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { runAutoGenerate } from '@/lib/services/paystub-auto-generate';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const result = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(eq(paystubAutoGenerateSettings.userId, dataUserId));

  return Response.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { mappingId, isEnabled, frequency, basePaystubId } = body;

  if (!mappingId) {
    return Response.json({ error: 'mappingId is required' }, { status: 400 });
  }

  // Check if setting already exists for this user + mapping
  const [existing] = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(
      and(
        eq(paystubAutoGenerateSettings.userId, dataUserId),
        eq(paystubAutoGenerateSettings.mappingId, mappingId)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (frequency !== undefined) updates.frequency = frequency;
    if (basePaystubId !== undefined) updates.basePaystubId = basePaystubId;

    const [updated] = await db
      .update(paystubAutoGenerateSettings)
      .set(updates)
      .where(eq(paystubAutoGenerateSettings.id, existing.id))
      .returning();

    return Response.json(updated);
  }

  // Create new
  const [created] = await db
    .insert(paystubAutoGenerateSettings)
    .values({
      userId: dataUserId,
      mappingId,
      isEnabled: isEnabled ?? false,
      frequency: frequency || 'biweekly',
      basePaystubId: basePaystubId || null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}



export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';
  const generated = await runAutoGenerate(userId, dek, dataUserId, force);

  return Response.json({ generated });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(paystubAutoGenerateSettings)
    .where(
      and(
        eq(paystubAutoGenerateSettings.id, id),
        eq(paystubAutoGenerateSettings.userId, dataUserId),
      )
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'Setting not found' }, { status: 404 });
  }

  await db
    .delete(paystubAutoGenerateSettings)
    .where(eq(paystubAutoGenerateSettings.id, id));

  return Response.json({ success: true });
}
