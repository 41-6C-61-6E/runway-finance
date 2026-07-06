import { getDb, getPool } from '../lib/db';
import { users as userTable, netWorthSnapshots, accountSnapshots, accounts } from '../lib/db/schema';
import { getServerDEK } from '../lib/crypto-context';
import { decryptField } from '../lib/crypto';
import { eq, and, gte, lte, sql, inArray, or } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = getDb();
  
  // 1. Get first user
  const userList = await db.select().from(userTable).limit(1);
  if (userList.length === 0) {
    console.log("No users found in database.");
    await getPool().end();
    return;
  }
  const user = userList[0];
  const userId = user.username;
  console.log(`User ID: ${userId}, Email: ${user.email}`);

  // 2. Get server DEK
  const dek = await getServerDEK(userId);
  console.log("Successfully resolved server DEK.");

  // 3. Query all reportable accounts
  const accs = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const activeAccs = [];
  for (const acc of accs) {
    const isHidden = acc.isHidden;
    const isExcluded = acc.isExcludedFromNetWorth;
    const type = acc.type;
    const currency = acc.currency || 'USD';
    const name = acc.name ? await decryptField(acc.name, dek) : 'Unnamed';
    console.log(`Account: ${acc.id} | Name: ${name} | Type: ${type} | Excluded: ${isExcluded} | Hidden: ${isHidden}`);
    if (!isHidden && !isExcluded) {
      activeAccs.push({ id: acc.id, name, type, currency });
    }
  }
  const activeAccIds = activeAccs.map(a => a.id);

  // 4. Query net_worth_snapshots for June 2026
  console.log("\n--- NET WORTH SNAPSHOTS IN JUNE 2026 ---");
  const nwSnaps = await db
    .select()
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, userId),
        gte(netWorthSnapshots.snapshotDate, '2026-06-01'),
        lte(netWorthSnapshots.snapshotDate, '2026-06-30')
      )
    )
    .orderBy(netWorthSnapshots.snapshotDate);

  for (const s of nwSnaps) {
    const netWorth = await decryptField(s.netWorth, dek);
    const assets = await decryptField(s.totalAssets, dek);
    const liabilities = await decryptField(s.totalLiabilities, dek);
    console.log(`Date: ${s.snapshotDate} | NetWorth: ${netWorth} | Assets: ${assets} | Liab: ${liabilities}`);
  }

  // 5. Query account snapshots for active accounts around June 2026
  console.log("\n--- ACCOUNT SNAPSHOTS AROUND JUNE 2026 ---");
  const accSnaps = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.userId, userId),
        inArray(accountSnapshots.accountId, activeAccIds),
        gte(accountSnapshots.snapshotDate, '2026-05-25'),
        lte(accountSnapshots.snapshotDate, '2026-07-05')
      )
    )
    .orderBy(accountSnapshots.snapshotDate, accountSnapshots.accountId);

  for (const s of accSnaps) {
    const balance = await decryptField(s.balance, dek);
    const accName = activeAccs.find(a => a.id === s.accountId)?.name || s.accountId;
    console.log(`Date: ${s.snapshotDate} | Account: ${accName} | Balance: ${balance} | Synthetic: ${s.isSynthetic}`);
  }

  // 6. Run getBalancesOnDate for 2026-05-31 and 2026-06-30
  const getBalancesOnDate = async (targetDate: string) => {
    const latestDates = await db
      .select({
        accountId: accountSnapshots.accountId,
        maxDate: sql<string>`max(${accountSnapshots.snapshotDate})`,
      })
      .from(accountSnapshots)
      .where(and(
        eq(accountSnapshots.userId, userId),
        lte(accountSnapshots.snapshotDate, targetDate),
        inArray(accountSnapshots.accountId, activeAccIds)
      ))
      .groupBy(accountSnapshots.accountId);

    if (latestDates.length === 0) return {};

    const conditions = latestDates.map((ld: any) =>
      and(
        eq(accountSnapshots.accountId, ld.accountId),
        eq(accountSnapshots.snapshotDate, ld.maxDate)
      )
    );

    const snaps = await db
      .select({
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        snapshotDate: accountSnapshots.snapshotDate,
      })
      .from(accountSnapshots)
      .where(and(
        eq(accountSnapshots.userId, userId),
        or(...conditions)
      ));

    const result: Record<string, { balance: number; date: string }> = {};
    for (const s of snaps) {
      const decrypted = await decryptField(s.balance, dek);
      result[s.accountId] = { balance: parseFloat(decrypted) || 0, date: s.snapshotDate };
    }
    return result;
  };

  console.log("\n--- WEALTH FLOW BALANCES AS OF 2026-05-31 ---");
  const begBalances = await getBalancesOnDate('2026-05-31');
  let begNetWorth = 0;
  for (const acc of activeAccs) {
    const data = begBalances[acc.id] || { balance: 0, date: 'N/A' };
    console.log(`Account: ${acc.name} | Balance: ${data.balance} (as of ${data.date})`);
    if (acc.type === 'mortgage' || acc.type === 'credit' || acc.type === 'loan') {
      begNetWorth -= Math.abs(data.balance);
    } else {
      begNetWorth += data.balance;
    }
  }
  console.log(`Computed Beginning Net Worth: ${begNetWorth}`);

  console.log("\n--- WEALTH FLOW BALANCES AS OF 2026-06-30 ---");
  const endBalances = await getBalancesOnDate('2026-06-30');
  let endNetWorth = 0;
  for (const acc of activeAccs) {
    const data = endBalances[acc.id] || { balance: 0, date: 'N/A' };
    console.log(`Account: ${acc.name} | Balance: ${data.balance} (as of ${data.date})`);
    if (acc.type === 'mortgage' || acc.type === 'credit' || acc.type === 'loan') {
      endNetWorth -= Math.abs(data.balance);
    } else {
      endNetWorth += data.balance;
    }
  }
  console.log(`Computed Ending Net Worth: ${endNetWorth}`);
  console.log(`Wealth Flow Net Worth Change: ${endNetWorth - begNetWorth}`);
  await getPool().end();
}

run().catch(console.error);
