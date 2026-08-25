import { getDb } from '@/lib/db';
import { recurringTransactions, transactions, categories, accounts, userSettings, transactionTags } from '@/lib/db/schema';
import { eq, and, sql, desc, gte, inArray } from 'drizzle-orm';
import { decryptRows, encryptRow } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { getUserTransactionsFromCache } from '@/lib/services/search-cache';
import { getShareGroupUserIds } from '@/lib/sharing';

import {
  type FrequencyType,
  normalizeMerchantName,
  patternMatches,
  addFrequencyPeriod,
  calculateNextExpectedDate,
} from '@/lib/utils/recurring';
export {
  type FrequencyType,
  normalizeMerchantName,
  patternMatches,
  addFrequencyPeriod,
  calculateNextExpectedDate,
};

const LOG_TAG = '[recurring-detection]';

interface RecurringExclusions {
  categoryIds?: string[];
  accountIds?: string[];
  accountTypes?: string[];
  tagIds?: string[];
  merchantPatterns?: string[];
}

/**
 * Merges recurring-exclusion settings from multiple user_settings rows into
 * the union of each list (in share groups, every member may set exclusions
 * on their own row). Deduplicates while preserving first-seen order.
 */
export function mergeRecurringExclusions(
  rows: Array<{ recurringExclusions?: unknown } | null | undefined>
): RecurringExclusions {
  const merged: RecurringExclusions = {
    categoryIds: [],
    accountIds: [],
    accountTypes: [],
    tagIds: [],
    merchantPatterns: [],
  };
  const union = (key: keyof RecurringExclusions, values: unknown[]) => {
    for (const v of values) {
      if (typeof v !== 'string' || !v) continue;
      const list = merged[key] as string[];
      if (!list.includes(v)) list.push(v);
    }
  };
  for (const row of rows) {
    const ex = row?.recurringExclusions as Partial<RecurringExclusions> | null | undefined;
    if (!ex || typeof ex !== 'object') continue;
    union('categoryIds', ex.categoryIds ?? []);
    union('accountIds', ex.accountIds ?? []);
    union('accountTypes', ex.accountTypes ?? []);
    union('tagIds', ex.tagIds ?? []);
    union('merchantPatterns', ex.merchantPatterns ?? []);
  }
  return merged;
}

/**
 * Calculates median of an array of numbers.
 */
function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates mean and standard deviation.
 */
function calculateMeanAndStdDev(arr: number[]): { mean: number; stdDev: number; cv: number } {
  if (arr.length === 0) return { mean: 0, stdDev: 0, cv: 0 };
  const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
  if (arr.length === 1) return { mean, stdDev: 0, cv: 0 };
  const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;
  return { mean, stdDev, cv };
}

/**
 * Classifies recurrence frequency based on inter-transaction day intervals.
 */
export function classifyFrequency(intervals: number[]): {
  frequency: FrequencyType | null;
  regularity: number;
} {
  if (intervals.length === 0) return { frequency: null, regularity: 0 };

  const median = calculateMedian(intervals);

  // Band definitions with tolerances
  const bands: { freq: FrequencyType; min: number; max: number; target: number }[] = [
    { freq: 'weekly', min: 5, max: 9, target: 7 },
    { freq: 'biweekly', min: 11, max: 17, target: 14 },
    { freq: 'monthly', min: 25, max: 35, target: 30 },
    { freq: 'quarterly', min: 80, max: 105, target: 91 },
    { freq: 'semi_annual', min: 160, max: 205, target: 182 },
    { freq: 'annual', min: 330, max: 400, target: 365 },
  ];

  for (const band of bands) {
    if (median >= band.min && median <= band.max) {
      // Calculate how many intervals fall within the band
      const matching = intervals.filter((i) => i >= band.min && i <= band.max).length;
      const regularity = matching / intervals.length;
      if (regularity >= 0.50) {
        return { frequency: band.freq, regularity };
      }
    }
  }

  return { frequency: null, regularity: 0 };
}



/**
 * Converts frequency to monthly amount multiplier.
 */
export function getMonthlyMultiplier(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 52 / 12;
    case 'biweekly':
      return 26 / 12;
    case 'semi_monthly':
      return 2;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 1 / 3;
    case 'semi_annual':
      return 1 / 6;
    case 'annual':
      return 1 / 12;
    default:
      return 1;
  }
}

/**
 * Converts frequency to annual amount multiplier.
 */
export function getAnnualMultiplier(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'semi_monthly':
      return 24;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'semi_annual':
      return 2;
    case 'annual':
      return 1;
    default:
      return 12;
  }
}

export function getMaxRecencyDays(frequency: FrequencyType): number {
  switch (frequency) {
    case 'weekly':
      return 28;
    case 'biweekly':
    case 'semi_monthly':
      return 45;
    case 'monthly':
      return 65;
    case 'quarterly':
      return 130;
    case 'semi_annual':
      return 220;
    case 'annual':
      return 400;
    default:
      return 65;
  }
}

interface DetectedCandidate {
  merchantName: string;
  matchPattern: string;
  accountId: string | null;
  categoryId: string | null;
  frequency: FrequencyType;
  averageAmount: number;
  lastAmount: number;
  lastDate: string;
  nextExpectedDate: string;
  flowType: 'income' | 'expense';
  occurrenceCount: number;
  confidence: number;
}

/**
 * Core engine: Detects recurring transactions from user transaction history.
 */
