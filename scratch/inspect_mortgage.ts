import { getDb } from '../lib/db';
import { accounts, userEncryptionKeys, accountSnapshots, transactions } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerKey, unwrapKey, decryptRows, decryptField } from '../lib/crypto';

async function main() {
  process.env.ENCRYPTION_KEY = 'f0d03d94e8cd8cf388a681b5c5d3eb741258699d58680af3ab9468dc6ff429a2';
  const db = getDb();
  
  const [keyRow] = await db
    .select()
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, 'alanracek'))
    .limit(1);

  if (!keyRow) {
    console.error('No encryption key row found for user alanracek');
    return;
  }

  const serverKey = getServerKey();
  let dek: Uint8Array;
  
  if (keyRow.serverWrappedDek && keyRow.serverWrappingIv) {
    dek = await unwrapKey({
      ciphertext: keyRow.serverWrappedDek,
      iv: keyRow.serverWrappingIv,
      tag: keyRow.serverWrappingTag ?? '',
    }, serverKey);
  } else {
    console.error('No server wrapped DEK found');
    return;
  }

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, 'alanracek'), eq(accounts.type, 'mortgage')));

  console.log(`=== Mortgage Accounts for alanracek (Total: ${userAccounts.length}) ===`);
  const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
  
  for (const acc of decryptedAccounts) {
    console.log(`\nAccount ID: ${acc.id}`);
    console.log(`Name: "${acc.name}"`);
    console.log(`Balance: ${acc.balance}`);
    console.log(`Metadata: ${JSON.stringify(acc.metadata, null, 2)}`);

    // Fetch snapshots
    const snaps = await db
      .select()
      .from(accountSnapshots)
      .where(and(eq(accountSnapshots.userId, 'alanracek'), eq(accountSnapshots.accountId, acc.id)))
      .orderBy(asc(accountSnapshots.snapshotDate));

    console.log(`Total snapshots count: ${snaps.length}`);
    
    console.log('\n--- Real/Imported Snapshots ---');
    for (const snap of snaps) {
      if (!snap.isSynthetic) {
        const balance = parseFloat(await decryptField(snap.balance, dek)) || 0;
        console.log(`  - Date: ${snap.snapshotDate}, Balance: ${balance}, isSynthetic: ${snap.isSynthetic}, isImported: ${snap.isImported}`);
      }
    }

    console.log('\n--- Last 30 Snapshots ---');
    const decryptedSnaps = await Promise.all(snaps.map(async (snap) => {
      const balance = parseFloat(await decryptField(snap.balance, dek)) || 0;
      return { date: snap.snapshotDate, balance, isSynthetic: snap.isSynthetic, isImported: snap.isImported };
    }));

    for (let i = Math.max(0, decryptedSnaps.length - 30); i < decryptedSnaps.length; i++) {
      const s = decryptedSnaps[i];
      console.log(`  - Date: ${s.date}, Balance: ${s.balance}, isSynthetic: ${s.isSynthetic}, isImported: ${s.isImported}`);
    }

    console.log('\n--- Snapshots around Dec 2023 ---');
    for (const s of decryptedSnaps) {
      if (s.date.startsWith('2023-11') || s.date.startsWith('2023-12') || s.date.startsWith('2024-01')) {
        console.log(`  - Date: ${s.date}, Balance: ${s.balance}, isSynthetic: ${s.isSynthetic}, isImported: ${s.isImported}`);
      }
    }

    console.log('\n--- Snapshots around Dec 2024 ---');
    for (const s of decryptedSnaps) {
      if (s.date.startsWith('2024-12') || s.date.startsWith('2025-01')) {
        console.log(`  - Date: ${s.date}, Balance: ${s.balance}, isSynthetic: ${s.isSynthetic}, isImported: ${s.isImported}`);
      }
    }

    console.log('\n--- Snapshots around June 2025 ---');
    for (const s of decryptedSnaps) {
      if (s.date.startsWith('2025-06') || s.date.startsWith('2025-07')) {
        console.log(`  - Date: ${s.date}, Balance: ${s.balance}, isSynthetic: ${s.isSynthetic}, isImported: ${s.isImported}`);
      }
    }

    // Fetch transactions
    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, 'alanracek'), eq(transactions.accountId, acc.id), eq(transactions.deleted, false)))
      .orderBy(asc(transactions.date));

    console.log(`\nTransactions count: ${txs.length}`);
    for (const tx of txs) {
      const amount = parseFloat(await decryptField(tx.amount, dek)) || 0;
      const desc = await decryptField(tx.description, dek);
      console.log(`  - Date: ${tx.date}, Amount: ${amount}, Desc: "${desc}", pending: ${tx.pending}`);
    }
  }
}

main().catch(console.error);
