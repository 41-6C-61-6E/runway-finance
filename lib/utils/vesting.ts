/**
 * Pure Vesting & Equity Valuation Engine
 *
 * Supports:
 * - Grant types: 'iso' | 'nso' | 'rsu' | 'common'
 * - Cliff + periodic vesting (monthly, quarterly, annual) or custom tranches
 * - Early exercise (83(b)) and post-vest exercises / sales
 * - Dual valuation basis: 409A FMV ('fmv') vs. Preferred / Target ('preferred')
 * - ISO AMT bargain element & NSO ordinary income spread calculations
 * - Historical and projected vesting timeline generation
 */

export type EquityGrantType = 'iso' | 'nso' | 'rsu' | 'common';
export type EquityValuationMode = 'fmv' | 'preferred';
export type VestingFrequency = 'monthly' | 'quarterly' | 'annual' | 'custom' | 'immediate';

export interface CustomVestingTranche {
  date: string; // YYYY-MM-DD
  shares: number;
}

export interface VestingScheduleConfig {
  totalMonths: number; // e.g. 48
  cliffMonths: number; // e.g. 12
  cliffPercent: number; // e.g. 25 (0 to 100)
  frequency: VestingFrequency;
  customTranches?: CustomVestingTranche[];
}

export interface EquityGrantInput {
  id: string;
  accountId: string;
  companyName: string;
  grantName: string;
  grantType: EquityGrantType;
  grantDate: string; // YYYY-MM-DD
  vestingStartDate: string; // YYYY-MM-DD
  expirationDate?: string | null;
  totalShares: number;
  exercisedShares: number;
  soldShares: number;
  strikePrice: number;
  currentFmv: number;
  preferredPrice?: number | null;
  valuationMode: EquityValuationMode;
  vestingSchedule: VestingScheduleConfig;
  earlyExerciseAllowed?: boolean;
  filed83b?: boolean;
  earlyExerciseDate?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
}

export interface VestingEventPoint {
  date: string; // YYYY-MM-DD
  sharesVestedOnDate: number;
  cumulativeVestedShares: number;
  unvestedShares: number;
  vestedPct: number;
  isCliff: boolean;
}

export interface GrantValuationMetrics {
  asOfDate: string;
  totalShares: number;
  vestedShares: number;
  unvestedShares: number;
  vestedPct: number;
  exercisedShares: number;
  soldShares: number;
  /** Vested options/RSUs not yet exercised (or for early-exercised grants, vested portion of held shares) */
  unexercisedVestedShares: number;
  /** Unvested options available for early exercise if earlyExerciseAllowed is true */
  earlyExercisableShares: number;
  /** Shares already exercised and still held (exercisedShares - soldShares) */
  heldExercisedShares: number;
  /** Vested portion of held exercised shares */
  vestedHeldShares: number;
  /** Unvested portion of early-exercised shares (subject to company repurchase right until vested) */
  unvestedHeldShares: number;

  effectiveSharePrice: number;
  fmvSharePrice: number;
  preferredSharePrice: number;
  strikePrice: number;

  /** Spread per share at effective valuation: max(0, effectiveSharePrice - effectiveStrike) */
  spreadPerShare: number;
  /** Spread per share at 409A FMV: max(0, fmvSharePrice - effectiveStrike) */
  fmvSpreadPerShare: number;

  /**
   * Vested Intrinsic Value (the canonical balance contribution for Net Worth):
   * - For unexercised vested options: unexercisedVestedShares * max(0, effectivePrice - strike)
   * - For RSUs: vestedHeldOrUnsettled * effectivePrice
   * - For held exercised shares (common or exercised options): heldExercisedShares * effectivePrice
   *   (or if early exercised, vestedHeldShares * effectivePrice + unvestedHeldShares * strikePrice)
   */
  vestedIntrinsicValue: number;
  /** Vested intrinsic value evaluated strictly at 409A FMV */
  vestedValueAtFmv: number;
  /** Vested intrinsic value evaluated at Preferred/Target price */
  vestedValueAtPreferred: number;

  /** Unvested potential value ("On the Table") at effective share price */
  unvestedIntrinsicValue: number;
  /** Total potential value (Vested + Unvested remaining shares) at effective share price */
  totalPotentialValue: number;

