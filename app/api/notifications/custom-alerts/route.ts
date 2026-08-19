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

  // R13: validate the full condition tree recursively (structure + field/trigger fit)
  if (hasTree) {
    if (conditionOperator !== undefined && conditionOperator !== 'AND' && conditionOperator !== 'OR') {
      return Response.json({ error: 'conditionOperator must be "AND" or "OR".' }, { status: 400 });
    }
    const treeError = validateConditionTreeInput(conditionTree, triggerType as TriggerType);
    if (treeError) return Response.json({ error: treeError }, { status: 400 });
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
    // R13: removed the dead '23505' (unique-violation) mapping — the
    // custom_alert_rules table has no unique (user_id, name) constraint, so it
    // could never fire. Duplicate names are allowed (matching existing behavior).
    const message = err?.code === '23502'
      ? 'A required field is missing. Please fill in all required fields and try again.'
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

// ── R13: recursive conditionTree validation ───────────────────────────────────
// Rejects malformed rule JSONB at write time so the fail-closed evaluator never
// has to guess. Enforces: operator ∈ {AND,OR}, conditions is an array of known
// fields with number/string values, depth ≤ 3, and no unknown structure.

const CONDITION_VALUE_FIELDS = new Set([
  'account', 'amount_min', 'amount_max', 'keyword',
  'balance_above_value', 'balance_below_value',
  'balance_above_account', 'balance_below_account',
  'goal_reached_percentage', 'goal_reached_amount',
  'cf_net_savings_below', 'cf_net_savings_above',
  'cf_savings_rate_below', 'cf_savings_rate_above',
]);
const MAX_TREE_DEPTH = 3;

function validateSingleCondition(cond: any, path: string): string | null {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
    return `${path} must be a condition object.`;
  }
  if (typeof cond.field !== 'string' || !CONDITION_VALUE_FIELDS.has(cond.field)) {
    return `${path} has an invalid or unknown field "${cond.field}".`;
  }
  // value must be present and be a number or string (keywords/accounts allow string)
  if (cond.value === undefined || cond.value === null) {
    return `${path} is missing a value.`;
  }
  if (typeof cond.value !== 'string' && typeof cond.value !== 'number') {
    return `${path} value must be a string or number.`;
  }
  if (typeof cond.value === 'number' && !Number.isFinite(cond.value)) {
    return `${path} value must be a finite number.`;
  }
  if (cond.compareAccountId !== undefined && typeof cond.compareAccountId !== 'string') {
    return `${path} compareAccountId must be a string.`;
  }
  if (cond.goalId !== undefined && typeof cond.goalId !== 'string') {
    return `${path} goalId must be a string.`;
  }
  if (
    cond.consecutiveMonths !== undefined &&
    (typeof cond.consecutiveMonths !== 'number' || !Number.isInteger(cond.consecutiveMonths) || cond.consecutiveMonths < 1)
  ) {
    return `${path} consecutiveMonths must be a positive integer.`;
  }
  return null;
}

function validateConditionTree(node: any, depth: number, path: string): string | null {
  if (depth > MAX_TREE_DEPTH) {
    return `Condition tree is too deep (max ${MAX_TREE_DEPTH} levels).`;
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return `${path} must be a condition group object.`;
  }
  if (node.operator !== 'AND' && node.operator !== 'OR') {
    return `${path} operator must be "AND" or "OR".`;
  }

  if (node.conditions !== undefined) {
    if (!Array.isArray(node.conditions)) {
      return `${path}.conditions must be an array.`;
    }
    for (let i = 0; i < node.conditions.length; i++) {
      const err = validateSingleCondition(node.conditions[i], `${path}.conditions[${i}]`);
      if (err) return err;
    }
  }

  if (node.subGroups !== undefined) {
    if (!Array.isArray(node.subGroups)) {
      return `${path}.subGroups must be an array.`;
    }
    for (let i = 0; i < node.subGroups.length; i++) {
      const err = validateConditionTree(node.subGroups[i], depth + 1, `${path}.subGroups[${i}]`);
      if (err) return err;
    }
  }

  // A group must contain at least one condition or sub-group to be meaningful.
  const hasConds = Array.isArray(node.conditions) && node.conditions.length > 0;
  const hasSubs = Array.isArray(node.subGroups) && node.subGroups.length > 0;
  if (!hasConds && !hasSubs) {
    return `${path} is empty; add at least one condition.`;
  }

  return null;
}

function validateConditionTreeInput(conditionTree: any, triggerType: TriggerType): string | null {
  const baseErr = validateConditionTree(conditionTree, 1, 'conditionTree');
  if (baseErr) return baseErr;
  // Ensure every leaf field is allowed for the declared trigger type.
  const validFields = TRIGGER_FIELDS[triggerType];
  const walk = (node: any): string | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node.conditions)) {
      for (const cond of node.conditions) {
        if (!validFields.includes(cond?.field)) {
          return `Field "${cond?.field}" is not valid for trigger type "${triggerType}". Valid fields: ${validFields.join(', ')}.`;
        }
      }
    }
    if (Array.isArray(node.subGroups)) {
      for (const sub of node.subGroups) {
        const err = walk(sub);
        if (err) return err;
      }
    }
    return null;
  };
  return walk(conditionTree);
}
