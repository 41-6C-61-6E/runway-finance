import { getDb } from '@/lib/db';
import {
  accounts,
  equityGrants,
  holdings,
  holdingSnapshots,
  accountSnapshots,
  transactions,
} from '@/lib/db/schema';
import { eq, and, asc, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { decryptRow, decryptRows, encryptRow, encryptField } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';
import { createNetWorthSnapshot } from '@/lib/services/sync';
import { ensureSystemCategories } from '@/lib/db/seed-categories';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { logger } from '@/lib/logger';
import {
  computeGrantMetrics,
  normalizeVestingSchedule,
  buildPortfolioVestingTimeline,
  type EquityGrantInput,
  type EquityGrantType,
  type EquityValuationMode,
  type VestingScheduleConfig,
  type GrantValuationMetrics,
} from '@/lib/utils/vesting';

const LOG_TAG = '[equity-grants-service]';

export interface EquityGrantWithMetrics extends EquityGrantInput {
  accountName: string;
  isExcludedFromNetWorth: boolean;
  metrics: GrantValuationMetrics;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface CreateOrUpdateGrantPayload {
  accountId?: string;
  companyName: string;
  grantName: string;
  grantType: EquityGrantType;
  grantDate: string;
  vestingStartDate: string;
  expirationDate?: string | null;
  totalShares: number;
  exercisedShares?: number;
  soldShares?: number;
  strikePrice: number;
  currentFmv: number;
  preferredPrice?: number | null;
  valuationMode?: EquityValuationMode;
  vestingSchedule: VestingScheduleConfig;
  earlyExerciseAllowed?: boolean;
  filed83b?: boolean;
  earlyExerciseDate?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
  isExcludedFromNetWorth?: boolean;
}

let schemaEnsured = false;
async function ensureEquityGrantsSchema(db: ReturnType<typeof getDb>) {
  if (schemaEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "equity_grants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" text NOT NULL,
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "company_name" text NOT NULL,
        "grant_name" text NOT NULL,
        "grant_type" text DEFAULT 'iso' NOT NULL,
        "grant_date" date NOT NULL,
        "vesting_start_date" date NOT NULL,
        "expiration_date" date,
        "total_shares" text NOT NULL,
        "exercised_shares" text DEFAULT '0' NOT NULL,
        "sold_shares" text DEFAULT '0' NOT NULL,
        "strike_price" text DEFAULT '0' NOT NULL,
        "current_fmv" text DEFAULT '0' NOT NULL,
        "preferred_price" text,
        "valuation_mode" text DEFAULT 'fmv' NOT NULL,
        "vesting_schedule" text NOT NULL,
        "early_exercise_allowed" boolean DEFAULT false NOT NULL,
        "filed_83b" boolean DEFAULT false NOT NULL,
        "early_exercise_date" date,
        "logo_url" text,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      ALTER TABLE "equity_grants" ADD COLUMN IF NOT EXISTS "logo_url" text;
    `);
    schemaEnsured = true;
  } catch {
    // ignore if concurrent or non-fatal
  }
}

function toGrantInput(row: any): EquityGrantInput {
  return {
    id: row.id,
    accountId: row.accountId,
    companyName: String(row.companyName || 'Private Company'),
    grantName: String(row.grantName || 'Option Grant'),
    grantType: (['iso', 'nso', 'rsu', 'common'].includes(row.grantType) ? row.grantType : 'iso') as EquityGrantType,
    grantDate: String(row.grantDate || new Date().toISOString().split('T')[0]).slice(0, 10),
    vestingStartDate: String(row.vestingStartDate || row.grantDate || new Date().toISOString().split('T')[0]).slice(0, 10),
    expirationDate: row.expirationDate ? String(row.expirationDate).slice(0, 10) : null,
    totalShares: Number(row.totalShares) || 0,
    exercisedShares: Number(row.exercisedShares) || 0,
    soldShares: Number(row.soldShares) || 0,
    strikePrice: Number(row.strikePrice) || 0,
    currentFmv: Number(row.currentFmv) || 0,
    preferredPrice:
      row.preferredPrice !== null && row.preferredPrice !== undefined && String(row.preferredPrice).trim() !== ''
        ? Number(row.preferredPrice)
        : null,
    valuationMode: row.valuationMode === 'preferred' ? 'preferred' : 'fmv',
    vestingSchedule: normalizeVestingSchedule(row.vestingSchedule),
    earlyExerciseAllowed: Boolean(row.earlyExerciseAllowed),
    filed83b: Boolean(row.filed83b),
    earlyExerciseDate: row.earlyExerciseDate ? String(row.earlyExerciseDate).slice(0, 10) : null,
    logoUrl: row.logoUrl ? String(row.logoUrl) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

/**
 * Lists all equity grants for a user, decrypted and enriched with live vesting metrics.
 * Also ensures any parent `stock_option` account balances are up to date with today's vesting.
 */
export async function listUserEquityGrants(
  userId: string,
  dek: Uint8Array,
  asOfDate?: string
): Promise<{
  grants: EquityGrantWithMetrics[];
  summary: {
    totalVestedValue: number;
    totalVestedValueFmv: number;
    totalVestedValuePreferred: number;
    totalUnvestedValue: number;
    totalPotentialValue: number;
    totalSharesGranted: number;
    totalVestedShares: number;
    totalUnvestedShares: number;
    totalExercisedShares: number;
    totalCashToExerciseVested: number;
    totalIsoAmtBargainElement: number;
    totalEstimatedTaxOnExercise: number;
    nextVestEvent: { date: string; shares: number; grantName: string; companyName: string } | null;
  };
}> {
  const db = getDb();
  await ensureEquityGrantsSchema(db);
  const rawGrants = await db
    .select()
    .from(equityGrants)
    .where(eq(equityGrants.userId, userId))
    .orderBy(asc(equityGrants.grantDate), asc(equityGrants.createdAt));

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decryptedGrants = await decryptRows('equity_grants', rawGrants, dek);
  const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
  const accountMap = new Map<string, any>();
  for (const acc of decryptedAccounts) {
    accountMap.set(acc.id, acc);
  }

  const todayStr = asOfDate || new Date().toISOString().split('T')[0];

  const grants: EquityGrantWithMetrics[] = [];
  let totalVestedValue = 0;
  let totalVestedValueFmv = 0;
  let totalVestedValuePreferred = 0;
  let totalUnvestedValue = 0;
  let totalPotentialValue = 0;
  let totalSharesGranted = 0;
  let totalVestedShares = 0;
  let totalUnvestedShares = 0;
  let totalExercisedShares = 0;
  let totalCashToExerciseVested = 0;
  let totalIsoAmtBargainElement = 0;
  let totalEstimatedTaxOnExercise = 0;
  let nextVestEvent: { date: string; shares: number; grantName: string; companyName: string } | null = null;

  for (const row of decryptedGrants) {
    const input = toGrantInput(row);
    const metrics = computeGrantMetrics(input, todayStr);
    const acc = accountMap.get(input.accountId);

    grants.push({
      ...input,
      accountName: acc?.name || `${input.companyName} Equity`,
      isExcludedFromNetWorth: Boolean(acc?.isExcludedFromNetWorth),
      metrics,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    totalVestedValue += metrics.vestedIntrinsicValue;
    totalVestedValueFmv += metrics.vestedValueAtFmv;
    totalVestedValuePreferred += metrics.vestedValueAtPreferred;
    totalUnvestedValue += metrics.unvestedIntrinsicValue;
    totalPotentialValue += metrics.totalPotentialValue;
    totalSharesGranted += metrics.totalShares;
    totalVestedShares += metrics.vestedShares;
    totalUnvestedShares += metrics.unvestedShares;
    totalExercisedShares += metrics.exercisedShares;
    totalCashToExerciseVested += metrics.cashToExerciseVested;
    totalIsoAmtBargainElement += metrics.isoAmtBargainElement;
    totalEstimatedTaxOnExercise += metrics.estimatedTaxOnVestedExercise;

    if (metrics.nextVestDate && metrics.nextVestShares > 0) {
      if (!nextVestEvent || metrics.nextVestDate < nextVestEvent.date) {
        nextVestEvent = {
          date: metrics.nextVestDate,
          shares: metrics.nextVestShares,
          grantName: input.grantName,
          companyName: input.companyName,
        };
      } else if (metrics.nextVestDate === nextVestEvent.date) {
        nextVestEvent.shares = Math.round((nextVestEvent.shares + metrics.nextVestShares) * 10000) / 10000;
      }
    }
  }

  return {
    grants,
    summary: {
      totalVestedValue: Math.round(totalVestedValue * 100) / 100,
      totalVestedValueFmv: Math.round(totalVestedValueFmv * 100) / 100,
      totalVestedValuePreferred: Math.round(totalVestedValuePreferred * 100) / 100,
      totalUnvestedValue: Math.round(totalUnvestedValue * 100) / 100,
      totalPotentialValue: Math.round(totalPotentialValue * 100) / 100,
      totalSharesGranted: Math.round(totalSharesGranted * 10000) / 10000,
      totalVestedShares: Math.round(totalVestedShares * 10000) / 10000,
      totalUnvestedShares: Math.round(totalUnvestedShares * 10000) / 10000,
      totalExercisedShares: Math.round(totalExercisedShares * 10000) / 10000,
      totalCashToExerciseVested: Math.round(totalCashToExerciseVested * 100) / 100,
      totalIsoAmtBargainElement: Math.round(totalIsoAmtBargainElement * 100) / 100,
      totalEstimatedTaxOnExercise: Math.round(totalEstimatedTaxOnExercise * 100) / 100,
      nextVestEvent,
    },
  };
}

/**
 * Finds or creates a parent `stock_option` account for the company so that
 * equity grants appear cleanly in the Accounts hierarchy, Net Worth, Investments, and FIRE Plans.
 */
async function ensureEquityAccount(
  userId: string,
  companyName: string,
  dek: Uint8Array,
  requestedAccountId?: string,
  isExcludedFromNetWorth?: boolean
): Promise<string> {
  const db = getDb();

  if (requestedAccountId) {
    const [existing] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, requestedAccountId), eq(accounts.userId, userId)))
      .limit(1);
    if (existing) {
      if (isExcludedFromNetWorth !== undefined && existing.isExcludedFromNetWorth !== isExcludedFromNetWorth) {
        await db
          .update(accounts)
          .set({ isExcludedFromNetWorth, updatedAt: new Date() })
          .where(eq(accounts.id, existing.id));
      }
      return existing.id;
    }
  }

  // Look for an existing stock_option account matching the company name
  const existingRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.type, 'stock_option')));
  const decrypted = await decryptRows('accounts', existingRows, dek);

  const normalizedCompany = companyName.trim().toLowerCase();
  const match = decrypted.find((acc) => {
    const inst = String(acc.institution || '').trim().toLowerCase();
    const name = String(acc.name || '').trim().toLowerCase();
    return inst === normalizedCompany || name === `${normalizedCompany} equity` || name === normalizedCompany;
  });

  if (match) {
    if (isExcludedFromNetWorth !== undefined && match.isExcludedFromNetWorth !== isExcludedFromNetWorth) {
      await db
        .update(accounts)
        .set({ isExcludedFromNetWorth, updatedAt: new Date() })
        .where(eq(accounts.id, match.id));
    }
    return match.id;
  }

  const accountName = companyName.toLowerCase().includes('equity') || companyName.toLowerCase().includes('options')
    ? companyName.trim()
    : `${companyName.trim()} Equity`;

  const rawAccount = {
    userId,
    connectionId: null,
    plaidConnectionId: null,
    externalId: `equity-${randomUUID()}`,
    name: accountName,
    currency: 'USD',
    balance: '0.00',
    balanceDate: new Date(),
    type: 'stock_option',
    institution: companyName.trim(),
    metadata: JSON.stringify({ companyName: companyName.trim(), isEquityAccount: true }),
    isHidden: false,
    isExcludedFromNetWorth: isExcludedFromNetWorth ?? false,
    displayOrder: 0,
  };

  const encryptedAccount = await encryptRow('accounts', rawAccount, dek);
  const [inserted] = await db.insert(accounts).values(encryptedAccount).returning();
  return inserted.id;
}

/**
 * Recomputes the parent account's balance, syncs `holdings` rows (one per grant)
 * so the Investments page Holdings & Allocation charts include vested options,
 * and regenerates historical `account_snapshots` along the vesting curve.
 */
export async function syncEquityAccountAndSnapshots(
  accountId: string,
  userId: string,
  dek: Uint8Array
): Promise<void> {
  const db = getDb();
  const todayStr = new Date().toISOString().split('T')[0];

  const rawGrants = await db
    .select()
    .from(equityGrants)
    .where(and(eq(equityGrants.accountId, accountId), eq(equityGrants.userId, userId)))
    .orderBy(asc(equityGrants.grantDate));

  if (rawGrants.length === 0) {
    // No grants remain on this account; zero out holdings and balance
    await db.delete(holdings).where(eq(holdings.accountId, accountId));
    await db
      .update(accounts)
      .set({
        balance: await encryptField('0.00', dek),
        balanceDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));
    await createNetWorthSnapshot(userId, dek, todayStr, { skipNotifications: true });
    return;
  }

  const decryptedGrants = await decryptRows('equity_grants', rawGrants, dek);
  const grantInputs = decryptedGrants.map(toGrantInput);

  // 1. Compute current total vested intrinsic value & sync holdings rows
  let totalAccountBalance = 0;
  await db.delete(holdings).where(eq(holdings.accountId, accountId));

  for (const g of grantInputs) {
    const m = computeGrantMetrics(g, todayStr);
    totalAccountBalance += m.vestedIntrinsicValue;

    const securityId = `grant-${g.id}`;
    const tickerSymbol = g.companyName
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase() || 'OPT';

    // Represent the grant in `holdings` so Allocation & Holdings Table show it cleanly
    const holdingName = `${g.companyName} — ${g.grantName} (${g.grantType.toUpperCase()})`;
    const effectiveUnitValue = m.vestedShares > 0
      ? Math.round((m.vestedIntrinsicValue / m.vestedShares) * 10000) / 10000
      : m.spreadPerShare;
    const costBasisVal = m.exercisedCostBasis > 0 ? m.exercisedCostBasis : 0;

    const rawHolding = {
      userId,
      accountId,
      securityId,
      ticker: tickerSymbol,
      name: holdingName,
      quantity: String(m.vestedShares),
      price: String(effectiveUnitValue),
      costBasis: String(costBasisVal),
      value: formatToCents(m.vestedIntrinsicValue),
      currency: 'USD',
    };
    const encHolding = await encryptRow('holdings', rawHolding, dek);
    await db.insert(holdings).values(encHolding);

    const rawHoldingSnap = {
      userId,
      accountId,
      snapshotDate: todayStr,
      securityId,
      ticker: tickerSymbol,
      name: holdingName,
      quantity: String(m.vestedShares),
      price: String(effectiveUnitValue),
      value: formatToCents(m.vestedIntrinsicValue),
      costBasis: String(costBasisVal),
    };
    const encHoldingSnap = await encryptRow('holding_snapshots', rawHoldingSnap, dek);
    await db
      .insert(holdingSnapshots)
      .values(encHoldingSnap)
      .onConflictDoUpdate({
        target: [
          holdingSnapshots.userId,
          holdingSnapshots.accountId,
          holdingSnapshots.securityId,
          holdingSnapshots.snapshotDate,
        ],
        set: {
          name: encHoldingSnap.name,
          quantity: encHoldingSnap.quantity,
          price: encHoldingSnap.price,
          value: encHoldingSnap.value,
          costBasis: encHoldingSnap.costBasis,
        },
      });
  }

  // 2. Update parent account balance
  const formattedBalance = formatToCents(totalAccountBalance);
  const encryptedBalance = await encryptField(formattedBalance, dek);
  await db
    .update(accounts)
    .set({
      balance: encryptedBalance,
      balanceDate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));

  // 3. Generate synthetic historical `account_snapshots` along the vesting curve
  const timeline = buildPortfolioVestingTimeline(grantInputs, todayStr);
  await db
    .delete(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

  for (const pt of timeline) {
    if (!pt.isPastOrToday) continue;
    const isToday = pt.date === todayStr;
    const snapBalance = await encryptField(formatToCents(pt.vestedValueEffective), dek);
    await db
      .insert(accountSnapshots)
      .values({
        userId,
        accountId,
        snapshotDate: pt.date,
        balance: snapBalance,
        isSynthetic: !isToday,
      })
      .onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: {
          balance: snapBalance,
          isSynthetic: !isToday,
        },
      });
  }

  // Clean up any stale future snapshots on the account
  await db
    .delete(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        gt(accountSnapshots.snapshotDate, todayStr)
      )
    );

  // Ensure an initial/adjustment transaction exists on the account for ledger completeness
  const catId = await ensureSystemCategories(userId, dek);
  const adjExternalId = `equity-sync-${accountId}`;
  const txnValues = {
    userId,
    accountId,
    externalId: adjExternalId,
    date: todayStr,
    amount: formattedBalance,
    description: 'Vested equity intrinsic value',
    payee: grantInputs[0]?.companyName || 'Equity Grant',
    memo: null,
    pending: false,
    categoryId: catId,
  };
  const encTxn = await encryptRow('transactions', txnValues, dek);
  await db
    .insert(transactions)
    .values(encTxn)
    .onConflictDoUpdate({
      target: [transactions.accountId, transactions.externalId],
      set: {
        date: todayStr,
        amount: encTxn.amount,
        description: encTxn.description,
        updatedAt: new Date(),
      },
    });

  await createNetWorthSnapshot(userId, dek, todayStr, { skipNotifications: true });
  invalidateUserSearchCache(userId);
}

/**
 * Creates a new equity grant and synchronizes its parent account & historical snapshots.
 */
export async function createEquityGrant(
  userId: string,
  payload: CreateOrUpdateGrantPayload,
  dek: Uint8Array
): Promise<EquityGrantWithMetrics> {
  const db = getDb();
  await ensureEquityGrantsSchema(db);
  const accountId = await ensureEquityAccount(
    userId,
    payload.companyName,
    dek,
    payload.accountId,
    payload.isExcludedFromNetWorth
  );

  const normalizedSchedule = normalizeVestingSchedule(payload.vestingSchedule);
  const rawGrant = {
    userId,
    accountId,
    companyName: payload.companyName.trim(),
    grantName: payload.grantName.trim(),
    grantType: payload.grantType,
    grantDate: payload.grantDate,
    vestingStartDate: payload.vestingStartDate || payload.grantDate,
    expirationDate: payload.expirationDate || null,
    totalShares: String(payload.totalShares),
    exercisedShares: String(payload.exercisedShares ?? 0),
    soldShares: String(payload.soldShares ?? 0),
    strikePrice: String(payload.strikePrice ?? 0),
    currentFmv: String(payload.currentFmv ?? 0),
    preferredPrice:
      payload.preferredPrice !== null && payload.preferredPrice !== undefined
        ? String(payload.preferredPrice)
        : null,
    valuationMode: payload.valuationMode ?? 'fmv',
    vestingSchedule: JSON.stringify(normalizedSchedule),
    earlyExerciseAllowed: Boolean(payload.earlyExerciseAllowed),
    filed83b: Boolean(payload.filed83b),
    earlyExerciseDate: payload.earlyExerciseDate || null,
    logoUrl: payload.logoUrl ? payload.logoUrl.trim() : null,
    notes: payload.notes ? payload.notes.trim() : null,
  };

  const encrypted = await encryptRow('equity_grants', rawGrant, dek);
  const [inserted] = await db.insert(equityGrants).values(encrypted).returning();

  await syncEquityAccountAndSnapshots(accountId, userId, dek);

  const decrypted = await decryptRow('equity_grants', inserted, dek);
  const input = toGrantInput(decrypted);
  const metrics = computeGrantMetrics(input);

  logger.info(`${LOG_TAG} Created equity grant`, {
    userId,
    grantId: inserted.id,
    accountId,
    grantType: payload.grantType,
  });

  return {
    ...input,
    accountName: `${payload.companyName.trim()} Equity`,
    isExcludedFromNetWorth: Boolean(payload.isExcludedFromNetWorth),
    metrics,
    createdAt: inserted.createdAt,
    updatedAt: inserted.updatedAt,
  };
}

/**
 * Updates an existing equity grant and synchronizes its parent account & historical snapshots.
 */
export async function updateEquityGrant(
  grantId: string,
  userId: string,
  payload: Partial<CreateOrUpdateGrantPayload> & {
    /** Optional bulk update: apply new 409A / Preferred price & valuationMode to all grants in the same company account */
    applyValuationToCompany?: boolean;
  },
  dek: Uint8Array
): Promise<EquityGrantWithMetrics> {
  const db = getDb();
  const [existingRaw] = await db
    .select()
    .from(equityGrants)
    .where(and(eq(equityGrants.id, grantId), eq(equityGrants.userId, userId)))
    .limit(1);

  if (!existingRaw) {
    throw new Error('grant_not_found');
  }

  const existingDecrypted = await decryptRow('equity_grants', existingRaw, dek);
  const existingInput = toGrantInput(existingDecrypted);

  const nextSchedule = payload.vestingSchedule
    ? normalizeVestingSchedule(payload.vestingSchedule)
    : existingInput.vestingSchedule;

  const updatedRaw = {
    companyName: (payload.companyName ?? existingInput.companyName).trim(),
    grantName: (payload.grantName ?? existingInput.grantName).trim(),
    grantType: payload.grantType ?? existingInput.grantType,
    grantDate: payload.grantDate ?? existingInput.grantDate,
    vestingStartDate: payload.vestingStartDate ?? existingInput.vestingStartDate,
    expirationDate:
      payload.expirationDate !== undefined ? payload.expirationDate : existingInput.expirationDate,
    totalShares: String(payload.totalShares ?? existingInput.totalShares),
    exercisedShares: String(payload.exercisedShares ?? existingInput.exercisedShares),
    soldShares: String(payload.soldShares ?? existingInput.soldShares),
    strikePrice: String(payload.strikePrice ?? existingInput.strikePrice),
    currentFmv: String(payload.currentFmv ?? existingInput.currentFmv),
    preferredPrice:
      payload.preferredPrice !== undefined
        ? payload.preferredPrice !== null
          ? String(payload.preferredPrice)
          : null
        : existingInput.preferredPrice !== null && existingInput.preferredPrice !== undefined
          ? String(existingInput.preferredPrice)
          : null,
    valuationMode: payload.valuationMode ?? existingInput.valuationMode,
    vestingSchedule: JSON.stringify(nextSchedule),
    earlyExerciseAllowed:
      payload.earlyExerciseAllowed !== undefined
        ? Boolean(payload.earlyExerciseAllowed)
        : Boolean(existingInput.earlyExerciseAllowed),
    filed83b:
      payload.filed83b !== undefined
        ? Boolean(payload.filed83b)
        : Boolean(existingInput.filed83b),
    earlyExerciseDate:
      payload.earlyExerciseDate !== undefined
        ? payload.earlyExerciseDate
        : existingInput.earlyExerciseDate,
    logoUrl:
      payload.logoUrl !== undefined
        ? payload.logoUrl
          ? payload.logoUrl.trim()
          : null
        : existingInput.logoUrl ?? null,
    notes:
      payload.notes !== undefined
        ? payload.notes
          ? payload.notes.trim()
          : null
        : existingInput.notes,
    updatedAt: new Date(),
  };

  const encryptedUpdate = await encryptRow('equity_grants', updatedRaw, dek);
  const [updated] = await db
    .update(equityGrants)
    .set(encryptedUpdate)
    .where(and(eq(equityGrants.id, grantId), eq(equityGrants.userId, userId)))
    .returning();

  // If the user toggled `isExcludedFromNetWorth`, update the parent account
  if (payload.isExcludedFromNetWorth !== undefined) {
    await db
      .update(accounts)
      .set({
        isExcludedFromNetWorth: payload.isExcludedFromNetWorth,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, existingRaw.accountId), eq(accounts.userId, userId)));
  }

  // If applyValuationToCompany is true, propagate currentFmv, preferredPrice, and valuationMode to sibling grants on the same account
  if (payload.applyValuationToCompany) {
    const siblingGrants = await db
      .select()
      .from(equityGrants)
      .where(and(eq(equityGrants.accountId, existingRaw.accountId), eq(equityGrants.userId, userId)));

    for (const sib of siblingGrants) {
      if (sib.id === grantId) continue;
      const sibPatch: Record<string, any> = {
        currentFmv: encryptedUpdate.currentFmv,
        preferredPrice: encryptedUpdate.preferredPrice ?? null,
        valuationMode: updatedRaw.valuationMode,
        ...(payload.logoUrl !== undefined ? { logoUrl: encryptedUpdate.logoUrl ?? null } : {}),
        updatedAt: new Date(),
      };
      await db.update(equityGrants).set(sibPatch).where(eq(equityGrants.id, sib.id));
    }
  }

  await syncEquityAccountAndSnapshots(existingRaw.accountId, userId, dek);

  const decrypted = await decryptRow('equity_grants', updated, dek);
  const input = toGrantInput(decrypted);
  const metrics = computeGrantMetrics(input);

  const [accRow] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, existingRaw.accountId))
    .limit(1);
  const decAcc = accRow ? await decryptRow('accounts', accRow, dek) : null;

  return {
    ...input,
    accountName: decAcc?.name || `${input.companyName} Equity`,
    isExcludedFromNetWorth: Boolean(decAcc?.isExcludedFromNetWorth),
    metrics,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Deletes an equity grant. If it was the last grant on its parent `stock_option` account,
 * also removes the auto-created `stock_option` account (or zeroes it out if it has manual transactions).
 */
export async function deleteEquityGrant(
  grantId: string,
  userId: string,
  dek: Uint8Array
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(equityGrants)
    .where(and(eq(equityGrants.id, grantId), eq(equityGrants.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new Error('grant_not_found');
  }

  const accountId = existing.accountId;
  await db
    .delete(equityGrants)
    .where(and(eq(equityGrants.id, grantId), eq(equityGrants.userId, userId)));

  const remaining = await db
    .select({ id: equityGrants.id })
    .from(equityGrants)
    .where(and(eq(equityGrants.accountId, accountId), eq(equityGrants.userId, userId)));

  if (remaining.length === 0) {
    // Delete the empty parent stock_option account so no orphan $0 account lingers
    await db
      .delete(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.type, 'stock_option')));
    const todayStr = new Date().toISOString().split('T')[0];
    await createNetWorthSnapshot(userId, dek, todayStr, { skipNotifications: true });
    invalidateUserSearchCache(userId);
  } else {
    await syncEquityAccountAndSnapshots(accountId, userId, dek);
  }
}

