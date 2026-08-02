import { accountSnapshots } from '@/lib/db/schema';
import { eq, and, lte, sql, inArray, or, SQL } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';

async function fetchAggregatedBalances(
  db: any,
  userId: string,
  accountIds: string[],
  dek: Uint8Array,
  aggregateExpr: SQL<string>,
  additionalWhere?: SQL
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};

  const whereConditions = [
    eq(accountSnapshots.userId, userId),
    inArray(accountSnapshots.accountId, accountIds),
  ];

  if (additionalWhere) {
    whereConditions.push(additionalWhere);
  }

  const targetDates = await db
    .select({
      accountId: accountSnapshots.accountId,
      targetDate: aggregateExpr,
    })
    .from(accountSnapshots)
    .where(and(...whereConditions))
    .groupBy(accountSnapshots.accountId);

  if (targetDates.length === 0) return {};

  const conditions = targetDates.map((td: any) =>
    and(
      eq(accountSnapshots.accountId, td.accountId),
      eq(accountSnapshots.snapshotDate, td.targetDate)
    )
  );

  const snaps = await db
    .select({
      accountId: accountSnapshots.accountId,
      balance: accountSnapshots.balance,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.userId, userId),
      or(...conditions)
    ));

  const result: Record<string, number> = {};
  for (const s of snaps) {
    const decrypted = await decryptField(s.balance, dek);
    result[s.accountId] = parseFloat(decrypted) || 0;
  }
  return result;
}

export async function getBalancesOnDate(
  db: any,
  userId: string,
  targetDate: string,
  accountIds: string[],
  dek: Uint8Array
): Promise<Record<string, number>> {
  return fetchAggregatedBalances(
    db,
    userId,
    accountIds,
    dek,
    sql<string>`max(${accountSnapshots.snapshotDate})`,
    lte(accountSnapshots.snapshotDate, targetDate)
  );
}

export async function getEarliestBalances(
  db: any,
  userId: string,
  accountIds: string[],
  dek: Uint8Array
): Promise<Record<string, number>> {
  return fetchAggregatedBalances(
    db,
    userId,
    accountIds,
    dek,
    sql<string>`min(${accountSnapshots.snapshotDate})`
  );
}
