import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { userNotifications } from '@/lib/db/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/utils/require-auth';

export const GET = withAuth(async (req, { userId }) => {
  const db = getDb();
  const [list, unread] = await Promise.all([
    db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt))
      .limit(50),
    db
      .select({ n: count() })
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false))),
  ]);
  const unreadCount = unread[0]?.n ?? 0;

  return NextResponse.json(
    { notifications: list, unreadCount },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
});

export const POST = withAuth(async (req, { userId }) => {
  const db = getDb();
  await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(userNotifications.userId, userId));

  return NextResponse.json({ success: true });
});

export const DELETE = withAuth(async (req, { userId }) => {
  const db = getDb();
  await db
    .delete(userNotifications)
    .where(eq(userNotifications.userId, userId));

  logger.info('DELETE /api/notifications - cleared all notifications', {
    userId,
  });

  return NextResponse.json({ success: true });
});
