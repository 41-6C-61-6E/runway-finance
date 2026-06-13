import 'dotenv/config';
import { getDb } from '../lib/db';
import { importLog, transactions, accountSnapshots } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  try {
    const logs = await db.select({ count: sql<number>`count(*)` }).from(importLog);
    const txs = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(sql`import_id IS NOT NULL`);
    const snaps = await db.select({ count: sql<number>`count(*)` }).from(accountSnapshots).where(sql`import_id IS NOT NULL`);
    
    console.log('--- DATABASE STATUS ---');
    console.log(`Import Log count: ${logs[0].count}`);
    console.log(`Transactions imported count: ${txs[0].count}`);
    console.log(`Account Snapshots imported count: ${snaps[0].count}`);
    
    if (logs[0].count > 0) {
      const sampleLogs = await db.select({ id: importLog.id, fileName: importLog.fileName, userId: importLog.userId }).from(importLog).limit(5);
      console.log('\nSample logs:', JSON.stringify(sampleLogs, null, 2));
    }
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

main().then(() => process.exit(0));
