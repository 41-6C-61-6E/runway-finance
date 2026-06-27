import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { customAlertRules, sentNotifications } from '@/lib/db/schema';
import { eq, and, like, desc } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const db = getDb();

    // Confirm this rule belongs to the user
    const [rule] = await db
      .select({ id: customAlertRules.id })
      .from(customAlertRules)
      .where(and(eq(customAlertRules.id, id), eq(customAlertRules.userId, session.user.id)))
      .limit(1);

    if (!rule) {
      return Response.json({ error: 'Alert rule not found.' }, { status: 404 });
    }

    // Look for the most recent sentNotifications entry with key matching this rule
    const [lastEntry] = await db
      .select({ sentAt: sentNotifications.sentAt })
      .from(sentNotifications)
      .where(
        and(
          eq(sentNotifications.userId, session.user.id),
          like(sentNotifications.key, `custom_%_alert:${id}%`)
        )
      )
      .orderBy(desc(sentNotifications.sentAt))
      .limit(1);

    return Response.json({
      ruleId: id,
      lastFired: lastEntry ? lastEntry.sentAt : null,
    });
  } catch (err: any) {
    console.error('[custom-alerts/last-fired] Error:', err);
    return Response.json({ error: 'Failed to fetch last fired time.' }, { status: 500 });
  }
}
