/**
 * Pure helper functions for paystub operations, extracted to avoid importing
 * Next.js route or database dependencies in unit tests.
 */

/**
 * Parses MM/DD/YYYY dates to YYYY-MM-DD.
 */
export function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr; // Return as-is if not parseable
  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * ── P-4: stable import dedupe key. ─────────────────────────────────────────
 * Fast non-cryptographic FNV-1a 64-bit fold into a 16-hex digest. Used ONLY
 * as the fallback dedupe key for paystub imports from employers that don't
 * supply an advice number (see import route): two runs of the same JSON
 * blob for the same user/employer/date/totals collide, a different paycheck
 * doesn't. Deliberately not crypto — collision probability at these inputs
 * is negligible, and it avoids pulling node:crypto into edge runtime.
 */
export function fnv1aDigest64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) % (1n << 64n);
  }

  // Fold the 64-bit hash toward 2^64 to widen low-bit entropy (FNV is
  // bottom-bit-weak; we only use 16 hex chars = 64 bits of the final value).
  let a = h >> 0n;
  for (let i = 1; i < 64; i += 4) {
    a = (a ^ (h << BigInt(i))) % (1n << 64n);
    a = (a * prime) % (1n << 64n);
  }

  return a.toString(16).padStart(16, '0').slice(-16);
}

/**
 * ── P-2: import tie-out. ────────────────────────────────────────────────
 * A paystub "ties out" when:
 *   1. |gross − taxes − deductions − net| < $0.02 (internally consistent), AND
 *   2. for every YTD field the employer supplied, the delta since the most
 *      recent prior imported stub is within $0.05 of this stub's current
 *      amount (continuity — catches edited/missed stubs and re-imports of
 *      stale JSON).
 * The prior stub is the most recent *imported* stub before this check date
 * (same user, any employer — YTDs are per-employee, so mixing employers
 * would corrupt continuity; the import route is per-employer per batch,
 * but the caller may want cross-checks; we match employer on the caller
 * side if needed).
 */
export interface PaystubTieOutInput {
  checkDate: string;
  gross: string | number;
  taxes: string | number;
  deductions: string | number;
  net: string | number;
  grossYtd?: string | number | null;
  taxesYtd?: string | number | null;
  deductionsYtd?: string | number | null;
}

export function computeTiesOut(
  stub: PaystubTieOutInput,
  priorStubs: Array<PaystubTieOutInput | null>
): boolean {
  const gross = Number(stub.gross) || 0;
  const taxes = Number(stub.taxes) || 0;
  const deductions = Number(stub.deductions) || 0;
  const net = Number(stub.net) || 0;

  // Rule 1: current-period internal consistency (< $0.02 slack covers the
  // common employer rounding-to-penny behavior).
  const derived = gross - taxes - deductions;
  if (Math.abs(derived - net) >= 0.02) return false;

  // Rule 2: YTD continuity vs the most recent imported stub.
  const prior = priorStubs.find(s => s != null);
  if (prior) {
    const check = (cur?: string | number | null, prev?: string | number | null, curField?: string | number) => {
      if (cur == null) return true;
      const curVal = Number(cur) || 0;
      const prevVal = Number(prev) || 0;
      const delta = curVal - prevVal;
      const expected = Number(curField ?? 0) || 0;
      return Math.abs(delta - expected) < 0.05;
    };
    if (
      !check(stub.grossYtd, prior.grossYtd, gross) ||
      !check(stub.taxesYtd, prior.taxesYtd, taxes) ||
      !check(stub.deductionsYtd, prior.deductionsYtd, deductions)
    ) {
      return false;
    }
  }

  return true;
}
/**
 * Add a frequency interval to a date string (YYYY-MM-DD).
 */
export function addFrequencyInterval(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'semimonthly':
      date.setUTCDate(date.getUTCDate() + 15);
      break;
    case 'monthly': {
      const originalDay = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + 1);
      if (date.getUTCDate() !== originalDay) {
        date.setUTCDate(0);
      }
      break;
    }
    default:
      date.setUTCDate(date.getUTCDate() + 14); // Default to biweekly
  }

  return date.toISOString().split('T')[0];
}

