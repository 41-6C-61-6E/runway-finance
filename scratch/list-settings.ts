import { getDb } from '../lib/db';
import { userSettings } from '../lib/db/schema';

async function main() {
  const db = getDb();
  console.log("=== USER SETTINGS ===");
  const list = await db.select().from(userSettings);
  for (const s of list) {
    console.log(`- userId: ${s.userId}, viewingUserId: ${s.viewingUserId}, paystubEnabled: ${s.paystubEnabled}`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
