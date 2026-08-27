import { getDb } from '@/lib/db';
import { categoryRules, transactionTags } from '@/lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { decryptRows } from '@/lib/crypto';

const LOG_TAG = '[rules-engine]';

/**
 * M-4 (2026-08-27 security review): user-supplied regex conditions are
 * evaluated for EVERY transaction in the household. A pathological pattern
 * (nested quantifiers, deep alternation) can hang the shared worker with a
 * multi-second backtracking — cross-tenant DoS. We therefore:
 *   - reject known catastrophic-backtracking shapes at validation time
 *     (exported so write paths can use it too), and
 *   - enforce a hard length cap at evaluation time (defense in depth for
 *     rules created before the validator existed).
 */
const MAX_RULE_REGEX_LENGTH = 120;

function hasCatastrophicShape(pattern: string): boolean {
  // Per-depth flags for group bodies: has an inner quantifier or a nested
  // group. A group is "repeated" when closed by +, * or { — if its body
  // then contains any quantifier or nested group, backtracking can be
  // super-linear (classic ReDoS shapes: (a+)+, (a*)*, (a{1,})+, ((a+))+,
  // (a+b+)*, ...). This scan is linear and never backtracks itself.
  const stack: { hasQuant: boolean; hasGroup: boolean }[] = [
    { hasQuant: false, hasGroup: false },
  ];
  let inClass = false;
  let escaped = false;
  const isQuant = (c: string) => c === '+' || c === '*' || c === '{';

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (inClass) { if (ch === ']') inClass = false; continue; }
    if (ch === '[') { inClass = true; continue; }

    if (ch === '(') {
      stack.push({ hasQuant: false, hasGroup: false });
    } else if (ch === ')') {
      if (stack.length <= 1) return false; // malformed; RegExp ctor catches it
      const closed = stack.pop()!;
      const next = pattern[i + 1];
      const repeated = next === '+' || next === '*' || next === '{';
      if (repeated && (closed.hasQuant || closed.hasGroup)) return true;
      const parent = stack[stack.length - 1];
      parent.hasGroup = true; // any nested group flags the enclosing body
      if (repeated || closed.hasQuant) parent.hasQuant = true;
    } else if (isQuant(ch) && stack.length > 1) {
      stack[stack.length - 1].hasQuant = true;
    }
  }
  return false;
}

/**
 * True when the pattern contains a quantified (repeated) group whose body
 * itself contains a quantifier or a nested group — the classic
 * catastrophic-backtracking shape.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  return hasCatastrophicShape(pattern);
}

export function isSafeUserRegex(pattern: string): boolean {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_RULE_REGEX_LENGTH) {
    return false;
  }
  // Must at least be a constructible regex.
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  // Reject nested quantifiers such as (a+)+ or ((a+))+.
  if (hasCatastrophicShape(pattern)) return false;
  return true;
}

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
    .orderBy(asc(categoryRules.priority), asc(categoryRules.createdAt), asc(categoryRules.id));

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

  const searchValue = String(condition.value ?? '');
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
        if (!isSafeUserRegex(searchValue)) return false;
        const flags = condition.caseSensitive ? '' : 'i';
        return new RegExp(searchValue, flags).test(fieldStr);
      } catch {
        return false;
      }
    case 'gt':
    case 'greater_than': {
      const numField = parseFloat(fieldStr.replace(/[^\d.-]/g, ''));
      const numSearch = parseFloat(searchValue.replace(/[^\d.-]/g, ''));
      if (isNaN(numField) || isNaN(numSearch)) return false;
      return (condition.field === 'amount' ? Math.abs(numField) : numField) > (condition.field === 'amount' ? Math.abs(numSearch) : numSearch);
    }
    case 'lt':
    case 'less_than': {
      const numField = parseFloat(fieldStr.replace(/[^\d.-]/g, ''));
      const numSearch = parseFloat(searchValue.replace(/[^\d.-]/g, ''));
      if (isNaN(numField) || isNaN(numSearch)) return false;
      return (condition.field === 'amount' ? Math.abs(numField) : numField) < (condition.field === 'amount' ? Math.abs(numSearch) : numSearch);
    }
    case 'gte':
    case 'greater_than_or_equal': {
      const numField = parseFloat(fieldStr.replace(/[^\d.-]/g, ''));
      const numSearch = parseFloat(searchValue.replace(/[^\d.-]/g, ''));
      if (isNaN(numField) || isNaN(numSearch)) return false;
      return (condition.field === 'amount' ? Math.abs(numField) : numField) >= (condition.field === 'amount' ? Math.abs(numSearch) : numSearch);
    }
    case 'lte':
    case 'less_than_or_equal': {
      const numField = parseFloat(fieldStr.replace(/[^\d.-]/g, ''));
      const numSearch = parseFloat(searchValue.replace(/[^\d.-]/g, ''));
      if (isNaN(numField) || isNaN(numSearch)) return false;
      return (condition.field === 'amount' ? Math.abs(numField) : numField) <= (condition.field === 'amount' ? Math.abs(numSearch) : numSearch);
    }
    case 'eq_numeric':
    case 'equals_numeric': {
      const numField = parseFloat(fieldStr.replace(/[^\d.-]/g, ''));
      const numSearch = parseFloat(searchValue.replace(/[^\d.-]/g, ''));
      if (isNaN(numField) || isNaN(numSearch)) return false;
      return Math.abs((condition.field === 'amount' ? Math.abs(numField) : numField) - (condition.field === 'amount' ? Math.abs(numSearch) : numSearch)) < 0.001;
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

