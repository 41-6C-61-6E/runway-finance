import { getDb } from '@/lib/db';
import {
  accounts,
  tags,
  paystubFieldMappings,
  paystubLineItems,
  transactions,
  transactionTags,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptRow, decryptRows } from '@/lib/crypto';
import { isAssetAccount } from '@/lib/utils/account-scope';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

/**
 * Ensures that a hidden virtual account "From Paystub" exists for the user.
 */
export async function ensureVirtualPaystubAccount(
  db: ReturnType<typeof getDb>,
  userId: string,
  dek?: Uint8Array
): Promise<string> {
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.type, 'paystub')))
    .limit(1);

  if (userAccounts.length > 0) {
    return userAccounts[0].id;
  }

  const rawValues = {
    userId,
    connectionId: null,
    externalId: `virtual-paystub-${userId}`,
    name: 'From Paystub',
    currency: 'USD',
    balance: '0',
    balanceDate: new Date(),
    type: 'paystub',
    metadata: null,
    institution: null,
    isHidden: true,
    isExcludedFromNetWorth: true,
    displayOrder: 0,
  };

  const values = dek ? await encryptRow('accounts', rawValues, dek) : rawValues;

  const [created] = await db
    .insert(accounts)
    .values(values)
    .returning();

  return created.id;
}

/**
 * Ensures that a tag named "paystub" exists for the user.
 */
export async function ensurePaystubTag(
  db: ReturnType<typeof getDb>,
  userId: string,
  dek?: Uint8Array
): Promise<string> {
  const userTags = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId));

  const decrypted = dek ? await decryptRows('tags', userTags, dek) : userTags;
  const existing = decrypted.find((t) => t.name.toLowerCase() === 'paystub');
  if (existing) {
    return existing.id;
  }

  const rawValues = {
    userId,
    name: 'paystub',
    color: '#6366f1',
    description: 'Auto-applied to paystub transactions',
  };

  const values = dek ? await encryptRow('tags', rawValues, dek) : rawValues;
  const [created] = await db
    .insert(tags)
    .values(values)
    .returning();

  return created.id;
}

/**
 * Create transactions from paystub line items.
 * Shared logic used by manual POST, import, and auto-generate.
 */
