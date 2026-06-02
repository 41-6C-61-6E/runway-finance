import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accountSnapshots, accounts } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptField, decryptRows } from '../lib/crypto';
import { isAssetAccount } from '../lib/utils/account-scope';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);

  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);
  const assetAccounts = decryptedAccounts.filter(acc => isAssetAccount(acc.type.toLowerCase()) && !acc.isExcludedFromNetWorth && !acc.isHidden);

  const allUserSnaps = await db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.userId, userId))
    .orderBy(asc(accountSnapshots.snapshotDate));

  const balances15 = new Map<string, number>();
  const balances16 = new Map<string, number>();

  const latestByAccount = new Map<string, number>();
  for (const snap of allUserSnaps) {
    const decrypted = dek ? await decryptField(snap.balance, dek) : snap.balance;
    const balance = parseFloat(decrypted) || 0;
    latestByAccount.set(snap.accountId, balance);

    if (snap.snapshotDate === '2023-06-15') {
      for (const acc of assetAccounts) {
        balances15.set(acc.id, latestByAccount.get(acc.id) ?? 0);
      }
    } else if (snap.snapshotDate === '2023-06-16') {
      for (const acc of assetAccounts) {
        balances16.set(acc.id, latestByAccount.get(acc.id) ?? 0);
      }
    }
  }

  console.log('\n--- Account Balances Comparison ---');
  let total15 = 0;
  let total16 = 0;
  for (const acc of assetAccounts) {
    const b15 = balances15.get(acc.id) ?? 0;
    const b16 = balances16.get(acc.id) ?? 0;
    if (b15 !== 0 || b16 !== 0) {
      console.log(`"${acc.name}" (${acc.type}):`);
      console.log(`  June 15: ${b15}`);
      console.log(`  June 16: ${b16}`);
      console.log(`  Diff: ${b16 - b15}`);
      total15 += b15;
      total16 += b16;
    }
  }
  console.log(`Total Assets June 15: ${total15}`);
  console.log(`Total Assets June 16: ${total16}`);
  console.log(`Total Assets Diff: ${total16 - total15}`);

  process.exit(0);
}

run().catch(console.error);
