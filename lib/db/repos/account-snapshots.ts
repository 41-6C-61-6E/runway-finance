import 'server-only';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { accountSnapshots } from '../schema';

export async function listAccountSnapshots(
  accountId: string,
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  return await db
    .select()
    .from(accountSnapshots)
    .where(and(eq(accountSnapshots.accountId, accountId), eq(accountSnapshots.userId, userId)))
    .orderBy(desc(accountSnapshots.snapshotDate));
}

