import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accountSnapshots } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptField } from '../lib/crypto';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);
  const accountId = 'e29b55b1-7eb4-4557-ac21-a51cc5d50f76'; // Nationstar Mortgage

  console.log('Querying Nationstar Mortgage snapshots...');
  const snapshots = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId)
      )
    )
    .orderBy(asc(accountSnapshots.snapshotDate));

  console.log(`Found ${snapshots.length} snapshots for Nationstar.`);

  const beforeStr = '2025-10-03';
  const afterStr = '2025-10-10';

  console.log(`\nSnapshots from ${beforeStr} to ${afterStr}:`);
  for (const snap of snapshots) {
    if (snap.snapshotDate >= beforeStr && snap.snapshotDate <= afterStr) {
      const balance = parseFloat(dek ? await decryptField(snap.balance, dek) : snap.balance);
      console.log(`Date: ${snap.snapshotDate}, Balance: ${balance}, Synthetic: ${snap.isSynthetic}, Imported: ${snap.isImported}`);
    }
  }

  process.exit(0);
}

run().catch(console.error);