export async function detectRecurringTransactions(
  userId: string,
  dek: Uint8Array,
  options?: { lookbackMonths?: number; referenceDate?: string }
): Promise<{ created: number; updated: number; totalDetected: number }> {
  const db = getDb();
  const lookbackMonths = options?.lookbackMonths || 12;
  const referenceDate = options?.referenceDate || new Date().toISOString().split('T')[0];

  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
  const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

  // 1. Fetch user accounts, categories, and settings for exclusion filters
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

    // Personalization rule: exclusion settings are stored per session user, so a
    // shared group can have multiple configured rows (primary + members). Merge
    // the group's rows and treat the union as the effective exclusions — member
    // exclusions are no longer silently ignored. getShareGroupUserIds returns
    // [userId, ...activeMembers]; [userId] for a user with no share group.
    const groupIds = await getShareGroupUserIds(userId);
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(inArray(userSettings.userId, groupIds));

  const customExcl = mergeRecurringExclusions(settingsRows as Array<{ recurringExclusions?: unknown }>);

  // Build exclusion sets
  const excludedAccountIds = new Set<string>();
  for (const acc of userAccounts) {
    if (acc.type === 'paystub' || acc.externalId?.startsWith('virtual-')) {
      excludedAccountIds.add(acc.id.toString());
    }
  }
  for (const accId of (customExcl.accountIds || [])) {
    if (accId) excludedAccountIds.add(accId.toString());
  }

  // Account-type exclusions (e.g. '401k', 'mortgage', 'investment'): every
  // account whose type matches is excluded. Comparison is normalized
  // (lowercase, alphanumerics only) to tolerate casing/separator variants.
  const normTypeKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const excludedAccountTypeKeys = new Set<string>(
    ((customExcl.accountTypes || []) as string[])
      .map((t) => normTypeKey(String(t)))
      .filter(Boolean)
  );
  if (excludedAccountTypeKeys.size > 0) {
    for (const acc of userAccounts) {
      const key = normTypeKey(String(acc.type || ''));
      if (key && excludedAccountTypeKeys.has(key)) {
        excludedAccountIds.add(acc.id.toString());
      }
    }
  }

  const excludedCategoryIds = new Set<string>();
  for (const cat of userCategories) {
    if (cat.excludeFromReports || cat.name.toLowerCase().includes('transfer')) {
      excludedCategoryIds.add(cat.id.toString());
    }
  }
  for (const catId of (customExcl.categoryIds || [])) {
    if (catId) excludedCategoryIds.add(catId.toString());
  }

  // Category hierarchy: excluding a parent category also excludes any
  // transaction categorized to a descendant of it. Walk up the ancestor
  // chain for each transaction's category (bounded to avoid cycles).
  const categoryParentById = new Map<string, string | null>();
  for (const cat of userCategories) {
    categoryParentById.set(cat.id.toString(), cat.parentId ? cat.parentId.toString() : null);
  }
  const isCategoryExcluded = (catId: string): boolean => {
    let cur: string | null = catId;
    let guard = 0;
    while (cur && guard < 32) {
      if (excludedCategoryIds.has(cur)) return true;
      cur = categoryParentById.get(cur) ?? null;
      guard += 1;
    }
    return false;
  };

  const excludedMerchantPatterns: string[] = (customExcl.merchantPatterns || [])
    .map((p: string) => p.toLowerCase().trim())
    .filter(Boolean);

  // 2. Fetch user transactions (decrypted)
  const rawTxns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.deleted, false),
        eq(transactions.ignored, false),
        gte(transactions.date, lookbackDateStr)
      )
    );

  if (rawTxns.length === 0) {
    return { created: 0, updated: 0, totalDetected: 0 };
  }

  const decryptedTxns = await decryptRows('transactions', rawTxns, dek);

  // Tag-based exclusions: any transaction carrying an excluded tag is
  // skipped directly (no split-group expansion — a tagged parent does not
  // exclude its untagged children, matching the budgets tag-exclusion
  // semantics). One join-table query scoped to the fetched transaction ids.
  const excludedTagIds = (customExcl.tagIds || [])
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
  const excludedTaggedTxIds = new Set<string>();
  if (excludedTagIds.length > 0) {
    const taggedRows = await db
      .select({ transactionId: transactionTags.transactionId })
      .from(transactionTags)
      .where(
        and(
          inArray(transactionTags.tagId, excludedTagIds),
          inArray(transactionTags.transactionId, rawTxns.map((t) => t.id))
        )
      );
    for (const row of taggedRows) {
      if (row.transactionId) excludedTaggedTxIds.add(row.transactionId.toString());
    }
  }

  // 3. Group transactions by normalized merchant pattern + flowType + account
  type TxItem = {
    id: string;
    date: string;
    amount: number;
    description: string;
    payee: string | null;
    accountId: string;
    categoryId: string | null;
  };

  const groups = new Map<string, { merchantName: string; matchPattern: string; txs: TxItem[]; flowType: 'income' | 'expense' }>();

  for (const tx of decryptedTxns) {
    // Filter virtual/paystub accounts, transfers, and user exclusions
    if (tx.id && excludedTaggedTxIds.has(tx.id.toString())) continue;
    if (tx.accountId && excludedAccountIds.has(tx.accountId.toString())) continue;
    if (tx.paystubId || (tx as any).source === 'paystub' || (tx as any).isTransfer) continue;
    if (tx.categoryId && isCategoryExcluded(tx.categoryId.toString())) continue;

    const rawDesc = tx.payee || tx.description || '';
    if (!rawDesc || rawDesc.trim().length === 0) continue;

    // Check custom merchant pattern exclusions
    if (excludedMerchantPatterns.some((pat) => patternMatches(rawDesc, pat))) {
      continue;
    }

    const normName = normalizeMerchantName(rawDesc);
    if (!normName || normName.length < 2) continue;

    const amountNum = parseFloat(tx.amount || '0');
    if (isNaN(amountNum) || amountNum === 0) continue;

    const flowType: 'income' | 'expense' = amountNum > 0 ? 'income' : 'expense';
    const matchKey = `${normName.toLowerCase()}::${tx.accountId}::${flowType}`;

    if (!groups.has(matchKey)) {
      groups.set(matchKey, {
        merchantName: normName,
        matchPattern: normName.toLowerCase(),
        txs: [],
        flowType,
      });
    }

    groups.get(matchKey)!.txs.push({
      id: tx.id,
      date: typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0],
      amount: Math.abs(amountNum),
      description: tx.description || '',
      payee: tx.payee || null,
      accountId: tx.accountId,
      categoryId: tx.categoryId,
    });
  }

  // 4. Analyze each candidate group
  const detectedCandidates: DetectedCandidate[] = [];

  for (const group of groups.values()) {
    // Sort ascending by date
    const sortedTxs = [...group.txs].sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate same-day charges from the same merchant (e.g. split items or accidental double auth)
    const dedupedTxs: TxItem[] = [];
    for (const tx of sortedTxs) {
      const prev = dedupedTxs[dedupedTxs.length - 1];
      if (prev && prev.date === tx.date) {
        // Aggregate amount
        prev.amount += tx.amount;
      } else {
        dedupedTxs.push({ ...tx });
      }
    }

    if (dedupedTxs.length < 2) continue;

    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < dedupedTxs.length; i++) {
      const d1 = new Date(dedupedTxs[i - 1].date + 'T00:00:00Z');
      const d2 = new Date(dedupedTxs[i].date + 'T00:00:00Z');
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        intervals.push(diffDays);
      }
    }

    if (intervals.length === 0) continue;

    const { frequency, regularity } = classifyFrequency(intervals);
    if (!frequency) continue;

    // Minimum occurrences threshold
    const minOccurrences = frequency === 'annual' || frequency === 'semi_annual' ? 2 : 3;
    if (dedupedTxs.length < minOccurrences) continue;

    // Recency threshold check: omit lapsed/ended subscriptions
    const lastTx = dedupedTxs[dedupedTxs.length - 1];
    const daysSinceLastTx = Math.round(
      (new Date(referenceDate + 'T00:00:00Z').getTime() - new Date(lastTx.date + 'T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const maxRecency = getMaxRecencyDays(frequency);
    if (daysSinceLastTx > maxRecency) {
      // Historical subscription that no longer recurs (e.g. ended > 65d ago)
      continue;
    }

    // Amount stats
    const amounts = dedupedTxs.map((t) => t.amount);
    const { mean, cv } = calculateMeanAndStdDev(amounts);

    // Skip high variance (unless high occurrence)
    if (cv > 0.40 && dedupedTxs.length < 5) continue;

    // Compute confidence (0-100)
    let amtScore = 100;
    if (cv < 0.05) amtScore = 100;
    else if (cv < 0.15) amtScore = 88;
    else if (cv < 0.30) amtScore = 72;
    else amtScore = 55;

    const occScore = Math.min(100, dedupedTxs.length * 15);
    const confidence = Math.min(
      100,
      Math.max(10, Math.round(0.45 * amtScore + 0.40 * (regularity * 100) + 0.15 * occScore))
    );

    const nextExpected = calculateNextExpectedDate(lastTx.date, frequency, referenceDate);

    // Pick most frequent categoryId
    const catCounts = new Map<string, number>();
    for (const t of dedupedTxs) {
      if (t.categoryId) {
        catCounts.set(t.categoryId, (catCounts.get(t.categoryId) || 0) + 1);
      }
    }
    let topCategoryId: string | null = null;
    let maxCount = 0;
    for (const [catId, count] of catCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topCategoryId = catId;
      }
    }

    detectedCandidates.push({
      merchantName: group.merchantName,
      matchPattern: group.matchPattern,
      accountId: lastTx.accountId,
      categoryId: topCategoryId,
      frequency,
      averageAmount: Math.round(mean * 100) / 100,
      lastAmount: Math.round(lastTx.amount * 100) / 100,
      lastDate: lastTx.date,
      nextExpectedDate: nextExpected,
      flowType: group.flowType,
      occurrenceCount: dedupedTxs.length,
      confidence,
    });
  }

  // 4. Fetch existing recurring transactions to perform smart upsert preserving user overrides
  const existingRows = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.userId, userId));

  const existingDecrypted = await decryptRows('recurring_transactions', existingRows, dek);

  // Index existing rows by each pattern alternative (first row wins per alternative)
  const existingByPattern = new Map<string, typeof existingDecrypted[0]>();
  for (const item of existingDecrypted) {
    for (const alt of (item.matchPattern || item.merchantName || '').toLowerCase().split('|')) {
      const p = alt.trim();
      if (p && !existingByPattern.has(p)) {
        existingByPattern.set(p, item);
      }
    }
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const candidate of detectedCandidates) {
    let existing: typeof existingDecrypted[0] | undefined;
    for (const alt of candidate.matchPattern.toLowerCase().split('|')) {
      const p = alt.trim();
      if (p) {
        const match = existingByPattern.get(p);
        if (match) {
          existing = match;
          break;
        }
      }
    }

    if (existing) {
      // Don't overwrite if dismissed or user explicitly paused
      const updateData: Record<string, any> = {
        lastAmount: String(candidate.lastAmount),
        averageAmount: String(candidate.averageAmount),
        lastDate: candidate.lastDate,
        occurrenceCount: candidate.occurrenceCount,
        confidence: existing.isConfirmed ? 100 : Math.max(existing.confidence, candidate.confidence),
        updatedAt: new Date(),
      };

      // Only advance the projected date when a newer payment was seen; otherwise preserve user state
      const hasNewPayment = candidate.lastDate > (existing.lastDate || '');
      if (hasNewPayment) {
        const effectiveFrequency: FrequencyType = existing.isConfirmed
          ? (existing.frequency as FrequencyType)
          : candidate.frequency;
        updateData.nextExpectedDate = calculateNextExpectedDate(candidate.lastDate, effectiveFrequency, referenceDate);
      } else if (!existing.nextExpectedDate) {
        updateData.nextExpectedDate = candidate.nextExpectedDate;
      }

      // Only update frequency if user hasn't confirmed
      if (!existing.isConfirmed) {
        updateData.frequency = candidate.frequency;
      }

      // If existing category is null and we found one, populate it
      if (!existing.categoryId && candidate.categoryId) {
        updateData.categoryId = candidate.categoryId;
      }

      const encryptedUpdate = await encryptRow('recurring_transactions', updateData, dek);

      await db
        .update(recurringTransactions)
        .set(encryptedUpdate)
        .where(eq(recurringTransactions.id, existing.id));

      updatedCount++;
    } else {
      // Insert new recurring record
      const insertData = {
        userId,
        merchantName: candidate.merchantName,
        matchPattern: candidate.matchPattern,
        accountId: candidate.accountId,
        categoryId: candidate.categoryId,
        frequency: candidate.frequency,
        averageAmount: String(candidate.averageAmount),
        lastAmount: String(candidate.lastAmount),
        lastDate: candidate.lastDate,
        nextExpectedDate: candidate.nextExpectedDate,
        flowType: candidate.flowType,
        isConfirmed: candidate.confidence >= 90, // Auto-confirm extremely confident matches
        isDismissed: false,
        isPaused: false,
        customName: null,
        notes: null,
        occurrenceCount: candidate.occurrenceCount,
        confidence: candidate.confidence,
      };

      const encryptedInsert = await encryptRow('recurring_transactions', insertData, dek);

      await db.insert(recurringTransactions).values(encryptedInsert);
      createdCount++;
    }
  }

  logger.info(`${LOG_TAG} Recurring detection completed`, {
    userId,
    detected: detectedCandidates.length,
    created: createdCount,
    updated: updatedCount,
  });

  return {
    created: createdCount,
    updated: updatedCount,
    totalDetected: detectedCandidates.length,
  };
}

