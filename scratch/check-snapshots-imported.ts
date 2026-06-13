import 'dotenv/config';
import { getDb } from '../lib/db';
import { accountSnapshots } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  try {
    const res = await db.select().from(accountSnapshots).where(eq(accountSnapshots.isImported, true));
    console.log(`Account snapshots with isImported = true: ${res.length}`);
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

main().then(() => process.exit(0));
