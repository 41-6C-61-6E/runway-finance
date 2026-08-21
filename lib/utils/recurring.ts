export type FrequencyType = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

/**
 * Normalizes merchant / payee name by stripping processor prefixes, terminal IDs, store numbers, and date tokens.
 */
export function normalizeMerchantName(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown';

  let s = raw.trim();

  // Strip common processor prefixes
  const prefixes = [
    /^(SQ\s*\*|TST\*\s*|SP\s*\*|PAYPAL\s*\*|UBER\s*\*|LYFT\s*\*|STRIPE\s*\*|VENMO\s*\*|RECURRING\s+PAYMENT\s+TO\s+|RECURRING\s+PAYMENT\s+|CHECKCARD\s+|PURCHASE\s+AUTHORIZED\s+ON\s+)/i,
    /^(DEBIT\s+CARD\s+PURCHASE\s+|POS\s+PURCHASE\s+|PREAUTHORIZED\s+ACH\s+)/i,
  ];

  for (const prefix of prefixes) {
    s = s.replace(prefix, '').trim();
  }

  // Normalize common merchant brands
  s = s.replace(/^AMZN\s*Mktp\s*(US\*)?/i, 'Amazon');
  s = s.replace(/^AMZN\s*MKTP/i, 'Amazon');
  s = s.replace(/^AMAZON\.COM\*/i, 'Amazon');
  s = s.replace(/^GOOGLE\s*\*(\s*SERVICES)?/i, 'Google');

  // Strip card masks and trailing card numbers (e.g. *1234, XXXXX1234)
  s = s.replace(/\s*\*+\d{4}\b/g, '').trim();
  s = s.replace(/\b[\*xX]{2,}\d{2,4}\b/g, '').trim();

  // Strip phone numbers (e.g. 800-123-4567, 8881234567)
  s = s.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '').trim();

  // Strip store numbers / terminal IDs (e.g., #1234, Store 5521, Term 09, Loc 482)
  s = s.replace(/\b(store|term|terminal|loc|location|unit|station|branch)\s*#?\s*\d+\b/gi, '').trim();
  s = s.replace(/#\d+\b/g, '').trim();

  // Strip dates (e.g. 08/17, 2026-08-17, Aug 17)
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').trim();
  s = s.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(\/\d{2,4})?\b/g, '').trim();

  // Strip trailing reference IDs / alphanumeric sequences that contain numbers
  s = s.replace(/\s+[A-Z0-9]*\d+[A-Z0-9]*\b/g, '').trim();

  // Strip trailing state codes (e.g. "Seattle WA", "San Francisco CA US")
  s = s.replace(/\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(\s+US)?$/i, '').trim();

  // Collapse multiple spaces and special characters
  s = s.replace(/[\s\-_*]+/g, ' ').trim();

  // If we ended up with an empty string, fallback to original cleaned
  if (s.length < 2) {
    s = raw.replace(/[\s\-_*]+/g, ' ').trim();
  }

  // Capitalize words nicely in Title Case (e.g. Netflix.com, Apple.com/bill)
  return s
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * Case-insensitive pattern match. Pattern supports `|`-separated alternatives.
 */
export function patternMatches(description: string, pattern: string): boolean {
  if (!description || !pattern) return false;
  const desc = description.toLowerCase().trim();
  const alternatives = pattern
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (alternatives.length === 0) return false;
  return alternatives.some((p) => desc.includes(p) || normalizeMerchantName(desc).toLowerCase() === p);
}

/**
 * Adds frequency period to a date, preserving original anchor day-of-month.
 */
export function addFrequencyPeriod(dateStr: string, frequency: FrequencyType, anchorDay?: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return dateStr;

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const effectiveDay = anchorDay ?? day;

  if (frequency === 'semi_monthly') {
    const target = new Date(Date.UTC(year, month, 1));
    if (day < 15) {
      target.setUTCDate(15);
    } else {
      const nextMonth = new Date(Date.UTC(year, month + 1, 1));
      const daysInNext = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
      target.setUTCFullYear(nextMonth.getUTCFullYear());
      target.setUTCMonth(nextMonth.getUTCMonth());
      target.setUTCDate(Math.min(effectiveDay <= 15 ? 1 : effectiveDay, daysInNext));
    }
    return target.toISOString().split('T')[0];
  }

  const monthDelta =
    frequency === 'monthly' ? 1
    : frequency === 'quarterly' ? 3
    : frequency === 'semi_annual' ? 6
    : frequency === 'annual' ? 12
    : 0;
  const dayDelta = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 0;

  const target = new Date(Date.UTC(year, month + monthDelta, 1));
  const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(effectiveDay, daysInTargetMonth) + dayDelta);

  return target.toISOString().split('T')[0];
}

/**
 * Calculates next expected date from the last date, stepping forward to present/future.
 */
export function calculateNextExpectedDate(lastDateStr: string, frequency: FrequencyType, referenceDateStr?: string, anchorDay?: number): string {
  const origDate = new Date(lastDateStr + 'T00:00:00Z');
  const effectiveAnchor = anchorDay ?? (isNaN(origDate.getTime()) ? undefined : origDate.getUTCDate());
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];
  let next = addFrequencyPeriod(lastDateStr, frequency, effectiveAnchor);

  if (next >= todayStr) return next;

  let current = next;
  let iterations = 0;
  while (current < todayStr && iterations < 50) {
    current = addFrequencyPeriod(current, frequency, effectiveAnchor);
    iterations++;
  }

  return current;
}
