import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);

  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);

  console.log(`Found ${decryptedAccounts.length} accounts:`);
  for (const acc of decryptedAccounts) {
    const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
    console.log(`\nAccount: "${acc.name}"`);
    console.log(`- ID: ${acc.id}`);
    console.log(`- Type: ${acc.type}`);
    console.log(`- Hidden: ${acc.isHidden}, Excluded NW: ${acc.isExcludedFromNetWorth}`);
    if (meta) {
      console.log(`- Metadata: ${JSON.stringify(meta)}`);
    }
  }

  process.exit(0);
}

run().catch(console.error);
