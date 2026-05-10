import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  let settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settings || settings.length === 0) {
    // Create default settings if none exist
    const [created] = await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode ?? false,
    });
  }

  return Response.json({
    privacyMode: settings[0].privacyMode,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const privacyMode = body.privacyMode;

  if (typeof privacyMode !== 'boolean') {
    return Response.json({ error: 'Invalid privacyMode value' }, { status: 400 });
  }

  const db = getDb();

  let settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settings || settings.length === 0) {
    const [created] = await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
        privacyMode,
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode,
    });
  }

  const [updated] = await db
    .update(userSettings)
    .set({ privacyMode, updatedAt: new Date() })
    .where(eq(userSettings.userId, session.user.id))
    .returning();

  return Response.json({
    privacyMode: updated.privacyMode,
  });
}
