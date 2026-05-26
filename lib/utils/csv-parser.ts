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

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next double quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
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
    } else {
      currentField += char;
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

export function parseDateField(value: string, endOfMonth: boolean = false): string {
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
      const day = endOfMonth
        ? new Date(Date.UTC(year, month, 0)).getUTCDate()
        : 1;
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
    const day = endOfMonth
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 1;
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
      const day = endOfMonth
        ? new Date(Date.UTC(year, month, 0)).getUTCDate()
        : 1;
      const paddedDay = day.toString().padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
  }

  // Try ISO / common date formats first (YYYY-MM-DD, MM/DD/YYYY, etc.)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime()) && trimmed.includes('-') && trimmed.split('-')[0].length === 4) {
    return trimmed;
  }

  // Try "Month DD, YYYY" or "Mon DD, YYYY" (e.g. "October 23, 2025", "Oct 23, 2025")
  const monthDayYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const monthName = monthDayYearMatch[1].toLowerCase();
    const day = monthDayYearMatch[2].padStart(2, '0');
    const year = monthDayYearMatch[3];
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    if (monthIndex !== -1) {
      const month = (monthIndex % 12) + 1;
      const padded = month.toString().padStart(2, '0');
      return `${year}-${padded}-${day}`;
    }
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // Try "YYYY-MM-DD" as fallback
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return trimmed;
  }

  // Final fallback: let JavaScript Date parse whatever remains
  const fallbackDate = new Date(trimmed);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate.toISOString().split('T')[0];
  }

  return trimmed;
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
