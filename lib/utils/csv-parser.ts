export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  allRows: Record<string, string>[];
  totalRows: number;
  delimiter: string;
  errors: string[];
};

export function parseCsv(
  text: string,
  options?: { delimiter?: string; maxPreviewRows?: number }
): CsvParseResult {
  const errors: string[] = [];
  // Strip a UTF-8 BOM so it doesn't corrupt the first header (e.g. "\uFEFFDate").
  if (text && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  if (!text || !text.trim()) {
    return { headers: [], rows: [], allRows: [], totalRows: 0, delimiter: ',', errors: ['CSV is empty'] };
  }

  // Detect delimiter using the first line
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.substring(0, firstLineEnd);
  const delimiter = options?.delimiter ?? detectDelimiter(firstLine);

  // Parse lines character by character, respecting quotes
  const allParsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let fieldStarted = false; // whether the current field has any content yet

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next double quote
      } else if (inQuotes) {
        // A closing quote ends the quoted section.
        inQuotes = false;
      } else if (!fieldStarted) {
        // A quote at the start of a field opens a quoted section.
        inQuotes = true;
      } else {
        // A quote mid-field (e.g. He said "hi") is treated as a literal
        // character so it cannot corrupt the parse state.
        currentField += char;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      fieldStarted = false;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((val) => val !== '')) {
        allParsedRows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      fieldStarted = false;
    } else {
      currentField += char;
      fieldStarted = true;
    }
  }

  // Add the last row if it has content
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((val) => val !== '')) {
      allParsedRows.push(currentRow);
    }
  }

  if (allParsedRows.length < 1) {
    return { headers: [], rows: [], allRows: [], totalRows: 0, delimiter, errors: ['No rows found'] };
  }

  const headers = allParsedRows[0];
  const dataRows = allParsedRows.slice(1);
  const rows: Record<string, string>[] = [];

  for (const rowValues of dataRows) {
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = rowValues[j] ?? '';
    }
    rows.push(row);
  }

  const maxPreview = options?.maxPreviewRows ?? 50;

  return {
    headers,
    rows: rows.slice(0, maxPreview),
    allRows: rows,
    totalRows: rows.length,
    delimiter,
    errors,
  };
}

function detectDelimiter(firstLine: string): string {
  if (!firstLine) return ',';
  const delimiters = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let bestCount = 0;

  for (const delim of delimiters) {
    const count = (firstLine.match(new RegExp(delim === '\t' ? '\\t' : delim === '|' ? '\\|' : delim, 'g')) || []).length;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = delim;
    }
  }
  return bestDelimiter;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function resolveDayOfMonth(dayOfMonth: number | 'end' | undefined, year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (dayOfMonth === 'end') {
    return lastDay;
  }
  if (typeof dayOfMonth === 'number' && dayOfMonth >= 1) {
    return Math.min(Math.floor(dayOfMonth), lastDay);
  }
  return 1;
}

// Returns true only for a real calendar date (e.g. rejects 2025-02-31).
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

export function parseDateField(value: string, dayOfMonth?: number | 'end'): string {
  if (!value) return '';
  const trimmed = value.trim();

  // Try "Month YYYY" or "Mon YYYY" or "Mon-YY" or "Month-YYYY" (e.g. "October 2025", "Oct 2025", "Oct-25", "Oct, 2025")
  const monthMatch = trimmed.match(/^([a-zA-Z]+)[-,\s]+(\d{2,4})$/);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    let year = parseInt(monthMatch[2], 10);
    if (monthMatch[2].length === 2) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    if (monthIndex !== -1) {
      const month = (monthIndex % 12) + 1;
      const paddedMonth = month.toString().padStart(2, '0');
      const day = resolveDayOfMonth(dayOfMonth, year, month);
      const paddedDay = day.toString().padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
  }

  // Try "YYYY-MM" or "YYYY-M"
  const yearMonthMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const month = parseInt(yearMonthMatch[2], 10);
    const paddedMonth = month.toString().padStart(2, '0');
    const day = resolveDayOfMonth(dayOfMonth, year, month);
    const paddedDay = day.toString().padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  // Try "MM/YYYY" or "M/YYYY" or "MM-YYYY" or "MM/YY" or "M/YY" (must be exactly 2 parts)
  const monthYearMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (monthYearMatch) {
    const month = parseInt(monthYearMatch[1], 10);
    let year = parseInt(monthYearMatch[2], 10);
    if (monthYearMatch[2].length === 2) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    if (month >= 1 && month <= 12) {
      const paddedMonth = month.toString().padStart(2, '0');
      const day = resolveDayOfMonth(dayOfMonth, year, month);
      const paddedDay = day.toString().padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
  }

  // Try ISO / common date formats first (YYYY-MM-DD, MM/DD/YYYY, etc.)
  // Strip any time component (e.g. "2025-01-15 10:30:00" or "2025-01-15T10:30:00Z")
  // so the value is a clean YYYY-MM-DD that Postgres `date` accepts.
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    const year = parseInt(isoDateMatch[1], 10);
    const month = parseInt(isoDateMatch[2], 10);
    const day = parseInt(isoDateMatch[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    return '';
  }

  // Try "Month DD, YYYY" or "Mon DD, YYYY" (e.g. "October 23, 2025", "Oct 23, 2025")
  const monthDayYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const monthName = monthDayYearMatch[1].toLowerCase();
    const day = parseInt(monthDayYearMatch[2], 10);
    const year = parseInt(monthDayYearMatch[3], 10);
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    if (monthIndex !== -1) {
      const month = (monthIndex % 12) + 1;
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
      return '';
    }
  }

  // Try MM/DD/YYYY or DD/MM/YYYY. Disambiguate by range: if the first component
  // is > 12 it must be a day (DD/MM); if the second is > 12 it must be a day
  // (MM/DD). When both are <= 12, default to US MM/DD (documented behavior).
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    let month: number;
    let day: number;
    if (a > 12 && b <= 12) {
      // DD/MM/YYYY
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      // MM/DD/YYYY
      month = a;
      day = b;
    } else {
      // Ambiguous (both <= 12) — assume US MM/DD/YYYY.
      month = a;
      day = b;
    }
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    return '';
  }

  // Final fallback: let JavaScript Date parse whatever remains. Only accept the
  // result if it round-trips to a valid calendar date; otherwise return '' so the
  // caller can route the row to "errored" instead of inserting a bad date.
  const fallbackDate = new Date(trimmed);
  if (!isNaN(fallbackDate.getTime())) {
    const iso = fallbackDate.toISOString().split('T')[0];
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
    if (isValidCalendarDate(y, m, d)) {
      return iso;
    }
  }

  return '';
}

