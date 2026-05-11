import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots, netWorthSnapshots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type AssetSubType = 'realestate' | 'vehicle' | 'crypto' | 'gold' | 'silver' | 'otherAsset';

export const MANUAL_ACCOUNT_TYPES: AssetSubType[] = [
  'realestate', 'vehicle', 'crypto', 'gold', 'silver', 'otherAsset',
];

export const ACCOUNT_TYPE_MAP: Record<AssetSubType, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
};

export interface CreateManualAccountInput {
  userId: string;
  name: string;
  type: AssetSubType;
  metadata?: Record<string, unknown>;
  initialValue?: number;
  currency?: string;
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

export async function fetchRedfinValue(propertyId: string): Promise<number> {
  const url = `https://www.redfin.com/what-is-my-home-worth?propertyId=${encodeURIComponent(propertyId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
  } catch (err) {
    throw new Error(`Redfin network error [${url}]: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Redfin HTTP ${res.status} [${url}]: ${body.slice(0, 300)}`);
  }
  const html = await res.text();
  const match = html.match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
  if (!match) {
    throw new Error(`Could not parse Redfin estimate from page (${url}): page is ${html.length} chars, no price pattern found`);
  }
  return parseFloat(match[1].replace(/,/g, ''));
}

export async function fetchBitcoinBalance(xpub: string): Promise<number> {
  const url = `https://blockchain.info/balance?active=${encodeURIComponent(xpub)}`;
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 300 } });
  } catch (err) {
    throw new Error(`Bitcoin network error [${url}]: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Bitcoin HTTP ${res.status} [${url}]: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as Record<string, { final_balance: number }>;
  const entry = data[xpub];
  if (!entry || entry.final_balance === undefined) {
    throw new Error(`Bitcoin response format unexpected [${url}]: keys=${Object.keys(data).join(',')}, firstKeyHasBalance=${Object.values(data)[0]?.final_balance !== undefined}`);
  }
  return entry.final_balance / 1e8;
}

export async function fetchSpotPrice(type: 'gold' | 'silver'): Promise<number> {
  const metal = type === 'gold' ? 'XAU' : 'XAG';
  const url = `https://api.metals.live/v1/spot/${metal}`;
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 300 } });
  } catch (err) {
    throw new Error(`Spot price network error [${url}]: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Spot price HTTP ${res.status} [${url}]: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) {
    const found = data.find((item: Record<string, unknown>) => item.metal === metal || item.currency === 'USD');
    if (!found) {
      throw new Error(`Spot price array response missing ${metal} entry [${url}]: first item keys=${Object.keys(data[0] ?? {}).join(',')}`);
    }
    return parseFloat(String((found as Record<string, unknown>).price ?? 0));
  }
  const obj = data as Record<string, unknown>;
  const price = obj[metal] ?? obj.price ?? obj.spotPrice;
  if (price === undefined || price === null) {
    throw new Error(`Spot price object response missing price field [${url}]: keys=${Object.keys(obj).join(',')}`);
  }
  return parseFloat(String(price));
}

export async function createManualAccount(input: CreateManualAccountInput) {
  const db = getDb();
  const accountType = ACCOUNT_TYPE_MAP[input.type];

  const initialValue = input.initialValue ?? 0;

  const [account] = await db
    .insert(accounts)
    .values({
      userId: input.userId,
      connectionId: null,
      externalId: manualExternalId(),
      name: input.name,
      currency: input.currency ?? 'USD',
      balance: String(initialValue),
      balanceDate: new Date(),
      type: accountType,
      metadata: input.metadata ?? {},
      institution: null,
      isHidden: false,
      isExcludedFromNetWorth: false,
      displayOrder: 0,
    })
    .returning();

  if (initialValue !== 0) {
    await db.insert(transactions).values({
      userId: input.userId,
      accountId: account.id,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: String(initialValue),
      description: `Initial ${input.name} value`,
      payee: null,
      memo: null,
      pending: false,
    });
  }

  return account;
}

export async function syncManualAccount(
  accountId: string,
  userId: string
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

  const oldBalance = parseFloat(account.balance.toString());
  const meta = (account.metadata ?? {}) as Record<string, unknown>;
  let newValue: number;

  try {
    switch (account.type) {
      case 'realestate': {
        const propertyId = meta.propertyId as string;
        if (!propertyId) throw new Error('No propertyId in metadata');
        newValue = await fetchRedfinValue(propertyId);
        break;
      }
      case 'crypto': {
        const xpub = meta.xpub as string;
        if (!xpub) throw new Error('No xpub in metadata');
        newValue = await fetchBitcoinBalance(xpub);
        break;
      }
      case 'metals': {
        const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
        const amountOz = parseFloat(String(meta.amountOz ?? '0'));
        if (amountOz <= 0) throw new Error('No amountOz in metadata');
        const spotPrice = await fetchSpotPrice(subType);
        newValue = amountOz * spotPrice;
        break;
      }
      default:
        return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: 'Account type does not support auto-sync' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    console.error(`[manual-accounts] Sync failed for account ${accountId} (${account.type}):`, msg);
    return {
      status: 'error',
      newBalance: oldBalance,
      oldBalance,
      changed: false,
      errorMessage: msg,
    };
  }

  const delta = newValue - oldBalance;

  await db.update(accounts).set({
    balance: String(newValue),
    balanceDate: new Date(),
    updatedAt: new Date(),
  }).where(eq(accounts.id, accountId));

  if (Math.abs(delta) > 0.0001) {
    const assetTypeLabels: Record<string, string> = {
      realestate: 'Real Estate',
      crypto: 'Bitcoin',
      metals: 'Metals',
    };
    await db.insert(transactions).values({
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: String(delta),
      description: `${assetTypeLabels[account.type] ?? account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
    });
  }

  await createAccountSnapshotsForUser(userId);
  await updateNetWorthSnapshot(userId);

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed: Math.abs(delta) > 0.0001,
  };
}

