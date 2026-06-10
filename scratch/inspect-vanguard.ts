import 'dotenv/config';
import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { eq, ilike } from 'drizzle-orm';
import { decryptField } from '../lib/crypto';
import { getServerDEK } from '../lib/crypto-context';

async function main() {
  const db = getDb();
  
  const allAccounts = await db.select().from(accounts);
  
  for (const acc of allAccounts) {
    const userId = acc.userId;
    const dek = await getServerDEK(userId);
    let name = acc.name;
    try {
      const dec = await decryptField(acc.name, dek);
      if (dec) name = dec;
    } catch {}
    
    if (name.toLowerCase().includes('vanguard')) {
      console.log(`Account: "${name}"`);
      console.log(`  ID: ${acc.id}`);
      console.log(`  isHidden: ${acc.isHidden}`);
      console.log(`  isExcludedFromNetWorth: ${acc.isExcludedFromNetWorth}`);
      console.log(`  plaidConnectionId: ${acc.plaidConnectionId}`);
    }
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
