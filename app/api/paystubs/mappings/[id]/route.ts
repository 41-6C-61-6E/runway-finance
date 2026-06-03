import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { paystubFieldMappings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const db = getDb();
  const { id } = await params;

  const [mapping] = await db
    .select()
    .from(paystubFieldMappings)
    .where(
      and(
        eq(paystubFieldMappings.id, id),
        eq(paystubFieldMappings.userId, dataUserId)
      )
    )
    .limit(1);

  if (!mapping) {
    return Response.json({ error: 'Mapping not found' }, { status: 404 });
  }

  return Response.json(mapping);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { id } = await params;

  // Verify ownership
  const [existing] = await db
    .select()
    .from(paystubFieldMappings)
    .where(
      and(
        eq(paystubFieldMappings.id, id),
        eq(paystubFieldMappings.userId, dataUserId)
      )
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'Mapping not found' }, { status: 404 });
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.employerName !== undefined) updates.employerName = body.employerName;
  if (body.mappings !== undefined) updates.mappings = body.mappings;
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
  if (body.accountId !== undefined) updates.accountId = body.accountId;
  if (body.tagId !== undefined) updates.tagId = body.tagId;

  // If setting as default, unset all other defaults for this user
  if (body.isDefault === true) {
    await db
      .update(paystubFieldMappings)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(paystubFieldMappings.userId, dataUserId),
          eq(paystubFieldMappings.isDefault, true)
        )
      );
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(paystubFieldMappings)
    .set(updates)
    .where(eq(paystubFieldMappings.id, id))
    .returning();

  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const db = getDb();
  const { id } = await params;

  // Verify ownership
  const [existing] = await db
    .select()
    .from(paystubFieldMappings)
    .where(
      and(
        eq(paystubFieldMappings.id, id),
        eq(paystubFieldMappings.userId, dataUserId)
      )
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'Mapping not found' }, { status: 404 });
  }

  await db.delete(paystubFieldMappings).where(eq(paystubFieldMappings.id, id));

  return Response.json({ success: true });
}