export interface RecurringItem {
  id: string;
  userId: string;
  merchantName: string;
  matchPattern: string;
  displayName: string;
  customName: string | null;
  notes: string | null;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string;
  frequency: FrequencyType;
  averageAmount: number;
  lastAmount: number;
  monthlyAmount: number;
  annualAmount: number;
  lastDate: string;
  nextExpectedDate: string | null;
  daysUntilNext: number | null;
  isOverdue: boolean;
  flowType: string;
  isConfirmed: boolean;
  isDismissed: boolean;
  isPaused: boolean;
  occurrenceCount: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Retrieves recurring transactions for a user with resolved account and category names.
 */
export function applyRecurringFilters(
  items: RecurringItem[],
  options?: {
    flowType?: string;
    includeDismissed?: boolean;
    status?: string;
    search?: string;
    accountId?: string;
    categoryId?: string;
  }
): RecurringItem[] {
  let results = items;

  // Apply filters
  if (!options?.includeDismissed) {
    results = results.filter((r) => !r.isDismissed);
  }

  if (options?.flowType && options.flowType !== 'all') {
    results = results.filter((r) => r.flowType === options.flowType);
  }

  if (options?.status) {
    if (options.status === 'active') {
      results = results.filter((r) => !r.isPaused && !r.isDismissed);
    } else if (options.status === 'paused') {
      results = results.filter((r) => r.isPaused);
    } else if (options.status === 'dismissed') {
      results = results.filter((r) => r.isDismissed);
    } else if (options.status === 'needs_review') {
      results = results.filter((r) => !r.isConfirmed && !r.isDismissed && !r.isPaused);
    }
  }

  if (options?.accountId) {
    results = results.filter((r) => r.accountId === options.accountId);
  }

  if (options?.categoryId) {
    results = results.filter((r) => r.categoryId === options.categoryId);
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    results = results.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.merchantName.toLowerCase().includes(q) ||
        (r.categoryName && r.categoryName.toLowerCase().includes(q))
    );
  }

