import 'dotenv/config';
import { getDb } from '../lib/db';
import { 
  users, accounts, categories, transactions, budgets, financialGoals, 
  importLog, accountSnapshots, netWorthSnapshots, simplifinConnections,
  plaidConnections, holdings, tags, paystubs 
} from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  const tables = [
    { name: 'users', table: users },
    { name: 'accounts', table: accounts },
    { name: 'categories', table: categories },
    { name: 'transactions', table: transactions },
    { name: 'budgets', table: budgets },
    { name: 'financialGoals', table: financialGoals },
    { name: 'importLog', table: importLog },
    { name: 'accountSnapshots', table: accountSnapshots },
    { name: 'netWorthSnapshots', table: netWorthSnapshots },
    { name: 'simplifinConnections', table: simplifinConnections },
    { name: 'plaidConnections', table: plaidConnections },
    { name: 'holdings', table: holdings },
    { name: 'tags', table: tags },
    { name: 'paystubs', table: paystubs },
  ];
  
  console.log('--- ALL TABLE COUNTS ---');
  for (const t of tables) {
    try {
      const res = await db.select({ count: sql<number>`count(*)` }).from(t.table);
      console.log(`${t.name}: ${res[0].count}`);
    } catch (err: any) {
      console.log(`${t.name}: ERROR (${err.message})`);
    }
  }
}

main().then(() => process.exit(0));
