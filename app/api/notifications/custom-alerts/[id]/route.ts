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

// ── R13: recursive conditionTree validation (mirrors the create route) ────────
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

  // R13: validate conditionTree / conditionOperator (if provided) against the
  // rule's current trigger type, same as the flat `conditions` path above.
  const treeBeingUpdated = conditionTree !== undefined && conditionTree !== null;
  if (treeBeingUpdated || conditionOperator !== undefined) {
    if (conditionOperator !== undefined && conditionOperator !== 'AND' && conditionOperator !== 'OR') {
      return Response.json({ error: 'conditionOperator must be "AND" or "OR".' }, { status: 400 });
    }
    try {
      const { id } = await params;
      const db = getDb();
      const [existing] = await db
        .select({ triggerType: customAlertRules.triggerType })
        .from(customAlertRules)
        .where(and(eq(customAlertRules.id, id), eq(customAlertRules.userId, session.user.id)))
        .limit(1);

      if (existing && ALLOWED_TRIGGER_TYPES.includes(existing.triggerType as TriggerType)) {
        if (treeBeingUpdated) {
          const treeError = validateConditionTreeInput(conditionTree, existing.triggerType as TriggerType);
          if (treeError) return Response.json({ error: treeError }, { status: 400 });
        }
      }
    } catch (lookupErr) {
      console.error('[custom-alerts] Failed to fetch rule for tree validation:', lookupErr);
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