  /** Cash required to exercise all currently vested unexercised options */
  cashToExerciseVested: number;
  /** Cash required to exercise all remaining unexercised options (total - exercised) */
  cashToExerciseAll: number;
  /** Total cost basis already paid for exercised shares still held */
  exercisedCostBasis: number;

  /**
   * Tax / AMT estimates if exercising all currently unexercised vested shares today:
   * - For ISOs: AMT bargain element = unexercisedVestedShares * max(0, currentFmv - strikePrice)
   *   (unless 83(b) was already filed upon early exercise)
   * - For NSOs: Ordinary income spread = unexercisedVestedShares * max(0, currentFmv - strikePrice)
   */
  isoAmtBargainElement: number;
  nsoOrdinaryIncomeSpread: number;
  estimatedTaxOnVestedExercise: number;

  nextVestDate: string | null;
  nextVestShares: number;
  isFullyVested: boolean;
  isExpired: boolean;
}

/**
 * Add `months` to a YYYY-MM-DD date string in UTC, clamping day-of-month to the target month's max days
 * (e.g., Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsDateStr(dateStr: string, monthsToAdd: number): string {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] || 2026;
  const monthIdx = (parts[1] || 1) - 1;
  const day = parts[2] || 1;

  const totalMonths = year * 12 + monthIdx + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIdx = ((totalMonths % 12) + 12) % 12;

  const maxDay = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);

  const yyyy = String(targetYear).padStart(4, '0');
  const mm = String(targetMonthIdx + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeVestingSchedule(raw: unknown): VestingScheduleConfig {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      totalMonths: 48,
      cliffMonths: 12,
      cliffPercent: 25,
      frequency: 'monthly',
    };
  }

  const freq = ['monthly', 'quarterly', 'annual', 'custom', 'immediate'].includes(parsed.frequency)
    ? (parsed.frequency as VestingFrequency)
    : 'monthly';

  const totalMonths = Math.max(0, Math.min(240, Number(parsed.totalMonths ?? 48) || 0));
  const cliffMonths = Math.max(0, Math.min(totalMonths, Number(parsed.cliffMonths ?? 12) || 0));
  const cliffPercent = Math.max(0, Math.min(100, Number(parsed.cliffPercent ?? (cliffMonths > 0 && totalMonths > 0 ? (cliffMonths / totalMonths) * 100 : 0)) || 0));

  const customTranches: CustomVestingTranche[] | undefined = Array.isArray(parsed.customTranches)
    ? parsed.customTranches
        .map((t: any) => ({
          date: String(t?.date || '').slice(0, 10),
          shares: Math.max(0, Number(t?.shares) || 0),
        }))
        .filter((t: CustomVestingTranche) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.shares > 0)
        .sort((a: CustomVestingTranche, b: CustomVestingTranche) => a.date.localeCompare(b.date))
    : undefined;

  return {
    totalMonths,
    cliffMonths,
    cliffPercent,
    frequency: freq,
    ...(customTranches && customTranches.length > 0 ? { customTranches } : {}),
  };
}

/**
 * Generates the discrete chronological list of vesting tranche events for a grant.
 */
