import 'server-only';
import { eq, and, asc } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../index';
import { accounts } from '../schema';
import { decryptRow, decryptRows } from '@/lib/crypto';

export async function getAccountById(
  id: string,
  userId: string,
  dek?: Buffer | null,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) return null;
  if (!dek) return account;
  return await decryptRow('accounts', account, dek);
}

export async function listAccounts(
  userId: string,
  dek?: Buffer | null,
  tx?: DbOrTx
) {
  const db = tx ?? getDb();
  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.name));

  if (!dek) return rawAccounts;
  return await decryptRows('accounts', rawAccounts, dek);
}

export async function deleteAccount(
  id: string,
  userId: string,
  tx?: DbOrTx
): Promise<boolean> {
  const db = tx ?? getDb();
  const result = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));

  return Boolean(result);
}

