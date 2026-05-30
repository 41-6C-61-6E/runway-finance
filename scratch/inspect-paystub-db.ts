import { getDb } from '../lib/db';
import { accounts, transactions, paystubs, paystubLineItems, paystubFieldMappings } from '../lib/db/schema';
import { getUsers } from '../lib/users';
import { decryptRows, decryptField } from '../lib/crypto';
import { getServerDEK } from '../lib/crypto-context';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const db = getDb();
  console.log('=== DB INSPECTION START ===');

  // 1. Get users
  const users = await getUsers();
  console.log('Users in DB:', users);

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  // Inspect data for each user
  for (const user of users) {
    const userId = user.username;
    console.log(`\n--- Inspecting data for User: ${userId} ---`);

    // Get DEK
    let dek: Uint8Array;
    try {
      dek = await getServerDEK(userId);
      console.log('DEK successfully retrieved via server key recovery.');
    } catch (err: any) {
      console.log('Failed to retrieve DEK:', err.message);
      continue;
    }

    // accounts
    const accs = await db.select().from(accounts).where(eq(accounts.userId, userId));
    const decryptedAccs = await decryptRows('accounts', accs, dek);
    console.log(`Accounts (${decryptedAccs.length}):`);
    for (const a of decryptedAccs) {
      console.log(`  - ID=${a.id}, Name=${a.name}, Type=${a.type}, isHidden=${a.isHidden}, isExcluded=${a.isExcludedFromNetWorth}`);
    }

    // templates/mappings
    const templates = await db.select().from(paystubFieldMappings).where(eq(paystubFieldMappings.userId, userId));
    console.log(`Field Mapping Templates (${templates.length}):`);
    for (const t of templates) {
      console.log(`  - ID=${t.id}, Name=${t.name}, Employer=${t.employerName}, isDefault=${t.isDefault}, AccountID=${t.accountId}, TagID=${t.tagId}`);
      console.log(`    Mappings:`, JSON.stringify(t.mappings));
    }

    // paystubs
    const stubs = await db.select().from(paystubs).where(eq(paystubs.userId, userId));
    console.log(`Paystubs (${stubs.length}):`);
    for (const s of stubs.slice(0, 5)) {
      console.log(`  - ID=${s.id}, Employer=${s.employerName}, Date=${s.checkDate}, Gross=${s.grossCurrent}, Net=${s.netCurrent}`);
    }

    // line items
    const items = await db.select().from(paystubLineItems).where(eq(paystubLineItems.userId, userId)).limit(10);
    console.log(`Sample Line Items (${items.length}):`);
    for (const item of items) {
      console.log(`  - ID=${item.id}, section=${item.section}, desc=${item.description}, amount=${item.amount}, action=${item.mappingAction}, categoryId=${item.categoryId}`);
    }

    // paystub transactions
    const txs = await db.select().from(transactions).where(eq(transactions.userId, userId));
    const decryptedTxs = await decryptRows('transactions', txs, dek);
    const paystubTxs = decryptedTxs.filter(t => t.source === 'paystub' || t.paystubId !== null);
    console.log(`Paystub Transactions (${paystubTxs.length}):`);
    for (const t of paystubTxs) {
      const acc = decryptedAccs.find(a => a.id === t.accountId);
      console.log(`  - ID=${t.id}, Desc=${t.description}, Amount=${t.amount}, Date=${t.date}, AccountName=${acc?.name || t.accountId}, Source=${t.source}, paystubId=${t.paystubId}`);
    }
  }

  console.log('\n=== DB INSPECTION END ===');
}

main().catch(console.error);
