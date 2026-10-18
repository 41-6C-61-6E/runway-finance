import { getDb } from '@/lib/db';
import { userSettings, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getEffectiveRole } from '@/lib/utils/require-auth';
import { getHiddenAccountIdsForUser } from '@/lib/data-visibility';
import { decryptRows } from '@/lib/crypto';
import { filterReportableAccounts } from '@/lib/utils/account-scope';

export type DecryptedAccount = typeof accounts.$inferSelect;

export interface FinanceContext {
  userId: string;
  dataUserId: string;
  dek: Uint8Array;
  role: 'primary' | 'admin' | 'member';
  hiddenAccountIds: Set<string>;
  settings: typeof userSettings.$inferSelect;
  now: Date;
  getAccounts(): Promise<DecryptedAccount[]>;
}

export async function buildFinanceContext(args: {
  userId: string;
  dataUserId: string;
  dek: Uint8Array;
  now?: Date;
}): Promise<FinanceContext> {
  const { userId, dataUserId, dek, now = new Date() } = args;
  const db = getDb();

  const [userSettingsRows, role, hiddenAccountIdsArray] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    getEffectiveRole(userId),
    getHiddenAccountIdsForUser(userId, dataUserId),
  ]);

  const settings = userSettingsRows[0] ?? ({} as typeof userSettings.$inferSelect);
  const hiddenAccountIds = new Set(hiddenAccountIdsArray);

  let memoizedAccounts: Promise<DecryptedAccount[]> | null = null;

  return {
    userId,
    dataUserId,
    dek,
    role,
    hiddenAccountIds,
    settings,
    now,
    getAccounts() {
      if (!memoizedAccounts) {
        memoizedAccounts = (async () => {
          const userAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, dataUserId));

          const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
          const reportableAccounts = filterReportableAccounts(decryptedAccounts);
          return reportableAccounts.filter((a) => !hiddenAccountIds.has(a.id));
        })();
      }
      return memoizedAccounts;
    },
  };
}