export function generateVestingEvents(
  vestingStartDate: string,
  totalShares: number,
  scheduleInput: VestingScheduleConfig | unknown
): VestingEventPoint[] {
  const cleanShares = Math.max(0, Number(totalShares) || 0);
  if (cleanShares <= 0) return [];

  const schedule = normalizeVestingSchedule(scheduleInput);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(vestingStartDate)
    ? vestingStartDate
    : new Date().toISOString().split('T')[0];

  // 1. Immediate vesting (or common shares with 0 totalMonths)
  if (schedule.frequency === 'immediate' || schedule.totalMonths <= 0) {
    return [
      {
        date: startDate,
        sharesVestedOnDate: cleanShares,
        cumulativeVestedShares: cleanShares,
        unvestedShares: 0,
        vestedPct: 100,
        isCliff: false,
      },
    ];
  }

  // 2. Custom tranches
  if (schedule.frequency === 'custom' && schedule.customTranches && schedule.customTranches.length > 0) {
    const events: VestingEventPoint[] = [];
    let cumulative = 0;
    for (let i = 0; i < schedule.customTranches.length; i++) {
      const tranche = schedule.customTranches[i];
      const remaining = Math.max(0, cleanShares - cumulative);
      const vestedNow = Math.min(remaining, tranche.shares);
      if (vestedNow <= 0) continue;
      cumulative = Math.round((cumulative + vestedNow) * 10000) / 10000;
      const unvested = Math.max(0, Math.round((cleanShares - cumulative) * 10000) / 10000);
      events.push({
        date: tranche.date,
        sharesVestedOnDate: vestedNow,
        cumulativeVestedShares: cumulative,
        unvestedShares: unvested,
        vestedPct: (cumulative / cleanShares) * 100,
        isCliff: i === 0,
      });
    }
    return events;
  }

  // 3. Standard periodic schedule (monthly, quarterly, annual) with optional cliff
  const stepMonths =
    schedule.frequency === 'quarterly' ? 3 : schedule.frequency === 'annual' ? 12 : 1;

  const events: VestingEventPoint[] = [];
  let cumulative = 0;

  const hasCliff = schedule.cliffMonths > 0 && schedule.cliffPercent > 0;
  let currentMonthOffset = 0;

  if (hasCliff) {
    const cliffDate = addMonthsDateStr(startDate, schedule.cliffMonths);
    const cliffShares = Math.min(
      cleanShares,
      Math.round(cleanShares * (schedule.cliffPercent / 100) * 10000) / 10000
    );
    cumulative = cliffShares;
    events.push({
      date: cliffDate,
      sharesVestedOnDate: cliffShares,
      cumulativeVestedShares: cumulative,
      unvestedShares: Math.max(0, cleanShares - cumulative),
      vestedPct: (cumulative / cleanShares) * 100,
      isCliff: true,
    });
    currentMonthOffset = schedule.cliffMonths;
  }

  const baseCliffShares = cumulative;
  const remainingMonths = Math.max(0, schedule.totalMonths - currentMonthOffset);
  const remainingShares = Math.max(0, cleanShares - baseCliffShares);

  if (remainingMonths > 0 && remainingShares > 0) {
    const numSteps = Math.max(1, Math.ceil(remainingMonths / stepMonths));
    for (let step = 1; step <= numSteps; step++) {
      const monthOffset = Math.min(
        schedule.totalMonths,
        currentMonthOffset + step * stepMonths
      );
      const eventDate = addMonthsDateStr(startDate, monthOffset);
      const isLast = step === numSteps || monthOffset >= schedule.totalMonths;

      const targetCumulative = isLast
        ? cleanShares
        : Math.min(
            cleanShares,
            Math.round(
              (baseCliffShares + (remainingShares * step) / numSteps) * 10000
            ) / 10000
          );
      const vestedOnDate = Math.max(
        0,
        Math.round((targetCumulative - cumulative) * 10000) / 10000
      );
      cumulative = targetCumulative;

      if (vestedOnDate > 0) {
        events.push({
          date: eventDate,
          sharesVestedOnDate: vestedOnDate,
          cumulativeVestedShares: cumulative,
          unvestedShares: Math.max(0, Math.round((cleanShares - cumulative) * 10000) / 10000),
          vestedPct: (cumulative / cleanShares) * 100,
          isCliff: false,
        });
      }
      if (isLast) break;
    }
  } else if (remainingShares > 0 && events.length === 0) {
    events.push({
      date: startDate,
      sharesVestedOnDate: cleanShares,
      cumulativeVestedShares: cleanShares,
      unvestedShares: 0,
      vestedPct: 100,
      isCliff: false,
    });
  }

  return events;
}

/**
 * Computes full vesting and valuation metrics for a single grant as of `asOfDate`.
 */
