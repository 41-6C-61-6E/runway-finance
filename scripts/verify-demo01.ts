import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import {
  accounts,
  holdings,
  transactions,
  tags,
  budgets,
  financialGoals,
  plans,
  planAccounts,
  planEvents,
  recurringTransactions,
  paystubs,
  accountSnapshots,
  netWorthSnapshots,
  monthlyCashFlow,
  categorySpendingSummary,
  userNotifications,
  aiProposals,
} from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const userId = 'demo01';
  const dek = await getServerDEK(userId);

  const [
    accs,
    hlds,
    txs,
    tgs,
    bdgs,
    goals,
    firePlans,
    recTxs,
    pstbs,
    accSnaps,
    nwSnaps,
    cashFlow,
    spendSummary,
    notifs,
    proposals,
  ] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(holdings).where(eq(holdings.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db.select().from(financialGoals).where(eq(financialGoals.userId, userId)),
    db.select().from(plans).where(eq(plans.userId, userId)),
    db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, userId)),
    db.select().from(paystubs).where(eq(paystubs.userId, userId)),
    db.select().from(accountSnapshots).where(eq(accountSnapshots.userId, userId)),
    db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId)).orderBy(desc(netWorthSnapshots.snapshotDate)),
    db.select().from(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId)),
    db.select().from(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId)),
    db.select().from(userNotifications).where(eq(userNotifications.userId, userId)),
    db.select().from(aiProposals).where(eq(aiProposals.userId, userId)),
  ]);

  const pAccounts = firePlans.length > 0 ? await db.select().from(planAccounts).where(eq(planAccounts.planId, firePlans[0].id)) : [];
  const pEvents = firePlans.length > 0 ? await db.select().from(planEvents).where(eq(planEvents.planId, firePlans[0].id)) : [];

  const decAccs = await decryptRows('accounts', accs, dek);
  const decNw = await decryptRows('net_worth_snapshots', nwSnaps.slice(0, 5), dek);
  const decGoals = await decryptRows('financial_goals', goals, dek);
  const decPlans = await decryptRows('plans', firePlans, dek);

  console.log('--- DEMO01 VERIFICATION REPORT ---');
  console.log(`Accounts: ${accs.length}`);
  console.log(`Holdings: ${hlds.length}`);
  console.log(`Transactions: ${txs.length}`);
  console.log(`Tags: ${tgs.length}`);
  console.log(`Budgets: ${bdgs.length}`);
  console.log(`Financial Goals: ${goals.length}`);
  console.log(`FIRE Plans: ${firePlans.length} (Linked Accounts: ${pAccounts.length}, Events: ${pEvents.length})`);
  console.log(`Recurring Transactions: ${recTxs.length}`);
  console.log(`Paystubs: ${pstbs.length}`);
  console.log(`Account Snapshots: ${accSnaps.length}`);
  console.log(`Net Worth Snapshots: ${nwSnaps.length}`);
  console.log(`Monthly Cash Flow records: ${cashFlow.length}`);
  console.log(`Category Spending Summary records: ${spendSummary.length}`);
  console.log(`Notifications: ${notifs.length}`);
  console.log(`AI Proposals: ${proposals.length}`);

  console.log('\n--- LATEST NET WORTH ---');
  if (decNw.length > 0) {
    console.log(`Date: ${decNw[0].snapshotDate}, Net Worth: $${Number(decNw[0].netWorth).toLocaleString()}, Assets: $${Number(decNw[0].totalAssets).toLocaleString()}, Liabilities: $${Number(decNw[0].totalLiabilities).toLocaleString()}`);
  }

  console.log('\n--- ACCOUNTS BREAKDOWN ---');
  for (const a of decAccs) {
    console.log(`- ${a.name} (${a.type}): $${Number(a.balance).toLocaleString()}`);
  }

  console.log('\n--- FINANCIAL GOALS ---');
  for (const g of decGoals) {
    console.log(`- ${g.name}: Target $${Number(g.targetAmount).toLocaleString()}, Current $${Number(g.currentAmount).toLocaleString()}`);
  }

  console.log('\n--- FIRE PLAN ---');
  if (decPlans.length > 0) {
    console.log(`- Plan: ${decPlans[0].name}, Retirement Age: ${decPlans[0].retirementAge}, Annual Spend: $${Number(decPlans[0].annualExpenses).toLocaleString()}`);
  }

  console.log('\nVERIFICATION COMPLETE');
  process.exit(0);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