export async function createTransactionsFromLineItems(
  db: ReturnType<typeof getDb>,
  userId: string,
  paystub: { id: string; checkDate: string; mappingId?: string | null },
  lineItems: Array<{
    id: string;
    section: string;
    description: string;
    amount: string;
    mappingAction: string;
    categoryId: string | null;
  }>,
  employerName: string,
  checkDate: string,
  dek?: Uint8Array
) {
  // Resolve target account, tag, and mappings JSON from the field mapping template if specified
  let mappingsJson: Record<string, { action: string; categoryId: string | null; accountId?: string | null; tagId?: string | null }> = {};
  let targetAccountId: string | null = null;
  let targetTagId: string | null = null;

  if (paystub.mappingId) {
    const [mapping] = await db
      .select({
        accountId: paystubFieldMappings.accountId,
        tagId: paystubFieldMappings.tagId,
        mappings: paystubFieldMappings.mappings,
      })
      .from(paystubFieldMappings)
      .where(eq(paystubFieldMappings.id, paystub.mappingId))
      .limit(1);

    if (mapping) {
      targetAccountId = mapping.accountId;
      targetTagId = mapping.tagId;
      mappingsJson = (mapping.mappings || {}) as any;
    }
  }

  // Pre-resolve virtual fallbacks lazily
  let virtualAccountId: string | null = null;
  let defaultTagId: string | null = null;

  async function getFallbackAccountId() {
    if (!virtualAccountId) {
      virtualAccountId = await ensureVirtualPaystubAccount(db, userId, dek);
    }
    return virtualAccountId;
  }

  async function getFallbackTagId() {
    if (!defaultTagId) {
      defaultTagId = await ensurePaystubTag(db, userId, dek);
    }
    return defaultTagId;
  }

  async function resolveAccountAndTagForLine(section: string, description: string) {
    const lookupKey = `${section}:${description}`;
    const mappingEntry = mappingsJson[lookupKey];
    const accId = mappingEntry?.accountId || targetAccountId || (await getFallbackAccountId());
    const tgId = mappingEntry?.tagId || targetTagId || (await getFallbackTagId());
    return { accountId: accId, tagId: tgId };
  }

  const mappedItems = lineItems.filter(
    (item) => item.mappingAction === 'import' && item.categoryId
  );

  if (mappedItems.length === 0) return;

  // EARNINGS: Group earnings items by their resolved account and tag
  const earningsItems = mappedItems.filter((item) => item.section === 'earnings');
  if (earningsItems.length > 0) {
    const groups: Record<string, { items: typeof earningsItems; accountId: string; tagId: string; categoryId: string }> = {};

    for (const item of earningsItems) {
      const { accountId, tagId } = await resolveAccountAndTagForLine(item.section, item.description);
      const key = `${accountId}::${tagId}::${item.categoryId}`;
      if (!groups[key]) {
        groups[key] = { items: [], accountId, tagId, categoryId: item.categoryId };
      }
      groups[key].items.push(item);
    }

    for (const groupKey of Object.keys(groups)) {
      const { items, accountId, tagId, categoryId } = groups[groupKey];
      const totalEarnings = items.reduce(
        (sum, item) => sum + parseFloat(item.amount || '0'),
        0
      );
      const earningsExternalId = `paystub-${paystub.id}-${items[0].id}`;

      const txnValues = {
        userId,
        accountId: accountId,
        externalId: earningsExternalId,
        date: checkDate,
        amount: String(totalEarnings),
        description: `Paycheck - ${employerName}`,
        source: 'paystub',
        paystubId: paystub.id,
        categoryId: categoryId,
        reviewed: true,
      };
      const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;

      const [txn] = await db
        .insert(transactions)
        .values(encryptedTxn)
        .returning();

      // Link tag to transaction
      await db.insert(transactionTags).values({
        transactionId: txn.id,
        tagId: tagId,
      });

      // Link all matching earnings line items to this transaction
      for (const item of items) {
        await db
          .update(paystubLineItems)
          .set({ transactionId: txn.id })
          .where(eq(paystubLineItems.id, item.id));
      }
    }
  }

  // Pre-fetch user account types to detect asset destination accounts
  const userAccounts = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const accountTypeById = new Map(userAccounts.map((a) => [a.id, a.type]));

  // TAXES and DEDUCTIONS: Create individual transactions
  const expenseItems = mappedItems.filter(
    (item) =>
      item.section === 'taxes' ||
      item.section === 'before_tax_deductions' ||
      item.section === 'after_tax_deductions'
  );

  for (const item of expenseItems) {
    const amount = parseFloat(item.amount || '0');
    const { accountId, tagId } = await resolveAccountAndTagForLine(item.section, item.description);
    const targetType = accountTypeById.get(accountId) || (virtualAccountId === accountId ? 'paystub' : '');

    const isDeduction = item.section === 'before_tax_deductions' || item.section === 'after_tax_deductions';
    const isAssetDest = targetType !== 'paystub' && isAssetAccount(targetType);
    const signedAmount = (isDeduction && isAssetDest) ? Math.abs(amount) : -Math.abs(amount);

    const externalId = `paystub-${paystub.id}-${item.id}`;

    const txnValues = {
      userId,
      accountId: accountId,
      externalId,
      date: checkDate,
      amount: String(signedAmount),
      description: item.description,
      source: 'paystub',
      paystubId: paystub.id,
      categoryId: item.categoryId,
      reviewed: true,
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;

    const [txn] = await db
      .insert(transactions)
      .values(encryptedTxn)
      .returning();

    // Link tag to transaction
    await db.insert(transactionTags).values({
      transactionId: txn.id,
      tagId: tagId,
    });

    await db
      .update(paystubLineItems)
      .set({ transactionId: txn.id })
      .where(eq(paystubLineItems.id, item.id));
  }

  invalidateUserSearchCache(userId);
}

