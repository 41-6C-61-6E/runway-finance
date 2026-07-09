import 'dotenv/config';
import { getDb } from '../lib/db';
import { accounts, accountSnapshots, transactions, netWorthSnapshots, users } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptField, encryptField } from '../lib/crypto';
import { getServerDEK } from '../lib/crypto-context';
import { formatToCents } from '../lib/services/account-history';

async function main() {
  const db = getDb();
  console.log('Starting financial precision cleanup script...\n');

  const allUsers = await db.select({ username: users.username, email: users.email }).from(users);
  console.log(`Found ${allUsers.length} user(s) in database.\n`);

  let totalAccountsUpdated = 0;
  let totalSnapshotsUpdated = 0;
  let totalTransactionsUpdated = 0;
  let totalNetWorthUpdated = 0;

  for (const user of allUsers) {
    if (!user.username) {
      console.log(`  [Skip] User has no username: email=${user.email}`);
      continue;
    }
    console.log(`Processing user: ${user.username} (Email: ${user.email})...`);
    let dek: Uint8Array;
    try {
      dek = await getServerDEK(user.username);
    } catch (err) {
      console.error(`  [Error] Failed to resolve server DEK for user ${user.username}:`, err);
      continue;
    }

    // 1. Clean up accounts balance
    const userAccounts = await db
      .select({ id: accounts.id, name: accounts.name, balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.userId, user.username));

    let accountsUpdated = 0;
    for (const acc of userAccounts) {
      try {
        const decrypted = await decryptField(acc.balance, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(accounts)
            .set({ balance: encrypted, updatedAt: new Date() })
            .where(eq(accounts.id, acc.id));
          accountsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update balance for account ${acc.id}:`, err);
      }
    }
    if (accountsUpdated > 0) {
      console.log(`  Updated ${accountsUpdated} account balance(s).`);
      totalAccountsUpdated += accountsUpdated;
    }

    // 2. Clean up account snapshots balance
    const userSnapshots = await db
      .select({ id: accountSnapshots.id, snapshotDate: accountSnapshots.snapshotDate, balance: accountSnapshots.balance })
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, user.username));

    let snapshotsUpdated = 0;
    for (const snap of userSnapshots) {
      try {
        const decrypted = await decryptField(snap.balance, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(accountSnapshots)
            .set({ balance: encrypted })
            .where(eq(accountSnapshots.id, snap.id));
          snapshotsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update snapshot ${snap.id}:`, err);
      }
    }
    if (snapshotsUpdated > 0) {
      console.log(`  Updated ${snapshotsUpdated} account snapshot(s).`);
      totalSnapshotsUpdated += snapshotsUpdated;
    }

    // 3. Clean up transactions amount
    const userTxs = await db
      .select({ id: transactions.id, date: transactions.date, amount: transactions.amount })
      .from(transactions)
      .where(eq(transactions.userId, user.username));

    let txsUpdated = 0;
    for (const tx of userTxs) {
      try {
        const decrypted = await decryptField(tx.amount, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(transactions)
            .set({ amount: encrypted })
            .where(eq(transactions.id, tx.id));
          txsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update transaction ${tx.id}:`, err);
      }
    }
    if (txsUpdated > 0) {
      console.log(`  Updated ${txsUpdated} transaction amount(s).`);
      totalTransactionsUpdated += txsUpdated;
    }

    // 4. Clean up net worth snapshots
    const userNwSnaps = await db
      .select({
        snapshotDate: netWorthSnapshots.snapshotDate,
        totalAssets: netWorthSnapshots.totalAssets,
        totalLiabilities: netWorthSnapshots.totalLiabilities,
        netWorth: netWorthSnapshots.netWorth,
      })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, user.username));

    let nwUpdated = 0;
    for (const nw of userNwSnaps) {
      try {
        const decAssets = await decryptField(nw.totalAssets, dek);
        const decLiab = await decryptField(nw.totalLiabilities, dek);
        const decNw = await decryptField(nw.netWorth, dek);

        const formAssets = formatToCents(parseFloat(decAssets) || 0);
        const formLiab = formatToCents(parseFloat(decLiab) || 0);
        const formNw = formatToCents(parseFloat(decNw) || 0);

        if (decAssets !== formAssets || decLiab !== formLiab || decNw !== formNw) {
          const encAssets = await encryptField(formAssets, dek);
          const encLiab = await encryptField(formLiab, dek);
          const encNw = await encryptField(formNw, dek);

          await db
            .update(netWorthSnapshots)
            .set({
              totalAssets: encAssets,
              totalLiabilities: encLiab,
              netWorth: encNw,
            })
            .where(
              and(
                eq(netWorthSnapshots.userId, user.username),
                eq(netWorthSnapshots.snapshotDate, nw.snapshotDate)
              )
            );
          nwUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update net worth snapshot for date ${nw.snapshotDate}:`, err);
      }
    }
    if (nwUpdated > 0) {
      console.log(`  Updated ${nwUpdated} net worth snapshot(s).`);
      totalNetWorthUpdated += nwUpdated;
    }
  }

  console.log('\n-----------------------------------------');
  console.log('Cleanup execution report:');
  console.log(`- Accounts updated: ${totalAccountsUpdated}`);
  console.log(`- Account snapshots updated: ${totalSnapshotsUpdated}`);
  console.log(`- Transactions updated: ${totalTransactionsUpdated}`);
  console.log(`- Net worth snapshots updated: ${totalNetWorthUpdated}`);
  console.log('-----------------------------------------');
  console.log('Precision cleanup completed successfully!');
}

main().catch(console.error).finally(() => process.exit(0));
