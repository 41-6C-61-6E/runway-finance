// Pure amortization calculation functions — safe for client-side use.
// No Node.js-only imports (no pg, fs, path, crypto, etc.).

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmortizationParams {
  originalBalance: number;
  annualRate: number;
  termMonths: number;
  monthlyPayment: number;
  startDate: string;
  originalPropertyPrice?: number;
  monthlyPmi?: number;
}

export interface AmortizationRow {
  month: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  pmi?: number;
}

export interface ExtraPaymentParams {
  monthlyExtra?: number;
  lumpSumAmount?: number;
  lumpSumDate?: string;
  biweekly?: boolean;
}

export interface AmortizationSummary {
  payoffDate: string | null;
  totalInterest: number;
  totalPayments: number;
  totalPmiPaid?: number;
  pmiRemovalDate80?: string | null;
  pmiRemovalDate78?: string | null;
  isNegativeAmortization?: boolean;
}

export interface AcceleratedAmortizationSummary extends AmortizationSummary {
  interestSaved: number;
  monthsSaved: number;
  pmiSaved?: number;
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

/**
 * Computes calendar-safe payment dates clamping to month length (e.g. Jan 31 -> Feb 28 -> Mar 31).
 * Prevents JavaScript Date month overflow / skipping.
 */
export function getAmortizationPaymentDate(startDateStr: string, monthIndexOffset: number): string {
  if (!startDateStr) return new Date().toISOString().split('T')[0];
  const parts = startDateStr.split('-').map(Number);
  const startYear = parts[0] || 2000;
  const startMonth = (parts[1] || 1) - 1; // 0-indexed
  const targetDay = parts[2] || 1;

  const totalMonths = startMonth + monthIndexOffset;
  const targetYear = startYear + Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;

  const maxDays = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(targetDay, maxDays);
  const mm = String(targetMonthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

// ─── Pure Calculation Functions ──────────────────────────────────────────────

export function calculateAmortizationSchedule(params: AmortizationParams): AmortizationRow[] {
  const { originalBalance, annualRate, termMonths, monthlyPayment, startDate, originalPropertyPrice, monthlyPmi } = params;
  if (!termMonths || termMonths <= 0 || !originalBalance || originalBalance <= 0) return [];
  const schedule: AmortizationRow[] = [];
  const monthlyRate = annualRate / 100 / 12;
  let balance = originalBalance;
  let effectivePayment = monthlyPayment;

  if (effectivePayment <= 0) {
    effectivePayment = monthlyRate > 0
      ? originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : originalBalance / termMonths;
  }

  const pmiThreshold78 = (originalPropertyPrice && originalPropertyPrice > 0) ? originalPropertyPrice * 0.78 : null;
  const statutoryMidpointMonth = Math.ceil(termMonths / 2);
  const monthlyPmiAmount = monthlyPmi && monthlyPmi > 0 ? monthlyPmi : 0;

  for (let month = 1; month <= termMonths; month++) {
    const paymentDateStr = getAmortizationPaymentDate(startDate, month - 1);

    if (balance <= 0) {
      schedule.push({
        month,
        date: paymentDateStr,
        payment: 0,
        principal: 0,
        interest: 0,
        remainingBalance: 0,
        pmi: 0,
      });
      continue;
    }

    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest;

    // Terminal month or paydown adjustment: zero out tiny residual cent balance
    if (month === termMonths && balance > 0 && principal > 0 && Math.abs(balance - principal) < 25.0) {
      principal = balance;
    } else if (principal > balance) {
      principal = balance;
    }

    balance -= principal;

    // PMI calculation under Homeowners Protection Act of 1998
    let pmiThisMonth = 0;
    if (monthlyPmiAmount > 0) {
      const isCancelledByLtv = pmiThreshold78 !== null && balance <= pmiThreshold78;
      const isCancelledByMidpoint = month >= statutoryMidpointMonth;
      if (!isCancelledByLtv && !isCancelledByMidpoint && balance > 0) {
        pmiThisMonth = monthlyPmiAmount;
      }
    }

    schedule.push({
      month,
      date: paymentDateStr,
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
      pmi: Math.round(pmiThisMonth * 100) / 100,
    });
  }

  return schedule;
}

export function calculateAmortizationWithExtraPayments(
  params: AmortizationParams,
  extra: ExtraPaymentParams
): {
  standard: AmortizationRow[];
  accelerated: AmortizationRow[];
  standardSummary: AmortizationSummary;
  acceleratedSummary: AcceleratedAmortizationSummary;
} {
  const standard = calculateAmortizationSchedule(params);
  const { originalBalance, annualRate, termMonths, monthlyPayment, startDate, originalPropertyPrice, monthlyPmi } = params;
  if (!termMonths || termMonths <= 0 || !originalBalance || originalBalance <= 0) {
    const defaultSummary: AmortizationSummary = { payoffDate: startDate || '', totalInterest: 0, totalPayments: 0, totalPmiPaid: 0 };
    return { standard: [], accelerated: [], standardSummary: defaultSummary, acceleratedSummary: { ...defaultSummary, interestSaved: 0, monthsSaved: 0, pmiSaved: 0 } };
  }
  const monthlyRate = annualRate / 100 / 12;

  const effectivePayment = monthlyPayment > 0
    ? monthlyPayment
    : monthlyRate > 0
      ? originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : originalBalance / termMonths;

  let balance = originalBalance;
  let extraMonthly = extra.monthlyExtra ?? 0;
  const lumpSum = extra.lumpSumAmount ?? 0;
  const lumpSumDate = extra.lumpSumDate || startDate; // Default to startDate if lumpSum entered without date
  let lumpSumApplied = false;

  if (extra.biweekly) {
    extraMonthly += effectivePayment / 12;
  }

  const pmiThreshold80 = (originalPropertyPrice && originalPropertyPrice > 0) ? originalPropertyPrice * 0.80 : null;
  const pmiThreshold78 = (originalPropertyPrice && originalPropertyPrice > 0) ? originalPropertyPrice * 0.78 : null;
  const statutoryMidpointMonth = Math.ceil(termMonths / 2);
  const monthlyPmiAmount = monthlyPmi && monthlyPmi > 0 ? monthlyPmi : 0;

  const accelerated: AmortizationRow[] = [];

  for (let month = 1; month <= termMonths; month++) {
    const paymentDateStr = getAmortizationPaymentDate(startDate, month - 1);

    if (balance <= 0) {
      accelerated.push({
        month,
        date: paymentDateStr,
        payment: 0,
        principal: 0,
        interest: 0,
        remainingBalance: 0,
        pmi: 0,
      });
      continue;
    }

    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest + extraMonthly;

    if (lumpSum > 0 && !lumpSumApplied) {
      if (paymentDateStr >= lumpSumDate) {
        principal += lumpSum;
        lumpSumApplied = true;
      }
    }

    // Terminal month or paydown adjustment: zero out tiny residual cent balance
    if (month === termMonths && balance > 0 && principal > 0 && Math.abs(balance - principal) < 25.0) {
      principal = balance;
    } else if (principal > balance) {
      principal = balance;
    }

    balance -= principal;

    // PMI calculation under Homeowners Protection Act of 1998
    let pmiThisMonth = 0;
    if (monthlyPmiAmount > 0) {
      const isCancelledByLtv = pmiThreshold78 !== null && balance <= pmiThreshold78;
      const isCancelledByMidpoint = month >= statutoryMidpointMonth;
      if (!isCancelledByLtv && !isCancelledByMidpoint && balance > 0) {
        pmiThisMonth = monthlyPmiAmount;
      }
    }

    accelerated.push({
      month,
      date: paymentDateStr,
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
      pmi: Math.round(pmiThisMonth * 100) / 100,
    });
  }

  // Summary and Payoff Resolution
  const standardZeroRow = standard.find((r) => r.remainingBalance <= 0);
  const acceleratedZeroRow = accelerated.find((r) => r.remainingBalance <= 0);

  const standardLastRow = standard[standard.length - 1];
  const isStandardNegative = !standardZeroRow && standardLastRow && standardLastRow.remainingBalance > originalBalance;
  const isAcceleratedNegative = !acceleratedZeroRow && accelerated[accelerated.length - 1]?.remainingBalance > originalBalance;

  const standardTotalPayments = standardZeroRow ? standardZeroRow.month : standard.length;
  const acceleratedTotalPayments = acceleratedZeroRow ? acceleratedZeroRow.month : accelerated.length;

  const standardTotalInterest = standard.slice(0, standardTotalPayments).reduce((s, r) => s + r.interest, 0);
  const acceleratedTotalInterest = accelerated.slice(0, acceleratedTotalPayments).reduce((s, r) => s + r.interest, 0);

  const standardTotalPmi = standard.slice(0, standardTotalPayments).reduce((s, r) => s + (r.pmi ?? 0), 0);
  const acceleratedTotalPmi = accelerated.slice(0, acceleratedTotalPayments).reduce((s, r) => s + (r.pmi ?? 0), 0);

  // PMI Removal Dates (80% and 78%)
  const std80Row = pmiThreshold80 ? standard.find((r) => r.remainingBalance <= pmiThreshold80) : null;
  const std78Row = pmiThreshold78 ? standard.find((r) => r.remainingBalance <= pmiThreshold78) : null;
  const acc80Row = pmiThreshold80 ? accelerated.find((r) => r.remainingBalance <= pmiThreshold80) : null;
  const acc78Row = pmiThreshold78 ? accelerated.find((r) => r.remainingBalance <= pmiThreshold78) : null;

  return {
    standard,
    accelerated,
    standardSummary: {
      payoffDate: standardZeroRow ? standardZeroRow.date : null,
      totalInterest: Math.round(standardTotalInterest * 100) / 100,
      totalPayments: standardTotalPayments,
      totalPmiPaid: Math.round(standardTotalPmi * 100) / 100,
      pmiRemovalDate80: std80Row?.date ?? null,
      pmiRemovalDate78: std78Row?.date ?? null,
      isNegativeAmortization: isStandardNegative,
    },
    acceleratedSummary: {
      payoffDate: acceleratedZeroRow ? acceleratedZeroRow.date : null,
      totalInterest: Math.round(acceleratedTotalInterest * 100) / 100,
      totalPayments: acceleratedTotalPayments,
      totalPmiPaid: Math.round(acceleratedTotalPmi * 100) / 100,
      pmiRemovalDate80: acc80Row?.date ?? null,
      pmiRemovalDate78: acc78Row?.date ?? null,
      interestSaved: Math.round(Math.max(0, standardTotalInterest - acceleratedTotalInterest) * 100) / 100,
      pmiSaved: Math.round(Math.max(0, standardTotalPmi - acceleratedTotalPmi) * 100) / 100,
      monthsSaved: (standardZeroRow && acceleratedZeroRow) ? Math.max(0, standardTotalPayments - acceleratedTotalPayments) : 0,
      isNegativeAmortization: isAcceleratedNegative,
    },
  };
}
