import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { accounts, budgets, categories, transactions, userSettings } from '@/lib/db/schema';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { isAssetAccount, isLiabilityAccount, toCashFlowAmount } from '@/lib/utils/account-scope';

// Account types treated as "liquid" — kept in sync with the net worth
// side panel's Liquidity section.
const LIQUID_TYPES = new Set([
  'checking', 'savings', 'hsachecking', 'investment', 'brokerage',
  'otherinvestment', 'otherInvestment', 'crypto', 'metals',
]);

/** Resolve a period key / date ("2026-08", "2026-Q3", "2026", "2026-08-01") to an inclusive date range. Mirrors `app/api/budgets/route.ts`. */
function parsePeriodRange(keyOrDate: string | null | undefined): { start: string; end: string } {
  if (!keyOrDate) {
    return { start: '1970-01-01', end: '9999-12-31' };
  }
  const s = keyOrDate.trim();
  if (s.includes('-Q')) {
    const [y, q] = s.split('-Q').map(Number);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { start: s, end: s };
  }
  return { start: '1970-01-01', end: '9999-12-31' };
}

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

  // ── Essential (Fixed) monthly spend from the user's existing budgets ──
  // Budget lines whose category is Fixed (isDiscretionary = false on the
  // category itself or its parent) are summed into a representative
  // monthly essential-spend figure. No qualifying budgets → null, which
  // hides the Emergency Fund Coverage block on the dashboard.
  const allBudgets = await db
    .select({
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      isRecurring: budgets.isRecurring,
      effectiveFrom: budgets.effectiveFrom,
      effectiveTo: budgets.effectiveTo,
      yearMonth: budgets.yearMonth,
      periodType: budgets.periodType,
      periodKey: budgets.periodKey,
      isIncome: categories.isIncome,
      categoryType: categories.categoryType,
      isDiscretionary: categories.isDiscretionary,
      parentId: categories.parentId,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.userId, dataUserId));

  const currentMonthRange = parsePeriodRange(yearMonths[yearMonths.length - 1]);
  const categoryMonthlyBudget = new Map<string, { monthly: number; from: string }>();
  for (const b of allBudgets) {
    if (b.isIncome === true || b.categoryType === 'compound') continue;

    // Active in the current calendar month (same rules as /api/budgets).
    let active = false;
    if (b.isRecurring) {
      const from = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
      const to = b.effectiveTo ? parsePeriodRange(b.effectiveTo).end : '9999-12-31';
      active = from <= currentMonthRange.end && to >= currentMonthRange.start;
    } else {
      const oneOffKey = b.yearMonth || b.periodKey || b.effectiveFrom;
      if (oneOffKey) {
        const range = parsePeriodRange(oneOffKey);
        active = range.start <= currentMonthRange.end && range.end >= currentMonthRange.start;
      }
    }
    if (!active) continue;

    // Fixed via own flag or inherited from the parent group.
    const parent = b.parentId ? categoryMap.get(b.parentId) : undefined;
    if (b.isDiscretionary !== false && parent?.isDiscretionary !== false) continue;

    const amount = await decryptField(b.amount, dek);
    const value = parseFloat(amount) || 0;
    if (value === 0) continue;

    // Monthly roll-down — same priority as /api/budgets (monthly > quarterly/3 > yearly/12).
    // Budgets for the same category are rare; per the budgets API, the most
    // recently effective line wins.
    let multiplier = 1;
    const type = b.periodType || 'monthly';
    if (type === 'quarterly') multiplier = 1 / 3;
    else if (type === 'yearly') multiplier = 1 / 12;

    const fromKey = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
    const existing = categoryMonthlyBudget.get(b.categoryId);
    if (existing === undefined || fromKey >= existing.from) {
      categoryMonthlyBudget.set(b.categoryId, { monthly: value * multiplier, from: fromKey });
    }
  }

  let monthlyEssentialSpend: number | null = null;
  for (const { monthly } of categoryMonthlyBudget.values()) {
    monthlyEssentialSpend = (monthlyEssentialSpend ?? 0) + monthly;
  }
  if (monthlyEssentialSpend !== null && !(monthlyEssentialSpend > 0)) {
    monthlyEssentialSpend = null;
  }

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

  // Income / total spend over the window, using the same classification
  // rules as /api/cash-flow/savings-rate standard cash flows. Essential
  // spend is budget-based (above); the loop only feeds the savings rate.
  const allTxns = await db.select().from(transactions).where(eq(transactions.userId, dataUserId));
  const decryptedTxns = await decryptRows('transactions', allTxns, dek);

  let totalIncome = 0;
  let totalSpend = 0;

  // Map account id -> type so liability accounts (payments stored as
  // POSITIVE amounts) are normalized before the income/spend split.
  const accountTypeById = new Map<string, string>();
  for (const acc of decryptedAccounts as any[]) {
    accountTypeById.set(String(acc.id), String(acc.type ?? ''));
  }

  for (const tx of decryptedTxns as any[]) {
    if (tx.ignored || tx.deleted) continue;
    if (!activeAccountIds.has(tx.accountId)) continue;
    if (!isPaystubEnabled && tx.source === 'paystub') continue;

    const ym = tx.date.substring(0, 7);
    if (!windowSet.has(ym)) continue;

    const rawAmount = parseFloat(tx.amount);
    if (isNaN(rawAmount) || rawAmount === 0) continue;

    const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;

    // Report exclusion (self or parent) mirrors the cash-flow routes.
    let excluded = (category?.excludeFromReports ?? false) === true;
    if (!excluded && category?.parentId) {
      const parent = categoryMap.get(category.parentId);
      if (parent?.excludeFromReports) excluded = true;
    }

    // Transfers & compound categories don't count toward burn rate.
    if (excluded || category?.categoryType === 'transfer' || category?.categoryType === 'compound') continue;

    const amount = toCashFlowAmount(rawAmount, accountTypeById.get(String(tx.accountId)));
    if (category?.isIncome) {
      totalIncome += amount;
      continue;
    }
    totalSpend += Math.abs(amount);
  }

  const WINDOW = yearMonths.length;
  const monthlyIncome = totalIncome / WINDOW;
  const monthlyTotalSpend = totalSpend / WINDOW;
  const annualIncome = monthlyIncome * 12;

  const netCashFlow = totalIncome - totalSpend;
  const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : null;
  const netWorthToIncomeRatio = annualIncome > 0 ? netWorth / annualIncome : null;
  const emergencyFundMonths = monthlyEssentialSpend != null && monthlyEssentialSpend > 0
    ? liquidCash / monthlyEssentialSpend
    : null;

  return NextResponse.json({
    windowMonths: WINDOW,
    window: yearMonths,
    liquidCash,
    monthlyIncome,
    monthlyEssentialSpend,
    monthlyTotalSpend,
    annualIncome,
    savingsRate,
    netWorth,
    netWorthToIncomeRatio,
    emergencyFundMonths,
  });
}
