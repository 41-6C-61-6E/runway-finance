import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { accounts } from './db/schema';
import { getEffectiveRole } from './utils/require-auth';

/**
 * Ids of the given data owner's accounts flagged `sensitive`,
 * which are hidden from plain sharing members.
 */
export async function getSensitiveAccountIds(dataUserId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, dataUserId), eq(accounts.sensitive, true)));
  return rows.map((r) => r.id);
}

/**
 * Account ids that must be excluded from the given user's data queries.
 * Non-member roles (primary/admin) see everything; plain members lose
 * the owner's sensitive accounts.
 */
export async function getHiddenAccountIdsForUser(
  userId: string,
  dataUserId: string
): Promise<string[]> {
  const role = await getEffectiveRole(userId);
  if (role !== 'member') return [];
  return getSensitiveAccountIds(dataUserId);
}

/**
 * True when `accountId` is one of the data owner's sensitive accounts and the
 * requesting user is a plain sharing member (i.e. the account is hidden from them).
 */
export async function isAccountHiddenFromUser(
  userId: string,
  dataUserId: string,
  accountId: string | null
): Promise<boolean> {
  if (!accountId) return false;
  const [account] = await getDb()
    .select({ sensitive: accounts.sensitive })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, dataUserId)))
    .limit(1);
  if (!account?.sensitive) return false;
  const role = await getEffectiveRole(userId);
  return role === 'member';
}
