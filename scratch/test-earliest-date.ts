import 'dotenv/config';
import { getDb } from '../lib/db';
import { getEarliestTransactionDate } from '../lib/services/account-history';

async function main() {
  const accountId = 'e216aa50-f8aa-42d8-9b68-f9a2f68d5daf'; // Vanguard Roth IRA - Alan
  console.log("Fetching earliest transaction date for Vanguard Roth IRA...");
  const date = await getEarliestTransactionDate(accountId);
  console.log(`Value: "${date}"`);
  console.log(`Type of date: ${typeof date}`);
  if (date) {
    console.log(`Is YYYY-MM-DD: ${/^\d{4}-\d{2}-\d{2}$/.test(date)}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