export function computeGrantMetrics(
  grant: EquityGrantInput,
  asOfDateInput?: string,
  overrideSharePrice?: number
): GrantValuationMetrics {
  const asOfDate =
    asOfDateInput && /^\d{4}-\d{2}-\d{2}$/.test(asOfDateInput)
      ? asOfDateInput
      : new Date().toISOString().split('T')[0];

  const totalShares = Math.max(0, Number(grant.totalShares) || 0);
  const exercisedShares = Math.max(0, Math.min(totalShares, Number(grant.exercisedShares) || 0));
  const soldShares = Math.max(0, Math.min(exercisedShares || totalShares, Number(grant.soldShares) || 0));

  const isCommonOrRsu = grant.grantType === 'rsu' || grant.grantType === 'common';
  const strikePrice = isCommonOrRsu && grant.grantType === 'rsu'
    ? 0
    : Math.max(0, Number(grant.strikePrice) || 0);

  const fmvSharePrice = Math.max(0, Number(grant.currentFmv) || 0);
  const preferredSharePrice =
    grant.preferredPrice != null && Number(grant.preferredPrice) > 0
      ? Number(grant.preferredPrice)
      : fmvSharePrice;

  const effectiveSharePrice =
    overrideSharePrice !== undefined && overrideSharePrice >= 0
      ? overrideSharePrice
      : grant.valuationMode === 'preferred'
        ? preferredSharePrice
        : fmvSharePrice;

  const events =
    grant.grantType === 'common' && (!grant.vestingSchedule || grant.vestingSchedule.totalMonths === 0)
      ? generateVestingEvents(grant.vestingStartDate || grant.grantDate, totalShares, {
          totalMonths: 0,
          cliffMonths: 0,
          cliffPercent: 100,
          frequency: 'immediate',
        })
      : generateVestingEvents(grant.vestingStartDate || grant.grantDate, totalShares, grant.vestingSchedule);

  let vestedShares = 0;
  let nextVestDate: string | null = null;
  let nextVestShares = 0;

  for (const ev of events) {
    if (ev.date <= asOfDate) {
      vestedShares = ev.cumulativeVestedShares;
    } else if (nextVestDate === null) {
      nextVestDate = ev.date;
      nextVestShares = ev.sharesVestedOnDate;
    }
  }

  const unvestedShares = Math.max(0, Math.round((totalShares - vestedShares) * 10000) / 10000);
  const vestedPct = totalShares > 0 ? (vestedShares / totalShares) * 100 : 0;
  const isFullyVested = totalShares > 0 && unvestedShares <= 0.0001;
  const isExpired = Boolean(
    grant.expirationDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(grant.expirationDate) &&
      asOfDate > grant.expirationDate
  );

  // Determine exercised vs. unexercised breakdown
  // If options were exercised (including early exercise), `exercisedShares` tracks total exercised to date.
  const heldExercisedShares = Math.max(0, exercisedShares - soldShares);
  const vestedAfterSold = Math.max(0, vestedShares - soldShares);
  const vestedHeldShares = Math.min(heldExercisedShares, vestedAfterSold);
  const unvestedHeldShares = Math.max(0, heldExercisedShares - vestedHeldShares);

  // Unexercised vested shares: if expired, unexercised options expire worthless (0)
  const rawUnexercisedVested =
    grant.grantType === 'common'
      ? 0
      : Math.max(0, vestedShares - exercisedShares);
  const unexercisedVestedShares = isExpired ? 0 : rawUnexercisedVested;

  const earlyExercisableShares =
    !isExpired && grant.earlyExerciseAllowed && (grant.grantType === 'iso' || grant.grantType === 'nso')
      ? Math.max(0, totalShares - Math.max(vestedShares, exercisedShares))
      : 0;

  const spreadPerShare = Math.max(0, effectiveSharePrice - strikePrice);
  const fmvSpreadPerShare = Math.max(0, fmvSharePrice - strikePrice);
  const preferredSpreadPerShare = Math.max(0, preferredSharePrice - strikePrice);

  // Calculate Vested Intrinsic Value at a given share price
  const calcVestedValueAtPrice = (price: number): number => {
    const spread = Math.max(0, price - strikePrice);
    if (grant.grantType === 'common') {
      const remainingCommon = Math.max(0, vestedShares - soldShares);
      return remainingCommon * price;
    }
    if (grant.grantType === 'rsu') {
      const remainingRsu = Math.max(0, vestedShares - soldShares);
      return remainingRsu * price;
    }
    // ISO / NSO:
    // 1. Vested unexercised options are worth their spread: unexercisedVestedShares * spread
    // 2. Exercised shares still held that are vested are owned outright: vestedHeldShares * price
    // 3. Early-exercised shares that are STILL UNVESTED are valued conservatively at their exercise cost
    //    (company can repurchase at strike price if you leave before vesting) + vested value is tracked in unvested.
    const unexercisedVal = unexercisedVestedShares * spread;
    const vestedHeldVal = vestedHeldShares * price;
    const unvestedHeldCostVal = unvestedHeldShares * Math.min(price, strikePrice);
    return Math.round((unexercisedVal + vestedHeldVal + unvestedHeldCostVal) * 100) / 100;
  };

  const vestedIntrinsicValue = calcVestedValueAtPrice(effectiveSharePrice);
  const vestedValueAtFmv = calcVestedValueAtPrice(fmvSharePrice);
  const vestedValueAtPreferred = calcVestedValueAtPrice(preferredSharePrice);

  // Unvested value ("On the Table")
  const unvestedIntrinsicValue = isExpired
    ? 0
    : grant.grantType === 'rsu' || grant.grantType === 'common'
      ? Math.round(unvestedShares * effectiveSharePrice * 100) / 100
      : Math.round(unvestedShares * spreadPerShare * 100) / 100;

  const totalPotentialValue = Math.round((vestedIntrinsicValue + unvestedIntrinsicValue) * 100) / 100;

  const cashToExerciseVested =
    grant.grantType === 'iso' || grant.grantType === 'nso'
      ? Math.round(unexercisedVestedShares * strikePrice * 100) / 100
      : 0;

  const remainingUnexercisedAll =
    grant.grantType === 'iso' || grant.grantType === 'nso'
      ? Math.max(0, totalShares - exercisedShares)
      : 0;
  const cashToExerciseAll = isExpired
    ? 0
    : Math.round(remainingUnexercisedAll * strikePrice * 100) / 100;

  const exercisedCostBasis =
    grant.grantType === 'rsu'
      ? Math.round(heldExercisedShares * fmvSharePrice * 100) / 100
      : Math.round(heldExercisedShares * strikePrice * 100) / 100;

  // Tax / AMT calculations for exercising currently unexercised vested shares
  const isoAmtBargainElement =
    grant.grantType === 'iso' && !grant.filed83b
      ? Math.round(unexercisedVestedShares * fmvSpreadPerShare * 100) / 100
      : 0;

  const nsoOrdinaryIncomeSpread =
    grant.grantType === 'nso' && !grant.filed83b
      ? Math.round(unexercisedVestedShares * fmvSpreadPerShare * 100) / 100
      : 0;

  // Standard estimate: 26%/28% federal AMT rate on ISO bargain element above exemption, or ~32% marginal on NSO spread
  const estimatedTaxOnVestedExercise =
    grant.grantType === 'iso'
      ? Math.round(isoAmtBargainElement * 0.26 * 100) / 100
      : grant.grantType === 'nso'
        ? Math.round(nsoOrdinaryIncomeSpread * 0.32 * 100) / 100
        : 0;

  return {
    asOfDate,
    totalShares,
    vestedShares,
    unvestedShares,
    vestedPct,
    exercisedShares,
    soldShares,
    unexercisedVestedShares,
    earlyExercisableShares,
    heldExercisedShares,
    vestedHeldShares,
    unvestedHeldShares,
    effectiveSharePrice,
    fmvSharePrice,
    preferredSharePrice,
    strikePrice,
    spreadPerShare,
    fmvSpreadPerShare,
    vestedIntrinsicValue,
    vestedValueAtFmv,
    vestedValueAtPreferred,
    unvestedIntrinsicValue,
    totalPotentialValue,
    cashToExerciseVested,
    cashToExerciseAll,
    exercisedCostBasis,
    isoAmtBargainElement,
    nsoOrdinaryIncomeSpread,
    estimatedTaxOnVestedExercise,
    nextVestDate,
    nextVestShares,
    isFullyVested,
    isExpired,
  };
}

