import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots, netWorthSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { ensureSystemCategories, ensureCompoundCategories, ensureEmployerContributions } from '@/lib/db/seed-categories';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { decryptField, encryptField, encryptRow } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import type { ApiConfig } from '@/lib/services/asset-estimator';
import { API_KEY_DEFAULTS } from '@/config/defaults';
import { computeNetWorthTotals, computeCategoryBreakdown, type NetWorthAccountInput } from '@/lib/utils/account-scope';
import { TYPE_HIERARCHY } from '@/lib/constants/account-types';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots, convertCurrency, roundToCents, getAccountEarliestCalculationDate, formatToCents } from '@/lib/services/account-history';
import { fetchSecure, validateEndpointUrl } from '@/lib/utils/ssrf';

const LOG_TAG = '[manual-accounts]';

export type { ApiConfig };

const DEFAULT_API_CONFIG: ApiConfig = { ...API_KEY_DEFAULTS };

import {
  normalizeRedfinApiUrl,
  cleanRedfinJson,
  extractRedfinPropertyId,
  fetchRedfinValuationDetails,
  fetchRedfinValue,
  fetchBtcPrice,
  fetchBitcoinBalance,
  fetchSpotPrice,
  type RedfinEstimates
} from "./manual-accounts/asset-estimators";

export {
  normalizeRedfinApiUrl,
  extractRedfinPropertyId,
  fetchRedfinValuationDetails,
  fetchRedfinValue,
  type RedfinEstimates
};

export async function readApiConfig(userId: string): Promise<ApiConfig> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ apiKeys: userSettings.apiKeys })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    let keys: Record<string, string> = {};
    if (settings?.apiKeys) {
      const dek = await getSessionDEK();
      const decrypted = await decryptField(settings.apiKeys, dek);
      keys = JSON.parse(decrypted);
    }
    return {
      metalsApiUrl: keys.metalsApiUrl || DEFAULT_API_CONFIG.metalsApiUrl,
      metalsApiKey: keys.metalsApiKey || '',
      redfinApiUrl: normalizeRedfinApiUrl(keys.redfinApiUrl),
      fredApiUrl: keys.fredApiUrl || DEFAULT_API_CONFIG.fredApiUrl,
      fredApiKey: keys.fredApiKey || (typeof process !== 'undefined' ? (process.env.FRED_API_KEY ?? '') : ''),
      btcApiUrl: keys.btcApiUrl || DEFAULT_API_CONFIG.btcApiUrl,
      btcApiKey: keys.btcApiKey || '',
      btcXpubApiUrl: keys.btcXpubApiUrl || DEFAULT_API_CONFIG.btcXpubApiUrl,
    };

  } catch (err) {
    // May fail if no session DEK is available, fall back to defaults
    return { ...DEFAULT_API_CONFIG };
  }
}

export const MANUAL_ACCOUNT_TYPES: string[] = [
  'realestate', 'vehicle', 'crypto', 'gold', 'silver', 'otherAsset', 'mortgage', 'cash',
  ...Object.keys(TYPE_HIERARCHY),
];

export const ACCOUNT_TYPE_MAP: Record<string, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
  mortgage: 'mortgage',
  cash: 'cash',
};



function nowISO(): string {
  return new Date().toISOString().split('T')[0];
}

function adjExternalId(): string {
  return `adj-${randomUUID()}`;
}

function manualExternalId(): string {
  return `manual-${randomUUID()}`;
}

