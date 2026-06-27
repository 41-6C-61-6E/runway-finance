import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { customAlertRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const ALLOWED_TRIGGER_TYPES = ['transaction', 'account_balance', 'savings_goal', 'cash_flow'] as const;
type TriggerType = typeof ALLOWED_TRIGGER_TYPES[number];

const TRIGGER_FIELDS: Record<TriggerType, string[]> = {
  transaction: ['account', 'amount_min', 'amount_max', 'keyword'],
  account_balance: ['balance_above_value', 'balance_below_value', 'balance_above_account', 'balance_below_account'],
  savings_goal: ['goal_reached_percentage', 'goal_reached_amount'],
  cash_flow: ['cf_net_savings_below', 'cf_net_savings_above', 'cf_savings_rate_below', 'cf_savings_rate_above'],
};

function validateConditionsForTrigger(conditions: any[], triggerType: TriggerType): string | null {
  const validFields = TRIGGER_FIELDS[triggerType];
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    if (!cond || typeof cond !== 'object') return `Condition ${i + 1} is malformed.`;
    if (!cond.field || !validFields.includes(cond.field)) {
      return `Condition ${i + 1} has an invalid field "${cond.field}" for trigger type "${triggerType}". Valid fields: ${validFields.join(', ')}.`;
    }
  }
  return null;
}

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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  const { name, criteria, isEnabled, conditions, conditionOperator, conditionTree } = body;

  // ── Validation ─────────────────────────────────────────────────────────
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Rule name cannot be empty.' }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return Response.json({ error: 'Rule name must be 100 characters or fewer.' }, { status: 400 });
    }
  }

  // If conditions are being updated, validate them against the rule's current trigger type
  if (conditions !== undefined && Array.isArray(conditions) && conditions.length > 0) {
    try {
      const { id } = await params;
      const db = getDb();
      const [existing] = await db
        .select({ triggerType: customAlertRules.triggerType })
        .from(customAlertRules)
        .where(and(eq(customAlertRules.id, id), eq(customAlertRules.userId, session.user.id)))
        .limit(1);

      if (existing && ALLOWED_TRIGGER_TYPES.includes(existing.triggerType as TriggerType)) {
        const validationError = validateConditionsForTrigger(conditions, existing.triggerType as TriggerType);
        if (validationError) return Response.json({ error: validationError }, { status: 400 });
      }
    } catch (lookupErr) {
      console.error('[custom-alerts] Failed to fetch rule for validation:', lookupErr);
    }
  }

  try {
    const { id } = await params;
    const db = getDb();

    // Build update object based on provided fields
    const updateFields: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateFields.name = name.trim();
    if (criteria !== undefined) updateFields.criteria = criteria;
    if (isEnabled !== undefined) updateFields.isEnabled = Boolean(isEnabled);
    if (conditions !== undefined) updateFields.conditions = conditions;
    if (conditionOperator !== undefined) updateFields.conditionOperator = conditionOperator;
    if (conditionTree !== undefined) updateFields.conditionTree = conditionTree;

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
      return Response.json({ error: 'Alert rule not found.' }, { status: 404 });
    }

    return Response.json({ rule: updatedRule });
  } catch (err: any) {
    console.error('[custom-alerts] Failed to update custom alert rule:', err);
    const message = err?.code === '23502'
      ? 'A required field is missing. Please check your rule configuration and try again.'
      : 'Failed to update alert rule. Please try again.';
    return Response.json({ error: message }, { status: 500 });
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
      return Response.json({ error: 'Alert rule not found.' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err: any) {
    console.error('[custom-alerts] Failed to delete custom alert rule:', err);
    return Response.json({ error: 'Failed to delete alert rule. Please try again.' }, { status: 500 });
  }
}