export function getFrequencyDays(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'semimonthly':
      return 15;
    case 'monthly':
      return 30;
    default:
      return 14;
  }
}

/**
 * ── S-1: semimonthly cadence. ─────────────────────────────────────────────
 * `addFrequencyInterval('semimonthly')` is a plain +15-day step (kept for
 * pay-period shifting). Real semi-monthly pay runs on fixed calendar
 * anchors: either {1, 15} or {15, end-of-month}. We pick the pair whose
 * earlier day is closest to the anchor's day-of-month and advance to the
 * next occurrence of that pair, so a schedule never drifts off the
 * employer's actual pay dates.
 */
export function nextSemimonthlyDateFrom(anchor: string): string {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const d = Number(anchor.slice(8, 10));
  const pad = (n: number) => String(n).padStart(2, '0');
  const eom = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm, 0)).getUTCDate();

  // {15, EOM} fits when the anchor lands in the second half of the month,
  // otherwise {1, 15}.
  const earlyPair = d <= 15;

  // First anchor day strictly after `anchor`; if none remains in the current
  // month, roll to the next month's first anchor.
  const advance = (yy0: number, mm0: number): string => {
    const days = earlyPair ? [1, 15] : [15, eom(yy0, mm0)];
    for (const day of days) {
      const ds = `${yy0}-${pad(mm0)}-${pad(day)}`;
      if (ds > anchor) return ds;
    }
    if (mm0 === 12) return `${yy0 + 1}-01-${pad(earlyPair ? 1 : 15)}`;
    return `${yy0}-${pad(mm0 + 1)}-${pad(earlyPair ? 1 : 15)}`;
  };

  return advance(y, m);
}

/**
 * Next expected check date for a pay frequency.
 *
 * Semimonthly uses calendar anchor stepping (S-1) so dates stay on the real
 * 1st/15th (or 15th/EOM) pay days; every other frequency keeps the fixed
 * interval step from `addFrequencyInterval`.
 */
export function nextCadenceDate(referenceDate: string, frequency: string): string {
  if (frequency === 'semimonthly') return nextSemimonthlyDateFrom(referenceDate);
  return addFrequencyInterval(referenceDate, frequency);
}

/**
 * Normalize raw paycheck input formats.
 */
export function normalizeBackendInput(input: any): any[] {
  if (!input) return [];

  // Case 1: input is an array
  if (Array.isArray(input)) {
    // If the first element is the paycheck container, normalize it
    if (input.length === 1 && input[0]?.paychecks && Array.isArray(input[0].paychecks)) {
      return normalizeSinglePaycheckContainer(input[0]);
    }
    // Otherwise, assume it's already an array of paystubs
    return input;
  }

  // Case 2: input is the paycheck container object directly
  if (input.paychecks && Array.isArray(input.paychecks)) {
    return normalizeSinglePaycheckContainer(input);
  }

  return [];
}

function normalizeSinglePaycheckContainer(json: any): any[] {
  const employeeName = json.employee?.name || null;
  return json.paychecks.map((paycheck: any) => {
    let payPeriodStart = paycheck.checkDate || '';
    let payPeriodEnd = paycheck.checkDate || '';
    if (paycheck.earnings && paycheck.earnings.length > 0) {
      const firstEarning = paycheck.earnings[0];
      payPeriodStart = firstEarning.beginDate || firstEarning.payPeriodStartDate || paycheck.payPeriodStartDate || paycheck.checkDate || '';
      payPeriodEnd = firstEarning.endDate || firstEarning.payPeriodEndDate || paycheck.payPeriodEndDate || paycheck.checkDate || '';
    }

    const grossCurrent = paycheck.totals?.earningsAmount ?? 0;
    const taxesCurrent = paycheck.totals?.taxesAmount ?? 0;
    const deductionsCurrent = paycheck.totals?.deductionsAmount ?? 0;
    const netCurrent = Number(grossCurrent) - Number(taxesCurrent) - Number(deductionsCurrent);

    return {
      employeeName,
      payPeriodStart,
      payPeriodEnd,
      checkDate: paycheck.checkDate,
      adviceNumber: paycheck.checkNumber,
      grossCurrent: String(grossCurrent),
      taxesCurrent: String(taxesCurrent),
      deductionsCurrent: String(deductionsCurrent),
      netCurrent: String(netCurrent),
      hoursAndEarnings: (paycheck.earnings || []).map((e: any) => ({
        description: e.description,
        hours: e.hours,
        amount: e.amount,
      })),
      taxes: (paycheck.taxes || []).map((t: any) => ({
        description: t.description,
        amount: t.amount,
        ytdAmount: t.ytdAmount,
      })),
      beforeTaxDeductions: (paycheck.deductions || []).map((d: any) => ({
        description: d.description,
        amount: d.amount,
        ytdAmount: d.ytdAmount,
      })),
      // P-5: pass through the employer's explicit after-tax deduction list
      // (Roth 401k, 457, post-tax salary continuation, garnishments, ...).
      // Legacy GM payloads only send `deductions` (pre-tax); when the field
      // is absent we keep [] rather than guessing from description text.
      afterTaxDeductions: (paycheck.afterTaxDeductions || []).map((d: any) => ({
        description: d.description,
        amount: d.amount,
        ytdAmount: d.ytdAmount,
      })),
    };
  });
}

