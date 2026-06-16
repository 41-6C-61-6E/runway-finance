import 'dotenv/config';
import { getDb } from '../lib/db';
import { aiProviders } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  try {
    const rows = await db.select().from(aiProviders).where(eq(aiProviders.userId, 'alanracek'));
    console.log('AI Providers for alanracek:', rows);
  } catch (error) {
    console.error('Query failed:', error);
  }
}

main().then(() => process.exit(0));
