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
  const accountId = 'cbc6ed8b-247b-4d22-b116-6d1941dbf2f1'; // Carnation House

  console.log('Querying Carnation House snapshots...');
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

  console.log(`Found ${snapshots.length} snapshots for Carnation House.`);

  for (const snap of snapshots) {
    const balance = parseFloat(dek ? await decryptField(snap.balance, dek) : snap.balance);
    console.log(`Date: ${snap.snapshotDate}, Balance: ${balance}, Synthetic: ${snap.isSynthetic}, Imported: ${snap.isImported}`);
  }

  process.exit(0);
}

run().catch(console.error);
