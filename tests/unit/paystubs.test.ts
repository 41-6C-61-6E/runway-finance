import { describe, it, expect } from 'vitest';
import { addFrequencyInterval, getFrequencyDays } from '@/app/api/paystubs/auto-generate/route';
import { parseDate } from '@/app/api/paystubs/import/route';

describe('Paystubs Helpers', () => {
  describe('parseDate', () => {
    it('parses MM/DD/YYYY dates to YYYY-MM-DD', () => {
      expect(parseDate('05/29/2026')).toBe('2026-05-29');
      expect(parseDate('12/01/2022')).toBe('2022-12-01');
      expect(parseDate('01/05/2024')).toBe('2024-01-05');
    });

    it('returns original string if not in MM/DD/YYYY format', () => {
      expect(parseDate('2026-05-29')).toBe('2026-05-29');
      expect(parseDate('invalid-date')).toBe('invalid-date');
    });
  });

  describe('addFrequencyInterval', () => {
    it('handles weekly frequency (+7 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'weekly')).toBe('2026-06-05');
      expect(addFrequencyInterval('2026-12-28', 'weekly')).toBe('2027-01-04');
    });

    it('handles biweekly frequency (+14 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'biweekly')).toBe('2026-06-12');
      expect(addFrequencyInterval('2026-12-20', 'biweekly')).toBe('2027-01-03');
    });

    it('handles semimonthly frequency (+15 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'semimonthly')).toBe('2026-06-13');
      expect(addFrequencyInterval('2026-12-20', 'semimonthly')).toBe('2027-01-04');
    });

    it('handles monthly frequency (+1 month)', () => {
      expect(addFrequencyInterval('2026-05-29', 'monthly')).toBe('2026-06-29');
      expect(addFrequencyInterval('2026-12-29', 'monthly')).toBe('2027-01-29');
      // Leap year check: Feb 2024 has 29 days
      expect(addFrequencyInterval('2024-01-31', 'monthly')).toBe('2024-02-29');
    });

    it('defaults to biweekly for unknown frequency', () => {
      expect(addFrequencyInterval('2026-05-29', 'unknown')).toBe('2026-06-12');
    });
  });

  describe('getFrequencyDays', () => {
    it('returns correct days for each frequency', () => {
      expect(getFrequencyDays('weekly')).toBe(7);
      expect(getFrequencyDays('biweekly')).toBe(14);
      expect(getFrequencyDays('semimonthly')).toBe(15);
      expect(getFrequencyDays('monthly')).toBe(30);
      expect(getFrequencyDays('unknown')).toBe(14);
    });
  });
});
