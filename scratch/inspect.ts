import 'dotenv/config';
import { getDb } from '../lib/db';
import { userSettings } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  const settings = await db.select().from(userSettings);
  console.log(`\nFound ${settings.length} User Settings rows:`);
  for (const s of settings) {
    console.log(`- User ID: ${s.userId}`);
    console.log(`  aiAutoAnalyze: ${s.aiAutoAnalyze}`);
    console.log(`  showSyntheticData:`, JSON.stringify(s.showSyntheticData));
    console.log(`  showImportedData:`, JSON.stringify(s.showImportedData));
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
