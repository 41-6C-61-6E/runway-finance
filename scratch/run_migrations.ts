import { initDb } from '../lib/db/migrate';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:l45606393b@localhost:5432/runway_finance';
  console.log(`Running migrations against: ${url}`);
  try {
    await initDb(url);
    console.log('Migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
