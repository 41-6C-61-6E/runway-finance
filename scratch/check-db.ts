import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { isNull } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const res = await db.select().from(accounts).where(isNull(accounts.connectionId));
  console.log("Manual Accounts in DB:");
  for (const row of res) {
    console.log(`ID: ${row.id}, Name: ${row.name}, Type: ${row.type}, Metadata: ${row.metadata}`);
  }
}

main().catch(console.error);
