// Pure calculation functions — no DB imports, safe for client-side use

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

  for (let month = 1; month <= termMonths && balance > 0; month++) {
    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest;

    if (principal <= 0) principal = balance;
    if (principal > balance) principal = balance;

    balance -= principal;

    const paymentDate = new Date(start);
    paymentDate.setMonth(start.getMonth() + month - 1);

    schedule.push({
      month,
      date: paymentDate.toISOString().split('T')[0],
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
    });

    if (balance <= 0) break;
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

  if (extra.biweekly) {
    extraMonthly += effectivePayment / 2;
  }

  const accelerated: AmortizationRow[] = [];
  const start = new Date(startDate);

  for (let month = 1; month <= termMonths && balance > 0; month++) {
    const interest = balance * monthlyRate;
    let principal = effectivePayment - interest + extraMonthly;

    if (lumpSum > 0 && lumpSumDate) {
      const paymentDate = new Date(start);
      paymentDate.setMonth(start.getMonth() + month - 1);
      const lumpDate = new Date(lumpSumDate);
      if (paymentDate >= lumpDate && month === 1) {
        principal += lumpSum;
      }
    }

    if (principal <= 0) principal = balance;
    if (principal > balance + interest) principal = balance + interest;

    balance -= (principal - interest);

    const paymentDate = new Date(start);
    paymentDate.setMonth(start.getMonth() + month - 1);

    accelerated.push({
      month,
      date: paymentDate.toISOString().split('T')[0],
      payment: Math.round((principal + interest) * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.max(0, Math.round(balance * 100) / 100),
    });

    if (balance <= 0) break;
  }

  const lastStandard = standard[standard.length - 1];
  const lastAccelerated = accelerated[accelerated.length - 1];

  const standardTotalInterest = standard.reduce((s, r) => s + r.interest, 0);
  const acceleratedTotalInterest = accelerated.reduce((s, r) => s + r.interest, 0);

  return {
    standard,
    accelerated,
    standardSummary: {
      payoffDate: lastStandard?.date ?? '',
      totalInterest: Math.round(standardTotalInterest * 100) / 100,
      totalPayments: standard.length,
    },
    acceleratedSummary: {
      payoffDate: lastAccelerated?.date ?? '',
      totalInterest: Math.round(acceleratedTotalInterest * 100) / 100,
      totalPayments: accelerated.length,
      interestSaved: Math.round((standardTotalInterest - acceleratedTotalInterest) * 100) / 100,
      monthsSaved: standard.length - accelerated.length,
    },
  };
}

export function estimateVehicleDepreciation(
  purchasePrice: number,
  purchaseDate: string
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