  return results;
}

export async function getRecurringTransactions(
  userId: string,
  dek: Uint8Array,
  options?: {
    flowType?: string;
    includeDismissed?: boolean;
    status?: string;
    search?: string;
    accountId?: string;
    categoryId?: string;
    countOnly?: boolean;
  }
): Promise<RecurringItem[] | { count: number }> {
  const db = getDb();

  // 1. Fetch recurring transactions
  const rows = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.userId, userId))
    .orderBy(desc(recurringTransactions.confidence), desc(recurringTransactions.occurrenceCount));

  const decrypted = await decryptRows('recurring_transactions', rows, dek);

  // 2. Fetch categories and accounts for name resolution (display-only; skippable for counts)
  const userCats =
    options?.countOnly && !options.search
      ? []
      : await db.select().from(categories).where(eq(categories.userId, userId));
  const userAccounts = options?.countOnly
    ? []
    : await db.select().from(accounts).where(eq(accounts.userId, userId));

  const decryptedCats = await decryptRows('categories', userCats, dek);
  const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);

  const catMap = new Map(decryptedCats.map((c) => [c.id, c]));
  const accMap = new Map(decryptedAccounts.map((a) => [a.id, a]));

  const today = new Date().toISOString().split('T')[0];

  // 3. Transform and filter
  const results: RecurringItem[] = decrypted.map((item) => {
    const avgAmt = parseFloat(item.averageAmount || '0') || 0;
    const lastAmt = parseFloat(item.lastAmount || '0') || 0;
    const cat = item.categoryId ? catMap.get(item.categoryId) : undefined;
    const acc = item.accountId ? accMap.get(item.accountId) : undefined;

    const monthlyMultiplier = getMonthlyMultiplier(item.frequency);
    const annualMultiplier = getAnnualMultiplier(item.frequency);

    const monthlyAmount = avgAmt * monthlyMultiplier;
    const annualAmount = avgAmt * annualMultiplier;

    // Days until next expected date
    let daysUntilNext: number | null = null;
    let isOverdue = false;
    if (item.nextExpectedDate) {
      const t1 = new Date(today + 'T00:00:00Z').getTime();
      const t2 = new Date(item.nextExpectedDate + 'T00:00:00Z').getTime();
      daysUntilNext = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
      if (daysUntilNext < 0) {
        isOverdue = true;
      }
    }

    return {
      id: item.id,
      userId: item.userId,
      merchantName: item.merchantName,
      matchPattern: item.matchPattern,
      displayName: item.customName || item.merchantName,
      customName: item.customName || null,
      notes: item.notes || null,
      accountId: item.accountId,
      accountName: acc?.name || null,
      categoryId: item.categoryId,
      categoryName: cat?.name || null,
      categoryColor: cat?.color || '#6366f1',
      frequency: item.frequency as FrequencyType,
      averageAmount: avgAmt,
      lastAmount: lastAmt,
      monthlyAmount: Math.round(monthlyAmount * 100) / 100,
      annualAmount: Math.round(annualAmount * 100) / 100,
      lastDate: item.lastDate,
      nextExpectedDate: item.nextExpectedDate,
      daysUntilNext,
      isOverdue,
      flowType: item.flowType || 'expense',
      isConfirmed: item.isConfirmed,
      isDismissed: item.isDismissed,
      isPaused: item.isPaused,
      occurrenceCount: item.occurrenceCount,
      confidence: item.confidence,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  const filtered = applyRecurringFilters(results, options);

  if (options?.countOnly) {
    return { count: filtered.length };
  }

  return filtered;
}

/**
 * Retrieves a single recurring transaction group with matched transactions history.
 */
export async function getRecurringTransactionById(id: string, userId: string, dek: Uint8Array) {
  const db = getDb();

  const [row] = await db
    .select()
    .from(recurringTransactions)
    .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId)))
    .limit(1);

  if (!row) return null;

  const [decrypted] = await decryptRows('recurring_transactions', [row], dek);

  // Fetch matched transactions history (capped to a 24-month lookback)
  const floorDate = new Date();
  floorDate.setMonth(floorDate.getMonth() - 24);
  const floorStr = floorDate.toISOString().split('T')[0];

  const allUserTxns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.deleted, false),
        eq(transactions.ignored, false),
        gte(transactions.date, floorStr)
      )
    )
    .orderBy(desc(transactions.date));

  const decryptedTxns = await decryptRows('transactions', allUserTxns, dek);

  const pattern = decrypted.matchPattern || decrypted.merchantName || '';
  const matchedTxs = decryptedTxns.filter((tx) => {
    if (decrypted.accountId && tx.accountId !== decrypted.accountId) return false;
    const desc = tx.payee || tx.description || '';
    return patternMatches(desc, pattern);
  });

  const history = matchedTxs.slice(0, 24).map((tx) => ({
    id: tx.id,
    date: typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0],
    amount: Math.abs(parseFloat(tx.amount || '0') || 0),
    description: tx.description,
    payee: tx.payee,
    pending: tx.pending,
  }));

  // Sparkline data (chronological)
  const sparkline = [...history].reverse().map((h) => ({
    date: h.date,
    amount: h.amount,
  }));

  const totalSpentLifetime = history.reduce((sum, h) => sum + h.amount, 0);

  return {
    ...decrypted,
    averageAmount: parseFloat(decrypted.averageAmount || '0') || 0,
    lastAmount: parseFloat(decrypted.lastAmount || '0') || 0,
    history,
    sparkline,
    totalSpentLifetime: Math.round(totalSpentLifetime * 100) / 100,
  };
}

