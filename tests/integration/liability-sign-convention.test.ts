/**
 * Liability sign-convention fixes — Step 3 verification.
 *
 * Liability accounts (credit, loan, mortgage, …) use the opposite sign
 * convention from asset accounts:
 *
 *   - asset accounts:   payments/expenses NEGATIVE, deposits/income POSITIVE
 *   - liability accounts: payments POSITIVE (debt reduction), charges NEGATIVE
 *
 * `toCashFlowAmount()` (lib/utils/account-scope.ts) normalizes a stored raw
 * amount to the standard cash-flow sign before any income/expense split.
 *
 * The three Step-3 sites previously classified on the RAW sign, so a
 * credit-card payment (+120) was booked as income (or skipped from spending),
 * and a negative charge (−150) was never counted as spending on a liability.
 *
 * Established identity (same as the Step-2 monthly cash-flow fix):
 *   spending contribution = −toCashFlowAmount(raw)
 *     - liability payment (raw +2000)  → +2000 spending
 *     - liability charge  (raw −150)   → −150  spending (= asset-refund
 *       semantics: a positive cash-flow amount reduces the spending figure)
 *   in the forecast, for liability accounts the same normalization means
 *   inflow = debt-increasing event (charge) and outflow = debt-decreasing
 *   event (payment), which projects the debt balance correctly.
 *
 * Sites covered here:
 *   1. updateCategorySpendingSummaries  (lib/services/sync.ts)
 *   2. updateCategoryIncomeSummaries    (lib/services/sync.ts)
 *   3. GET /api/budgets/forecast        (app/api/budgets/forecast/route.ts)
 *
 * updateMonthlyCashFlowSummaries is already covered by
 * tests/integration/sync-ingestion.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import './setup';
import { getDb } from '@/lib/db';
import { users, userSettings, userEncryptionKeys } from '@/lib/db/schema/users';
import {
  accounts,
  categories,
  categoryIncomeSummary,
  categorySpendingSummary,
  transactions,
} from '@/lib/db/schema';
import { clearSearchCache } from '@/lib/services/search-cache';
import {
  updateCategoryIncomeSummaries,
  updateCategorySpendingSummaries,
} from '@/lib/services/sync';
import {
  decryptRows,
  encryptRow,
  getServerKey,
  wrapKey,
} from '@/lib/crypto';
import bcrypt from 'bcryptjs';

// The forecast route resolves session identity + DEK from the auth layer;
// stub both so the route runs against the same key used for seeding.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto-context')>();
  return {
    ...actual,
    getSessionDEK: vi.fn(),
  };
});

import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';

// ── Test data ────────────────────────────────────────────────────────────────

const userId = 'integration_user_liability_step3';
const Y_M = '2026-07';
// Mid-month date: the suite pins TZ=America/New_York and the code parses
// date-only strings as UTC midnight, so month-1st dates shift back a month.
const DAY = `${Y_M}-15`;

const CAT_SPEND = crypto.randomUUID();
const CAT_INCOME = crypto.randomUUID();
const CAT_COMPOUND = crypto.randomUUID();

let dek: Uint8Array;
let creditId: string;
let checkingId: string;
let creditExtId: string;
let checkingExtId: string;
let seedCounter = 0;

async function seed() {
  const db = getDb();

  seedCounter += 1;
  creditExtId = `ext_acct_credit_${seedCounter}`;
  checkingExtId = `ext_acct_checking_${seedCounter}`;

  const encCredit = await encryptRow('accounts', {
    userId,
    externalId: creditExtId,
    name: 'Test Credit Card',
    type: 'credit',
    balance: '3000.00',
    currency: 'USD',
    isHidden: false,
    isExcludedFromNetWorth: false,
  }, dek);
  const [credit] = await db.insert(accounts).values(encCredit).returning();
  creditId = credit.id;

  const encChecking = await encryptRow('accounts', {
    userId,
    externalId: checkingExtId,
    name: 'Test Checking',
    type: 'checking',
    balance: '2000.00',
    currency: 'USD',
    isHidden: false,
    isExcludedFromNetWorth: false,
  }, dek);
  const [checking] = await db.insert(accounts).values(encChecking).returning();
  checkingId = checking.id;

  const spendCat = await encryptRow('categories', {
    id: CAT_SPEND,
    userId,
    name: 'Dining',
    description: 'test spend category',
    icon: '🍔',
    color: '#ff0000',
    isIncome: false,
    categoryType: 'standard',
    hideFromTransactions: false,
  }, dek);
  const incomeCat = await encryptRow('categories', {
    id: CAT_INCOME,
    userId,
    name: 'Salary',
    description: 'test income category',
    icon: '💵',
    color: '#00ff00',
    isIncome: true,
    categoryType: 'standard',
    hideFromTransactions: false,
  }, dek);
  const compoundCat = await encryptRow('categories', {
    id: CAT_COMPOUND,
    userId,
    name: 'Compound Bucket',
    description: 'test compound category',
    icon: '📦',
    color: '#123456',
    isIncome: false,
    categoryType: 'compound',
    hideFromTransactions: false,
  }, dek);
  await db.insert(categories).values([spendCat, incomeCat, compoundCat]);
}

async function seedTx(
  externalId: string,
  accountId: string,
  amount: number,
  categoryId?: string | null,
  date: string = DAY
) {
  const enc = await encryptRow('transactions', {
    userId,
    accountId,
    externalId,
    date,
    amount: amount.toFixed(2),
    description: `tx ${externalId}`,
    isPending: false,
    pending: false,
    ...(categoryId ? { categoryId } : {}),
  }, dek);
  await getDb().insert(transactions).values(enc).onConflictDoNothing();
}

beforeEach(async () => {
  dek = new Uint8Array(32);
  crypto.getRandomValues(dek);
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const db = getDb();
  await db.insert(users).values({
    username: 'liability_step3_tester',
    passwordHash,
  }).onConflictDoNothing();
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const serverKey = getServerKey();
  const wrapped = await wrapKey(dek, serverKey);
  await db.insert(userEncryptionKeys).values({
    userId,
    wrappedDek: wrapped.ciphertext,
    wrappingIv: wrapped.iv,
    wrappingTag: wrapped.tag,
    serverWrappedDek: wrapped.ciphertext,
    serverWrappingIv: wrapped.iv,
    serverWrappingTag: wrapped.tag,
    salt: '0'.repeat(64),
  }).onConflictDoNothing();

  // The summary services read from the process-global search cache; the
  // integration beforeEach already truncated all tables, so any cached
  // hydration is stale — drop it to force a re-read of the current data.
  clearSearchCache();
  await seed();
});

// ── Category summary services (lib/services/sync.ts) ────────────────────────

describe('liability sign convention — category summary services (Step 3)', () => {
  it('books a liability payment as spending (not income)', async () => {
    // Credit card: +120 payment (liability convention = money OUT).
    await seedTx('liab_payment_120', creditId, 120, CAT_SPEND);
    // Checking: −120 expense (asset convention = money OUT).
    // Regression guard: pre-fix, the liability payment was never written to
    // the spending summary (absVal = +120 passed the >= 0 guard and was
    // skipped), so the two rows diverged. Post-fix they must be equal.
    await seedTx('asset_expense_120', checkingId, -120, CAT_SPEND);
    // Genuine asset-side income — must be unaffected.
    await seedTx('asset_income_500', checkingId, 500, CAT_INCOME);

    await updateCategorySpendingSummaries(userId, dek);
    await updateCategoryIncomeSummaries(userId, dek);

    const spendRows = await decryptRows(
      'category_spending_summary',
      await getDb().select().from(categorySpendingSummary),
      dek
    );
    const creditSpend = spendRows.find(
      (r: any) => r.categoryId === CAT_SPEND && r.accountId === creditId && r.yearMonth === Y_M
    );
    const checkingSpend = spendRows.find(
      (r: any) => r.categoryId === CAT_SPEND && r.accountId === checkingId && r.yearMonth === Y_M
    );

    // Liability +120 payment → $120 spent on the credit card.
    expect(creditSpend).toBeDefined();
    expect(parseFloat(creditSpend!.amount as string)).toBe(120);
    expect(parseFloat(creditSpend!.transactionCount as string)).toBe(1);

    // And identical to the asset-side −120 expense (parity guard).
    expect(checkingSpend).toBeDefined();
    expect(parseFloat(checkingSpend!.amount as string)).toBe(120);

    const incomeRows = await decryptRows(
      'category_income_summary',
      await getDb().select().from(categoryIncomeSummary),
      dek
    );
    // The liability payment must NOT appear as income anywhere.
    expect(
      incomeRows.find((r: any) => r.accountId === creditId)
    ).toBeUndefined();
    // Checking income is exactly the genuine +500.
    const checkingIncome = incomeRows.find(
      (r: any) => r.categoryId === CAT_INCOME && r.accountId === checkingId && r.yearMonth === Y_M
    );
    expect(checkingIncome).toBeDefined();
    expect(parseFloat(checkingIncome!.amount as string)).toBe(500);
    expect(parseFloat(checkingIncome!.transactionCount as string)).toBe(1);
  });

  it('applies asset-style refund semantics to a liability charge', async () => {
    // A negative amount on a liability account is the debt-increasing event
    // (a charge). Under the established identity (spending =
    // −toCashFlowAmount(raw)) it contributes the same way as a refund on an
    // asset account: a positive cash-flow amount REDUCES the spending figure.
    await seedTx('liab_charge_150', creditId, -150, CAT_SPEND);
    await seedTx('liab_payment_200', creditId, 200, CAT_SPEND);

    await updateCategorySpendingSummaries(userId, dek);

    const spendRows = await decryptRows(
      'category_spending_summary',
      await getDb().select().from(categorySpendingSummary),
      dek
    );
    const creditSpend = spendRows.find(
      (r: any) => r.categoryId === CAT_SPEND && r.accountId === creditId && r.yearMonth === Y_M
    );
    expect(creditSpend).toBeDefined();
    // 200 (payment) − 150 (charge) = 50, matching the asset-account
    // behavior for an expense+refund pair.
    expect(parseFloat(creditSpend!.amount as string)).toBe(50);
    expect(parseFloat(creditSpend!.transactionCount as string)).toBe(2);

    // And the charge is still not booked as income.
    const incomeRows = await decryptRows(
      'category_income_summary',
      await getDb().select().from(categoryIncomeSummary),
      dek
    );
    expect(incomeRows.find((r: any) => r.accountId === creditId)).toBeUndefined();
  });

  it('keeps compound categories on raw absolute-amount aggregation', async () => {
    // Compound categories aggregate the RAW absolute amount — the liability
    // flip must not apply there (guard the compound branch of the ternary).
    await seedTx('compound_liab_80', creditId, 80, CAT_COMPOUND);

    await updateCategorySpendingSummaries(userId, dek);

    const spendRows = await decryptRows(
      'category_spending_summary',
      await getDb().select().from(categorySpendingSummary),
      dek
    );
    const compoundSpend = spendRows.find(
      (r: any) => r.categoryId === CAT_COMPOUND && r.accountId === creditId && r.yearMonth === Y_M
    );
    expect(compoundSpend).toBeDefined();
    expect(parseFloat(compoundSpend!.amount as string)).toBe(80);
    expect(parseFloat(compoundSpend!.transactionCount as string)).toBe(1);
  });

  it('leaves ignored-transaction skipping unchanged', async () => {
    // Sanity: the fix must not alter the pre-existing skip paths.
    await seedTx('liab_ignored_100', creditId, 100, CAT_SPEND);
    await getDb()
      .update(transactions)
      .set({ ignored: true })
      .where(eq(transactions.externalId, 'liab_ignored_100'));

    await updateCategorySpendingSummaries(userId, dek);

    const spendRows = await decryptRows(
      'category_spending_summary',
      await getDb().select().from(categorySpendingSummary),
      dek
    );
    expect(
      spendRows.find((r: any) => r.accountId === creditId && r.yearMonth === Y_M)
    ).toBeUndefined();
  });
});

// ── Budget forecast route (app/api/budgets/forecast/route.ts) ────────────────

describe('liability sign convention — budgets forecast route (Step 3)', () => {
  it('classifies a liability payment as an outflow, not an inflow', async () => {
    const { GET: getForecast } = await import('@/app/api/budgets/forecast/route');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: userId },
    });
    (getSessionDEK as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dek);

    const creditBal = 3000;
    const checkingBal = 2000;

    // Credit card: +900 payment (liability convention = money OUT). Pre-fix
    // this landed in incomeByAccount → +$300/mo phantom "income".
    await seedTx('forecast_liab_payment_900', creditId, 900, CAT_SPEND, '2026-08-15');
    // Checking: +400 income and −200 expense (standard asset convention).
    await seedTx('forecast_income_400', checkingId, 400, CAT_INCOME, '2026-08-15');
    await seedTx('forecast_expense_200', checkingId, -200, CAT_SPEND, '2026-08-15');

    const res = await getForecast(
      new Request(
        `http://localhost/api/budgets/forecast?accountIds=${creditId},${checkingId}&months=6&lookbackMonths=3`
      )
    );

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.forecast).toHaveLength(6);

    const month1 = json.forecast.find((m: any) => m.month === '2026-08');
    expect(month1).toBeDefined();
    const creditProj = month1.accounts.find((a: any) => a.accountId === creditId);
    const checkingProj = month1.accounts.find((a: any) => a.accountId === checkingId);

    // Credit card: the +900 payment must be an OUTFLOW ($900/3 = $300/mo).
    // Pre-fix: outflows 0 and inflows +300 (sign-inverted forecast).
    expect(creditProj.outflows).toBeCloseTo(300, 2);
    expect(creditProj.inflows).toBeCloseTo(0, 2);
    expect(creditProj.startingBalance).toBe(creditBal);
    expect(creditProj.projectedBalance).toBeCloseTo(creditBal - 300, 2);

    // Checking account: pure asset flow, unaffected by the fix.
    expect(checkingProj.inflows).toBeCloseTo(400 / 3, 2);
    expect(checkingProj.outflows).toBeCloseTo(200 / 3, 2);
    expect(checkingProj.projectedBalance).toBeCloseTo(checkingBal + 400 / 3 - 200 / 3, 2);
  });
});
