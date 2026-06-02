import { describe, it, expect } from 'vitest';
import { parseCsv, parseDateField, determineTransactionSign } from '../../lib/utils/csv-parser';

describe('CSV Parser', () => {
  it('should parse simple CSV content', () => {
    const csv = 'Date,Amount,Description\n2025-01-01,10.50,Test transaction\n2025-01-02,-5.00,Another test';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Date', 'Amount', 'Description']);
    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      Date: '2025-01-01',
      Amount: '10.50',
      Description: 'Test transaction',
    });
  });

  it('should auto-detect delimiters', () => {
    const csvSemi = 'Date;Amount;Description\n2025-01-01;10.50;Test';
    const resultSemi = parseCsv(csvSemi);
    expect(resultSemi.delimiter).toBe(';');

    const csvTab = 'Date\tAmount\tDescription\n2025-01-01\t10.50\tTest';
    const resultTab = parseCsv(csvTab);
    expect(resultTab.delimiter).toBe('\t');
  });

  it('should handle double quotes and escaped quotes', () => {
    const csv = 'Date,Amount,Description\n2025-01-01,10.50,"Test, with comma"\n2025-01-02,-5.00,"Test with ""escaped"" quotes"';
    const result = parseCsv(csv);

    expect(result.rows[0].Description).toBe('Test, with comma');
    expect(result.rows[1].Description).toBe('Test with "escaped" quotes');
  });

  it('should handle newlines within quoted fields', () => {
    const csv = 'Date,Amount,Description\n2025-01-01,10.50,"Test line 1\nTest line 2"\n2025-01-02,-5.00,Single line';
    const result = parseCsv(csv);

    expect(result.totalRows).toBe(2);
    expect(result.rows[0].Description).toBe('Test line 1\nTest line 2');
    expect(result.rows[1].Description).toBe('Single line');
  });

  it('should parse dates in various formats', () => {
    expect(parseDateField('2025-02-15')).toBe('2025-02-15');
    expect(parseDateField('2/15/2025')).toBe('2025-02-15');
    expect(parseDateField('10/05/2025')).toBe('2025-10-05');
    expect(parseDateField('October 2025')).toBe('2025-10-01');
    expect(parseDateField('Oct 2025')).toBe('2025-10-01');

    // Test dayOfMonth = 'end' for various formats
    expect(parseDateField('October 2025', 'end')).toBe('2025-10-31');
    expect(parseDateField('Oct 2025', 'end')).toBe('2025-10-31');
    expect(parseDateField('2025-10', 'end')).toBe('2025-10-31');
    expect(parseDateField('10/2025', 'end')).toBe('2025-10-31');
    expect(parseDateField('February 2024', 'end')).toBe('2024-02-29'); // Leap year
    expect(parseDateField('Feb 2025', 'end')).toBe('2025-02-28'); // Non-leap year
    expect(parseDateField('Oct-25', 'end')).toBe('2025-10-31'); // 2-digit year

    // Test specific day of month
    expect(parseDateField('April 2026', 15)).toBe('2026-04-15');
    expect(parseDateField('2026-04', 15)).toBe('2026-04-15');
    expect(parseDateField('4/2026', 15)).toBe('2026-04-15');

    // Test clamping: day 31 in April -> 30
    expect(parseDateField('April 2026', 31)).toBe('2026-04-30');
    // Test clamping: day 30 in February 2025 (non-leap) -> 28
    expect(parseDateField('February 2025', 30)).toBe('2025-02-28');
  });

  it('should determine transaction sign based on type indicator', () => {
    // Debit indicators (should become negative)
    expect(determineTransactionSign(100.5, 'debit')).toBe(-100.5);
    expect(determineTransactionSign(100.5, 'Debit')).toBe(-100.5);
    expect(determineTransactionSign(50, 'd')).toBe(-50);
    expect(determineTransactionSign(25.99, 'expense')).toBe(-25.99);
    expect(determineTransactionSign(10, 'withdrawal')).toBe(-10);
    expect(determineTransactionSign(20, 'out')).toBe(-20);
    expect(determineTransactionSign(30, 'charge')).toBe(-30);
    expect(determineTransactionSign(15, '-')).toBe(-15);
    expect(determineTransactionSign(100, 'payment')).toBe(-100);
    expect(determineTransactionSign(200, 'Debit Transaction')).toBe(-200);

    // Credit indicators (should become positive)
    expect(determineTransactionSign(100.5, 'credit')).toBe(100.5);
    expect(determineTransactionSign(50, 'c')).toBe(50);
    expect(determineTransactionSign(25.99, 'income')).toBe(25.99);
    expect(determineTransactionSign(10, 'deposit')).toBe(10);
    expect(determineTransactionSign(20, 'refund')).toBe(20);
    expect(determineTransactionSign(15, '+')).toBe(15);
    expect(determineTransactionSign(300, 'Credit Transaction')).toBe(300);

    // Mixed/already signed amounts
    expect(determineTransactionSign(-100.5, 'debit')).toBe(-100.5);
    expect(determineTransactionSign(-100.5, 'credit')).toBe(100.5);

    // Unknown indicators (should remain unchanged)
    expect(determineTransactionSign(45, 'unknown')).toBe(45);
    expect(determineTransactionSign(-45, '')).toBe(-45);
  });
});
