// Pure amortization calculation functions — safe for client-side use.
// No Node.js-only imports (no pg, fs, path, crypto, etc.).

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmortizationParams {
  originalBalance: number;
  annualRate: number;
  termMonths: number;
  monthlyPayment: number;
  startDate: string;
}

export interface AmortizationRow {
  month: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

export interface ExtraPaymentParams {
  monthlyExtra?: number;
  lumpSumAmount?: number;
  lumpSumDate?: string;
  biweekly?: boolean;
}

// ─── Pure Calculation Functions ──────────────────────────────────────

export function calculateAmortizationSchedule(params: AmortizationParams): AmortizationRow[] {
  const { originalBalance, annualRate, termMonths, monthlyPayment, startDate } = params;
  const schedule: AmortizationRow[] = [];
  const monthlyRate = annualRate / 100 / 12;
  let balance = originalBalance;
  let effectivePayment = monthlyPayment;

  if (effectivePayment <= 0) {
    effectivePayment = monthlyRate > 0
      ? originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : originalBalance / termMonths;
  }

  const start = new Date(startDate);

  for (let month = 1; month <= termMonths; month++) {
    const paymentDate = new Date(start.getTime());
    paymentDate.setUTCMonth(start.getUTCMonth() + month - 1);

    if (balance <= 0) {
      schedule.push({
        month,
        date: paymentDate.toISOString().split('T')[0],
        payment: 0,
        principal: 0,
        interest: 0,
        remainingBalance: 0,
      });
      continue;
    }

    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest;

    if (principal <= 0) {
      principal = balance;
    }

    if (principal > balance) {
      principal = balance;
    }

    balance -= principal;

    schedule.push({
      month,
      date: paymentDate.toISOString().split('T')[0],
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
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
  standardSummary: { payoffDate: string; totalInterest: number; totalPayments: number };
  acceleratedSummary: { payoffDate: string; totalInterest: number; totalPayments: number; interestSaved: number; monthsSaved: number };
} {
  const standard = calculateAmortizationSchedule(params);
  const { originalBalance, annualRate, termMonths, monthlyPayment, startDate } = params;
  const monthlyRate = annualRate / 100 / 12;

  const effectivePayment = monthlyPayment > 0
    ? monthlyPayment
    : monthlyRate > 0
      ? originalBalance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : originalBalance / termMonths;

  let balance = originalBalance;
  let extraMonthly = extra.monthlyExtra ?? 0;
  const lumpSum = extra.lumpSumAmount ?? 0;
  const lumpSumDate = extra.lumpSumDate;
  let lumpSumApplied = false;

  if (extra.biweekly) {
    extraMonthly += effectivePayment / 12;
  }

  const accelerated: AmortizationRow[] = [];
  const start = new Date(startDate);

  for (let month = 1; month <= termMonths; month++) {
    const paymentDate = new Date(start.getTime());
    paymentDate.setUTCMonth(start.getUTCMonth() + month - 1);

    if (balance <= 0) {
      accelerated.push({
        month,
        date: paymentDate.toISOString().split('T')[0],
        payment: 0,
        principal: 0,
        interest: 0,
        remainingBalance: 0,
      });
      continue;
    }

    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest + extraMonthly;

    if (lumpSum > 0 && lumpSumDate && !lumpSumApplied) {
      const lumpDate = new Date(lumpSumDate);
      if (paymentDate >= lumpDate) {
        principal += lumpSum;
        lumpSumApplied = true;
      }
    }

    if (principal <= 0) principal = balance;
    if (principal > balance) principal = balance;

    balance -= principal;

    accelerated.push({
      month,
      date: paymentDate.toISOString().split('T')[0],
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
    });
  }

  const defaultDate = new Date().toISOString().split('T')[0];

  const lastActiveStandard = standard.filter((r) => r.payment > 0).pop();
  const lastActiveAccelerated = accelerated.filter((r) => r.payment > 0).pop();

  const standardTotalPayments = standard.filter((r) => r.payment > 0).length;
  const acceleratedTotalPayments = accelerated.filter((r) => r.payment > 0).length;

  const standardTotalInterest = standard.reduce((s, r) => s + r.interest, 0);
  const acceleratedTotalInterest = accelerated.reduce((s, r) => s + r.interest, 0);

  return {
    standard,
    accelerated,
    standardSummary: {
      payoffDate: lastActiveStandard?.date ?? defaultDate,
      totalInterest: Math.round(standardTotalInterest * 100) / 100,
      totalPayments: standardTotalPayments,
    },
    acceleratedSummary: {
      payoffDate: lastActiveAccelerated?.date ?? defaultDate,
      totalInterest: Math.round(acceleratedTotalInterest * 100) / 100,
      totalPayments: acceleratedTotalPayments,
      interestSaved: Math.round((standardTotalInterest - acceleratedTotalInterest) * 100) / 100,
      monthsSaved: standardTotalPayments - acceleratedTotalPayments,
    },
  };
}