export async function createManualAccount(input: {
  userId: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
  initialValue?: number;
  currency?: string;
  apiConfig?: ApiConfig;
}, dek?: Uint8Array) {
  const db = getDb();
  const accountType = ACCOUNT_TYPE_MAP[input.type] || input.type;

  const initialValue = input.initialValue ?? 0;

  const REAL_ESTATE_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family'
  ];
  const isRealEstate = REAL_ESTATE_TYPES.includes(accountType);

  const meta = input.metadata ? { ...input.metadata } : {};

  const rawValues = {
    userId: input.userId,
    connectionId: null,
    externalId: manualExternalId(),
    name: input.name,
    currency: (input.currency && input.currency.trim()) || 'USD',
    balance: formatToCents(initialValue),
    balanceDate: new Date(),
    type: accountType,
    metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
    institution: null,
    isHidden: false,
    isExcludedFromNetWorth: false,
    displayOrder: 0,
  };

  const values = dek ? await encryptRow('accounts', rawValues, dek) : rawValues;

  const [account] = await db
    .insert(accounts)
    .values(values)
    .returning();

  if (initialValue !== 0) {
    const txnValues = {
      userId: input.userId,
      accountId: account.id,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: formatToCents(initialValue),
      description: `Initial ${input.name} value`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(input.userId, dek),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  // Ensure compound categories exist
  await ensureCompoundCategories(input.userId, dek);
  await ensureEmployerContributions(input.userId, dek);

  // Generate synthetic historical snapshots if purchase info is present
  const hasPurchaseHistory = !!meta.purchaseDate && (!!meta.purchasePrice || accountType === 'metals');
  if (hasPurchaseHistory) {
    try {
      await generateAssetHistorySnapshots(account.id, input.userId, input.type, meta, input.apiConfig, dek);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to generate history snapshots for ${account.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`${LOG_TAG} Account created`, { accountId: account.id, name: account.name, type: input.type, initialValue });

  if (initialValue !== 0) {
    invalidateUserSearchCache(input.userId);
  }

  return account;
}

export async function syncManualAccount(
  accountId: string,
  userId: string,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    // account.metadata is a jsonb object from the database (no encryption)
    rawMeta = account.metadata || {};
  }
  const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) as Record<string, unknown>;
  // Snapshot so we can persist a newly learned redfinPropertyId after sync.
  const initialRedfinPropertyId = meta.redfinPropertyId;
  let newValue: number;

  try {
    switch (account.type) {
      case 'realestate':
      case 'primaryhome':
      case 'secondaryhome':
      case 'rentalproperty':
      case 'commercial':
      case 'land':
      case 'otherrealestate':
      case 'single-family':
      case 'condo':
      case 'townhouse':
      case 'multi-family':
      case 'other': {
        // The only input is the Redfin property ID. Existing accounts may
        // still carry it inside the legacy address/redfinUrl fields — adopt
        // it automatically so those users don't have to change anything.
        const storedPropertyId =
          extractRedfinPropertyId(meta.redfinPropertyId) ||
          extractRedfinPropertyId(meta.redfinUrl) ||
          extractRedfinPropertyId(meta.address);
        if (!storedPropertyId) {
          throw new Error(`No Redfin Property ID for "${account.name}". Edit the property and enter the Redfin Property ID (the number after /home/ in the property's Redfin URL, e.g. 446533).`);
        }
        const estimates = await fetchRedfinValuationDetails({
          propertyId: storedPropertyId,
        }, apiConfig);
        const method = (meta.valuationMethod as 'conservative' | 'normal' | 'optimistic' | undefined) || 'normal';
        const selectedValue = estimates[method];
        if (selectedValue === undefined || selectedValue === null || isNaN(selectedValue)) {
          throw new Error(`Redfin parse error: No valid valuation field returned in response.`);
        }
        newValue = selectedValue;
        // Migrate a legacy-embedded ID to the canonical field.
        if (meta.redfinPropertyId !== estimates.propertyId) {
          meta.redfinPropertyId = estimates.propertyId;
          logger.info(`${LOG_TAG} Stored Redfin property ID for account`, { accountId, propertyId: estimates.propertyId });
        }
        break;
      }

      case 'crypto': {
        const xpub = meta.xpub as string;
        if (!xpub) throw new Error('No xpub in metadata');
        newValue = await fetchBitcoinBalance(xpub, apiConfig);
        break;
      }
      case 'metals': {
        const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
        const amountOz = parseFloat(String(meta.amountOz ?? '0'));
        if (amountOz <= 0) throw new Error('No amountOz in metadata');
        const spotPrice = await fetchSpotPrice(subType, apiConfig);
        newValue = amountOz * spotPrice;
        break;
      }
      default:
        return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: 'Account type does not support auto-sync' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    logger.error(`${LOG_TAG} Sync failed`, { accountId, type: account.type, error: msg });

    try {
      meta.syncError = msg;
      const updatedMeta = JSON.stringify(meta);
      const encryptedMeta = dek ? await encryptField(updatedMeta, dek) : updatedMeta;
      await db
        .update(accounts)
        .set({
          metadata: encryptedMeta,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));
    } catch (saveErr) {
      logger.error(`${LOG_TAG} Failed to save sync error to metadata`, { accountId, error: String(saveErr) });
    }

    return {
      status: 'error',
      newBalance: oldBalance,
      oldBalance,
      changed: false,
      errorMessage: msg,
    };
  }

  const delta = newValue - oldBalance;
  logger.debug(`${LOG_TAG} Sync comparison for ${accountId} (${account.type}): changed=${Math.abs(delta) > 0.0001}`);

  const accountUpdate: any = {
    balance: dek ? await encryptField(formatToCents(newValue), dek) : formatToCents(newValue),
    balanceDate: new Date(),
    updatedAt: new Date(),
  };

  if (meta.syncError !== undefined || meta.redfinPropertyId !== initialRedfinPropertyId) {
    if (meta.syncError !== undefined) {
      delete meta.syncError;
    }
    const updatedMeta = JSON.stringify(meta);
    accountUpdate.metadata = dek ? await encryptField(updatedMeta, dek) : updatedMeta;
  }

  await db.transaction(async (tx) => {
    await tx.update(accounts).set(accountUpdate).where(eq(accounts.id, accountId));

    if (Math.abs(delta) > 0.0001) {
      const assetTypeLabels: Record<string, string> = {
        realestate: 'Real Estate',
        primaryhome: 'Primary Home',
        secondaryhome: 'Secondary Home',
        rentalproperty: 'Rental Property',
        commercial: 'Commercial',
        land: 'Land',
        otherrealestate: 'Other Real Estate',
        crypto: 'Bitcoin',
        metals: 'Metals',
      };
      const adjKey = `adj-${accountId}-${nowISO()}`;
      const txnValues = {
        userId,
        accountId,
        externalId: adjKey,
        date: nowISO(),
        amount: formatToCents(delta),
        description: `${assetTypeLabels[account.type] ?? account.name} value adjustment`,
        payee: null,
        memo: null,
        pending: false,
        categoryId: await ensureSystemCategories(userId, dek),
      };
      const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
      await tx
        .insert(transactions)
        .values(encryptedTxn)
        .onConflictDoNothing({ target: [transactions.accountId, transactions.externalId] });
    }
  });

  await ensureCompoundCategories(userId, dek);
  await ensureEmployerContributions(userId, dek);
  await createAccountSnapshotsForUser(userId, dek);
  await updateNetWorthSnapshot(userId, dek);

  // Regenerate synthetic history for real estate and mortgages to keep HPI/amortization curves aligned
  const REAL_ESTATE_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family', 'other',
    'mortgage'
  ];
  if (REAL_ESTATE_TYPES.includes(account.type) || account.type === 'metals') {
    try {
      let rawMeta: string | Record<string, unknown>;
      if (dek && account.metadata) {
        const decrypted = await decryptField(account.metadata, dek);
        rawMeta = decrypted || '{}';
      } else if (typeof account.metadata === 'string') {
        rawMeta = account.metadata || '{}';
      } else {
        rawMeta = account.metadata || {};
      }
      const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) as Record<string, unknown>;
      await generateAssetHistorySnapshots(accountId, userId, account.type, meta, apiConfig, dek);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to regenerate history for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account synced`, { accountId, type: account.type, changed });

  if (changed) {
    invalidateUserSearchCache(userId);
  }

  try {
    const { healSyncAlerts } = await import('@/lib/services/notifications');
    await healSyncAlerts(userId, accountId);
  } catch (healErr) {
    logger.debug(`${LOG_TAG} Non-critical error healing sync alerts for manual account`, { accountId, error: String(healErr) });
  }

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed,
  };
}

export async function adjustManualAccountValue(
  accountId: string,
  userId: string,
  newValue: number,
  note?: string,
  amountOz?: number,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let finalNewValue = newValue;
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    // account.metadata is a jsonb object from the database (no encryption)
    rawMeta = account.metadata || {};
  }
  const meta: Record<string, unknown> = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta));
  const delta = finalNewValue - oldBalance;

  await db.transaction(async (tx) => {
    if (account.type === 'metals' && amountOz !== undefined) {
      const updatedMeta = { ...meta, amountOz };
      const encryptedMeta = dek ? await encryptField(JSON.stringify(updatedMeta), dek) : JSON.stringify(updatedMeta);
      const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
      await tx.update(accounts).set({
        balance: encryptedBalance,
        balanceDate: new Date(),
        updatedAt: new Date(),
        metadata: encryptedMeta,
      }).where(eq(accounts.id, accountId));
    } else {
      const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
      await tx.update(accounts).set({
        balance: encryptedBalance,
        balanceDate: new Date(),
        updatedAt: new Date(),
      }).where(eq(accounts.id, accountId));
    }

    if (Math.abs(delta) > 0.0001) {
      const txnValues = {
        userId,
        accountId,
        externalId: adjExternalId(),
        date: nowISO(),
        amount: formatToCents(delta),
        description: note ?? `${account.name} value adjustment`,
        payee: null,
        memo: null,
        pending: false,
        categoryId: await ensureSystemCategories(userId, dek),
      };
      const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
      await tx
        .insert(transactions)
        .values(encryptedTxn)
        .onConflictDoNothing({ target: [transactions.accountId, transactions.externalId] });
    }
  });

  await ensureCompoundCategories(userId, dek);
  await ensureEmployerContributions(userId, dek);
  await createAccountSnapshotsForUser(userId, dek);
  await updateNetWorthSnapshot(userId, dek);

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account value adjusted`, { accountId, type: account.type, changed });

  if (changed) {
    invalidateUserSearchCache(userId);
  }

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed,
  };
}

