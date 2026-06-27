import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { userNotifications } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();
    
    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(userNotifications.id, id),
          eq(userNotifications.userId, session.user.id)
        )
      );

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
