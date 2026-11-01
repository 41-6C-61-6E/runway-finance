import 'server-only';
import { eq, and } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { budgets } from '../schema';

export async function getBudgetById(
  id: string,
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [budget] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .limit(1);

  return budget ?? null;
}

export async function listBudgets(
  userId: string,
  periodType?: string,
  periodKey?: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const conditions = [eq(budgets.userId, userId)];

  if (periodType) {
    conditions.push(eq(budgets.periodType, periodType));
  }
  if (periodKey) {
    conditions.push(eq(budgets.periodKey, periodKey));
  }

  return await db
    .select()
    .from(budgets)
    .where(and(...conditions));
}