export async function addAccountSnapshot(
  accountId: string,
  userId: string,
  date: string,
  value: number,
  note?: string,
  amountOz?: number,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let finalNewValue = value;
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    rawMeta = account.metadata || {};
  }
  const meta: Record<string, unknown> = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta));

  if (account.type === 'metals' && amountOz !== undefined) {
    try {
      const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
      const spotPrice = await fetchSpotPrice(subType, apiConfig);
      finalNewValue = amountOz * spotPrice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spot price fetch failed';
      logger.error(`${LOG_TAG} Add snapshot failed for metals account`, { accountId, error: msg });
      return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: msg };
    }
  }

  await db.transaction(async (tx) => {
    if (account.type === 'metals' && amountOz !== undefined) {
      const updatedMeta = { ...meta, amountOz };
      const encryptedMeta = dek ? await encryptField(JSON.stringify(updatedMeta), dek) : JSON.stringify(updatedMeta);
      const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
      
      // Update current account balance only if snapshot date is >= current balanceDate
      const currentBalanceDate = account.balanceDate ? new Date(account.balanceDate).toISOString().split('T')[0] : '';
      if (date >= currentBalanceDate) {
        await tx.update(accounts).set({
          balance: encryptedBalance,
          balanceDate: new Date(date),
          updatedAt: new Date(),
          metadata: encryptedMeta,
        }).where(eq(accounts.id, accountId));
      } else {
        await tx.update(accounts).set({
          updatedAt: new Date(),
          metadata: encryptedMeta,
        }).where(eq(accounts.id, accountId));
      }
    } else {
      const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
      // Update current account balance only if snapshot date is >= current balanceDate
      const currentBalanceDate = account.balanceDate ? new Date(account.balanceDate).toISOString().split('T')[0] : '';
      if (date >= currentBalanceDate) {
        await tx.update(accounts).set({
          balance: encryptedBalance,
          balanceDate: new Date(date),
          updatedAt: new Date(),
        }).where(eq(accounts.id, accountId));
      }
    }

    // Insert or update the snapshot in account_snapshots (isSynthetic = false, isImported = true)
    const encryptedSnapshotBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
    await tx.insert(accountSnapshots).values({
      userId,
      accountId,
      snapshotDate: date,
      balance: encryptedSnapshotBalance,
      isSynthetic: false,
      isImported: true,
    }).onConflictDoUpdate({
      target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
      set: {
        balance: encryptedSnapshotBalance,
        isSynthetic: false,
        isImported: true,
      },
    });

    // If a note is provided, insert a zero-amount transaction
    if (note) {
      const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalNewValue);
      const txnDescription = `Snapshot Balance: ${formattedBalance} (${note})`;
      const txnValues = {
        userId,
        accountId,
        externalId: adjExternalId(),
        date,
        amount: '0',
        description: txnDescription,
        payee: null,
        memo: null,
        pending: false,
        categoryId: await ensureSystemCategories(userId, dek),
      };
      const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
      await tx
        .insert(transactions)
        .values(encryptedTxn)
        .onConflictDoNothing({ target: [transactions.accountId, transactions.externalId] });
    }
  });

  // Regenerate history for this account
  const MODEL_SNAPSHOT_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family', 'other',
    'vehicle', 'metals', 'mortgage'
  ];

  if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
    try {
      const latestMeta = account.type === 'metals' && amountOz !== undefined ? { ...meta, amountOz } : meta;
      await generateAssetHistorySnapshots(accountId, userId, account.type, latestMeta, apiConfig, dek);
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to generate asset history snapshots in addAccountSnapshot`, { accountId, err });
    }
  } else {
    try {
      const today = new Date().toISOString().split('T')[0];
      const fromDate = await getAccountEarliestCalculationDate(accountId, userId, account.metadata, dek);
      const finalFromDate = date < fromDate ? date : fromDate;
      await generateHistoricalAccountSnapshots(accountId, userId, finalFromDate, today, dek);
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to generate historical snapshots in addAccountSnapshot`, { accountId, err });
    }
  }

  // Rebuild aggregated net worth snapshots
  await recalculateNetWorthSnapshots(userId, dek);

  invalidateUserSearchCache(userId);

  return {
    status: 'success',
    newBalance: finalNewValue,
    oldBalance,
    changed: true,
  };
}

