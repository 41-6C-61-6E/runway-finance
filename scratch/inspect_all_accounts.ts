import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows, decryptField } from '../lib/crypto';
import { accounts, accountSnapshots, transactions } from '../lib/db/schema';
import { eq, asc, min } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');

  const allAccs = await db.select().from(accounts).where(eq(accounts.userId, 'alanracek'));
  const decrypted = await decryptRows('accounts', allAccs, dek);

  console.log('\n=== Accounts Earliest Data Inspection ===');
  for (const acc of decrypted) {
    const name = acc.name;
    const accountId = acc.id;

    // Get earliest transaction date
    const [tx] = await db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(asc(transactions.date))
      .limit(1);
    const earliestTx = tx ? tx.date : 'None';

    // Get earliest snapshot date
    const [snap] = await db
      .select({ date: accountSnapshots.snapshotDate })
      .from(accountSnapshots)
      .where(eq(accountSnapshots.accountId, accountId))
      .orderBy(asc(accountSnapshots.snapshotDate))
      .limit(1);
    const earliestSnap = snap ? snap.date : 'None';

    // Get earliest real snapshot date
    const [realSnap] = await db
      .select({ date: accountSnapshots.snapshotDate })
      .from(accountSnapshots)
      .where(
        eq(accountSnapshots.accountId, accountId) &&
        eq(accountSnapshots.isSynthetic, false)
      )
      .orderBy(asc(accountSnapshots.snapshotDate))
      .limit(1);
    const earliestRealSnap = realSnap ? realSnap.date : 'None';

    let originationDate = 'None';
    if (acc.metadata) {
      try {
        const metadata = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
        originationDate = metadata ? (metadata.purchaseDate || metadata.loanOriginationDate || metadata.originalLoanDate || 'None') : 'None';
      } catch (e) {}
    }


    console.log(`Account: "${name}"`);
    console.log(`  ID: ${accountId}`);
    console.log(`  Type: ${acc.type}`);
    console.log(`  Origination Date (Metadata): ${originationDate}`);
    console.log(`  Earliest Transaction Date:   ${earliestTx}`);
    console.log(`  Earliest Snapshot Date:      ${earliestSnap}`);
    console.log(`  Earliest Real Snapshot Date: ${earliestRealSnap}`);
  }
}

main().catch(console.error);
