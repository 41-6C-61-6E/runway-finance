import 'server-only';
import { eq, desc } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { netWorthSnapshots } from '../schema';

export async function getLatestNetWorthSnapshot(
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [snapshot] = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(desc(netWorthSnapshots.snapshotDate))
    .limit(1);

  return snapshot ?? null;
}

export async function listNetWorthSnapshots(
  userId: string,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  return await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(desc(netWorthSnapshots.snapshotDate));
}

