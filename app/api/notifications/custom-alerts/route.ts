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
    console.error('[custom-alerts] Failed to fetch custom alert rules:', err);
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
    const { name, triggerType, criteria, isEnabled, conditions, conditionOperator, conditionTree } = body;

    if (!name || !triggerType) {
      return Response.json({ error: 'Name and trigger type are required' }, { status: 400 });
    }

    const allowedTriggerTypes = ['transaction', 'account_balance', 'savings_goal', 'cash_flow'];
    if (!allowedTriggerTypes.includes(triggerType)) {
      return Response.json({ error: 'Invalid trigger type. Must be one of: transaction, account_balance, savings_goal, cash_flow' }, { status: 400 });
    }

    // Require conditionTree, conditions array, or legacy criteria
    const hasConditions = conditions && conditions.length > 0;
    const hasTree = conditionTree && (conditionTree.conditions?.length > 0 || conditionTree.subGroups?.length > 0);
    if (!hasTree && !hasConditions && (!criteria || Object.keys(criteria).length === 0)) {
      return Response.json({ error: 'At least one condition, conditionTree, or criteria is required' }, { status: 400 });
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
        conditions: hasConditions ? conditions : null,
        conditionOperator: conditionOperator || 'AND',
        conditionTree: hasTree ? conditionTree : null,
      })
      .returning();

    return Response.json({ rule: newRule });
  } catch (err) {
    console.error('[custom-alerts] Failed to create custom alert rule:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