export async function deleteManualAccount(
  accountId: string,
  userId: string,
  keepData?: boolean,
  dek?: Uint8Array
): Promise<void> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) return;

  if (keepData) {
    await db.update(accounts).set({
      connectionId: null,
      isHidden: true,
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
    logger.info(`${LOG_TAG} Account hidden (data kept)`, { accountId, name: account.name, type: account.type });
  } else {
    await db.delete(accounts).where(eq(accounts.id, accountId));
    await createAccountSnapshotsForUser(userId, dek);
    await updateNetWorthSnapshot(userId, dek);
    logger.info(`${LOG_TAG} Account deleted`, { accountId, name: account.name, type: account.type });
  }

  invalidateUserSearchCache(userId);
}

async function createAccountSnapshotsForUser(userId: string, dek?: Uint8Array) {
  const db = getDb();
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const today = nowISO();
  for (const acc of userAccounts) {
    if (acc.type === 'mortgage') {
      try {
        let rawMeta = acc.metadata;
        if (dek && rawMeta) {
          rawMeta = await decryptField(rawMeta, dek);
        }
        const meta = rawMeta ? JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) : {};
        const status = meta.mortgageStatus;
        const endEventDateStr = status === 'paid_off' ? meta.payoffDate : (status === 'refinanced' ? meta.refinanceDate : undefined);
        if (endEventDateStr && today >= endEventDateStr) {
          continue;
        }
      } catch (e) {
        // Ignore json parse error
      }
    }
    const decryptedBalance = parseFloat(dek ? await decryptField(acc.balance, dek) : acc.balance) || 0;
    const formattedBalance = formatToCents(decryptedBalance);
    const encryptedBalance = dek ? await encryptField(formattedBalance, dek) : formattedBalance;
    
    await db.insert(accountSnapshots).values({
      userId,
      accountId: acc.id,
      snapshotDate: today,
      balance: encryptedBalance,
      isSynthetic: false,
    }).onConflictDoUpdate({
      target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
      set: { balance: encryptedBalance, isSynthetic: false },
    });
  }
}

