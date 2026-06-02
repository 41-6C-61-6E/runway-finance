import { accountSnapshots, accounts } from '@/lib/db/schema';
import { eq, and, desc, gt, lt, asc, sql } from 'drizzle-orm';
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
  payoffBalance?: number,
  extraPrincipal?: number
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

  if (status === 'paid_off') {
    const endEventDateStr = endDateStr || currentDate;
    const endEventDate = new Date(endEventDateStr + 'T00:00:00');

    // 1. Walk forward from startDate to endEventDate - 1 month
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
        const principal = (effectivePayment + (extraPrincipal ?? 0)) - interest;
        balance = balance - principal;
      } else {
        balance = balance - (effectivePayment + (extraPrincipal ?? 0));
      }
      if (balance < 0) balance = 0;
    }

    // 2. On endEventDate, balance is 0
    snapshots.push({
      date: endEventDateStr,
      balance: 0,
    });
  } else {
    // For active or refinanced mortgages:
    // We walk forward from startDate to targetEndDate using standard amortization,
    // then adjust proportionally to hit targetEndBalance.
    const isRefinanced = status === 'refinanced';
    const targetEndDateStr = isRefinanced ? (endDateStr || currentDate) : currentDate;
    const targetEndDate = new Date(targetEndDateStr + 'T00:00:00');
    
    // For refinanced, the amortization history ends 1 month before refinanceDate,
    // with balance equal to payoffBalance. On refinanceDate, it is 0.
    const amortEndLimitDate = new Date(targetEndDate);
    if (isRefinanced) {
      amortEndLimitDate.setMonth(amortEndLimitDate.getMonth() - 1);
    }

    const targetEndBalance = isRefinanced ? (payoffBalance ?? 0) : currentBalance;

    let balance = originalBalance;
    let cursor = new Date(start);
    const tempSnaps: Array<{ date: string; balance: number }> = [];

    // Find the latest anniversary on or before amortEndLimitDate
    let year = amortEndLimitDate.getFullYear();
    let month = amortEndLimitDate.getMonth();
    let latestAnniversary = getAnniversaryDate(startDate, year, month);
    if (latestAnniversary > amortEndLimitDate) {
      month -= 1;
      latestAnniversary = getAnniversaryDate(startDate, year, month);
    }

    while (cursor <= latestAnniversary) {
      tempSnaps.push({
        date: formatDate(cursor),
        balance,
      });

      if (monthlyRate > 0) {
        const interest = balance * monthlyRate;
        const principal = (effectivePayment + (extraPrincipal ?? 0)) - interest;
        balance = balance - principal;
      } else {
        balance = balance - (effectivePayment + (extraPrincipal ?? 0));
      }
      if (balance < 0) balance = 0;

      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Push the end limit date itself if it wasn't pushed (meaning it's not aligned with the anniversary)
    const lastPushedStr = tempSnaps.length > 0 ? tempSnaps[tempSnaps.length - 1].date : '';
    const targetEndLimitStr = formatDate(amortEndLimitDate);
    if (lastPushedStr !== targetEndLimitStr) {
      tempSnaps.push({
        date: targetEndLimitStr,
        balance,
      });
    }

    // Proportional adjustment
    const N = tempSnaps.length;
    if (N > 0) {
      const amortizedEnd = tempSnaps[N - 1].balance;
      const diff = targetEndBalance - amortizedEnd;

      for (let i = 0; i < N; i++) {
        const fraction = N > 1 ? i / (N - 1) : 1;
        const adjustedBal = tempSnaps[i].balance + diff * fraction;
        snapshots.push({
          date: tempSnaps[i].date,
          balance: Math.round(adjustedBal * 100) / 100,
        });
      }
    }

    // If refinanced, on refinanceDate balance is 0
    if (isRefinanced) {
      snapshots.push({
        date: targetEndDateStr,
        balance: 0,
      });
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
  const REAL_ESTATE_ASSET_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family', 'other'
  ];

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

      const startDate = metadata.purchaseDate as string ?? metadata.startDate as string ?? undefined;
      if (startDate) {
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            lt(accountSnapshots.snapshotDate, startDate)
          )
        );
      }
    }

    // Clean up the old purchase date snapshot if it exists and matches the old purchase date/price
    if (REAL_ESTATE_ASSET_TYPES.includes(accountType) && oldPurchaseDate && oldPurchasePrice !== undefined) {
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

    // Clean up any historical snapshots (both synthetic and real) before the purchase date
    if (REAL_ESTATE_ASSET_TYPES.includes(accountType) || accountType === 'vehicle' || accountType === 'metals') {
      const purchaseDate = metadata.purchaseDate as string | undefined;
      if (purchaseDate) {
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            lt(accountSnapshots.snapshotDate, purchaseDate)
          )
        );
      }
    }
  } catch (err) {
    logger.error(`${LOG_TAG} Failed to clear existing snapshots for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let snapshots: Array<{ date: string; value: number }> = [];
  const today = new Date().toISOString().split('T')[0];

  switch (accountType) {
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
      const purchasePrice = metadata.purchasePrice as number ?? 0;
      const purchaseDate = metadata.purchaseDate as string ?? today;
      const zipCode = metadata.zipCode as string | undefined;
      const currentValue = metadata.manualValue as number ?? await getAccountCurrentBalance(accountId, dek);

      if (purchasePrice > 0 && purchaseDate < today) {
        snapshots = await estimateRealEstateHistory(purchasePrice, purchaseDate, currentValue, zipCode, apiConfig);
        snapshots = snapshots.filter(s => s.date >= purchaseDate);

        if (!snapshots.some(s => s.date === purchaseDate)) {
          snapshots.unshift({ date: purchaseDate, value: purchasePrice });
        }

        // Filter out synthetic snapshots for months that are already covered by real/imported snapshots
        const realSnaps = await db
          .select({
            snapshotDate: accountSnapshots.snapshotDate,
          })
          .from(accountSnapshots)
          .where(
            and(
              eq(accountSnapshots.accountId, accountId),
              eq(accountSnapshots.userId, userId),
              eq(accountSnapshots.isSynthetic, false)
            )
          );

        const coveredMonths = new Set(realSnaps.map(s => String(s.snapshotDate).substring(0, 7)));
        snapshots = snapshots.filter(s => !coveredMonths.has(s.date.substring(0, 7)));
      }
      break;
    }

    case 'vehicle': {
      const purchasePrice = metadata.purchasePrice as number ?? 0;
      const purchaseDate = metadata.purchaseDate as string ?? today;

      if (purchasePrice > 0 && purchaseDate < today) {
        snapshots = estimateVehicleHistory(purchasePrice, purchaseDate);
        snapshots = snapshots.filter(s => s.date >= purchaseDate);
      }
      break;
    }

    case 'metals': {
      const amountOz = parseFloat(String(metadata.amountOz ?? '0'));
      const subType = (metadata.subType ?? 'gold') as 'gold' | 'silver';
      const purchaseDate = metadata.purchaseDate as string ?? today;

      if (amountOz > 0 && purchaseDate < today) {
        snapshots = await estimateMetalsHistory(amountOz, subType, purchaseDate, apiConfig);
        snapshots = snapshots.filter(s => s.date >= purchaseDate);
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
      const extraPrincipal = metadata.extraPrincipal ? parseFloat(String(metadata.extraPrincipal)) : 0;
      
      const mortgageStatus = metadata.mortgageStatus as string | undefined;
      const payoffDate = metadata.payoffDate as string | undefined;
      const refinanceDate = metadata.refinanceDate as string | undefined;
      const payoffBalance = metadata.payoffBalance ? parseFloat(String(metadata.payoffBalance)) : 0;
      
      const currentBalance = await getAccountCurrentBalance(accountId, dek);

      // Query real snapshots to see if we should anchor to them
      const realSnaps = await db
        .select({
          snapshotDate: accountSnapshots.snapshotDate,
          balance: accountSnapshots.balance,
        })
        .from(accountSnapshots)
        .where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            eq(accountSnapshots.isSynthetic, false)
          )
        )
        .orderBy(asc(accountSnapshots.snapshotDate));

      const decryptedRealSnaps = await Promise.all(
        realSnaps.map(async (s) => {
          let balanceStr = String(s.balance);
          if (dek) {
            try {
              const decrypted = await decryptField(s.balance, dek);
              if (decrypted) balanceStr = decrypted;
            } catch (err) {
              // ignore
            }
          }
          return { date: String(s.snapshotDate), balance: parseFloat(balanceStr) };
        })
      );

      const validRealSnaps = decryptedRealSnaps.filter(s => !isNaN(s.balance));
      const firstReal = validRealSnaps[0];

      if (firstReal && originalLoanAmount > 0 && interestRate > 0) {
        // Hybrid Approach:
        // 1. Generate amortization paydown history BEFORE the first real snapshot date,
        // anchoring it to the first real snapshot's balance.
        const firstRealBalanceAbs = Math.abs(firstReal.balance);
        const historyBefore = generateMortgagePaydownHistory(
          { originalBalance: originalLoanAmount, annualRate: interestRate, termMonths, monthlyPayment: monthlyPI, startDate },
          firstRealBalanceAbs,
          firstReal.date,
          undefined,
          undefined,
          undefined,
          extraPrincipal
        );
        
        // Map and filter to only keep snapshots BEFORE the first real snapshot date
        const estBefore = historyBefore
          .map((h) => ({ date: h.date, value: -h.balance }))
          .filter((s) => s.date >= startDate && s.date < firstReal.date);

        // 2. Generate daily history for the period starting at the first real snapshot date
        // using the transaction-based/real-snapshot-based history generator.
        const { generateHistoricalAccountSnapshots } = await import('./account-history');
        await generateHistoricalAccountSnapshots(accountId, userId, firstReal.date, today, dek);

        // 3. Keep the estimated snapshots before the first real snapshot for insertion
        snapshots = estBefore;
      } else if (originalLoanAmount > 0 && interestRate > 0) {
        // Fallback: No real snapshots - generate full history using standard amortization from currentBalance to startDate
        const history = generateMortgagePaydownHistory(
          { originalBalance: originalLoanAmount, annualRate: interestRate, termMonths, monthlyPayment: monthlyPI, startDate },
          Math.abs(currentBalance),
          today,
          mortgageStatus,
          mortgageStatus === 'paid_off' ? payoffDate : refinanceDate,
          mortgageStatus === 'paid_off' ? 0 : payoffBalance,
          extraPrincipal
        );
        snapshots = history.map((h) => ({ date: h.date, value: -h.balance }));
        snapshots = snapshots.filter(s => s.date >= startDate);
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
    const isPurchaseDate = (REAL_ESTATE_ASSET_TYPES.includes(accountType) && snap.date === (metadata.purchaseDate as string));
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
