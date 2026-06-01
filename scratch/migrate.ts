import { Client } from 'pg';
import 'dotenv/config';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  console.log('Connected to database');

  try {
    const res = await client.query('SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 5;');
    console.log('Migrations:', res.rows);
  } catch (err) {
    console.error('Error querying migrations:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
