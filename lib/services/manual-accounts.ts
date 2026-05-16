import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots, netWorthSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { ensureSystemCategories } from '@/lib/db/seed-categories';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { decryptField, encryptField, encryptRow } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import type { ApiConfig } from '@/lib/services/asset-estimator';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

const LOG_TAG = '[manual-accounts]';

export type { ApiConfig };

export const DEFAULT_API_CONFIG: ApiConfig = {
  metalsApiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
  metalsApiKey: '',
  redfinApiUrl: 'https://www.redfin.com/what-is-my-home-worth',
  redfinApiKey: '',
  fredApiUrl: 'https://api.stlouisfed.org/fred/series/observations',
  fredApiKey: '',
  btcApiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD',
  btcApiKey: '',
  btcXpubApiUrl: 'https://{host}/api/v2/xpub/{xpub}?details=basic',
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
      redfinApiUrl: keys.redfinApiUrl || DEFAULT_API_CONFIG.redfinApiUrl,
      redfinApiKey: keys.redfinApiKey || '',
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

export type AssetSubType = 'realestate' | 'vehicle' | 'crypto' | 'gold' | 'silver' | 'otherAsset' | 'mortgage' | 'cash';

export const MANUAL_ACCOUNT_TYPES: AssetSubType[] = [
  'realestate', 'vehicle', 'crypto', 'gold', 'silver', 'otherAsset', 'mortgage', 'cash',
];

export const ACCOUNT_TYPE_MAP: Record<AssetSubType, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
  mortgage: 'mortgage',
  cash: 'cash',
};

export interface CreateManualAccountInput {
  userId: string;
  name: string;
  type: AssetSubType;
  metadata?: Record<string, unknown>;
  initialValue?: number;
  currency?: string;
  apiConfig?: ApiConfig;
}

export interface SyncResult {
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}

function nowISO(): string {
  return new Date().toISOString().split('T')[0];
}

function adjExternalId(): string {
  return `adj-${randomUUID()}`;
}

function manualExternalId(): string {
  return `manual-${randomUUID()}`;
}

export async function fetchRedfinValue(propertyId: string, apiConfig?: ApiConfig): Promise<number> {
  const baseUrl = apiConfig?.redfinApiUrl || DEFAULT_API_CONFIG.redfinApiUrl!;
  const url = `${baseUrl}?propertyId=${encodeURIComponent(propertyId)}`;
  const curlCmd = `curl -s -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' '${url}'`;
  logger.info(`${LOG_TAG} Redfin API call`, { propertyId, url });
  logger.debug(`${LOG_TAG} Redfin curl: ${curlCmd}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
  } catch (err) {
    throw new Error(`Redfin network error\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Redfin HTTP ${res.status}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`);
  }
  const html = await res.text();
  const match = html.match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
  if (!match) {
    throw new Error(`Redfin parse error\n  URL: ${url}\n  curl: ${curlCmd}\n  page length: ${html.length} chars, no price pattern found`);
  }
  return parseFloat(match[1].replace(/,/g, ''));
}

const TREZOR_HOSTS = ['btc2.trezor.io', 'btc1.trezor.io', 'btc3.trezor.io'];

async function fetchBtcPrice(apiConfig?: ApiConfig): Promise<number> {
  const url = apiConfig?.btcApiUrl || DEFAULT_API_CONFIG.btcApiUrl!;
  const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
  logger.info(`${LOG_TAG} BTC price API call`, { url });
  logger.debug(`${LOG_TAG} BTC price curl: ${curlCmd}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`BTC price network error\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`BTC price HTTP ${res.status}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    throw new Error(`BTC price parse error\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${JSON.stringify(data).slice(0, 500)}`);
  }
  logger.info(`${LOG_TAG} BTC price: $${price}/BTC`);
  return price;
}

