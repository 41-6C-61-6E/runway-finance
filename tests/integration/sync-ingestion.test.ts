import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/lib/db';
import { accounts, transactions, users, monthlyCashFlow, userSettings, netWorthSnapshots, userEncryptionKeys } from '@/lib/db/schema';
import { createNetWorthSnapshot, updateMonthlyCashFlowSummaries } from '@/lib/services/sync';
import { clearSearchCache } from '@/lib/services/search-cache';
import { encryptRow, decryptRows, wrapKey, getServerKey } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { truncateAllTestTables } from './setup';

describe('Real Database Integration: Sync & Summary Ingestion', () => {
  const userId = 'integration_user_sync_1';
  let dek: Uint8Array;

  beforeEach(async () => {
    await truncateAllTestTables();
    dek = new Uint8Array(32);
    crypto.getRandomValues(dek);

    const db = getDb();
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await db.insert(users).values({
      username: 'sync_integration_tester',
      passwordHash,
    }).onConflictDoNothing();

    await db.insert(userSettings).values({
      userId,
      currency: 'USD',
    }).onConflictDoNothing();

    // Register user's server-wrapped DEK so background services (like cache hydration) can decrypt
    const serverKey = getServerKey();
    const serverWrapped = await wrapKey(dek, serverKey);
    await db.insert(userEncryptionKeys).values({
      userId,
      wrappedDek: serverWrapped.ciphertext,
      wrappingIv: serverWrapped.iv,
      wrappingTag: serverWrapped.tag,
      serverWrappedDek: serverWrapped.ciphertext,
      serverWrappingIv: serverWrapped.iv,
      serverWrappingTag: serverWrapped.tag,
      salt: '0'.repeat(64),
    }).onConflictDoNothing();
  });

  it('calculates and stores encrypted net worth snapshot in PostgreSQL', async () => {
    const db = getDb();

    // Insert checking account (Asset: $5,000)
    const encChecking = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_chk_01',
      name: 'Primary Checking',
      type: 'checking',
      balance: '5000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    await db.insert(accounts).values(encChecking);

    // Insert credit card (Liability: $1,200)
    const encCredit = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_crd_01',
      name: 'Rewards Visa',
      type: 'credit',
      balance: '1200.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    await db.insert(accounts).values(encCredit);

    // Run snapshot creation
    await createNetWorthSnapshot(userId, dek, '2026-08-01', { skipNotifications: true });

    // Query persisted snapshots
    const storedSnapshots = await db
      .select()
      .from(netWorthSnapshots)
      .where(and(
        eq(netWorthSnapshots.userId, userId),
        eq(netWorthSnapshots.snapshotDate, '2026-08-01')
      ));

    expect(storedSnapshots.length).toBe(1);
    const [decrypted] = await decryptRows('net_worth_snapshots', storedSnapshots, dek);
    expect(parseFloat(decrypted.totalAssets)).toBe(5000);
    expect(parseFloat(decrypted.totalLiabilities)).toBe(1200);
    expect(parseFloat(decrypted.netWorth)).toBe(3800); // 5000 - 1200
  });

  it('guarantees transaction deduplication on (accountId, externalId) constraint', async () => {
    const db = getDb();

    // Insert account
    const encAcc = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_tx_01',
      name: 'Checking for Tx',
      type: 'checking',
      balance: '10000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    const [createdAcc] = await db.insert(accounts).values(encAcc).returning();

    // Insert transaction 1
    const encTx1 = await encryptRow('transactions', {
      userId,
      accountId: createdAcc.id,
      externalId: 'tx_external_dup_001',
      date: '2026-08-10',
      amount: '50.00',
      description: 'Grocery Store',
      currency: 'USD',
      isPending: false,
    }, dek);
    await db.insert(transactions).values(encTx1);

    // Simulate second sync run re-inserting the same transaction externalId with updated description
    const encTx2 = await encryptRow('transactions', {
      userId,
      accountId: createdAcc.id,
      externalId: 'tx_external_dup_001',
      date: '2026-08-10',
      amount: '50.00',
      description: 'Grocery Store (Updated)',
      currency: 'USD',
      isPending: false,
    }, dek);

    // Upsert on (accountId, externalId)
    await db.insert(transactions).values(encTx2).onConflictDoUpdate({
      target: [transactions.accountId, transactions.externalId],
      set: {
        amount: encTx2.amount,
        description: encTx2.description,
      },
    });

    const storedTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, createdAcc.id));

    // Must be exactly 1 row (zero duplicates)
    expect(storedTxs.length).toBe(1);
    const [decTx] = await decryptRows('transactions', storedTxs, dek);
    expect(decTx.description).toBe('Grocery Store (Updated)');
  });

  it('aggregates and updates monthly cash flow summaries across multiple months', async () => {
    const db = getDb();

    const encAcc = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_cf_01',
      name: 'Cash Flow Account',
      type: 'checking',
      balance: '5000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    const [acc] = await db.insert(accounts).values(encAcc).returning();

    // Month 1: July 2026 -> Income +3000, Expense -1200 -> Net +1800
    const txJuly1 = await encryptRow('transactions', {
      userId,
      accountId: acc.id,
      externalId: 'tx_jul_1',
      date: '2026-07-05',
      amount: '3000.00',
      description: 'Paycheck',
      isPending: false,
    }, dek);
    const txJuly2 = await encryptRow('transactions', {
      userId,
      accountId: acc.id,
      externalId: 'tx_jul_2',
      date: '2026-07-15',
      amount: '-1200.00',
      description: 'Rent',
      isPending: false,
    }, dek);

    // Month 2: August 2026 -> Expense -450 -> Net -450
    const txAug1 = await encryptRow('transactions', {
      userId,
      accountId: acc.id,
      externalId: 'tx_aug_1',
      date: '2026-08-02',
      amount: '-450.00',
      description: 'Groceries',
      isPending: false,
    }, dek);

    await db.insert(transactions).values([txJuly1, txJuly2, txAug1]);

    // Compute summaries
    await updateMonthlyCashFlowSummaries(userId, dek);

    const summaries = await db
      .select()
      .from(monthlyCashFlow)
      .where(eq(monthlyCashFlow.userId, userId));

    expect(summaries.length).toBe(2);

    const decryptedSummaries = await decryptRows('monthly_cash_flow', summaries, dek);
    const julSummary = decryptedSummaries.find((s) => s.yearMonth === '2026-07');
    const augSummary = decryptedSummaries.find((s) => s.yearMonth === '2026-08');

    expect(julSummary).toBeDefined();
    expect(parseFloat(julSummary?.totalIncome ?? '0')).toBe(3000);
    expect(parseFloat(julSummary?.totalExpenses ?? '0')).toBe(1200);
    expect(parseFloat(julSummary?.netCashFlow ?? '0')).toBe(1800);

    expect(augSummary).toBeDefined();
    expect(parseFloat(augSummary?.totalIncome ?? '0')).toBe(0);
    expect(parseFloat(augSummary?.totalExpenses ?? '0')).toBe(450);
    expect(parseFloat(augSummary?.netCashFlow ?? '0')).toBe(-450);
  });

  it('counts liability account payments (positive amounts) as expenses', async () => {
    const db = getDb();

    // The search cache is process-global with a 30-minute TTL and is not
    // cleared by truncateAllTestTables, so drop any entries hydrated by a
    // previous test to force a re-read of the current tables.
    clearSearchCache();

    const encChecking = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_liab_chk',
      name: 'Liability Test Checking',
      type: 'checking',
      balance: '5000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    const [checking] = await db.insert(accounts).values(encChecking).returning();

    const encMortgage = await encryptRow('accounts', {
      userId,
      externalId: 'ext_acc_liab_mtg',
      name: 'Liability Test Mortgage',
      type: 'mortgage',
      balance: '250000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    const [mortgage] = await db.insert(accounts).values(encMortgage).returning();

    // Uncategorized (no category rows exist in this fixture):
    //  - checking +3000 deposit  -> income 3000
    //  - checking -500           -> expense 500
    //  - mortgage +2000 payment  -> expense 2000 (liability sign normalization)
    // Dates sit mid-month: the suite pins TZ=America/New_York and the code
    // parses date-only strings as UTC midnight, so the 1st of a month would
    // land in the previous month in US time zones.
    await db.insert(transactions).values([
      await encryptRow('transactions', {
        userId,
        accountId: checking.id,
        externalId: 'tx_liab_salary',
        date: '2026-08-10',
        amount: '3000.00',
        description: 'Paycheck',
        isPending: false,
      }, dek),
      await encryptRow('transactions', {
        userId,
        accountId: checking.id,
        externalId: 'tx_liab_grocery',
        date: '2026-08-12',
        amount: '-500.00',
        description: 'Groceries',
        isPending: false,
      }, dek),
      // Liability convention: mortgage payment stored as POSITIVE (debt reduction).
      await encryptRow('transactions', {
        userId,
        accountId: mortgage.id,
        externalId: 'tx_liab_mtg_pmt',
        date: '2026-08-15',
        amount: '2000.00',
        description: 'Monthly Payment',
        isPending: false,
      }, dek),
    ]);

    await updateMonthlyCashFlowSummaries(userId, dek);

    const summaries = await db
      .select()
      .from(monthlyCashFlow)
      .where(eq(monthlyCashFlow.userId, userId));

    expect(summaries.length).toBe(1);
    const [decSummary] = await decryptRows('monthly_cash_flow', summaries, dek);
    expect(decSummary.yearMonth).toBe('2026-08');
    expect(parseFloat(decSummary?.totalIncome ?? '0')).toBe(3000);
    expect(parseFloat(decSummary?.totalExpenses ?? '0')).toBe(2500); // 500 + 2000
    expect(parseFloat(decSummary?.netCashFlow ?? '0')).toBe(500);
  });
});
