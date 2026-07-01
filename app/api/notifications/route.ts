import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { userNotifications } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

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

    return Response.json(
      { notifications: list },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    logger.error('GET /api/notifications error:', err);
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
    logger.error('POST /api/notifications error:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    await db
      .delete(userNotifications)
      .where(eq(userNotifications.userId, session.user.id));

    logger.info('DELETE /api/notifications - cleared all notifications', {
      userId: session.user.id,
    });

    return Response.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/notifications error:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
