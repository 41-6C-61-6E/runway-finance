import { getDb } from '@/lib/db';
import { categoryRules } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

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
  userId: string
): Promise<Map<string, RuleAction>> {
  const rules = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, userId), eq(categoryRules.isActive, true)))
    .orderBy(asc(categoryRules.priority));

  if (rules.length === 0) return new Map();

  const results = new Map<string, RuleAction>();

  for (const tx of txns) {
    for (const rule of rules) {
      const match = evaluateCondition(rule, tx);
      if (match) {
        const action: RuleAction = {
          categoryId: rule.setCategoryId,
          payee: rule.setPayee ?? null,
          reviewed: rule.setReviewed ?? null,
        };
        results.set(tx.id, action);
        break;
      }
    }
  }

  return results;
}

function evaluateCondition(
  rule: typeof categoryRules.$inferSelect,
  tx: TransactionData
): boolean {
  const fieldValue = getFieldValue(rule.conditionField, tx);
  if (fieldValue === null || fieldValue === undefined) return false;

  const searchValue = rule.conditionValue;
  const fieldStr = String(fieldValue);
  const searchStr = rule.conditionCaseSensitive ? searchValue : searchValue.toLowerCase();
  const targetStr = rule.conditionCaseSensitive ? fieldStr : fieldStr.toLowerCase();

  switch (rule.conditionOperator) {
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
        const flags = rule.conditionCaseSensitive ? '' : 'i';
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
