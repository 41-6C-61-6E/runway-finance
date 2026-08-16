import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/lib/db';
import { accounts, categories, transactions, users } from '@/lib/db/schema';
import { encryptRow } from '@/lib/crypto';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { truncateAllTestTables } from './setup';

describe('Real Database Integration: Transaction Rollback & Atomicity', () => {
  const userId = 'integration_user_rollback_1';
  let dek: Uint8Array;

  beforeEach(async () => {
    await truncateAllTestTables();
    dek = new Uint8Array(32);
    crypto.getRandomValues(dek);

    const db = getDb();
    const passwordHash = await bcrypt.hash('SecretPass123!', 10);
    await db.insert(users).values({
      username: 'rollback_integration_tester',
      passwordHash,
    }).onConflictDoNothing();
  });

  it('completely rolls back inserted records when a transaction aborts or throws an error', async () => {
    const db = getDb();

    // 1. Create a pre-existing account
    const encPreExisting = await encryptRow('accounts', {
      userId,
      externalId: 'ext_safe_acc_01',
      name: 'Safe Existing Account',
      type: 'checking',
      balance: '1000.00',
      currency: 'USD',
      isHidden: false,
      isExcludedFromNetWorth: false,
    }, dek);
    const [safeAcc] = await db.insert(accounts).values(encPreExisting).returning();

    // 2. Attempt a multi-step operation in a transaction that fails halfway
    let errorThrown = false;
    try {
      await db.transaction(async (tx) => {
        // Step A: Insert a new account
        const encTempAcc = await encryptRow('accounts', {
          userId,
          externalId: 'ext_temp_acc_01',
          name: 'Temp Account to Rollback',
          type: 'savings',
          balance: '500.00',
          currency: 'USD',
          isHidden: false,
          isExcludedFromNetWorth: false,
        }, dek);
        await tx.insert(accounts).values(encTempAcc);

        // Step B: Insert a category
        const encCat = await encryptRow('categories', {
          userId,
          name: 'Temp Category',
          isIncome: false,
        }, dek);
        await tx.insert(categories).values(encCat);

        // Step C: Throw intentional error to simulate DB crash or constraint failure
        throw new Error('Simulated transaction failure during backup import');
      });
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toBe('Simulated transaction failure during backup import');
    }

    expect(errorThrown).toBe(true);

    // 3. Verify that the rollback was 100% clean:
    // Only the pre-existing account exists, and the temporary account/category were NOT persisted
    const currentAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
    expect(currentAccounts.length).toBe(1);
    expect(currentAccounts[0].id).toBe(safeAcc.id);

    const currentCategories = await db.select().from(categories).where(eq(categories.userId, userId));
    expect(currentCategories.length).toBe(0);
  });

  it('commits all records atomically across relational tables on successful transaction', async () => {
    const db = getDb();

    await db.transaction(async (tx) => {
      const encAcc = await encryptRow('accounts', {
        userId,
        externalId: 'ext_atomic_acc_01',
        name: 'Atomic Investment Account',
        type: 'investment',
        balance: '25000.00',
        currency: 'USD',
        isHidden: false,
        isExcludedFromNetWorth: false,
      }, dek);
      const [newAcc] = await tx.insert(accounts).values(encAcc).returning();

      const encTx = await encryptRow('transactions', {
        userId,
        accountId: newAcc.id,
        externalId: 'tx_atomic_001',
        date: '2026-08-15',
        amount: '100.00',
        description: 'Dividend Received',
        isPending: false,
      }, dek);
      await tx.insert(transactions).values(encTx);
    });

    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
    expect(userAccounts.length).toBe(1);

    const userTxs = await db.select().from(transactions).where(eq(transactions.userId, userId));
    expect(userTxs.length).toBe(1);
  });
});