/**
 * Updates a recurring transaction item.
 */
export async function updateRecurringTransaction(
  id: string,
  userId: string,
  dek: Uint8Array,
  updates: {
    merchantName?: string;
    matchPattern?: string;
    accountId?: string | null;
    categoryId?: string | null;
    frequency?: FrequencyType;
    averageAmount?: number;
    lastAmount?: number;
    lastDate?: string;
    nextExpectedDate?: string | null;
    flowType?: 'income' | 'expense';
    isConfirmed?: boolean;
    isDismissed?: boolean;
    isPaused?: boolean;
    customName?: string | null;
    notes?: string | null;
  }
) {
  const db = getDb();

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updates.merchantName !== undefined) updateData.merchantName = updates.merchantName;
  if (updates.matchPattern !== undefined) updateData.matchPattern = updates.matchPattern;
  if (updates.accountId !== undefined) updateData.accountId = updates.accountId;
  if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId;
  if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
  if (updates.averageAmount !== undefined) updateData.averageAmount = String(updates.averageAmount);
  if (updates.lastAmount !== undefined) updateData.lastAmount = String(updates.lastAmount);
  if (updates.lastDate !== undefined) updateData.lastDate = updates.lastDate;
  if (updates.nextExpectedDate !== undefined) updateData.nextExpectedDate = updates.nextExpectedDate;
  if (updates.flowType !== undefined) updateData.flowType = updates.flowType;
  if (updates.isConfirmed !== undefined) updateData.isConfirmed = updates.isConfirmed;
  if (updates.isDismissed !== undefined) updateData.isDismissed = updates.isDismissed;
  if (updates.isPaused !== undefined) updateData.isPaused = updates.isPaused;
  if (updates.customName !== undefined) updateData.customName = updates.customName;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const encrypted = await encryptRow('recurring_transactions', updateData, dek);

  const [updated] = await db
    .update(recurringTransactions)
    .set(encrypted)
    .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId)))
    .returning();

  if (!updated) return null;
  const [decrypted] = await decryptRows('recurring_transactions', [updated], dek);
  return decrypted;
}

/**
 * Previews transactions that match a given pattern or merchant name.
 */
