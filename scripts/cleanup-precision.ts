import 'dotenv/config';
import { getDb } from '../lib/db';
import { accounts, accountSnapshots, transactions, netWorthSnapshots, users, monthlyCashFlow, categorySpendingSummary, categoryIncomeSummary, budgets, financialGoals, goalAllocationHistory } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptField, encryptField } from '../lib/crypto';
import { getServerDEK } from '../lib/crypto-context';
import { formatToCents } from '../lib/services/account-history';

async function main() {
  const db = getDb();
  console.log('Starting financial precision cleanup script...\n');

  const allUsers = await db.select({ username: users.username, email: users.email }).from(users);
  console.log(`Found ${allUsers.length} user(s) in database.\n`);

  let totalAccountsUpdated = 0;
  let totalSnapshotsUpdated = 0;
  let totalTransactionsUpdated = 0;
  let totalNetWorthUpdated = 0;
  let totalMcfUpdated = 0;
  let totalCssUpdated = 0;
  let totalCisUpdated = 0;
  let totalBudgetsUpdated = 0;
  let totalGoalsUpdated = 0;
  let totalGahUpdated = 0;

  for (const user of allUsers) {
    if (!user.username) {
      console.log(`  [Skip] User has no username: email=${user.email}`);
      continue;
    }
    console.log(`Processing user: ${user.username} (Email: ${user.email})...`);
    let dek: Uint8Array;
    try {
      dek = await getServerDEK(user.username);
    } catch (err) {
      console.error(`  [Error] Failed to resolve server DEK for user ${user.username}:`, err);
      continue;
    }

    // 1. Clean up accounts balance
    const userAccounts = await db
      .select({ id: accounts.id, name: accounts.name, balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.userId, user.username));

    let accountsUpdated = 0;
    for (const acc of userAccounts) {
      try {
        const decrypted = await decryptField(acc.balance, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(accounts)
            .set({ balance: encrypted, updatedAt: new Date() })
            .where(eq(accounts.id, acc.id));
          accountsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update balance for account ${acc.id}:`, err);
      }
    }
    if (accountsUpdated > 0) {
      console.log(`  Updated ${accountsUpdated} account balance(s).`);
      totalAccountsUpdated += accountsUpdated;
    }

    // 2. Clean up account snapshots balance
    const userSnapshots = await db
      .select({ id: accountSnapshots.id, snapshotDate: accountSnapshots.snapshotDate, balance: accountSnapshots.balance })
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, user.username));

    let snapshotsUpdated = 0;
    for (const snap of userSnapshots) {
      try {
        const decrypted = await decryptField(snap.balance, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(accountSnapshots)
            .set({ balance: encrypted })
            .where(eq(accountSnapshots.id, snap.id));
          snapshotsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update snapshot ${snap.id}:`, err);
      }
    }
    if (snapshotsUpdated > 0) {
      console.log(`  Updated ${snapshotsUpdated} account snapshot(s).`);
      totalSnapshotsUpdated += snapshotsUpdated;
    }

    // 3. Clean up transactions amount
    const userTxs = await db
      .select({ id: transactions.id, date: transactions.date, amount: transactions.amount })
      .from(transactions)
      .where(eq(transactions.userId, user.username));

    let txsUpdated = 0;
    for (const tx of userTxs) {
      try {
        const decrypted = await decryptField(tx.amount, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(transactions)
            .set({ amount: encrypted })
            .where(eq(transactions.id, tx.id));
          txsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update transaction ${tx.id}:`, err);
      }
    }
    if (txsUpdated > 0) {
      console.log(`  Updated ${txsUpdated} transaction amount(s).`);
      totalTransactionsUpdated += txsUpdated;
    }

    // 4. Clean up net worth snapshots
    const userNwSnaps = await db
      .select({
        snapshotDate: netWorthSnapshots.snapshotDate,
        totalAssets: netWorthSnapshots.totalAssets,
        totalLiabilities: netWorthSnapshots.totalLiabilities,
        netWorth: netWorthSnapshots.netWorth,
      })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, user.username));

    let nwUpdated = 0;
    for (const nw of userNwSnaps) {
      try {
        const decAssets = await decryptField(nw.totalAssets, dek);
        const decLiab = await decryptField(nw.totalLiabilities, dek);
        const decNw = await decryptField(nw.netWorth, dek);

        const formAssets = formatToCents(parseFloat(decAssets) || 0);
        const formLiab = formatToCents(parseFloat(decLiab) || 0);
        const formNw = formatToCents(parseFloat(decNw) || 0);

        if (decAssets !== formAssets || decLiab !== formLiab || decNw !== formNw) {
          const encAssets = await encryptField(formAssets, dek);
          const encLiab = await encryptField(formLiab, dek);
          const encNw = await encryptField(formNw, dek);

          await db
            .update(netWorthSnapshots)
            .set({
              totalAssets: encAssets,
              totalLiabilities: encLiab,
              netWorth: encNw,
            })
            .where(
              and(
                eq(netWorthSnapshots.userId, user.username),
                eq(netWorthSnapshots.snapshotDate, nw.snapshotDate)
              )
            );
          nwUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update net worth snapshot for date ${nw.snapshotDate}:`, err);
      }
    }
    if (nwUpdated > 0) {
      console.log(`  Updated ${nwUpdated} net worth snapshot(s).`);
      totalNetWorthUpdated += nwUpdated;
    }

    // 5. Clean up monthly cash flow
    const userMcf = await db
      .select({
        yearMonth: monthlyCashFlow.yearMonth,
        totalIncome: monthlyCashFlow.totalIncome,
        totalExpenses: monthlyCashFlow.totalExpenses,
        netCashFlow: monthlyCashFlow.netCashFlow,
      })
      .from(monthlyCashFlow)
      .where(eq(monthlyCashFlow.userId, user.username));

    let mcfUpdated = 0;
    for (const m of userMcf) {
      try {
        const decInc = await decryptField(m.totalIncome, dek);
        const decExp = await decryptField(m.totalExpenses, dek);
        const decNet = await decryptField(m.netCashFlow, dek);

        const formInc = formatToCents(parseFloat(decInc) || 0);
        const formExp = formatToCents(parseFloat(decExp) || 0);
        const formNet = formatToCents(parseFloat(decNet) || 0);

        if (decInc !== formInc || decExp !== formExp || decNet !== formNet) {
          const encInc = await encryptField(formInc, dek);
          const encExp = await encryptField(formExp, dek);
          const encNet = await encryptField(formNet, dek);

          await db
            .update(monthlyCashFlow)
            .set({
              totalIncome: encInc,
              totalExpenses: encExp,
              netCashFlow: encNet,
            })
            .where(
              and(
                eq(monthlyCashFlow.userId, user.username),
                eq(monthlyCashFlow.yearMonth, m.yearMonth)
              )
            );
          mcfUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update monthly cash flow for user ${user.username} date ${m.yearMonth}:`, err);
      }
    }
    if (mcfUpdated > 0) {
      console.log(`  Updated ${mcfUpdated} monthly cash flow summary row(s).`);
      totalMcfUpdated += mcfUpdated;
    }

    // 6. Clean up category spending summaries
    const userCss = await db
      .select({
        categoryId: categorySpendingSummary.categoryId,
        accountId: categorySpendingSummary.accountId,
        yearMonth: categorySpendingSummary.yearMonth,
        amount: categorySpendingSummary.amount,
      })
      .from(categorySpendingSummary)
      .where(eq(categorySpendingSummary.userId, user.username));

    let cssUpdated = 0;
    for (const s of userCss) {
      try {
        const decAmt = await decryptField(s.amount, dek);
        if (!decAmt) continue;

        const formAmt = formatToCents(parseFloat(decAmt) || 0);
        if (decAmt !== formAmt) {
          const encAmt = await encryptField(formAmt, dek);
          await db
            .update(categorySpendingSummary)
            .set({ amount: encAmt })
            .where(
              and(
                eq(categorySpendingSummary.userId, user.username),
                eq(categorySpendingSummary.categoryId, s.categoryId),
                eq(categorySpendingSummary.accountId, s.accountId),
                eq(categorySpendingSummary.yearMonth, s.yearMonth)
              )
            );
          cssUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update category spending summary for user ${user.username} cat ${s.categoryId}:`, err);
      }
    }
    if (cssUpdated > 0) {
      console.log(`  Updated ${cssUpdated} category spending summary row(s).`);
      totalCssUpdated += cssUpdated;
    }

    // 7. Clean up category income summaries
    const userCis = await db
      .select({
        categoryId: categoryIncomeSummary.categoryId,
        accountId: categoryIncomeSummary.accountId,
        yearMonth: categoryIncomeSummary.yearMonth,
        amount: categoryIncomeSummary.amount,
      })
      .from(categoryIncomeSummary)
      .where(eq(categoryIncomeSummary.userId, user.username));

    let cisUpdated = 0;
    for (const s of userCis) {
      try {
        const decAmt = await decryptField(s.amount, dek);
        if (!decAmt) continue;

        const formAmt = formatToCents(parseFloat(decAmt) || 0);
        if (decAmt !== formAmt) {
          const encAmt = await encryptField(formAmt, dek);
          await db
            .update(categoryIncomeSummary)
            .set({ amount: encAmt })
            .where(
              and(
                eq(categoryIncomeSummary.userId, user.username),
                eq(categoryIncomeSummary.categoryId, s.categoryId),
                eq(categoryIncomeSummary.accountId, s.accountId),
                eq(categoryIncomeSummary.yearMonth, s.yearMonth)
              )
            );
          cisUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update category income summary for user ${user.username} cat ${s.categoryId}:`, err);
      }
    }
    if (cisUpdated > 0) {
      console.log(`  Updated ${cisUpdated} category income summary row(s).`);
      totalCisUpdated += cisUpdated;
    }

    // 8. Clean up budgets
    const userBudgets = await db
      .select({ id: budgets.id, amount: budgets.amount })
      .from(budgets)
      .where(eq(budgets.userId, user.username));

    let budgetsUpdated = 0;
    for (const b of userBudgets) {
      try {
        const decrypted = await decryptField(b.amount, dek);
        if (!decrypted) continue;

        const formatted = formatToCents(parseFloat(decrypted) || 0);
        if (decrypted !== formatted) {
          const encrypted = await encryptField(formatted, dek);
          await db
            .update(budgets)
            .set({ amount: encrypted })
            .where(eq(budgets.id, b.id));
          budgetsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update budget ${b.id}:`, err);
      }
    }
    if (budgetsUpdated > 0) {
      console.log(`  Updated ${budgetsUpdated} budget amount(s).`);
      totalBudgetsUpdated += budgetsUpdated;
    }

    // 9. Clean up financial goals
    const userGoals = await db
      .select({
        id: financialGoals.id,
        targetAmount: financialGoals.targetAmount,
        currentAmount: financialGoals.currentAmount,
        reserve: financialGoals.reserve,
        allocatedAmount: financialGoals.allocatedAmount,
      })
      .from(financialGoals)
      .where(eq(financialGoals.userId, user.username));

    let goalsUpdated = 0;
    for (const g of userGoals) {
      try {
        const decTar = await decryptField(g.targetAmount, dek);
        const decCur = await decryptField(g.currentAmount, dek);
        const decRes = await decryptField(g.reserve, dek);
        const decAlloc = g.allocatedAmount || ''; // NOT encrypted

        const formTar = formatToCents(parseFloat(decTar) || 0);
        const formCur = formatToCents(parseFloat(decCur) || 0);
        const formRes = formatToCents(parseFloat(decRes) || 0);
        const formAlloc = decAlloc ? formatToCents(parseFloat(decAlloc) || 0) : '';

        if (decTar !== formTar || decCur !== formCur || decRes !== formRes || (decAlloc && decAlloc !== formAlloc)) {
          const encTar = await encryptField(formTar, dek);
          const encCur = await encryptField(formCur, dek);
          const encRes = await encryptField(formRes, dek);

          await db
            .update(financialGoals)
            .set({
              targetAmount: encTar,
              currentAmount: encCur,
              reserve: encRes,
              allocatedAmount: formAlloc || null,
            })
            .where(eq(financialGoals.id, g.id));
          goalsUpdated++;
        }
      } catch (err) {
        console.error(`    [Error] Failed to decrypt/update financial goal ${g.id}:`, err);
      }
    }
    if (goalsUpdated > 0) {
      console.log(`  Updated ${goalsUpdated} financial goal amount(s).`);
      totalGoalsUpdated += goalsUpdated;
    }

    // 10. Clean up goal allocation history (plaintext columns)
    const userGah = await db
      .select({
        id: goalAllocationHistory.id,
        accountBalance: goalAllocationHistory.accountBalance,
        allocatedAmount: goalAllocationHistory.allocatedAmount,
        desiredAmount: goalAllocationHistory.desiredAmount,
        remainingOnAccount: goalAllocationHistory.remainingOnAccount,
      })
      .from(goalAllocationHistory)
      .where(eq(goalAllocationHistory.userId, user.username));

    let gahUpdated = 0;
    for (const g of userGah) {
      const decBal = g.accountBalance;
      const decAlloc = g.allocatedAmount;
      const decDes = g.desiredAmount;
      const decRem = g.remainingOnAccount;

      const formBal = formatToCents(parseFloat(decBal) || 0);
      const formAlloc = formatToCents(parseFloat(decAlloc) || 0);
      const formDes = formatToCents(parseFloat(decDes) || 0);
      const formRem = formatToCents(parseFloat(decRem) || 0);

      if (decBal !== formBal || decAlloc !== formAlloc || decDes !== formDes || decRem !== formRem) {
        await db
          .update(goalAllocationHistory)
          .set({
            accountBalance: formBal,
            allocatedAmount: formAlloc,
            desiredAmount: formDes,
            remainingOnAccount: formRem,
          })
          .where(eq(goalAllocationHistory.id, g.id));
        gahUpdated++;
      }
    }
    if (gahUpdated > 0) {
      console.log(`  Updated ${gahUpdated} goal allocation history row(s).`);
      totalGahUpdated += gahUpdated;
    }
  }

  console.log('\n-----------------------------------------');
  console.log('Cleanup execution report:');
  console.log(`- Accounts updated: ${totalAccountsUpdated}`);
  console.log(`- Account snapshots updated: ${totalSnapshotsUpdated}`);
  console.log(`- Transactions updated: ${totalTransactionsUpdated}`);
  console.log(`- Net worth snapshots updated: ${totalNetWorthUpdated}`);
  console.log(`- Monthly cash flow updated: ${totalMcfUpdated}`);
  console.log(`- Category spending summaries updated: ${totalCssUpdated}`);
  console.log(`- Category income summaries updated: ${totalCisUpdated}`);
  console.log(`- Budgets updated: ${totalBudgetsUpdated}`);
  console.log(`- Financial goals updated: ${totalGoalsUpdated}`);
  console.log(`- Goal allocation histories updated: ${totalGahUpdated}`);
  console.log('-----------------------------------------');
  console.log('Precision cleanup completed successfully!');
}

main().catch(console.error).finally(() => process.exit(0));