export interface VestingTimelinePoint {
  date: string; // YYYY-MM-DD
  monthLabel: string;
  vestedShares: number;
  unvestedShares: number;
  vestedValueFmv: number;
  vestedValuePreferred: number;
  vestedValueEffective: number;
  unvestedValueEffective: number;
  totalPotentialValue: number;
  isPastOrToday: boolean;
}

/**
 * Generates a monthly timeline series across one or more grants from the earliest grant/vesting start
 * through the final vesting date, suitable for the Vesting Schedule Chart and historical snapshot generation.
 */
export function buildPortfolioVestingTimeline(
  grants: EquityGrantInput[],
  todayStrInput?: string,
  overrideSharePrice?: number
): VestingTimelinePoint[] {
  if (!grants || grants.length === 0) return [];
  const todayStr =
    todayStrInput && /^\d{4}-\d{2}-\d{2}$/.test(todayStrInput)
      ? todayStrInput
      : new Date().toISOString().split('T')[0];

  let minDate = todayStr;
  let maxDate = todayStr;

  for (const g of grants) {
    const start = g.vestingStartDate || g.grantDate || todayStr;
    if (start < minDate) minDate = start;
    const events = generateVestingEvents(start, g.totalShares, g.vestingSchedule);
    for (const ev of events) {
      if (ev.date < minDate) minDate = ev.date;
      if (ev.date > maxDate) maxDate = ev.date;
    }
  }

  // Ensure at least 12 months of range if all grants are immediate
  if (maxDate <= minDate) {
    maxDate = addMonthsDateStr(minDate, 12);
  }

  const points: VestingTimelinePoint[] = [];
  let cursor = minDate.slice(0, 7) + '-01';
  const endMonth = maxDate.slice(0, 7) + '-28';

  // Cap at 240 monthly steps (20 years) for safety
  let safety = 0;
  const dateSet = new Set<string>();
  dateSet.add(minDate);
  dateSet.add(todayStr);
  dateSet.add(maxDate);

  while (cursor <= endMonth && safety < 240) {
    // Use end of month or the 1st of each month
    dateSet.add(cursor);
    cursor = addMonthsDateStr(cursor, 1);
    safety++;
  }

  // Include every vesting event date so monthly step-ups and final vest dates are exact
  for (const g of grants) {
    const start = g.vestingStartDate || g.grantDate || todayStr;
    const events = generateVestingEvents(start, g.totalShares, g.vestingSchedule);
    for (const ev of events) {
      dateSet.add(ev.date);
    }
  }

  const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // Deduplicate to at most one point per YYYY-MM, preferring todayStr or the latest event date in that month
  const monthlyDates: string[] = [];
  const seenMonth = new Map<string, string>();
  for (const d of sortedDates) {
    const ym = d.slice(0, 7);
    if (seenMonth.get(ym) !== todayStr) {
      seenMonth.set(ym, d);
    }
  }
  for (const d of seenMonth.values()) {
    monthlyDates.push(d);
  }
  monthlyDates.sort((a, b) => a.localeCompare(b));

  for (const d of monthlyDates) {
    let vestedShares = 0;
    let unvestedShares = 0;
    let vestedValueFmv = 0;
    let vestedValuePreferred = 0;
    let vestedValueEffective = 0;
    let unvestedValueEffective = 0;

    for (const g of grants) {
      const grantStart = g.grantDate || g.vestingStartDate || d;
      if (d < grantStart && d < (g.vestingStartDate || grantStart)) {
        continue;
      }
      const m = computeGrantMetrics(g, d, overrideSharePrice);
      vestedShares += m.vestedShares;
      unvestedShares += m.unvestedShares;
      vestedValueFmv += m.vestedValueAtFmv;
      vestedValuePreferred += m.vestedValueAtPreferred;
      vestedValueEffective += m.vestedIntrinsicValue;
      unvestedValueEffective += m.unvestedIntrinsicValue;
    }

    const [yyyy, mm] = d.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = `${monthNames[(Number(mm) || 1) - 1]} ${yyyy}`;

    points.push({
      date: d,
      monthLabel,
      vestedShares: Math.round(vestedShares * 100) / 100,
      unvestedShares: Math.round(unvestedShares * 100) / 100,
      vestedValueFmv: Math.round(vestedValueFmv * 100) / 100,
      vestedValuePreferred: Math.round(vestedValuePreferred * 100) / 100,
      vestedValueEffective: Math.round(vestedValueEffective * 100) / 100,
      unvestedValueEffective: Math.round(unvestedValueEffective * 100) / 100,
      totalPotentialValue: Math.round((vestedValueEffective + unvestedValueEffective) * 100) / 100,
      isPastOrToday: d <= todayStr,
    });
  }

  return points;
}
