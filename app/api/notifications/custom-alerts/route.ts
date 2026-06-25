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
    const { name, triggerType, criteria, isEnabled, conditions, conditionOperator } = body;

    if (!name || !triggerType) {
      return Response.json({ error: 'Name and trigger type are required' }, { status: 400 });
    }

    // Require either conditions array or legacy criteria
    if ((!conditions || conditions.length === 0) && (!criteria || Object.keys(criteria).length === 0)) {
      return Response.json({ error: 'At least one condition or criteria is required' }, { status: 400 });
    }

    const db = getDb();
    const [newRule] = await db
      .insert(customAlertRules)
      .values({
        userId: session.user.id,
        name,
        triggerType,
        criteria: criteria || {},
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        conditions: conditions && conditions.length > 0 ? conditions : null,
        conditionOperator: conditionOperator || 'AND',
      })
      .returning();

    return Response.json({ rule: newRule });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
