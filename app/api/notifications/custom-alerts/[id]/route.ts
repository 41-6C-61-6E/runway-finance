import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { customAlertRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, criteria, isEnabled, conditions, conditionOperator } = body;

    const db = getDb();
    
    // Build update object based on provided fields
    const updateFields: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateFields.name = name;
    if (criteria !== undefined) updateFields.criteria = criteria;
    if (isEnabled !== undefined) updateFields.isEnabled = isEnabled;
    if (conditions !== undefined) updateFields.conditions = conditions;
    if (conditionOperator !== undefined) updateFields.conditionOperator = conditionOperator;

    const [updatedRule] = await db
      .update(customAlertRules)
      .set(updateFields)
      .where(
        and(
          eq(customAlertRules.id, id),
          eq(customAlertRules.userId, session.user.id)
        )
      )
      .returning();

    if (!updatedRule) {
      return Response.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    return Response.json({ rule: updatedRule });
  } catch (err) {
    console.error('[custom-alerts] Failed to update custom alert rule:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const db = getDb();

    const [deletedRule] = await db
      .delete(customAlertRules)
      .where(
        and(
          eq(customAlertRules.id, id),
          eq(customAlertRules.userId, session.user.id)
        )
      )
      .returning();

    if (!deletedRule) {
      return Response.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[custom-alerts] Failed to delete custom alert rule:', err);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
