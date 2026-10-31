import { getDb } from '@/lib/db';
import { userSettings, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { filterReportableAccounts } from '@/lib/utils/account-scope';

export type DecryptedAccount = typeof accounts.$inferSelect;

export interface FinanceContext {
  userId: string;
  dek: Uint8Array;
  settings: typeof userSettings.$inferSelect;
  now: Date;
  getAccounts(): Promise<DecryptedAccount[]>;
}

export async function buildFinanceContext(args: {
  userId: string;
  dek: Uint8Array;
  now?: Date;
}): Promise<FinanceContext> {
  const { userId, dek, now = new Date() } = args;
  const db = getDb();

  const userSettingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const settings = userSettingsRows[0] ?? ({} as typeof userSettings.$inferSelect);

  let memoizedAccounts: Promise<DecryptedAccount[]> | null = null;

  return {
    userId,
    dek,
    settings,
    now,
    getAccounts() {
      if (!memoizedAccounts) {
        memoizedAccounts = (async () => {
          const userAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, userId));

          const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
          return filterReportableAccounts(decryptedAccounts);
        })();
      }
      return memoizedAccounts;
    },
  };
}