export async function previewMatchingTransactions(
  userId: string,
  dek: Uint8Array,
  pattern: string,
  accountId?: string | null
) {
  if (!pattern || pattern.trim().length === 0) {
    return { count: 0, totalAmount: 0, averageAmount: 0, latestDate: null, suggestedFrequency: null, recentTransactions: [] };
  }

  const db = getDb();
  const floorDate = new Date();
  floorDate.setMonth(floorDate.getMonth() - 24);
  const floorStr = floorDate.toISOString().split('T')[0];

  const allUserTxns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.deleted, false),
        eq(transactions.ignored, false),
        gte(transactions.date, floorStr)
      )
    )
    .orderBy(desc(transactions.date));

  const decryptedTxns = await decryptRows('transactions', allUserTxns, dek);

  const matched = decryptedTxns.filter((tx) => {
    if (accountId && tx.accountId !== accountId) return false;
    const desc = tx.payee || tx.description || '';
    return patternMatches(desc, pattern);
  });

  if (matched.length === 0) {
    return { count: 0, totalAmount: 0, averageAmount: 0, latestDate: null, suggestedFrequency: null, recentTransactions: [] };
  }

  const sortedAsc = [...matched].sort((a, b) => (a.date < b.date ? -1 : 1));
  const amounts = matched.map((t) => Math.abs(parseFloat(t.amount || '0') || 0));
  const totalAmount = Math.round(amounts.reduce((sum, a) => sum + a, 0) * 100) / 100;
  const averageAmount = Math.round((totalAmount / (amounts.length || 1)) * 100) / 100;

  // Calculate intervals
  let suggestedFrequency: FrequencyType | null = null;
  if (sortedAsc.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < sortedAsc.length; i++) {
      const d1 = new Date((sortedAsc[i - 1].date as string).split('T')[0] + 'T00:00:00Z');
      const d2 = new Date((sortedAsc[i].date as string).split('T')[0] + 'T00:00:00Z');
      const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) intervals.push(diff);
    }
    if (intervals.length > 0) {
      const classified = classifyFrequency(intervals);
      suggestedFrequency = classified.frequency;
    }
  }

  return {
    count: matched.length,
    totalAmount,
    averageAmount,
    latestDate: (sortedAsc[sortedAsc.length - 1].date as string).split('T')[0],
    suggestedFrequency,
    recentTransactions: matched.slice(0, 5).map((t) => ({
      id: t.id,
      date: typeof t.date === 'string' ? t.date.split('T')[0] : new Date(t.date).toISOString().split('T')[0],
      amount: parseFloat(t.amount || '0') || 0,
      description: t.description,
      payee: t.payee,
      accountId: t.accountId,
      categoryId: t.categoryId,
    })),
  };
}

/**
 * Deletes a recurring transaction item.
 */
export async function deleteRecurringTransaction(id: string, userId: string) {
  const db = getDb();
  await db
    .delete(recurringTransactions)
    .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId)));
  return true;
}

export interface UpcomingBill {
  id: string;
  recurringId: string;
  merchantName: string;
  displayName: string;
  amount: number;
  expectedDate: string;
  frequency: FrequencyType;
  flowType: 'income' | 'expense';
  accountName: string | null;
  categoryName: string | null;
  categoryColor: string;
  isEstimate: boolean;
  daysUntil: number;
  isOverdue: boolean;
}

/**
 * Retrieves forward-looking upcoming bills/income for the calendar timeline.
 */
