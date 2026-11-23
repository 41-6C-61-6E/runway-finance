import {
  type AmortizationRow,
  calculateMonthlyPIPayment,
  getAmortizationPaymentDate,
} from './amortization';

export interface MortgageSnapshotPoint {
  accountId?: string;
  date: string;
  value: number;
  isSynthetic?: boolean;
}

export interface PropertySnapshotPoint {
  date: string;
  value: number;
  isSynthetic?: boolean;
}

export interface LinkedMortgageInput {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate?: number;
  monthlyPayment?: number;
  termMonths?: number;
  extraPrincipal?: number;
  metadata?: Record<string, unknown>;
}

export interface PaydownTimelinePoint {
  date: string;
  Standard: number | null;
  'With Extra Payments': number | null;
  isToday?: boolean;
  [mortgageKey: string]: string | number | boolean | null | undefined;
}

export interface HistoricalMortgageSeries {
  id: string;
  dataKey: string;
  name: string;
  isSelected: boolean;
  isClosed: boolean;
  origDate: string;
}

export interface BuildMortgagePaydownTimelineInput {
  selectedMortgage: LinkedMortgageInput;
  allLinkedMortgages: LinkedMortgageInput[];
  mortgageSnapshots: MortgageSnapshotPoint[];
  propertySnapshots?: PropertySnapshotPoint[];
  propertyPurchaseDate?: string;
  todayDate: string;
  showSynthetic: boolean;
  standardProjection: AmortizationRow[];
  acceleratedProjection: AmortizationRow[];
  showAccelerated: boolean;
}

export interface MortgagePaydownTimelineResult {
  points: PaydownTimelinePoint[];
  historicalSeries: HistoricalMortgageSeries[];
  todayAnchorDate: string | null;
  hasHistoricalData: boolean;
  hasProjectedData: boolean;
  maxBalance: number;
}

const CLOSED_MORTGAGE_STATUSES = new Set(['paid_off', 'refinanced']);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getMortgageMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!metadata) return undefined;
  const val = metadata[key];
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function getMortgageMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  if (!metadata) return undefined;
  const val = metadata[key];
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : undefined;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function getMortgageOrigDate(mortgage: LinkedMortgageInput): string {
  return (
    getMortgageMetadataString(mortgage.metadata, 'purchaseDate') ||
    getMortgageMetadataString(mortgage.metadata, 'startDate') ||
    getMortgageMetadataString(mortgage.metadata, 'originationDate') ||
    '1970-01-01'
  );
}

export function getMortgageEndDate(mortgage: LinkedMortgageInput): string | undefined {
  const status = getMortgageMetadataString(mortgage.metadata, 'mortgageStatus');
  if (status === 'paid_off') {
    return getMortgageMetadataString(mortgage.metadata, 'payoffDate');
  }
  if (status === 'refinanced') {
    return getMortgageMetadataString(mortgage.metadata, 'refinanceDate');
  }
  return undefined;
}

