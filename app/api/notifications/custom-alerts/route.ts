import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { customAlertRules } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

const ALLOWED_TRIGGER_TYPES = ['transaction', 'account_balance', 'savings_goal', 'cash_flow'] as const;
type TriggerType = typeof ALLOWED_TRIGGER_TYPES[number];

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
  } catch (err: any) {
    console.error('[custom-alerts] Failed to fetch custom alert rules:', err);
    return Response.json(
      { error: 'Failed to load alert rules. Please refresh and try again.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

  const { name, triggerType, criteria, isEnabled, conditions, conditionOperator, conditionTree } = body;

  // ── Validation ─────────────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Rule name is required.' }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return Response.json({ error: 'Rule name must be 100 characters or fewer.' }, { status: 400 });
  }
  if (!triggerType || !ALLOWED_TRIGGER_TYPES.includes(triggerType as TriggerType)) {
    return Response.json(
      { error: `Invalid trigger type. Must be one of: ${ALLOWED_TRIGGER_TYPES.join(', ')}.` },
      { status: 400 }
    );
  }

  const hasConditions = Array.isArray(conditions) && conditions.length > 0;
  const hasTree =
    conditionTree &&
    typeof conditionTree === 'object' &&
    (Array.isArray(conditionTree.conditions)
      ? conditionTree.conditions.length > 0
      : false || (Array.isArray(conditionTree.subGroups) ? conditionTree.subGroups.length > 0 : false));
  const hasCriteria = criteria && typeof criteria === 'object' && Object.keys(criteria).length > 0;

  if (!hasTree && !hasConditions && !hasCriteria) {
    return Response.json({ error: 'At least one condition is required.' }, { status: 400 });
  }

  // Validate that conditions belong to the declared trigger type
  if (hasConditions) {
    const validationError = validateConditionsForTrigger(conditions, triggerType as TriggerType);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
  }

  try {
    const db = getDb();
    const [newRule] = await db
      .insert(customAlertRules)
      .values({
        userId: session.user.id,
        name: name.trim(),
        triggerType,
        criteria: criteria || {},
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
        conditions: hasConditions ? conditions : null,
        conditionOperator: conditionOperator || 'AND',
        conditionTree: hasTree ? conditionTree : null,
      })
      .returning();

    return Response.json({ rule: newRule });
  } catch (err: any) {
    console.error('[custom-alerts] Failed to create custom alert rule:', err);
    const message = err?.code === '23502'
      ? 'A required field is missing. Please fill in all required fields and try again.'
      : err?.code === '23505'
      ? 'A rule with this name already exists.'
      : 'Failed to save alert rule. Please try again.';
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
