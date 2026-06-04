import { getDb } from '@/lib/db';
import { categoryRules, transactionTags } from '@/lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { decryptRows } from '@/lib/crypto';

const LOG_TAG = '[rules-engine]';

type TransactionData = {
  id: string;
  description: string;
  payee: string | null;
  memo: string | null;
  amount: string;
  categoryId: string | null;
};

export async function applyRulesToTransactions(
  txns: TransactionData[],
  userId: string,
  dek: Uint8Array
): Promise<Map<string, {
  categoryId: string | null;
  payee: string | null;
  reviewed: boolean | null;
  setTagId: string | null;
  overrideExisting: boolean;
  shouldUpdateTags: boolean;
  shouldUpdateCategory: boolean;
}>> {
  const rules = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, userId), eq(categoryRules.isActive, true)))
    .orderBy(asc(categoryRules.priority));

  if (rules.length === 0) {
    logger.debug(`${LOG_TAG} No active rules found`, { userId });
    return new Map();
  }

  const decryptedRules = await decryptRows('category_rules', rules, dek);

  const results = new Map<string, {
  categoryId: string | null;
  payee: string | null;
  reviewed: boolean | null;
  setTagId: string | null;
  overrideExisting: boolean;
  shouldUpdateTags: boolean;
  shouldUpdateCategory: boolean;
}>();

  // Fetch which transactions have existing tags
  const txIds = txns.map((t) => t.id);
  const existingTags = txIds.length > 0
    ? await getDb()
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(inArray(transactionTags.transactionId, txIds))
    : [];
  const txsWithTags = new Set(existingTags.map((t) => t.transactionId));

  for (const tx of txns) {
    for (const rule of decryptedRules) {
      const match = evaluateCondition(rule, tx);
      if (match) {
        const hasTags = txsWithTags.has(tx.id);
        const shouldUpdateCategory = !tx.categoryId || rule.overrideExisting;
        const shouldUpdateTags = rule.setTagId ? (!hasTags || rule.overrideExisting) : false;

        if (shouldUpdateCategory || shouldUpdateTags) {
          results.set(tx.id, {
            categoryId: shouldUpdateCategory ? rule.setCategoryId : tx.categoryId,
            payee: shouldUpdateCategory ? (rule.setPayee ?? null) : tx.payee,
            reviewed: shouldUpdateCategory ? (rule.setReviewed ?? null) : null,
            setTagId: rule.setTagId ?? null,
            overrideExisting: !!rule.overrideExisting,
            shouldUpdateTags,
            shouldUpdateCategory,
          } as any);
        }
        break;
      }
    }
  }

  logger.info(`${LOG_TAG} Rules evaluated`, {
    userId,
    activeRules: decryptedRules.length,
    transactionsToCategorize: txns.length,
    transactionsMatched: results.size,
  });

  return results;
}

export function evaluateCondition(
  rule: typeof categoryRules.$inferSelect,
  tx: TransactionData
): boolean {
  // Use multi-condition format if available, fallback to single condition
  const conditions = (rule.conditions as any[]) && (rule.conditions as any[]).length > 0
    ? (rule.conditions as any[])
    : [{
        field: rule.conditionField,
        operator: rule.conditionOperator,
        value: rule.conditionValue,
        caseSensitive: rule.conditionCaseSensitive,
      }];

  // All conditions must match (AND logic)
  for (const condition of conditions) {
    if (!evaluateSingleCondition(condition, tx)) {
      return false;
    }
  }

  return true;
}

