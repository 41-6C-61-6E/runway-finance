import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { paystubFieldMappings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const db = getDb();
  const result = await db
    .select()
    .from(paystubFieldMappings)
    .where(eq(paystubFieldMappings.userId, dataUserId));

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

  const { name, employerName, isDefault, mappings, accountId, tagId } = body;

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  // If setting as default, unset all other defaults for this user
  if (isDefault) {
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

  const [created] = await db
    .insert(paystubFieldMappings)
    .values({
      userId: dataUserId,
      name,
      employerName: employerName || '',
      isDefault: isDefault || false,
      mappings: mappings || {},
      accountId: accountId || null,
      tagId: tagId || null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