/**
 * Returns true when a line item is an OASDI / Social Security withholding line.
 * OASDI shows up either as a tax or a pre-tax deduction (employer-dependent),
 * labelled "Social Security", "OASDI", or "SS".
 */
export function isOasdiLine(section: string, description: string): boolean {
  const s = (section || '').toLowerCase();
  if (s !== 'taxes' && s !== 'before_tax_deductions') return false;
  const d = (description || '').trim();
  if (/social[\s\-_]*security/i.test(d)) return true;
  if (/\boasdi\b/i.test(d)) return true;
  if (/^ss$/i.test(d)) return true;
  return false;
}

/**
 * OASDI wage-base state accumulated so far in the tax year for a given paystub.
 */
export interface OasdiYtdState {
  /** Total wages already paid this tax year, before the target paystub. */
  wagesBefore: number;
  /** Total OASDI already withheld this tax year, before the target paystub. */
  oasdiBefore: number;
  /** Calendar year of the tax year the cap applies to. */
  taxYear: number;
}

/**
 * Compute the OASDI-relevant YTD state (wages + withheld OASDI) for all of a
 * user's paystubs dated strictly *before* `checkDate` in the same calendar year.
 *
 * Expects `paystubsList` sorted ascending by checkDate and `lineItemsMap` keyed
 * by paystub id (both already in memory from callers).
 */
export function computeOasdiYtdBefore(
  paystubsList: Array<{ checkDate: string; grossCurrent?: string | number; id: string }>,
  lineItemsMap: Map<string, Array<{ section: string; description: string; amount: string | number }>>,
  checkDate: string,
): OasdiYtdState {
  const taxYear = Number(checkDate.slice(0, 4));
  const year = checkDate.slice(0, 4);
  let wagesBefore = 0;
  let oasdiBefore = 0;

  for (const p of paystubsList) {
    if (!p.checkDate || p.checkDate >= checkDate) continue;
    if (p.checkDate.slice(0, 4) !== year) continue;
    wagesBefore += Number(p.grossCurrent) || 0;

    const items = lineItemsMap.get(p.id) || [];
    for (const it of items) {
      if (isOasdiLine(it.section, it.description)) {
        oasdiBefore += Number(it.amount) || 0;
      }
    }
  }

  return { wagesBefore, oasdiBefore, taxYear };
}

/**
 * Apply the statutory OASDI wage-base cap to a paycheck's expected OASDI withholding.
 */
export function capOasdiAmount(params: {
  expectedOasdi: number;
  gross: number;
  ytd: OasdiYtdState;
  wageBaseCap: number;
  oasdiRate: number;
}): number {
  const { expectedOasdi, gross, ytd, wageBaseCap, oasdiRate } = params;
  const remainingWageBase = Math.max(0, wageBaseCap - ytd.wagesBefore);
  if (remainingWageBase <= 0) {
    return 0;
  }
  const taxableGross = Math.min(gross, remainingWageBase);
  return Math.min(expectedOasdi, taxableGross * oasdiRate);
}
