import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
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

type RuleAction = {
  categoryId: string | null;
  payee: string | null;
  reviewed: boolean | null;
};

export async function applyRulesToTransactions(
  txns: TransactionData[],
  userId: string,
  dek: Uint8Array
): Promise<Map<string, RuleAction>> {
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

  const results = new Map<string, RuleAction>();

  for (const tx of txns) {
    for (const rule of decryptedRules) {
      const match = evaluateCondition(rule, tx);
      if (match) {
        results.set(tx.id, {
          categoryId: rule.setCategoryId,
          payee: rule.setPayee ?? null,
          reviewed: rule.setReviewed ?? null,
        });
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