export async function fetchBitcoinBalance(xpub: string, apiConfig?: ApiConfig): Promise<number> {
  const hasDescriptor = xpub.includes('(');
  const xpubFormats = hasDescriptor
    ? [xpub]
    : [xpub, `wpkh(${xpub})`];

  let lastError: string | null = null;
  let btcAmount: number | null = null;

  const hostList = apiConfig?.btcXpubApiUrl
    ? [new URL(apiConfig.btcXpubApiUrl.replace('{host}', 'host').replace('/api/v2/xpub/{xpub}?details=basic', '')).hostname]
    : TREZOR_HOSTS;

  const baseUrlTemplate = apiConfig?.btcXpubApiUrl || 'https://{host}/api/v2/xpub/{xpub}?details=basic';

  for (const fmt of xpubFormats) {
    for (const host of hostList) {
      const url = baseUrlTemplate.replace('{host}', host).replace('{xpub}', encodeURIComponent(fmt));
      const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
      logger.info(`${LOG_TAG} Bitcoin API call`, { host, xpub: fmt, url });
      logger.debug(`${LOG_TAG} Bitcoin curl: ${curlCmd}`);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        lastError = `network error\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn(`${LOG_TAG} Bitcoin host ${host} failed for ${fmt}`, { error: lastError });
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '(unreadable)');
        lastError = `HTTP ${res.status}\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`;
        logger.warn(`${LOG_TAG} Bitcoin host ${host} returned ${res.status} for ${fmt}, trying next host`);
        continue;
      }

      const rawJson = await res.text();
      logger.info(`${LOG_TAG} Bitcoin raw response [${host}/${fmt}]: ${rawJson.slice(0, 500)}`);

      let data: { balance?: string; unconfirmedBalance?: string };
      try {
        data = JSON.parse(rawJson);
      } catch {
        lastError = `parse error (invalid JSON)\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${rawJson.slice(0, 300)}`;
        continue;
      }

      const confirmed = BigInt(data.balance ?? '0');
      const unconfirmed = BigInt(data.unconfirmedBalance ?? '0');
      const totalSats = Number(confirmed + unconfirmed);

      logger.info(`${LOG_TAG} Bitcoin parsed [${host}/${fmt}]: balance=${data.balance}, unconfirmed=${data.unconfirmedBalance}, totalSats=${totalSats}`);

      if (isNaN(totalSats)) {
        lastError = `parse error (NaN)\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  raw balance: ${data.balance}, unconfirmed: ${data.unconfirmedBalance}`;
        continue;
      }

      const btc = totalSats / 1e8;

      if (btc === 0 && fmt !== xpubFormats[xpubFormats.length - 1]) {
        logger.info(`${LOG_TAG} BTC returned 0 for ${fmt} on ${host}, will retry with next format`);
        lastError = `got 0 BTC for ${fmt} on ${host}`;
        break;
      }

      btcAmount = btc;
      break;
    }
    if (btcAmount !== null) break;
  }

  if (btcAmount === null) {
    throw new Error(`Bitcoin fetch failed (${xpubFormats.length} formats x ${hostList.length} hosts)\n  last: ${lastError}`);
  }

  logger.info(`${LOG_TAG} BTC wallet balance: ${btcAmount} BTC`);

  const btcPrice = await fetchBtcPrice(apiConfig);
  const usdValue = btcAmount * btcPrice;

  logger.info(`${LOG_TAG} BTC value: ${btcAmount} BTC x $${btcPrice} = $${usdValue}`);

  return usdValue;
}

export async function fetchSpotPrice(type: 'gold' | 'silver', apiConfig?: ApiConfig): Promise<number> {
  const baseUrl = apiConfig?.metalsApiUrl || DEFAULT_API_CONFIG.metalsApiUrl!;
  const ticker = type === 'gold' ? 'GC=F' : 'SI=F';
  const url = `${baseUrl}/${ticker}`;
  const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
  logger.info(`${LOG_TAG} Spot price API call`, { ticker, url });
  logger.debug(`${LOG_TAG} Spot price curl: ${curlCmd}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
  } catch (err) {
    throw new Error(`Spot price network error\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Spot price HTTP ${res.status}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    throw new Error(`Spot price parse error\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return price;
}

export async function createManualAccount(input: CreateManualAccountInput, dek?: Uint8Array) {
  const db = getDb();
  const accountType = ACCOUNT_TYPE_MAP[input.type];

  const initialValue = input.initialValue ?? 0;

  const rawValues = {
    userId: input.userId,
    connectionId: null,
    externalId: manualExternalId(),
    name: input.name,
    currency: input.currency ?? 'USD',
    balance: String(initialValue),
    balanceDate: new Date(),
    type: accountType,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
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
      amount: String(initialValue),
      description: `Initial ${input.name} value`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(input.userId),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  // Generate synthetic historical snapshots if purchase info is present
  const meta = input.metadata ?? {};
  const hasPurchaseHistory = !!meta.purchaseDate && (!!meta.purchasePrice || accountType === 'metals');
  if (hasPurchaseHistory) {
    try {
      await generateAssetHistorySnapshots(account.id, input.userId, input.type, meta, input.apiConfig);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to generate history snapshots for ${account.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`${LOG_TAG} Account created`, { accountId: account.id, name: account.name, type: input.type, initialValue });

  return account;
}

export async function syncManualAccount(
  accountId: string,
  userId: string,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<SyncResult> {
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
  const rawMeta = dek && account.metadata ? await decryptField(account.metadata, dek) : (account.metadata ?? '{}');
  const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : '{}') as Record<string, unknown>;
  let newValue: number;

  try {
    switch (account.type) {
      case 'realestate': {
        const propertyId = meta.propertyId as string;
        if (!propertyId) throw new Error('No propertyId in metadata');
        newValue = await fetchRedfinValue(propertyId, apiConfig);
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
    return {
      status: 'error',
      newBalance: oldBalance,
      oldBalance,
      changed: false,
      errorMessage: msg,
    };
  }

  const delta = newValue - oldBalance;
  logger.info(`${LOG_TAG} Sync comparison for ${accountId} (${account.type}): oldBalance=${oldBalance}, newValue=${newValue}, delta=${delta}`);

  const accountUpdate: any = {
    balance: dek ? await encryptField(String(newValue), dek) : String(newValue),
    balanceDate: new Date(),
    updatedAt: new Date(),
  };
  await db.update(accounts).set(accountUpdate).where(eq(accounts.id, accountId));

  if (Math.abs(delta) > 0.0001) {
    const assetTypeLabels: Record<string, string> = {
      realestate: 'Real Estate',
      crypto: 'Bitcoin',
      metals: 'Metals',
    };
    const txnValues = {
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: String(delta),
      description: `${assetTypeLabels[account.type] ?? account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(userId),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  await createAccountSnapshotsForUser(userId);
  await updateNetWorthSnapshot(userId, dek);

  // Regenerate synthetic history for real estate to keep HPI curve aligned
  if (account.type === 'realestate' || account.type === 'metals') {
    try {
      const rawMeta = dek && account.metadata ? await decryptField(account.metadata, dek) : (account.metadata ?? '{}');
      const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : '{}') as Record<string, unknown>;
      await generateAssetHistorySnapshots(accountId, userId, account.type, meta, apiConfig);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to regenerate history for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account synced`, { accountId, type: account.type, oldBalance, newValue, changed });

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
): Promise<SyncResult> {
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
  const rawMeta = dek && account.metadata ? await decryptField(account.metadata, dek) : (account.metadata ?? '{}');
  const meta: Record<string, unknown> = JSON.parse(typeof rawMeta === 'string' ? rawMeta : '{}');

  if (account.type === 'metals' && amountOz !== undefined) {
    try {
      const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
      const spotPrice = await fetchSpotPrice(subType, apiConfig);
      finalNewValue = amountOz * spotPrice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spot price fetch failed';
      logger.error(`${LOG_TAG} Adjust failed for metals account`, { accountId, error: msg });
      return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: msg };
    }

    const updatedMeta = { ...meta, amountOz };
    const encryptedMeta = dek ? await encryptField(JSON.stringify(updatedMeta), dek) : JSON.stringify(updatedMeta);
    const encryptedBalance = dek ? await encryptField(String(finalNewValue), dek) : String(finalNewValue);
    await db.update(accounts).set({
      balance: encryptedBalance,
      balanceDate: new Date(),
      updatedAt: new Date(),
      metadata: encryptedMeta,
    }).where(eq(accounts.id, accountId));
  } else {
    const encryptedBalance = dek ? await encryptField(String(finalNewValue), dek) : String(finalNewValue);
    await db.update(accounts).set({
      balance: encryptedBalance,
      balanceDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
  }

  const delta = finalNewValue - oldBalance;

  if (Math.abs(delta) > 0.0001) {
    const txnValues = {
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: String(delta),
      description: note ?? `${account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(userId),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  await createAccountSnapshotsForUser(userId);
  await updateNetWorthSnapshot(userId, dek);

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account value adjusted`, { accountId, type: account.type, oldBalance, newValue: finalNewValue, changed, note });

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed,
  };
}

export async function deleteManualAccount(
  accountId: string,
  userId: string,
  keepData?: boolean
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
    await createAccountSnapshotsForUser(userId);
    await updateNetWorthSnapshot(userId);
    logger.info(`${LOG_TAG} Account deleted`, { accountId, name: account.name, type: account.type });
  }
}

async function createAccountSnapshotsForUser(userId: string) {
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
    const balance = acc.balance;
    await db.insert(accountSnapshots).values({
      userId,
      accountId: acc.id,
      snapshotDate: today,
      balance,
      isSynthetic: false,
    }).onConflictDoUpdate({
      target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
      set: { balance, isSynthetic: false },
    });
  }
}

async function updateNetWorthSnapshot(userId: string, dek?: Uint8Array) {
  const db = getDb();
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of userAccounts) {
    const balance = parseFloat(dek ? await decryptField(acc.balance, dek) : acc.balance.toString());
    const accountType = acc.type.toLowerCase();

    if (isAssetAccount(accountType)) {
      totalAssets += balance;
    } else if (isLiabilityAccount(accountType)) {
      totalLiabilities += Math.abs(balance);
    }

    if (!breakdown[accountType]) {
      breakdown[accountType] = { count: 0, value: 0 };
    }
    breakdown[accountType].count++;
    breakdown[accountType].value += balance;
  }

  const netWorth = totalAssets - totalLiabilities;
  const today = nowISO();

  const nwValues: any = {
    userId,
    snapshotDate: today,
    totalAssets: String(totalAssets),
    totalLiabilities: String(totalLiabilities),
    netWorth: String(netWorth),
    breakdown,
  };
  const encryptedNw = dek ? await encryptRow('net_worth_snapshots', nwValues, dek) : nwValues;

  await db.insert(netWorthSnapshots).values(encryptedNw).onConflictDoUpdate({
    target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
    set: encryptedNw,
  });
}
