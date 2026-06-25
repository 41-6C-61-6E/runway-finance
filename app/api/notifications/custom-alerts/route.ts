import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { customAlertRules } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(eq(customAlertRules.userId, session.user.id))
      .orderBy(desc(customAlertRules.createdAt));

    return Response.json({ rules });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, triggerType, criteria, isEnabled } = body;

    if (!name || !triggerType || !criteria) {
      return Response.json({ error: 'Name, trigger type, and criteria are required' }, { status: 400 });
    }

    const db = getDb();
    const [newRule] = await db
      .insert(customAlertRules)
      .values({
        userId: session.user.id,
        name,
        triggerType,
        criteria,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
      })
      .returning();

    return Response.json({ rule: newRule });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
