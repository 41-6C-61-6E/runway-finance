import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { userNotifications } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const list = await db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, session.user.id))
      .orderBy(desc(userNotifications.createdAt))
      .limit(50);

    return Response.json({ notifications: list });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(userNotifications.userId, session.user.id));

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
