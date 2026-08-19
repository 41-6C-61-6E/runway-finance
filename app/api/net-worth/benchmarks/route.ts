import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { accounts, categories, transactions, userSettings } from '@/lib/db/schema';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

// Account types treated as "liquid" — kept in sync with the net worth
// side panel's Liquidity section.
const LIQUID_TYPES = new Set([
  'checking', 'savings', 'hsachecking', 'investment', 'brokerage',
  'otherinvestment', 'otherInvestment', 'crypto', 'metals',
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  // Trailing 6 calendar-month window (current month included), averaged
  // into a representative monthly burn-rate / income figure.
  const now = new Date();
  const yearMonths: string[] = [];
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    yearMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const windowSet = new Set(yearMonths);

  const [allAccounts, allCategories, settings] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, dataUserId)),
    db.select().from(categories).where(eq(categories.userId, dataUserId)),
    db.select({ paystubEnabled: userSettings.paystubEnabled }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  ]);

  const decryptedAccounts = await decryptRows('accounts', allAccounts, dek);
  const decryptedCategories = await decryptRows('categories', allCategories, dek);
  const isPaystubEnabled = settings[0]?.paystubEnabled ?? false;

  const accountMap = new Map<string, (typeof decryptedAccounts)[number]>();
  for (const acc of decryptedAccounts) accountMap.set(acc.id, acc);
  const categoryMap = new Map<string, (typeof decryptedCategories)[number]>();
  for (const cat of decryptedCategories) categoryMap.set(cat.id, cat);

  const activeAccounts = decryptedAccounts.filter(
    (a: any) => (!a.isHidden && !a.isExcludedFromNetWorth) || a.type === 'paystub',
  );
  const activeAccountIds = new Set(activeAccounts.map((a: any) => a.id));

  // Liquid cash + net worth from live balances (same semantics as the
  // side panel's totals/liquidity memos).
  let liquidCash = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const acc of decryptedAccounts as any[]) {
    const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
    if (isNaN(balance)) continue;
    if (isAssetAccount(acc.type)) {
      totalAssets += balance;
      if (LIQUID_TYPES.has(acc.type)) liquidCash += balance;
    } else if (isLiabilityAccount(acc.type)) {
      totalLiabilities += Math.abs(balance);
    }
  }
  const netWorth = totalAssets - totalLiabilities;

  // Spending / income over the window, using the same classification
  // rules as /api/cash-flow/savings-rate standard cash flows.
  const allTxns = await db.select().from(transactions).where(eq(transactions.userId, dataUserId));
  const decryptedTxns = await decryptRows('transactions', allTxns, dek);

  let totalIncome = 0;
  let totalEssentialSpend = 0;
  let totalDiscretionarySpend = 0;

  for (const tx of decryptedTxns as any[]) {
    if (tx.ignored || tx.deleted) continue;
    if (!activeAccountIds.has(tx.accountId)) continue;
    if (!isPaystubEnabled && tx.source === 'paystub') continue;

    const ym = tx.date.substring(0, 7);
    if (!windowSet.has(ym)) continue;

    const amount = parseFloat(tx.amount);
    if (isNaN(amount) || amount === 0) continue;

    const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;

    // Report exclusion (self or parent) mirrors the cash-flow routes.
    let excluded = (category?.excludeFromReports ?? false) === true;
    if (!excluded && category?.parentId) {
      const parent = categoryMap.get(category.parentId);
      if (parent?.excludeFromReports) excluded = true;
    }

    // Transfers & compound categories don't count toward burn rate.
    if (excluded || category?.categoryType === 'transfer' || category?.categoryType === 'compound') continue;

    if (amount > 0) {
      if (category?.isIncome) totalIncome += amount;
    } else {
      const absAmt = Math.abs(amount);
      if (category?.isIncome) {
        totalIncome -= absAmt;
      } else {
        // Essential ("Fixed") vs optional ("Discretionary") split
        const discretionary = category ? category.isDiscretionary !== false : true;
        if (discretionary) totalDiscretionarySpend += absAmt;
        else totalEssentialSpend += absAmt;
      }
    }
  }

  const WINDOW = yearMonths.length;
  const monthlyIncome = totalIncome / WINDOW;
  const monthlyEssentialSpend = totalEssentialSpend / WINDOW;
  const monthlyDiscretionarySpend = totalDiscretionarySpend / WINDOW;
  const monthlyTotalSpend = monthlyEssentialSpend + monthlyDiscretionarySpend;
  const annualIncome = monthlyIncome * 12;

  const netCashFlow = totalIncome - (totalEssentialSpend + totalDiscretionarySpend);
  const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : null;
  const netWorthToIncomeRatio = annualIncome > 0 ? netWorth / annualIncome : null;
  const emergencyFundMonths = monthlyEssentialSpend > 0 ? liquidCash / monthlyEssentialSpend : null;

  return NextResponse.json({
    windowMonths: WINDOW,
    window: yearMonths,
    liquidCash,
    monthlyIncome,
    monthlyEssentialSpend,
    monthlyDiscretionarySpend,
    monthlyTotalSpend,
    annualIncome,
    savingsRate,
    netWorth,
    netWorthToIncomeRatio,
    emergencyFundMonths,
  });
}
