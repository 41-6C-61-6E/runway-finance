import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { userNotifications } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/utils/require-auth';

export const GET = withAuth(async (req, { userId }) => {
  const db = getDb();
  const list = await db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.userId, userId))
    .orderBy(desc(userNotifications.createdAt))
    .limit(50);

  return NextResponse.json(
    { notifications: list },
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
