import { accountSnapshots } from '@/lib/db/schema';
import { eq, and, desc, gt } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { calculateAmortizationSchedule } from '@/lib/utils/amortization';
import type { AmortizationParams } from '@/lib/utils/amortization';
import { API_KEY_DEFAULTS } from '@/config/defaults';

const LOG_TAG = '[asset-estimator]';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApiConfig {
  metalsApiUrl?: string;
  metalsApiKey?: string;
  redfinApiUrl?: string;
  redfinApiKey?: string;
  fredApiUrl?: string;
  fredApiKey?: string;
  btcApiUrl?: string;
  btcApiKey?: string;
  btcXpubApiUrl?: string;
}

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

interface FredObservation {
  date: string;
  value: string;
}

async function fetchFredSeries(
  seriesId: string,
  startDate: string,
  endDate: string,
  apiConfig?: ApiConfig
): Promise<FredObservation[]> {
  const apiKey = apiConfig?.fredApiKey || process.env.FRED_API_KEY || '';
  if (!apiKey) {
    logger.debug(`${LOG_TAG} No FRED_API_KEY configured, skipping FRED fetch`);
    return [];
  }

  const baseUrl = apiConfig?.fredApiUrl || API_KEY_DEFAULTS.fredApiUrl;
  const url = `${baseUrl}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`;
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
  zipCode?: string,
  apiConfig?: ApiConfig
): Promise<Array<{ date: string; value: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const snapshots: Array<{ date: string; value: number }> = [];

  let hpiData: FredObservation[] = [];

  if (zipCode) {
    const metroSeries = findMetroSeries(zipCode);
    if (metroSeries) {
      hpiData = await fetchFredSeries(metroSeries, purchaseDate, today, apiConfig);
    }
    if (hpiData.length === 0) {
      hpiData = await fetchFredSeries('USSTHPI', purchaseDate, today, apiConfig);
    }
  } else {
    hpiData = await fetchFredSeries('USSTHPI', purchaseDate, today, apiConfig);
  }

  if (hpiData.length >= 2) {
    const firstHpi = parseFloat(hpiData[0].value);
    const lastHpi = parseFloat(hpiData[hpiData.length - 1].value);
    if (firstHpi > 0 && lastHpi > 0) {
      const hpiRatio = lastHpi / firstHpi;
      const N = hpiData.length;
      const H_last = purchasePrice * hpiRatio;
      const D = currentValue - H_last;

      for (let i = 0; i < N; i++) {
        const obs = hpiData[i];
        const obsHpi = parseFloat(obs.value);
        if (obsHpi <= 0) continue;
        const H_i = purchasePrice * (obsHpi / firstHpi);
        const adjustment = D * (i / (N - 1));
        const estimatedValue = H_i + adjustment;
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
    cursor.setDate(cursor.getDate() + 30);
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
  purchaseDate: string,
  apiConfig?: ApiConfig
): Promise<Array<{ date: string; value: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const ticker = metalType === 'gold' ? 'GC=F' : 'SI=F';

  try {
    const startTs = Math.floor(new Date(purchaseDate).getTime() / 1000);
    const endTs = Math.floor(new Date(today).getTime() / 1000);
    const baseUrl = apiConfig?.metalsApiUrl || API_KEY_DEFAULTS.metalsApiUrl;
    const url = `${baseUrl}/${ticker}?period1=${startTs}&period2=${endTs}&interval=1mo`;

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

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getAnniversaryDate(startDateStr: string, year: number, monthIndex: number): Date {
  const startParts = startDateStr.split('-').map(Number);
  const targetDay = startParts[2];
  
  // Find maximum days in target year/month (monthIndex is 0-indexed)
  const maxDays = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(targetDay, maxDays);
  
  return new Date(year, monthIndex, day);
}

export function generateMortgagePaydownHistory(
  params: AmortizationParams,
  currentBalance: number,
  currentDate: string,
  status?: string,
  endDateStr?: string,
  payoffBalance?: number
): Array<{ date: string; balance: number }> {
  const { originalBalance, annualRate, termMonths, monthlyPayment, startDate } = params;
  const monthlyRate = annualRate / 100 / 12;
  const snapshots: Array<{ date: string; balance: number }> = [];

  let effectivePayment = monthlyPayment;
  if (effectivePayment <= 0 && monthlyRate > 0) {
    effectivePayment = originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(currentDate + 'T00:00:00');

  if (status === 'paid_off' || status === 'refinanced') {
    const endEventDateStr = endDateStr || currentDate;
    const endEventDate = new Date(endEventDateStr + 'T00:00:00');

    // 1. On endEventDate, balance is 0
    snapshots.push({
      date: endEventDateStr,
      balance: 0,
    });

    // 2. Walk before the end event date:
    if (status === 'paid_off') {
      // Walk forward from startDate to endEventDate - 1 month
      let balance = originalBalance;
      let forwardCursor = new Date(start);
      const endEventDateMinus1Month = new Date(endEventDate);
      endEventDateMinus1Month.setMonth(endEventDateMinus1Month.getMonth() - 1);

      while (forwardCursor <= endEventDateMinus1Month) {
        snapshots.push({
          date: formatDate(forwardCursor),
          balance: Math.round(balance * 100) / 100,
        });
        forwardCursor.setMonth(forwardCursor.getMonth() + 1);

        if (monthlyRate > 0) {
          const interest = balance * monthlyRate;
          const principal = effectivePayment - interest;
          balance = balance - principal;
        } else {
          balance = balance - effectivePayment;
        }
        if (balance < 0) balance = 0;
      }
    } else {
      // Walk backward from endEventDate - 1 month using payoffBalance
      const startVal = payoffBalance ?? 0;
      let balance = startVal;
      let backwardCursor = new Date(endEventDate);
      backwardCursor.setMonth(backwardCursor.getMonth() - 1);

      while (backwardCursor >= start) {
        snapshots.push({
          date: formatDate(backwardCursor),
          balance: Math.round(balance * 100) / 100,
        });
        backwardCursor.setMonth(backwardCursor.getMonth() - 1);
        if (backwardCursor < start) break;

        if (monthlyRate > 0) {
          balance = (balance + effectivePayment) / (1 + monthlyRate);
        } else {
          balance += effectivePayment;
        }

        if (balance > originalBalance) {
          balance = originalBalance;
        }
      }
    }
  } else {
    // Pushes today/currentDate with currentBalance
    snapshots.push({
      date: currentDate,
      balance: Math.round(currentBalance * 100) / 100,
    });

    // Find the latest anniversary date on or before today
    let year = today.getFullYear();
    let month = today.getMonth();
    let anniversary = getAnniversaryDate(startDate, year, month);
    if (anniversary > today) {
      month -= 1;
      anniversary = getAnniversaryDate(startDate, year, month);
    }

    let cursor = new Date(anniversary);
    let balance = currentBalance;

    while (cursor >= start) {
      snapshots.push({
        date: formatDate(cursor),
        balance: Math.round(balance * 100) / 100,
      });

      month -= 1;
      const prevCursor = getAnniversaryDate(startDate, year, month);
      if (prevCursor < start) {
        // If the previous anniversary would be before start, but the cursor is not start,
        // we make sure we have a snapshot on start itself.
        if (cursor.getTime() !== start.getTime()) {
          snapshots.push({
            date: startDate,
            balance: Math.round(originalBalance * 100) / 100,
          });
        }
        break;
      }

      if (monthlyRate > 0) {
        balance = (balance + effectivePayment) / (1 + monthlyRate);
      } else {
        balance += effectivePayment;
      }

      if (balance > originalBalance) {
        balance = originalBalance;
      }

      cursor = prevCursor;
    }
  }

  // Deduplicate and sort chronologically
  const dedupedMap = new Map<string, number>();
  for (const snap of snapshots) {
    dedupedMap.set(snap.date, snap.balance);
  }
  return Array.from(dedupedMap.entries())
    .map(([date, balance]) => ({ date, balance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function generateAssetHistorySnapshots(
  accountId: string,
  userId: string,
  accountType: string,
  metadata: Record<string, unknown>,
  apiConfig?: ApiConfig,
  dek?: Uint8Array,
  oldPurchaseDate?: string,
  oldPurchasePrice?: number
): Promise<number> {
  const { getDb } = await import(/* @vite-ignore */ '@/lib/db');
  const db = getDb();

  // Delete existing synthetic snapshots first. If this fails, abort —
  // otherwise old data (potentially from a different amortization
  // range or property) lingers alongside new data.
  try {
    await db.delete(accountSnapshots).where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

    // Clean up all snapshots after payoff/refinance date if applicable
    if (accountType === 'mortgage') {
      const status = metadata.mortgageStatus as string | undefined;
      const endEventDateStr = status === 'paid_off' ? (metadata.payoffDate as string | undefined) : (status === 'refinanced' ? (metadata.refinanceDate as string | undefined) : undefined);
      if (endEventDateStr) {
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            gt(accountSnapshots.snapshotDate, endEventDateStr)
          )
        );
      }
    }

    // Clean up the old purchase date snapshot if it exists and matches the old purchase date/price
    if (accountType === 'realestate' && oldPurchaseDate && oldPurchasePrice !== undefined) {
      await db.delete(accountSnapshots).where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          eq(accountSnapshots.snapshotDate, oldPurchaseDate),
          eq(accountSnapshots.isSynthetic, false),
          eq(accountSnapshots.balance, String(oldPurchasePrice))
        )
      );
    }
  } catch (err) {
    logger.error(`${LOG_TAG} Failed to clear existing snapshots for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let snapshots: Array<{ date: string; value: number }> = [];
  const today = new Date().toISOString().split('T')[0];

  switch (accountType) {
    case 'realestate': {
      const purchasePrice = metadata.purchasePrice as number ?? 0;
      const purchaseDate = metadata.purchaseDate as string ?? today;
      const zipCode = metadata.zipCode as string | undefined;
      const currentValue = metadata.manualValue as number ?? await getAccountCurrentBalance(accountId, dek);

      if (purchasePrice > 0 && purchaseDate < today) {
        snapshots = await estimateRealEstateHistory(purchasePrice, purchaseDate, currentValue, zipCode, apiConfig);
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
        snapshots = await estimateMetalsHistory(amountOz, subType, purchaseDate, apiConfig);
      }
      break;
    }

    case 'mortgage': {
      const originalLoanAmount = metadata.originalLoanAmount as number ?? 0;
      const interestRate = metadata.interestRate as number ?? 0;
      const termMonths = metadata.termMonths as number ?? 360;
      const monthlyPayment = metadata.monthlyPayment as number ?? 0;
      const monthlyPI = monthlyPayment;
      const startDate = metadata.purchaseDate as string ?? metadata.startDate as string ?? today;
      
      const mortgageStatus = metadata.mortgageStatus as string | undefined;
      const payoffDate = metadata.payoffDate as string | undefined;
      const refinanceDate = metadata.refinanceDate as string | undefined;
      const payoffBalance = metadata.payoffBalance ? parseFloat(String(metadata.payoffBalance)) : 0;
      
      const currentBalance = await getAccountCurrentBalance(accountId, dek);

      if (originalLoanAmount > 0 && interestRate > 0) {
        const history = generateMortgagePaydownHistory(
          { originalBalance: originalLoanAmount, annualRate: interestRate, termMonths, monthlyPayment: monthlyPI, startDate },
          Math.abs(currentBalance),
          today,
          mortgageStatus,
          mortgageStatus === 'paid_off' ? payoffDate : refinanceDate,
          mortgageStatus === 'paid_off' ? 0 : payoffBalance
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

    // Treat the purchase date snapshot as real (isSynthetic = false)
    const isPurchaseDate = (accountType === 'realestate' && snap.date === (metadata.purchaseDate as string));
    const isSynth = isPurchaseDate ? false : true;

    try {
      await db.insert(accountSnapshots).values({
        userId,
        accountId,
        snapshotDate: snap.date,
        balance: String(snap.value),
        isSynthetic: isSynth,
      }).onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: { balance: String(snap.value), isSynthetic: isSynth },
        where: isSynth ? eq(accountSnapshots.isSynthetic, true) : undefined,
      });
      inserted++;
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to insert snapshot for ${accountId} on ${snap.date}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`${LOG_TAG} Generated ${inserted} synthetic snapshots for account ${accountId} (${accountType})`);
  return inserted;
}

async function getAccountCurrentBalance(accountId: string, dek?: Uint8Array): Promise<number> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const { accounts } = await import('@/lib/db/schema');
    const [result] = await db
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!result) return 0;
    const balance = result.balance.toString();
    return parseFloat(dek ? await decryptField(balance, dek) : balance);
  } catch {
    return 0;
  }
}
