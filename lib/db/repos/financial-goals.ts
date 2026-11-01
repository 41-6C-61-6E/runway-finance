import 'server-only';
import { eq, and, asc } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { financialGoals } from '../schema';

export async function getGoalById(
  id: string,
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [goal] = await db
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, userId)))
    .limit(1);

  return goal ?? null;
}

export async function listGoals(
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  return await db
    .select()
    .from(financialGoals)
    .where(eq(financialGoals.userId, userId))
    .orderBy(asc(financialGoals.sortOrder));
}

export async function deleteGoal(
  id: string,
  userId: string,
  tx?: DbOrTx
): Promise<boolean> {
  const db = tx ?? getDb();
  const result = await db
    .delete(financialGoals)
    .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, userId)));

  return Boolean(result);
}

