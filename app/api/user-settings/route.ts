import { auth } from 'auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ACCENT_NAMES } from '@/lib/utils/apply-accent';

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
      accentColor: created?.accentColor ?? 'violet',
    });
  }

  return Response.json({
    privacyMode: settings[0].privacyMode,
    accentColor: settings[0].accentColor ?? 'violet',
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const privacyMode = body.privacyMode;
  const accentColor = body.accentColor;

  if (typeof privacyMode !== 'boolean' && privacyMode !== undefined) {
    return Response.json({ error: 'Invalid privacyMode value' }, { status: 400 });
  }

  if (accentColor !== undefined && !ACCENT_NAMES.includes(accentColor) && !/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
    return Response.json({ error: 'Invalid accentColor value' }, { status: 400 });
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
        accentColor: accentColor ?? 'violet',
      })
      .returning();

    return Response.json({
      privacyMode: created?.privacyMode,
      accentColor: created?.accentColor,
    });
  }

  const updates: Record<string, any> = {};
  if (privacyMode !== undefined) updates.privacyMode = privacyMode;
  if (accentColor !== undefined) updates.accentColor = accentColor;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(userSettings)
    .set(updates)
    .where(eq(userSettings.userId, session.user.id))
    .returning();

  return Response.json({
    privacyMode: updated.privacyMode,
    accentColor: updated.accentColor,
  });
}