async function updateNetWorthSnapshot(userId: string, dek?: Uint8Array) {
  const db = getDb();

  const [settings] = await db
    .select({ currency: userSettings.currency })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const baseCurrency = settings?.currency || 'USD';

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const decryptedAccountInputs: NetWorthAccountInput[] = [];
  for (const acc of userAccounts) {
    decryptedAccountInputs.push({
      type: acc.type,
      balance: parseFloat(dek ? await decryptField(acc.balance, dek) : acc.balance.toString()),
      isHidden: acc.isHidden,
      isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
      currency: acc.currency,
      metadata: acc.metadata,
    });
  }

  const today = nowISO();

  // Canonical scoped calculation (reportable + active-on-date, currency-converted)
  // — identical to the net worth snapshot pipeline and the live dashboard.
  const totals = computeNetWorthTotals(decryptedAccountInputs, baseCurrency, today);
  const breakdown = computeCategoryBreakdown(decryptedAccountInputs, baseCurrency, today);
  const totalAssets = totals.totalAssets;
  const totalLiabilities = totals.totalLiabilities;
  const netWorth = totals.netWorth;
  const nwValues: any = {
    userId,
    snapshotDate: today,
    totalAssets: String(totalAssets),
    totalLiabilities: String(totalLiabilities),
    netWorth: String(netWorth),
    breakdown: typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown),
  };
  const encryptedNw = dek ? await encryptRow('net_worth_snapshots', nwValues, dek) : nwValues;

  await db.insert(netWorthSnapshots).values(encryptedNw).onConflictDoUpdate({
    target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
    set: encryptedNw,
  });
}

