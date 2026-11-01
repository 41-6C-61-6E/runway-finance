import 'server-only';
import { eq, and } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { transactions } from '../schema';
import { decryptRow } from '@/lib/crypto';

export async function getTransactionById(
  id: string,
  userId: string,
  dek?: Buffer | null,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [txRecord] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);

  if (!txRecord) return null;
  if (!dek) return txRecord;
  return await decryptRow('transactions', txRecord, dek);
}

export async function deleteTransaction(
  id: string,
  userId: string,
  tx?: DbOrTx
): Promise<boolean> {
  const db = tx ?? getDb();
  const result = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  return Boolean(result);
}

