import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accountSnapshots, accounts } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows, decryptField } from '../lib/crypto';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);

  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);

  const carnation = decryptedAccounts.find(a => a.name.includes('Carnation House'));
  if (!carnation) {
    console.error('Carnation House account not found');
    return;
  }

  console.log('Carnation House account details:');
  console.log(`- ID: ${carnation.id}`);
  console.log(`- Type: ${carnation.type}`);
  console.log(`- Metadata: ${JSON.stringify(carnation.metadata)}`);

  console.log('\nQuerying account_snapshots...');
  const snapshots = await db
    .select()
    .from(accountSnapshots)
    .where(and(eq(accountSnapshots.userId, userId), eq(accountSnapshots.accountId, carnation.id)))
    .orderBy(asc(accountSnapshots.snapshotDate));

  console.log(`Found ${snapshots.length} snapshots for Carnation House.`);

  for (const snap of snapshots) {
    const balance = parseFloat(dek ? await decryptField(snap.balance, dek) : snap.balance);
    console.log(`Date: ${snap.snapshotDate}, Balance: ${balance}, isSynthetic: ${snap.isSynthetic}, isImported: ${snap.isImported}`);
  }

  process.exit(0);
}

run().catch(console.error);