function evaluateSingleCondition(
  condition: any,
  tx: TransactionData
): boolean {
  const fieldValue = getFieldValue(condition.field, tx);
  if (fieldValue === null || fieldValue === undefined) return false;

  const searchValue = condition.value;
  const fieldStr = String(fieldValue);
  const searchStr = condition.caseSensitive ? searchValue : searchValue.toLowerCase();
  const targetStr = condition.caseSensitive ? fieldStr : fieldStr.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return targetStr.includes(searchStr);
    case 'equals':
      return targetStr === searchStr;
    case 'starts_with':
      return targetStr.startsWith(searchStr);
    case 'ends_with':
      return targetStr.endsWith(searchStr);
    case 'regex':
      try {
        const flags = condition.caseSensitive ? '' : 'i';
        return new RegExp(searchValue, flags).test(fieldStr);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function getFieldValue(field: string, tx: TransactionData): string | null {
  switch (field) {
    case 'description':
      return tx.description;
    case 'payee':
      return tx.payee;
    case 'memo':
      return tx.memo;
    case 'amount':
      return tx.amount;
    default:
      return null;
  }
}



function normalizeConditions(rule: {
  conditionField?: string | null;
  conditionOperator?: string | null;
  conditionValue?: string | null;
  conditionCaseSensitive?: boolean | null;
  conditions?: any;
}): Array<{
  field: string;
  operator: string;
  value: string;
  caseSensitive: boolean;
}> {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions.map((c: any) => ({
      field: String(c.field || '').trim(),
      operator: String(c.operator || '').trim(),
      value: String(c.value || '').trim(),
      caseSensitive: !!c.caseSensitive,
    }));
  }
  if (
    rule.conditionField &&
    rule.conditionOperator &&
    rule.conditionValue !== undefined &&
    rule.conditionValue !== null
  ) {
    return [
      {
        field: String(rule.conditionField).trim(),
        operator: String(rule.conditionOperator).trim(),
        value: String(rule.conditionValue).trim(),
        caseSensitive: !!rule.conditionCaseSensitive,
      },
    ];
  }
  return [];
}

function conditionsEqual(a: Array<{
  field: string;
  operator: string;
  value: string;
  caseSensitive: boolean;
}>, b: Array<{
  field: string;
  operator: string;
  value: string;
  caseSensitive: boolean;
}>): boolean {
  if (a.length !== b.length) return false;

  const matchedIndices = new Set<number>();
  for (const condA of a) {
    let found = false;
    for (let i = 0; i < b.length; i++) {
      if (matchedIndices.has(i)) continue;
      const condB = b[i];
      if (
        condA.field === condB.field &&
        condA.operator === condB.operator &&
        condA.caseSensitive === condB.caseSensitive
      ) {
        const valA = condA.caseSensitive ? condA.value : condA.value.toLowerCase();
        const valB = condB.caseSensitive ? condB.value : condB.value.toLowerCase();
        if (valA === valB) {
          matchedIndices.add(i);
          found = true;
          break;
        }
      }
    }
    if (!found) return false;
  }
  return true;
}

export async function findDuplicateRule(
  userId: string,
  dek: Uint8Array,
  newRule: {
    conditionField?: string | null;
    conditionOperator?: string | null;
    conditionValue?: string | null;
    conditionCaseSensitive?: boolean | null;
    conditions?: any[];
    setCategoryId: string | null;
    setTagId?: string | null;
    setPayee?: string | null;
    setReviewed?: boolean | null;
    overrideExisting?: boolean | null;
  }
): Promise<any | null> {
  const dbRules = await getDb()
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId));

  if (dbRules.length === 0) return null;

  const decryptedRules = await decryptRows('category_rules', dbRules.map(r => ({ ...r })), dek);
  const newNorm = normalizeConditions(newRule);

  if (newNorm.length === 0) return null;

  for (let i = 0; i < decryptedRules.length; i++) {
    const rule = decryptedRules[i];
    const ruleNorm = normalizeConditions(rule);
    if (!conditionsEqual(newNorm, ruleNorm)) continue;

    // Check actions
    const categoryMatch = (rule.setCategoryId || null) === (newRule.setCategoryId || null);
    const tagMatch = (rule.setTagId || null) === (newRule.setTagId || null);
    const payeeMatch = (rule.setPayee?.trim() || null) === (newRule.setPayee?.trim() || null);
    const reviewedMatch = (rule.setReviewed ?? null) === (newRule.setReviewed ?? null);
    const overrideMatch = !!rule.overrideExisting === !!newRule.overrideExisting;

    if (categoryMatch && tagMatch && payeeMatch && reviewedMatch && overrideMatch) {
      return dbRules[i];
    }
  }

  return null;
}

