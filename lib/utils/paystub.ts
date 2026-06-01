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

/**
 * Compute the number of days in a frequency interval.
 */
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
      payPeriodStart = firstEarning.beginDate || firstEarning.payPeriodEndDate || paycheck.checkDate || '';
      payPeriodEnd = firstEarning.endDate || firstEarning.payPeriodEndDate || paycheck.checkDate || '';
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
      })),
      beforeTaxDeductions: (paycheck.deductions || []).map((d: any) => ({
        description: d.description,
        amount: d.amount,
      })),
      afterTaxDeductions: [],
    };
  });
}
