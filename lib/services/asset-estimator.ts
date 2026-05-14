import { accountSnapshots } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { calculateAmortizationSchedule } from '@/lib/utils/amortization';
import type { AmortizationParams } from '@/lib/utils/amortization';

const LOG_TAG = '[asset-estimator]';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PurchaseInfo {
  purchasePrice: number;
  purchaseDate: string;
  zipCode?: string;
}

// Re-export pure amortization functions (client-safe)
export {
  calculateAmortizationSchedule,
  calculateAmortizationWithExtraPayments,
} from '@/lib/utils/amortization';
export type { AmortizationParams, AmortizationRow, ExtraPaymentParams } from '@/lib/utils/amortization';

// ─── FRED API ────────────────────────────────────────────────────────────────

const FRED_API_KEY = () => process.env.FRED_API_KEY ?? '';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;
  value: string;
}

async function fetchFredSeries(
  seriesId: string,
  startDate: string,
  endDate: string
): Promise<FredObservation[]> {
  const apiKey = FRED_API_KEY();
  if (!apiKey) {
    logger.debug(`${LOG_TAG} No FRED_API_KEY configured, skipping FRED fetch`);
    return [];
  }

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      logger.warn(`${LOG_TAG} FRED API HTTP ${res.status} for ${seriesId}`);
      return [];
    }
    const data = await res.json() as { observations?: FredObservation[] };
    if (!data.observations) return [];
    return data.observations.filter((o) => o.value !== '.');
  } catch (err) {
    logger.warn(`${LOG_TAG} FRED API error for ${seriesId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Zip code prefix → FRED metro HPI series ID mapping (major metros)
const ZIP_TO_METRO_HPI: Record<string, string> = {
  '10': 'NYXRSA',
  '11': 'NYXRSA',
  '100': 'NYXRSA',
  '112': 'NYXRSA',
  '606': 'CHXRSA',
  '941': 'SFXRSA',
  '902': 'LAXRSA',
  '900': 'LAXRSA',
  '770': 'HOXRSA',
  '752': 'DAXRSA',
  '191': 'PEXRSA',
  '021': 'BOXRSA',
  '981': 'SEXRSA',
  '200': 'WDXRSA',
  '331': 'MIXRSA',
  '328': 'ORXRSA',
  '303': 'ATXRSA',
  '850': 'PHXRSA',
  '802': 'DNXRSA',
  '482': 'DEXRSA',
  '554': 'MNXRSA',
  '631': 'STXRSA',
  '152': 'PTXRSA',
  '972': 'POXRSA',
  '432': 'CMXRSA',
  '462': 'INXRSA',
  '641': 'KCXRSA',
  '282': 'CHXRSA',
  '372': 'NSXRSA',
  '322': 'JAXRSA',
  '336': 'TBXRSA',
  '782': 'SAXRSA',
  '441': 'CLXRSA',
  '430': 'CMXRSA',
};

function findMetroSeries(zipCode: string): string | null {
  for (const [prefix, series] of Object.entries(ZIP_TO_METRO_HPI)) {
    if (zipCode.startsWith(prefix)) return series;
  }
  return null;
}

// ─── Real Estate Historical Estimation ───────────────────────────────────────

export async function estimateRealEstateHistory(
  purchasePrice: number,
  purchaseDate: string,
  currentValue: number,
  zipCode?: string
): Promise<Array<{ date: string; value: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const snapshots: Array<{ date: string; value: number }> = [];

  let hpiData: FredObservation[] = [];

  if (zipCode) {
    const metroSeries = findMetroSeries(zipCode);
    if (metroSeries) {
      hpiData = await fetchFredSeries(metroSeries, purchaseDate, today);
    }
    if (hpiData.length === 0) {
      hpiData = await fetchFredSeries('USSTHPI', purchaseDate, today);
    }
  } else {
    hpiData = await fetchFredSeries('USSTHPI', purchaseDate, today);
  }

  if (hpiData.length >= 2) {
    const firstHpi = parseFloat(hpiData[0].value);
    const lastHpi = parseFloat(hpiData[hpiData.length - 1].value);
    if (firstHpi > 0 && lastHpi > 0) {
      const hpiRatio = lastHpi / firstHpi;
      const adjustedCurrentValue = currentValue;
      const adjustedPurchaseValue = adjustedCurrentValue / hpiRatio;

      for (const obs of hpiData) {
        const obsHpi = parseFloat(obs.value);
        if (obsHpi <= 0) continue;
        const estimatedValue = adjustedPurchaseValue * (obsHpi / firstHpi);
        snapshots.push({ date: obs.date, value: Math.round(estimatedValue * 100) / 100 });
      }
      return snapshots;
    }
  }

  // Fallback: compound appreciation rate
  const startDate = new Date(purchaseDate);
  const endDate = new Date(today);
  const totalYears = (endDate.getTime() - startDate.getTime()) / (365.25 * 86400000);
  const DEFAULT_APPRECIATION_RATE = 0.04;

  const annualRate = totalYears > 0
    ? Math.pow(currentValue / purchasePrice, 1 / totalYears) - 1
    : DEFAULT_APPRECIATION_RATE;

  const rate = isFinite(annualRate) ? annualRate : DEFAULT_APPRECIATION_RATE;

  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const yearsElapsed = (cursor.getTime() - startDate.getTime()) / (365.25 * 86400000);
    const estimatedValue = purchasePrice * Math.pow(1 + rate, yearsElapsed);
    snapshots.push({
      date: cursor.toISOString().split('T')[0],
      value: Math.round(estimatedValue * 100) / 100,
    });
    cursor.setDate(cursor.getDate() + 90);
  }

  return snapshots;
}

// ─── Vehicle Depreciation ────────────────────────────────────────────────────

export function estimateVehicleHistory(
  purchasePrice: number,
  purchaseDate: string,
  currentValue?: number
): Array<{ date: string; value: number }> {
  const today = new Date().toISOString().split('T')[0];
  const snapshots: Array<{ date: string; value: number }> = [];

  const startDate = new Date(purchaseDate);
  const endDate = new Date(today);

  const firstYearDrop = 0.20;
  const annualDrop = 0.15;
  const monthlyDepreciation = annualDrop / 12;

  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const monthsElapsed = (cursor.getFullYear() - startDate.getFullYear()) * 12
      + (cursor.getMonth() - startDate.getMonth());

    let estimatedValue: number;
    if (monthsElapsed <= 12) {
      estimatedValue = purchasePrice * (1 - firstYearDrop * (monthsElapsed / 12));
    } else {
      estimatedValue = purchasePrice * (1 - firstYearDrop) * Math.pow(1 - monthlyDepreciation, monthsElapsed - 12);
    }

    snapshots.push({
      date: cursor.toISOString().split('T')[0],
      value: Math.max(0, Math.round(estimatedValue * 100) / 100),
    });

    cursor.setDate(cursor.getDate() + 90);
  }

  return snapshots;
}

// ─── Precious Metals Historical ──────────────────────────────────────────────

export async function estimateMetalsHistory(
  amountOz: number,
  metalType: 'gold' | 'silver',
  purchaseDate: string
): Promise<Array<{ date: string; value: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const ticker = metalType === 'gold' ? 'GC=F' : 'SI=F';

  try {
    const startTs = Math.floor(new Date(purchaseDate).getTime() / 1000);
    const endTs = Math.floor(new Date(today).getTime() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs}&period2=${endTs}&interval=1mo`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

    const data = await res.json() as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> };
    };

    const timestamps = data?.chart?.result?.[0]?.timestamp;
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) throw new Error('No price data in response');

    return timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        value: Math.round((closes[i] ?? 0) * amountOz * 100) / 100,
      }))
      .filter((d) => d.value > 0);
  } catch (err) {
    logger.warn(`${LOG_TAG} Failed to fetch historical ${metalType} prices: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ─── Mortgage Synthetic Snapshots ────────────────────────────────────────────

export function generateMortgagePaydownHistory(
  params: AmortizationParams,
  currentBalance: number,
  currentDate: string
): Array<{ date: string; balance: number }> {
  const schedule = calculateAmortizationSchedule(params);
  const snapshots: Array<{ date: string; balance: number }> = [];

  for (const row of schedule) {
    if (row.date > currentDate) break;
    snapshots.push({ date: row.date, balance: row.remainingBalance });
  }

  // Ensure current balance matches
  if (snapshots.length > 0) {
    snapshots[snapshots.length - 1] = {
      ...snapshots[snapshots.length - 1],
      balance: currentBalance,
    };
  }

  return snapshots;
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function generateAssetHistorySnapshots(
  accountId: string,
  userId: string,
  accountType: string,
  metadata: Record<string, unknown>
): Promise<number> {
  const { getDb } = await import(/* @vite-ignore */ '@/lib/db');
  const db = getDb();

  let snapshots: Array<{ date: string; value: number }> = [];
  const today = new Date().toISOString().split('T')[0];

  switch (accountType) {
    case 'realestate': {
      const purchasePrice = metadata.purchasePrice as number ?? 0;
      const purchaseDate = metadata.purchaseDate as string ?? today;
      const zipCode = metadata.zipCode as string | undefined;
      const currentValue = metadata.manualValue as number ?? await getAccountCurrentBalance(accountId);

      if (purchasePrice > 0 && purchaseDate < today) {
        snapshots = await estimateRealEstateHistory(purchasePrice, purchaseDate, currentValue, zipCode);
      }
      break;
    }

    case 'vehicle': {
      const purchasePrice = metadata.purchasePrice as number ?? 0;
      const purchaseDate = metadata.purchaseDate as string ?? today;

      if (purchasePrice > 0 && purchaseDate < today) {
        snapshots = estimateVehicleHistory(purchasePrice, purchaseDate);
      }
      break;
    }

    case 'metals': {
      const amountOz = parseFloat(String(metadata.amountOz ?? '0'));
      const subType = (metadata.subType ?? 'gold') as 'gold' | 'silver';
      const purchaseDate = metadata.purchaseDate as string ?? today;

      if (amountOz > 0 && purchaseDate < today) {
        snapshots = await estimateMetalsHistory(amountOz, subType, purchaseDate);
      }
      break;
    }

    case 'mortgage': {
      const originalLoanAmount = metadata.originalLoanAmount as number ?? 0;
      const interestRate = metadata.interestRate as number ?? 0;
      const termMonths = metadata.termMonths as number ?? 360;
      const monthlyPayment = metadata.monthlyPayment as number ?? 0;
      const startDate = metadata.purchaseDate as string ?? metadata.startDate as string ?? today;
      const currentBalance = await getAccountCurrentBalance(accountId);

      if (originalLoanAmount > 0 && interestRate > 0) {
        const history = generateMortgagePaydownHistory(
          { originalBalance: originalLoanAmount, annualRate: interestRate, termMonths, monthlyPayment, startDate },
          Math.abs(currentBalance),
          today
        );
        snapshots = history.map((h) => ({ date: h.date, value: -h.balance }));
      }
      break;
    }
  }

  if (snapshots.length === 0) {
    logger.debug(`${LOG_TAG} No synthetic snapshots generated for account ${accountId}`);
    return 0;
  }

  let inserted = 0;
  for (const snap of snapshots) {
    if (snap.date >= today) continue;
    try {
      await db.insert(accountSnapshots).values({
        userId,
        accountId,
        snapshotDate: snap.date,
        balance: String(snap.value),
        isSynthetic: true,
      }).onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: { balance: String(snap.value), isSynthetic: true },
      });
      inserted++;
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to insert synthetic snapshot for ${accountId} on ${snap.date}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`${LOG_TAG} Generated ${inserted} synthetic snapshots for account ${accountId} (${accountType})`);
  return inserted;
}

async function getAccountCurrentBalance(accountId: string): Promise<number> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const { accounts } = await import('@/lib/db/schema');
    const [result] = await db
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    return result ? parseFloat(result.balance.toString()) : 0;
  } catch {
    return 0;
  }
}