export function determineTransactionSign(amount: number, typeIndicator: string): number {
  if (!typeIndicator) return amount;
  const clean = typeIndicator.trim().toLowerCase();
  
  // Debits (Expenses/Withdrawals) -> negative
  if (
    clean === 'debit' ||
    clean === 'd' ||
    clean === 'dr' ||
    clean === 'expense' ||
    clean === 'withdrawal' ||
    clean === 'out' ||
    clean === 'charge' ||
    clean === 'negative' ||
    clean === 'wd' ||
    clean === '-' ||
    clean === 'payment' ||
    clean.startsWith('deb') ||
    clean.startsWith('withd')
  ) {
    return -Math.abs(amount);
  }
  
  // Credits (Income/Deposits) -> positive
  if (
    clean === 'credit' ||
    clean === 'c' ||
    clean === 'cr' ||
    clean === 'income' ||
    clean === 'deposit' ||
    clean === 'in' ||
    clean === 'refund' ||
    clean === 'positive' ||
    clean === '+' ||
    clean.startsWith('cred') ||
    clean.startsWith('dep')
  ) {
    return Math.abs(amount);
  }
  
  return amount; // Fallback to original sign if no clear indicator
}

/**
 * Parse a raw amount string from a bank CSV into a signed number.
 *
 * Handles the common bank-export conventions:
 * - Parenthesized negatives: "(1,234.56)" -> -1234.56
 * - Trailing minus: "1234.56-" -> -1234.56
 * - EU decimal comma: "1234,56" -> 1234.56
 * - EU thousands dot + decimal comma: "1.234,56" -> 1234.56
 * - US thousands comma: "1,234.56" -> 1234.56
 * - Plain: "1234.56" -> 1234.56
 *
 * Returns 0 when the value cannot be parsed.
 */
export function parseAmount(raw: string): number {
  if (!raw) return 0;
  let value = raw.trim();
  if (!value) return 0;

  let negative = false;

  // Parenthesized negative: (1,234.56)
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1).trim();
  }

  // Trailing minus: 1234.56-
  if (value.endsWith('-')) {
    negative = true;
    value = value.slice(0, -1).trim();
  }

  // Strip currency symbols, spaces, and any other non-numeric characters
  // except digits, dots, commas, and a leading minus.
  value = value.replace(/[^0-9.,-]/g, '');
  if (!value) return 0;

  // A leading minus is a plain negative.
  if (value.startsWith('-')) {
    negative = !negative; // double negative is positive (rare, but handle it)
    value = value.slice(1);
  }

  const hasComma = value.includes(',');
  const hasDot = value.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator appears LAST is the decimal separator.
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    if (lastComma > lastDot) {
      // "1.234,56" -> decimal comma
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,234.56" -> decimal dot
      value = value.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Only commas present. A single comma is a decimal separator ("1234,56");
    // multiple commas are thousands separators ("1,234,567").
    const commaCount = (value.match(/,/g) || []).length;
    if (commaCount === 1) {
      value = value.replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  }
  // Only dots present: treat as decimal (or thousands) — parseFloat handles it.

  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  return negative ? -parsed : parsed;
}
