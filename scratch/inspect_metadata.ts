import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows, decryptField } from '../lib/crypto';
import { accounts } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const studentLoanId = '72bdb674-4a6e-4189-9392-3a977a0acc60';

  const [acc] = await db.select().from(accounts).where(eq(accounts.id, studentLoanId)).limit(1);
  if (acc) {
    const name = await decryptField(acc.name, dek);
    const metadata = acc.metadata ? await decryptField(acc.metadata, dek) : null;
    console.log('Account properties:');
    console.log(`  Name: ${name}`);
    console.log(`  Type: ${acc.type}`);
    console.log(`  Subtype: ${acc.subtype}`);
    console.log(`  Balance: ${acc.balance}`);
    console.log(`  Balance Date: ${acc.balanceDate}`);
    console.log(`  Metadata: ${metadata}`);
  } else {
    console.log('Account not found');
  }
}

main().catch(console.error);