export async function adjustManualAccountValue(
  accountId: string,
  userId: string,
  newValue: number,
  note?: string,
  amountOz?: number
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

  const oldBalance = parseFloat(account.balance.toString());
  let finalNewValue = newValue;
  const meta = (account.metadata ?? {}) as Record<string, unknown>;

  if (account.type === 'metals' && amountOz !== undefined) {
    try {
      const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
      const spotPrice = await fetchSpotPrice(subType);
      finalNewValue = amountOz * spotPrice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spot price fetch failed';
      console.error(`[manual-accounts] Adjust failed for metals account ${accountId}:`, msg);
      return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: msg };
    }

    await db.update(accounts).set({
      balance: String(finalNewValue),
      balanceDate: new Date(),
      updatedAt: new Date(),
      metadata: { ...meta, amountOz },
    }).where(eq(accounts.id, accountId));
  } else {
    await db.update(accounts).set({
      balance: String(finalNewValue),
      balanceDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
  }

  const delta = finalNewValue - oldBalance;

  if (Math.abs(delta) > 0.0001) {
    await db.insert(transactions).values({
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: String(delta),
      description: note ?? `${account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
    });
  }

  await createAccountSnapshotsForUser(userId);
  await updateNetWorthSnapshot(userId);

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed: Math.abs(delta) > 0.0001,
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
  } else {
    await db.delete(accounts).where(eq(accounts.id, accountId));
    await createAccountSnapshotsForUser(userId);
    await updateNetWorthSnapshot(userId);
  }
}

async function createAccountSnapshotsForUser(userId: string) {
  const db = getDb();
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const today = nowISO();
  for (const acc of userAccounts) {
    await db.insert(accountSnapshots).values({
      userId,
      accountId: acc.id,
      snapshotDate: today,
      balance: acc.balance.toString(),
      isSynthetic: false,
    }).onConflictDoUpdate({
      target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
      set: { balance: acc.balance.toString(), isSynthetic: false },
    });
  }
}

async function updateNetWorthSnapshot(userId: string) {
  const db = getDb();
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of userAccounts) {
    if (acc.isExcludedFromNetWorth) continue;

    const balance = parseFloat(acc.balance.toString());
    const accountType = acc.type.toLowerCase();

    const assetTypes = ['checking', 'savings', 'investment', 'other', 'brokerage', 'retirement', 'realestate', 'vehicle', 'crypto', 'metals', 'otherAsset'];
    const liabilityTypes = ['credit', 'loan', 'mortgage'];

    if (assetTypes.includes(accountType)) {
      totalAssets += balance;
    } else if (liabilityTypes.includes(accountType)) {
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

  await db.insert(netWorthSnapshots).values({
    userId,
    snapshotDate: today,
    totalAssets: String(totalAssets),
    totalLiabilities: String(totalLiabilities),
    netWorth: String(netWorth),
    breakdown,
  }).onConflictDoUpdate({
    target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
    set: {
      totalAssets: String(totalAssets),
      totalLiabilities: String(totalLiabilities),
      netWorth: String(netWorth),
      breakdown,
    },
  });
}