export async function getUpcomingBills(
  userId: string,
  dek: Uint8Array,
  daysAhead: number = 30,
  flowType: string = 'all',
  countOnly?: boolean
): Promise<{
  bills: UpcomingBill[];
  count: number;
  stats: {
    dueThisWeek: number;
    dueThisMonth: number;
    paidThisMonth: number;
    totalUpcoming: number;
    incomeThisWeek?: number;
    incomeThisMonth?: number;
    totalUpcomingIncome?: number;
    netThisMonth?: number;
  };
}> {
  const list = (await getRecurringTransactions(userId, dek, {
    status: 'active',
    includeDismissed: false,
    flowType: flowType === 'all' ? undefined : flowType,
  })) as RecurringItem[];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const horizonDate = new Date(todayDate);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + daysAhead);
  const horizonStr = horizonDate.toISOString().split('T')[0];

  const upcomingBills: UpcomingBill[] = [];

  // Project occurrences within window for each active recurring item
  for (const item of list) {
    if (!item.nextExpectedDate) continue;

    const periodDays =
      item.frequency === 'weekly'
        ? 7
        : item.frequency === 'biweekly'
          ? 14
          : item.frequency === 'monthly'
            ? 30
            : item.frequency === 'quarterly'
              ? 91
              : item.frequency === 'semi_annual'
                ? 182
                : item.frequency === 'annual'
                  ? 365
                  : 30;
    const maxIterations = Math.min(104, Math.ceil(daysAhead / periodDays) + 1);

    const origAnchorDate = new Date((item.lastDate || item.nextExpectedDate) + 'T00:00:00Z');
    const initialAnchorDay = isNaN(origAnchorDate.getTime()) ? undefined : origAnchorDate.getUTCDate();

    let projDate = item.nextExpectedDate;
    let safety = 0;

    // If nextExpectedDate is in the past, add as overdue
    if (projDate < todayStr) {
      const t1 = todayDate.getTime();
      const t2 = new Date(projDate + 'T00:00:00Z').getTime();
      const daysDiff = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));

      upcomingBills.push({
        id: `${item.id}-${projDate}`,
        recurringId: item.id,
        merchantName: item.merchantName,
        displayName: item.displayName,
        amount: item.lastAmount || item.averageAmount,
        expectedDate: projDate,
        frequency: item.frequency,
        flowType: (item.flowType as 'income' | 'expense') || 'expense',
        accountName: item.accountName,
        categoryName: item.categoryName,
        categoryColor: item.categoryColor,
        isEstimate: item.confidence < 85,
        daysUntil: daysDiff,
        isOverdue: true,
      });

      // Advance to next upcoming
      projDate = calculateNextExpectedDate(projDate, item.frequency, todayStr, initialAnchorDay);
    }

    // Advance and collect occurrences up to horizon
    while (projDate <= horizonStr && safety < maxIterations) {
      // Guard against degenerate frequency math (e.g. a weekly step that fails
      // to advance): re-emitting the same date would create duplicate bill
      // entries (same `${id}-${date}` key) that break React reconciliation.
      const nextProjDate = addFrequencyPeriod(projDate, item.frequency, initialAnchorDay);
      if (nextProjDate <= projDate) break;

      const t1 = todayDate.getTime();
      const t2 = new Date(projDate + 'T00:00:00Z').getTime();
      const daysDiff = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));

      upcomingBills.push({
        id: `${item.id}-${projDate}`,
        recurringId: item.id,
        merchantName: item.merchantName,
        displayName: item.displayName,
        amount: item.lastAmount || item.averageAmount,
        expectedDate: projDate,
        frequency: item.frequency,
        flowType: (item.flowType as 'income' | 'expense') || 'expense',
        accountName: item.accountName,
        categoryName: item.categoryName,
        categoryColor: item.categoryColor,
        isEstimate: item.confidence < 85,
        daysUntil: daysDiff,
        isOverdue: false,
      });

      projDate = nextProjDate;
      safety++;
    }
  }

  // Sort chronologically
  upcomingBills.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  // Compute summary stats
  const oneWeekAhead = new Date(todayDate);
  oneWeekAhead.setUTCDate(oneWeekAhead.getUTCDate() + 7);
  const oneWeekAheadStr = oneWeekAhead.toISOString().split('T')[0];

  const currentMonth = todayStr.slice(0, 7);

  let dueThisWeek = 0;
  let dueThisMonth = 0;
  let totalUpcoming = 0;

  let incomeThisWeek = 0;
  let incomeThisMonth = 0;
  let totalUpcomingIncome = 0;

  for (const b of upcomingBills) {
    if (b.flowType === 'expense') {
      if (b.expectedDate <= oneWeekAheadStr && !b.isOverdue) {
        dueThisWeek += b.amount;
      }
      if (b.expectedDate.startsWith(currentMonth)) {
        dueThisMonth += b.amount;
      }
      totalUpcoming += b.amount;
    } else {
      if (b.expectedDate <= oneWeekAheadStr && !b.isOverdue) {
        incomeThisWeek += b.amount;
      }
      if (b.expectedDate.startsWith(currentMonth)) {
        incomeThisMonth += b.amount;
      }
      totalUpcomingIncome += b.amount;
    }
  }

  // Calculate paid this month by checking transactions matching active recurring items this month
  let paidThisMonthCount = 0;
  if (!countOnly) {
    const db = getDb();
    const startOfMonthStr = `${currentMonth}-01`;
    const monthTxns = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.deleted, false),
          eq(transactions.ignored, false),
          gte(transactions.date, startOfMonthStr)
        )
      );

    const decryptedMonthTxns = await decryptRows('transactions', monthTxns, dek);

    const statFlow = flowType === 'income' ? 'income' : 'expense';

    // Count each recurring item at most once
    for (const item of list) {
      const pat = (item.matchPattern || item.merchantName || '').toLowerCase();
      if (!pat) continue;
      if (item.flowType !== statFlow) continue;
      const matched = decryptedMonthTxns.some((tx) => {
        if (item.accountId && tx.accountId && String(tx.accountId) !== String(item.accountId)) return false;
        const desc = tx.payee || tx.description || '';
        return patternMatches(desc, pat) || normalizeMerchantName(desc).toLowerCase() === pat;
      });
      if (matched) paidThisMonthCount++;
    }
  }

  return {
    bills: upcomingBills,
    count: upcomingBills.length,
    stats: {
      dueThisWeek: Math.round(dueThisWeek * 100) / 100,
      dueThisMonth: Math.round(dueThisMonth * 100) / 100,
      paidThisMonth: paidThisMonthCount,
      totalUpcoming: Math.round(totalUpcoming * 100) / 100,
      incomeThisWeek: Math.round(incomeThisWeek * 100) / 100,
      incomeThisMonth: Math.round(incomeThisMonth * 100) / 100,
      totalUpcomingIncome: Math.round(totalUpcomingIncome * 100) / 100,
      netThisMonth: Math.round((incomeThisMonth - dueThisMonth) * 100) / 100,
    },
  };
}

/**
 * Computes recurring summary statistics from a resolved items array.
 */
export function computeRecurringSummaryFromItems(items: RecurringItem[]) {
  const active = items.filter((r) => !r.isPaused && !r.isDismissed);
  const needsReview = items.filter((r) => !r.isConfirmed && !r.isDismissed && !r.isPaused);
  const paused = items.filter((r) => r.isPaused && !r.isDismissed);

  let monthlyExpenses = 0;
  let monthlyIncome = 0;
  let annualExpenses = 0;
  let annualIncome = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const item of active) {
    if (item.flowType === 'expense') {
      monthlyExpenses += item.monthlyAmount;
      annualExpenses += item.annualAmount;
      expenseCount++;
    } else {
      monthlyIncome += item.monthlyAmount;
      annualIncome += item.annualAmount;
      incomeCount++;
    }
  }

  return {
    monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
    monthlyIncome: Math.round(monthlyIncome * 100) / 100,
    annualExpenses: Math.round(annualExpenses * 100) / 100,
    annualIncome: Math.round(annualIncome * 100) / 100,
    activeCount: active.length,
    expenseCount,
    incomeCount,
    pausedCount: paused.length,
    needsReviewCount: needsReview.length,
    totalCount: items.length,
  };
}

