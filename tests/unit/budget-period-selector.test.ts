import { describe, it, expect } from 'vitest';
import {
  isValidPeriodKey,
  convertPeriodKeyForType,
  getKeyLabel,
  getNextKey,
  getPrevKey,
  getCurrentKey,
} from '@/components/budgets/budget-period-selector';
import { getPeriodDateRange } from '@/components/budgets/budget-transactions-tooltip';

describe('Budget Period Key Handling & Safeguards', () => {
  describe('isValidPeriodKey', () => {
    it('validates monthly format YYYY-MM', () => {
      expect(isValidPeriodKey('monthly', '2026-10')).toBe(true);
      expect(isValidPeriodKey('monthly', '2026-01')).toBe(true);
      expect(isValidPeriodKey('monthly', '2026-13')).toBe(false);
      expect(isValidPeriodKey('monthly', '2026-Q4')).toBe(false);
      expect(isValidPeriodKey('monthly', '2026')).toBe(false);
      expect(isValidPeriodKey('monthly', 'undefined')).toBe(false);
      expect(isValidPeriodKey('monthly', null)).toBe(false);
      expect(isValidPeriodKey('monthly', '')).toBe(false);
    });

    it('validates quarterly format YYYY-Q#', () => {
      expect(isValidPeriodKey('quarterly', '2026-Q1')).toBe(true);
      expect(isValidPeriodKey('quarterly', '2026-Q4')).toBe(true);
      expect(isValidPeriodKey('quarterly', '2026-Q5')).toBe(false);
      expect(isValidPeriodKey('quarterly', '2026-10')).toBe(false);
      expect(isValidPeriodKey('quarterly', '2026')).toBe(false);
      expect(isValidPeriodKey('quarterly', 'undefined')).toBe(false);
      expect(isValidPeriodKey('quarterly', 'Qundefined')).toBe(false);
      expect(isValidPeriodKey('quarterly', null)).toBe(false);
    });

    it('validates yearly format YYYY', () => {
      expect(isValidPeriodKey('yearly', '2026')).toBe(true);
      expect(isValidPeriodKey('yearly', '2026-10')).toBe(false);
      expect(isValidPeriodKey('yearly', '2026-Q4')).toBe(false);
      expect(isValidPeriodKey('yearly', 'undefined')).toBe(false);
      expect(isValidPeriodKey('yearly', null)).toBe(false);
    });
  });

  describe('convertPeriodKeyForType', () => {
    it('converts monthly key to quarterly and yearly correctly', () => {
      expect(convertPeriodKeyForType('2026-10', 'quarterly')).toBe('2026-Q4');
      expect(convertPeriodKeyForType('2026-05', 'quarterly')).toBe('2026-Q2');
      expect(convertPeriodKeyForType('2026-01', 'quarterly')).toBe('2026-Q1');
      expect(convertPeriodKeyForType('2026-10', 'yearly')).toBe('2026');
    });

    it('converts quarterly key to monthly and yearly correctly', () => {
      expect(convertPeriodKeyForType('2026-Q4', 'monthly')).toBe('2026-10');
      expect(convertPeriodKeyForType('2026-Q2', 'monthly')).toBe('2026-04');
      expect(convertPeriodKeyForType('2026-Q1', 'yearly')).toBe('2026');
    });

    it('handles corrupted or undefined keys without throwing or producing NaN', () => {
      const q = convertPeriodKeyForType('undefined', 'quarterly');
      expect(q).toMatch(/^\d{4}-Q[1-4]$/);
      expect(q).not.toContain('undefined');
      expect(q).not.toContain('NaN');

      const m = convertPeriodKeyForType('Qundefined', 'monthly');
      expect(m).toMatch(/^\d{4}-\d{2}$/);
      expect(m).not.toContain('undefined');
      expect(m).not.toContain('NaN');

      const y = convertPeriodKeyForType(null, 'yearly');
      expect(y).toMatch(/^\d{4}$/);
    });
  });

  describe('getKeyLabel', () => {
    it('formats quarterly label correctly and never returns Qundefined', () => {
      expect(getKeyLabel('quarterly', '2026-Q3')).toBe('Q3 2026');
      expect(getKeyLabel('quarterly', '2026-Q1')).toBe('Q1 2026');

      // Mismatched or corrupted keys must never produce "Qundefined"
      const mismatched = getKeyLabel('quarterly', '2026-10');
      expect(mismatched).toBe('Q4 2026');
      expect(mismatched).not.toContain('undefined');

      const undefinedLabel = getKeyLabel('quarterly', 'undefined');
      expect(undefinedLabel).not.toContain('undefined');
      expect(undefinedLabel).toMatch(/^Q[1-4] \d{4}$/);

      const qUndefinedLabel = getKeyLabel('quarterly', 'Qundefined');
      expect(qUndefinedLabel).not.toContain('undefined');
      expect(qUndefinedLabel).toMatch(/^Q[1-4] \d{4}$/);
    });

    it('formats monthly label correctly and recovers from mismatched quarterly keys', () => {
      expect(getKeyLabel('monthly', '2026-10')).toBe('October 2026');
      const recovered = getKeyLabel('monthly', '2026-Q4');
      expect(recovered).toBe('October 2026');
    });

    it('formats yearly label correctly', () => {
      expect(getKeyLabel('yearly', '2026')).toBe('2026');
      expect(getKeyLabel('yearly', '2026-10')).toBe('2026');
    });
  });

  describe('getNextKey and getPrevKey', () => {
    it('handles quarterly boundaries', () => {
      expect(getNextKey('quarterly', '2026-Q4')).toBe('2027-Q1');
      expect(getPrevKey('quarterly', '2026-Q1')).toBe('2025-Q4');
    });

    it('handles monthly boundaries', () => {
      expect(getNextKey('monthly', '2026-12')).toBe('2027-01');
      expect(getPrevKey('monthly', '2026-01')).toBe('2025-12');
    });

    it('recovers from mismatched keys without producing NaN-QNaN', () => {
      const nextFromMismatched = getNextKey('quarterly', '2026-10');
      expect(nextFromMismatched).toBe('2027-Q1'); // 2026-10 converts to 2026-Q4, next is 2027-Q1
      expect(nextFromMismatched).not.toContain('NaN');

      const prevFromMismatched = getPrevKey('quarterly', '2026-10');
      expect(prevFromMismatched).toBe('2026-Q3'); // 2026-10 converts to 2026-Q4, prev is 2026-Q3
      expect(prevFromMismatched).not.toContain('NaN');
    });
  });

  describe('getPeriodDateRange tooltip helper', () => {
    it('safely recovers when periodType is quarterly but periodKey is monthly or invalid', () => {
      const range = getPeriodDateRange('quarterly', '2026-10');
      expect(range.startDate).toBe('2026-10-01');
      expect(range.endDate).toBe('2026-12-31');
      expect(range.label).toBe('Q4 2026');
      expect(range.startDate).not.toContain('NaN');
      expect(range.endDate).not.toContain('NaN');

      const corruptedRange = getPeriodDateRange('quarterly', 'undefined');
      expect(corruptedRange.startDate).not.toContain('NaN');
      expect(corruptedRange.endDate).not.toContain('NaN');
    });
  });
});
