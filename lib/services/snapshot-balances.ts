import { accountSnapshots } from '@/lib/db/schema';
import { eq, and, lte, sql, inArray, or } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';

export async function getBalancesOnDate(
  db: any,
  userId: string,
  targetDate: string,
  accountIds: string[],
  dek: Uint8Array
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};

  const latestDates = await db
    .select({
      accountId: accountSnapshots.accountId,
      maxDate: sql<string>`max(${accountSnapshots.snapshotDate})`,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.userId, userId),
      lte(accountSnapshots.snapshotDate, targetDate),
      inArray(accountSnapshots.accountId, accountIds)
    ))
    .groupBy(accountSnapshots.accountId);

  if (latestDates.length === 0) return {};

  const conditions = latestDates.map((ld: any) =>
    and(
      eq(accountSnapshots.accountId, ld.accountId),
      eq(accountSnapshots.snapshotDate, ld.maxDate)
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