function monthEndDate(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yStr}-${mStr}-${String(maxDay).padStart(2, '0')}`;
}

function enumerateYearMonths(startYM: string, endYM: string): string[] {
  if (!startYM || !endYM || startYM > endYM) return [];
  const [startY, startM] = startYM.split('-').map(Number);
  const [endY, endM] = endYM.split('-').map(Number);
  if (!Number.isFinite(startY) || !Number.isFinite(startM) || !Number.isFinite(endY) || !Number.isFinite(endM)) {
    return [];
  }
  const result: string[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

function shiftDateMonths(dateStr: string, monthOffset: number): string {
  return getAmortizationPaymentDate(dateStr, monthOffset);
}

function synthesizeZeroSnapshotHistory(
  mortgage: LinkedMortgageInput,
  origDate: string,
  todayDate: string
): Array<{ date: string; balance: number }> {
  const status = getMortgageMetadataString(mortgage.metadata, 'mortgageStatus');
  const endEventDate = getMortgageEndDate(mortgage);
  const isRefinanced = status === 'refinanced';
  const endDate = endEventDate && endEventDate < todayDate ? endEventDate : todayDate;
  if (endDate <= origDate) return [];

  const targetEndBal =
    status === 'paid_off'
      ? 0
      : isRefinanced
        ? (getMortgageMetadataNumber(mortgage.metadata, 'payoffBalance') ?? 0)
        : Math.abs(mortgage.balance);

  const amortLimitDate = isRefinanced ? shiftDateMonths(endDate, -1) : endDate;
  const originalBalance = mortgage.originalLoanAmount;
  const annualRate = mortgage.interestRate ?? getMortgageMetadataNumber(mortgage.metadata, 'interestRate') ?? 0;
  const termMonths =
    mortgage.termMonths && mortgage.termMonths > 0
      ? mortgage.termMonths
      : (getMortgageMetadataNumber(mortgage.metadata, 'termMonths') ?? 360);
  const rawMonthlyPayment =
    mortgage.monthlyPayment && mortgage.monthlyPayment > 0
      ? mortgage.monthlyPayment
      : (getMortgageMetadataNumber(mortgage.metadata, 'monthlyPayment') ?? 0);
  const effectivePayment =
    rawMonthlyPayment > 0
      ? rawMonthlyPayment
      : calculateMonthlyPIPayment(originalBalance, annualRate, termMonths);
  const extraPrincipal =
    mortgage.extraPrincipal ?? getMortgageMetadataNumber(mortgage.metadata, 'extraPrincipal') ?? 0;
  const monthlyRate = annualRate / 100 / 12;

  const result: Array<{ date: string; balance: number }> = [];

  if (amortLimitDate < origDate) {
    result.push({ date: origDate, balance: round2(originalBalance) });
    if (isRefinanced) {
      result.push({ date: endDate, balance: 0 });
    }
    return result;
  }

  const tempSnaps: Array<{ date: string; balance: number }> = [];
  let balance = originalBalance;
  let offset = 0;
  const maxIterations = 601;

  while (offset < maxIterations) {
    const stepDate = getAmortizationPaymentDate(origDate, offset);
    if (stepDate > amortLimitDate) break;
    tempSnaps.push({ date: stepDate, balance });

    if (monthlyRate > 0) {
      const interest = balance * monthlyRate;
      const principal = effectivePayment + extraPrincipal - interest;
      balance = balance - principal;
    } else {
      balance = balance - (effectivePayment + extraPrincipal);
    }
    if (balance < 0) balance = 0;
    offset += 1;
  }

  if (tempSnaps.length === 0 || tempSnaps[tempSnaps.length - 1].date !== amortLimitDate) {
    tempSnaps.push({ date: amortLimitDate, balance });
  }

  const count = tempSnaps.length;
  if (count > 0) {
    const amortizedEnd = tempSnaps[count - 1].balance;
    const diff = targetEndBal - amortizedEnd;
    for (let i = 0; i < count; i++) {
      const fraction = count > 1 ? i / (count - 1) : 1;
      const adjusted = Math.max(0, tempSnaps[i].balance + diff * fraction);
      result.push({
        date: tempSnaps[i].date,
        balance: round2(adjusted),
      });
    }
  }

  if (isRefinanced) {
    result.push({ date: endDate, balance: 0 });
  }

  return result;
}

function trimProjectionRows(rows: AmortizationRow[]): AmortizationRow[] {
  if (rows.length === 0) return [];
  const firstZeroIdx = rows.findIndex((r) => r.remainingBalance <= 0);
  if (firstZeroIdx === -1) return rows;
  return rows.slice(0, firstZeroIdx + 1);
}

function evaluateMortgageBalancesAtDate(
  mortgages: LinkedMortgageInput[],
  balancesById: Record<string, number>,
  date: string
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const m of mortgages) {
    const origDate = getMortgageOrigDate(m);
    const endEventDate = getMortgageEndDate(m);
    if (date < origDate) {
      result[`mortgage_${m.id}`] = null;
    } else if (endEventDate && date >= endEventDate) {
      result[`mortgage_${m.id}`] = null;
    } else {
      const bal = balancesById[m.id] ?? 0;
      result[`mortgage_${m.id}`] = bal <= 0 ? null : round2(bal);
    }
  }
  return result;
}

export function buildMortgagePaydownTimeline(
  input: BuildMortgagePaydownTimelineInput
): MortgagePaydownTimelineResult {
  const {
    selectedMortgage,
    allLinkedMortgages,
    mortgageSnapshots,
    propertySnapshots = [],
    propertyPurchaseDate,
    todayDate,
    showSynthetic,
    standardProjection,
    acceleratedProjection,
    showAccelerated,
  } = input;

  // 1. Deduplicate linked mortgages while ensuring selectedMortgage is present
  const mortgageMap = new Map<string, LinkedMortgageInput>();
  for (const m of allLinkedMortgages) {
    if (!mortgageMap.has(m.id)) {
      mortgageMap.set(m.id, m);
    }
  }
  if (!mortgageMap.has(selectedMortgage.id)) {
    mortgageMap.set(selectedMortgage.id, selectedMortgage);
  }
  const mortgages = Array.from(mortgageMap.values());

  // 2. Filter snapshots (matching EquityOverTimeChart + useSyntheticData)
  const usableMortSnaps = mortgageSnapshots
    .filter((s) => (showSynthetic || !s.isSynthetic) && s.date <= todayDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const usablePropSnaps = propertySnapshots
    .filter((s) => (showSynthetic || !s.isSynthetic) && s.date <= todayDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const mortgageSnapshotsByDate: Record<string, Record<string, number>> = {};
  const mortgagesWithStoredSnapshots = new Set<string>();

  for (const snap of usableMortSnaps) {
    const accId = snap.accountId || selectedMortgage.id;
    mortgagesWithStoredSnapshots.add(accId);
    if (!mortgageSnapshotsByDate[snap.date]) {
      mortgageSnapshotsByDate[snap.date] = {};
    }
    mortgageSnapshotsByDate[snap.date][accId] = Math.abs(snap.value);
  }

  // 3. Zero-snapshot fallback (only when showSynthetic === true)
  if (showSynthetic) {
    for (const m of mortgages) {
      if (mortgagesWithStoredSnapshots.has(m.id)) continue;
      const origDate = getMortgageOrigDate(m);
      if (origDate === '1970-01-01' || origDate >= todayDate || !(m.originalLoanAmount > 0)) {
        continue;
      }
      const generated = synthesizeZeroSnapshotHistory(m, origDate, todayDate);
      for (const pt of generated) {
        if (!mortgageSnapshotsByDate[pt.date]) {
          mortgageSnapshotsByDate[pt.date] = {};
        }
        mortgageSnapshotsByDate[pt.date][m.id] = pt.balance;
      }
    }
  }

  // 4. Historical balance evaluation (matching EquityOverTimeChart semantics)
  const rawDates = Array.from(
    new Set([...Object.keys(mortgageSnapshotsByDate), ...usablePropSnaps.map((s) => s.date)])
  ).sort();

  const lastMortgageBalances: Record<string, number> = {};
  for (const m of mortgages) {
    let earliestSnapshotVal: number | undefined;
    for (const d of rawDates) {
      const val = mortgageSnapshotsByDate[d]?.[m.id];
      if (val !== undefined) {
        earliestSnapshotVal = val;
        break;
      }
    }
    if (earliestSnapshotVal !== undefined) {
      lastMortgageBalances[m.id] = earliestSnapshotVal;
    } else {
      lastMortgageBalances[m.id] =
        m.originalLoanAmount > 0 ? m.originalLoanAmount : Math.abs(m.balance);
    }
  }

  const initialCarryBalances = { ...lastMortgageBalances };

  const evaluatedPoints = rawDates.map((date) => {
    if (mortgageSnapshotsByDate[date]) {
      for (const [accId, balVal] of Object.entries(mortgageSnapshotsByDate[date])) {
        lastMortgageBalances[accId] = balVal;
      }
    }
    return {
      date,
      balances: evaluateMortgageBalancesAtDate(mortgages, lastMortgageBalances, date),
    };
  });

  const filteredPoints = evaluatedPoints.filter(
    (pt) => !propertyPurchaseDate || pt.date >= propertyPurchaseDate
  );

  // 5. Uniform monthly grid normalization (YYYY-MM)
  const monthMap = new Map<
    string,
    { date: string; balances: Record<string, number | null> }
  >();
  for (const pt of filteredPoints) {
    const ym = pt.date.slice(0, 7);
    monthMap.set(ym, pt);
  }

  const sortedYMs = Array.from(monthMap.keys()).sort();
  let firstHistYM: string | undefined;
  for (const ym of sortedYMs) {
    const pt = monthMap.get(ym);
    if (!pt) continue;
    const hasNonNull = Object.values(pt.balances).some((v) => v !== null && v > 0);
    if (hasNonNull) {
      firstHistYM = ym;
      break;
    }
  }

  const todayYM = todayDate.slice(0, 7);
  const selectedCurrentBalance = Math.abs(selectedMortgage.balance);
  const selectedOrigDate = getMortgageOrigDate(selectedMortgage);

  const trimmedStandard = trimProjectionRows(standardProjection);
  const trimmedAccelerated = showAccelerated ? trimProjectionRows(acceleratedProjection) : [];

  const futureStdByYM = new Map<string, AmortizationRow>();
  for (const row of trimmedStandard) {
    const ym = row.date.slice(0, 7);
    if (ym > todayYM) {
      futureStdByYM.set(ym, row);
    }
  }

  const futureAccByYM = new Map<string, AmortizationRow>();
  for (const row of trimmedAccelerated) {
    const ym = row.date.slice(0, 7);
    if (ym > todayYM) {
      futureAccByYM.set(ym, row);
    }
  }

  const hasFutureProjectionAfterToday = futureStdByYM.size > 0 || futureAccByYM.size > 0;
  const shouldAnchorTodayProjection =
    selectedCurrentBalance > 0 &&
    selectedOrigDate <= todayDate &&
    hasFutureProjectionAfterToday;

  const points: PaydownTimelinePoint[] = [];
  const nullMortgageBalances: Record<string, null> = {};
  for (const m of mortgages) {
    nullMortgageBalances[`mortgage_${m.id}`] = null;
  }

  if (firstHistYM) {
    const histMonths = enumerateYearMonths(firstHistYM, todayYM);
    const carryBalances: Record<string, number> = { ...initialCarryBalances };

    for (const ym of histMonths) {
      if (ym === todayYM) {
        // If all history is inside today's calendar month with an earlier date, emit it first
        // so the historical line has >= 2 points ending on Today.
        if (firstHistYM === todayYM) {
          const sameMonthPt = monthMap.get(todayYM);
          if (sameMonthPt && sameMonthPt.date < todayDate) {
            points.push({
              date: sameMonthPt.date,
              Standard: null,
              'With Extra Payments': null,
              ...sameMonthPt.balances,
            });
          }
        }

        const liveBalancesById: Record<string, number> = {};
        for (const m of mortgages) {
          liveBalancesById[m.id] = Math.abs(m.balance);
        }
        const todayMortgageBalances = evaluateMortgageBalancesAtDate(
          mortgages,
          liveBalancesById,
          todayDate
        );

        points.push({
          date: todayDate,
          isToday: true,
          Standard: shouldAnchorTodayProjection ? round2(selectedCurrentBalance) : null,
          'With Extra Payments':
            shouldAnchorTodayProjection && trimmedAccelerated.length > 0
              ? round2(selectedCurrentBalance)
              : null,
          ...todayMortgageBalances,
        });
      } else {
        const monthPt = monthMap.get(ym);
        if (monthPt) {
          points.push({
            date: monthPt.date,
            Standard: null,
            'With Extra Payments': null,
            ...monthPt.balances,
          });
          for (const m of mortgages) {
            const val = monthPt.balances[`mortgage_${m.id}`];
            if (val !== null && val !== undefined) {
              carryBalances[m.id] = val;
            }
          }
        } else {
          const evalDate = monthEndDate(ym);
          const gapBalances = evaluateMortgageBalancesAtDate(mortgages, carryBalances, evalDate);
          points.push({
            date: evalDate,
            Standard: null,
            'With Extra Payments': null,
            ...gapBalances,
          });
        }
      }
    }

    // Append future projection rows (> todayYM)
    const futureYMs = Array.from(
      new Set([...futureStdByYM.keys(), ...futureAccByYM.keys()])
    ).sort();

    for (const ym of futureYMs) {
      const stdRow = futureStdByYM.get(ym);
      const accRow = futureAccByYM.get(ym);
      const date = stdRow?.date ?? accRow?.date ?? monthEndDate(ym);
      points.push({
        date,
        Standard: stdRow ? round2(stdRow.remainingBalance) : null,
        'With Extra Payments': accRow ? round2(accRow.remainingBalance) : null,
        ...nullMortgageBalances,
      });
    }
  } else if (selectedCurrentBalance > 0 && selectedOrigDate <= todayDate) {
    // Zero historical snapshots: project forward cleanly starting at Today
    if (hasFutureProjectionAfterToday) {
      points.push({
        date: todayDate,
        isToday: true,
        Standard: round2(selectedCurrentBalance),
        'With Extra Payments':
          trimmedAccelerated.length > 0 ? round2(selectedCurrentBalance) : null,
        ...nullMortgageBalances,
      });
    }

    const futureYMs = Array.from(
      new Set([...futureStdByYM.keys(), ...futureAccByYM.keys()])
    ).sort();

    for (const ym of futureYMs) {
      const stdRow = futureStdByYM.get(ym);
      const accRow = futureAccByYM.get(ym);
      const date = stdRow?.date ?? accRow?.date ?? monthEndDate(ym);
      points.push({
        date,
        Standard: stdRow ? round2(stdRow.remainingBalance) : null,
        'With Extra Payments': accRow ? round2(accRow.remainingBalance) : null,
        ...nullMortgageBalances,
      });
    }
  } else {
    // Fallback when selectedCurrentBalance === 0 with zero historical snapshots,
    // or when the loan has a future origination date (origDate > todayDate).
    const allStdByDate = new Map<string, AmortizationRow>();
    const allAccByDate = new Map<string, AmortizationRow>();
    for (const r of trimmedStandard) allStdByDate.set(r.date, r);
    for (const r of trimmedAccelerated) allAccByDate.set(r.date, r);

    const fallbackDates = Array.from(
      new Set([...allStdByDate.keys(), ...allAccByDate.keys()])
    ).sort();

    for (const date of fallbackDates) {
      const stdRow = allStdByDate.get(date);
      const accRow = allAccByDate.get(date);
      points.push({
        date,
        Standard: stdRow ? round2(stdRow.remainingBalance) : null,
        'With Extra Payments': accRow ? round2(accRow.remainingBalance) : null,
        ...nullMortgageBalances,
      });
    }
  }

  // 7. Build historicalSeries, todayAnchorDate, hasHistoricalData, hasProjectedData, maxBalance
  const historicalSeries: HistoricalMortgageSeries[] = mortgages
    .filter((m) => {
      const key = `mortgage_${m.id}`;
      return points.some((pt) => {
        const val = pt[key];
        return typeof val === 'number' && val > 0;
      });
    })
    .map((m) => {
      const status = getMortgageMetadataString(m.metadata, 'mortgageStatus');
      return {
        id: m.id,
        dataKey: `mortgage_${m.id}`,
        name: m.name,
        isSelected: m.id === selectedMortgage.id,
        isClosed: status !== undefined && CLOSED_MORTGAGE_STATUSES.has(status),
        origDate: getMortgageOrigDate(m),
      };
    })
    .sort((a, b) => a.origDate.localeCompare(b.origDate) || a.id.localeCompare(b.id));

  const hasHistoricalData = historicalSeries.length > 0;
  const hasProjectedData = points.some(
    (pt) =>
      (typeof pt.Standard === 'number' && Number.isFinite(pt.Standard)) ||
      (typeof pt['With Extra Payments'] === 'number' && Number.isFinite(pt['With Extra Payments']))
  );

  const hasTodayPoint = points.some((pt) => pt.isToday === true);
  const hasPointBeforeToday = points.some((pt) => pt.date < todayDate);
  const hasProjectedAfterToday = points.some(
    (pt) =>
      pt.date > todayDate &&
      (typeof pt.Standard === 'number' || typeof pt['With Extra Payments'] === 'number')
  );
  const todayAnchorDate =
    hasTodayPoint && hasPointBeforeToday && hasProjectedAfterToday ? todayDate : null;

  let maxBalance = 1;
  for (const pt of points) {
    if (typeof pt.Standard === 'number' && pt.Standard > maxBalance) {
      maxBalance = pt.Standard;
    }
    if (
      typeof pt['With Extra Payments'] === 'number' &&
      pt['With Extra Payments'] > maxBalance
    ) {
      maxBalance = pt['With Extra Payments'];
    }
    for (const s of historicalSeries) {
      const val = pt[s.dataKey];
      if (typeof val === 'number' && val > maxBalance) {
        maxBalance = val;
      }
    }
  }

  return {
    points,
    historicalSeries,
    todayAnchorDate,
    hasHistoricalData,
    hasProjectedData,
    maxBalance,
  };
}
