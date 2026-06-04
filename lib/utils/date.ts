/**
 * Safely format a date string or Date object to a timezone-safe UTC string.
 * Supports YYYY-MM-DD, YYYY-MM, or Date objects/ISO strings.
 */
export function formatSafeUTCDate(
  dateInput: string | Date,
  options: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }
): string {
  if (!dateInput) return '';
  const dateStr = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];
  const parts = dateStr.split('-');
  let year = 1970;
  let month = 1;
  let day = 1;
  
  if (parts.length >= 1) year = parseInt(parts[0], 10);
  if (parts.length >= 2) month = parseInt(parts[1], 10);
  if (parts.length >= 3) day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    try {
      return new Date(dateInput).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
    } catch {
      return String(dateInput);
    }
  }
  
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return utcDate.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/**
 * Generates an array of date strings from the dataset to use as custom XAxis ticks.
 * Ensures ticks are cleanly spaced, non-repeating, and visually balanced.
 */
export function getChartXTicks<T extends { [key: string]: any }>(
  data: T[],
  timeframe?: string,
  dateKey: string = 'date'
): string[] {
  if (!data || data.length === 0) return [];
  if (data.length <= 5) return data.map(d => String(d[dateKey]));

  const dates = data.map(d => String(d[dateKey]));

  const getYearMonth = (dateStr: string) => dateStr.slice(0, 7); // 'YYYY-MM'
  const getYear = (dateStr: string) => dateStr.slice(0, 4); // 'YYYY'

  // Fallback for custom or missing timeframe
  const isLargeRange = dates.length > 365 || 
    (dates.length > 0 && 
     parseInt(getYear(dates[dates.length - 1])) - parseInt(getYear(dates[0])) >= 2);

  const effectiveTimeframe = timeframe || (isLargeRange ? '5y' : '1y');

  if (effectiveTimeframe === '1m') {
    // 5 evenly spaced ticks
    const ticks: string[] = [];
    const step = (data.length - 1) / 4;
    for (let i = 0; i < 5; i++) {
      const idx = Math.round(step * i);
      if (idx < data.length && !ticks.includes(dates[idx])) {
        ticks.push(dates[idx]);
      }
    }
    return ticks;
  }

  if (effectiveTimeframe === '3m' || effectiveTimeframe === '6m' || effectiveTimeframe === '1y' || effectiveTimeframe === 'ytd') {
    // Find transition points where the month changes
    const transitions: string[] = [];
    transitions.push(dates[0]);

    for (let i = 1; i < dates.length; i++) {
      const prevMonth = getYearMonth(dates[i - 1]);
      const currMonth = getYearMonth(dates[i]);
      if (prevMonth !== currMonth) {
        transitions.push(dates[i]);
      }
    }

    if (transitions.length > 8) {
      const filtered: string[] = [transitions[0]];
      const step = Math.ceil(transitions.length / 6); // Aim for ~5-6 ticks
      for (let i = step; i < transitions.length - 1; i += step) {
        filtered.push(transitions[i]);
      }
      if (transitions.length > 1) {
        filtered.push(transitions[transitions.length - 1]);
      }
      return filtered;
    }

    return transitions;
  }

  // For 5y or all: transition points where the year changes
  const transitions: string[] = [];
  transitions.push(dates[0]);

  for (let i = 1; i < dates.length; i++) {
    const prevYear = getYear(dates[i - 1]);
    const currYear = getYear(dates[i]);
    if (prevYear !== currYear) {
      transitions.push(dates[i]);
    }
  }

  if (transitions.length > 8) {
    const filtered: string[] = [transitions[0]];
    const step = Math.ceil(transitions.length / 6);
    for (let i = step; i < transitions.length - 1; i += step) {
      filtered.push(transitions[i]);
    }
    if (transitions.length > 1) {
      filtered.push(transitions[transitions.length - 1]);
    }
    return filtered;
  }

  return transitions;
}