/**
 * Retrieves summary statistics for recurring dashboard panels.
 */
export async function getRecurringSummary(userId: string, dek: Uint8Array) {
  const list = (await getRecurringTransactions(userId, dek, { includeDismissed: true })) as RecurringItem[];
  return computeRecurringSummaryFromItems(list);
}

/**
 * Manually creates a recurring transaction entry.
 */
export async function createManualRecurring(
  userId: string,
  dek: Uint8Array,
  data: {
    merchantName: string;
    matchPattern?: string;
    accountId?: string | null;
    categoryId?: string | null;
    frequency: FrequencyType;
    amount: number;
    lastDate: string;
    nextExpectedDate?: string;
    flowType?: 'income' | 'expense';
    customName?: string | null;
    notes?: string | null;
    isConfirmed?: boolean;
  }
) {
  const db = getDb();
  const pattern = data.matchPattern || normalizeMerchantName(data.merchantName).toLowerCase();
  const nextDate = data.nextExpectedDate || calculateNextExpectedDate(data.lastDate, data.frequency);

  const insertData = {
    userId,
    merchantName: data.merchantName,
    matchPattern: pattern,
    accountId: data.accountId || null,
    categoryId: data.categoryId || null,
    frequency: data.frequency,
    averageAmount: String(data.amount),
    lastAmount: String(data.amount),
    lastDate: data.lastDate,
    nextExpectedDate: nextDate,
    flowType: data.flowType || 'expense',
    isConfirmed: data.isConfirmed ?? true,
    isDismissed: false,
    isPaused: false,
    customName: data.customName || null,
    notes: data.notes || null,
    occurrenceCount: 1,
    confidence: 100,
  };

  const encrypted = await encryptRow('recurring_transactions', insertData, dek);
  const [created] = await db.insert(recurringTransactions).values(encrypted).returning();
  const [decrypted] = await decryptRows('recurring_transactions', [created], dek);
  return decrypted;
}

/**
 * Merges multiple recurring transactions into a single target rule.
 */
export async function mergeRecurringTransactions(
  userId: string,
  dek: Uint8Array,
  targetId: string,
  sourceIds: string[],
  customName?: string
): Promise<{ success: boolean; mergedItem: any }> {
  const db = getDb();

  const allRows = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.userId, userId));

  const allDecrypted = await decryptRows('recurring_transactions', allRows, dek);

  const target = allDecrypted.find((r) => r.id === targetId);
  if (!target) {
    throw new Error('Target recurring item not found');
  }

  const sources = allDecrypted.filter((r) => sourceIds.includes(r.id) && r.id !== targetId);
  if (sources.length === 0) {
    return { success: true, mergedItem: target };
  }

  // Combine match patterns
  const existingPatterns = (target.matchPattern || target.merchantName || '')
    .split('|')
    .map((p: string) => p.trim().toLowerCase())
    .filter(Boolean);

  for (const src of sources) {
    const srcPatterns = (src.matchPattern || src.merchantName || '')
      .split('|')
      .map((p: string) => p.trim().toLowerCase())
      .filter(Boolean);
    for (const pat of srcPatterns) {
      if (!existingPatterns.includes(pat)) {
        existingPatterns.push(pat);
      }
    }
  }
  const combinedPattern = existingPatterns.join('|');

  // Compute merged occurrences and latest date/amount
  const allMerged = [target, ...sources];
  const totalOccurrences = allMerged.reduce((sum, item) => sum + (item.occurrenceCount || 1), 0);

  let latestItem = target;
  for (const item of sources) {
    if (item.lastDate && (!latestItem.lastDate || item.lastDate > latestItem.lastDate)) {
      latestItem = item;
    }
  }

  let totalWeightedAmount = 0;
  let totalWeight = 0;
  for (const item of allMerged) {
    const amt = parseFloat(item.averageAmount || item.lastAmount || '0') || 0;
    const count = item.occurrenceCount || 1;
    totalWeightedAmount += amt * count;
    totalWeight += count;
  }
  const mergedAverageAmount = totalWeight > 0 ? totalWeightedAmount / totalWeight : parseFloat(target.averageAmount || '0');

  const updateFields: Record<string, any> = {
    matchPattern: combinedPattern,
    occurrenceCount: totalOccurrences,
    averageAmount: String(Math.round(mergedAverageAmount * 100) / 100),
    lastAmount: latestItem.lastAmount || target.lastAmount,
    lastDate: latestItem.lastDate || target.lastDate,
    nextExpectedDate: latestItem.nextExpectedDate || target.nextExpectedDate,
    confidence: Math.min(100, Math.max(target.confidence, ...sources.map((s) => s.confidence || 0))),
    isConfirmed: true,
    updatedAt: new Date(),
  };

  if (customName && customName.trim()) {
    updateFields.customName = customName.trim();
  }

  const encryptedUpdate = await encryptRow('recurring_transactions', updateFields, dek);

  await db.transaction(async (tx) => {
    await tx
      .update(recurringTransactions)
      .set(encryptedUpdate)
      .where(and(eq(recurringTransactions.id, targetId), eq(recurringTransactions.userId, userId)));

    for (const src of sources) {
      await tx
        .delete(recurringTransactions)
        .where(and(eq(recurringTransactions.id, src.id), eq(recurringTransactions.userId, userId)));
    }
  });

  const [updatedTargetRow] = await db
    .select()
    .from(recurringTransactions)
    .where(and(eq(recurringTransactions.id, targetId), eq(recurringTransactions.userId, userId)))
    .limit(1);

  const [decryptedMerged] = await decryptRows('recurring_transactions', [updatedTargetRow], dek);
  return { success: true, mergedItem: decryptedMerged };
}

