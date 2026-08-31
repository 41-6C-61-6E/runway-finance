import { describe, it, expect } from 'vitest';
import {
  formatBalance,
  formatAmount,
  formatProjected,
  formatCompactCurrency,
  formatPercent,
  formatPlainPercent,
} from '@/lib/utils/format';

describe('R-7 role formatters (G3 / W-3)', () => {
  describe('balance — whole dollars, no cents', () => {
    it('prints whole dollars', () => {
      expect(formatBalance(482)).toBe('$482');
      expect(formatBalance(-482)).toBe('-$482');
      expect(formatBalance(98635.51)).toBe('$98,636');
      expect(formatBalance(0)).toBe('$0');
    });
  });

  describe('amount — exactly 2 decimals (ledger)', () => {
    it('prints cents even when trailing', () => {
      expect(formatAmount(48.2)).toBe('$48.20');
      expect(formatAmount(-48.02)).toBe('-$48.02');
      expect(formatAmount(0)).toBe('$0.00');
    });
  });

  describe('projected — 1 decimal, no trailing .0', () => {
    it('drops trailing zeros', () => {
      expect(formatProjected(420)).toBe('$420');
      expect(formatProjected(420.5)).toBe('$420.5');
      expect(formatProjected(1.5)).toBe('$1.5');
      expect(formatProjected(0)).toBe('$0');
      expect(formatProjected(-12.5)).toBe('-$12.5');
    });
  });

  describe('axis currency (compact) — whole $ below 1K, 3-sig-fig above', () => {
    it('never prints decimals below $1,000 and never raw $+number', () => {
      expect(formatCompactCurrency(15)).toBe('$15');
      expect(formatCompactCurrency(999)).toBe('$999');
      expect(formatCompactCurrency(1500)).toBe('$2k');
      expect(formatCompactCurrency(1900)).toBe('$2k');
      expect(formatCompactCurrency(1_200_000)).toBe('$1.2M');
      expect(formatCompactCurrency(-40)).toBe('-$40');
    });
  });

  describe('formatPercent — signed delta', () => {
    it('keeps a forced + and the requested decimals', () => {
      expect(formatPercent(2)).toBe('+2.00%');
      expect(formatPercent(-0.2, 1)).toBe('-0.2%');
      expect(formatPercent(null)).toBe('+0.00%');
    });
  });

  describe('formatPlainPercent — measurement/axis percent (R-7)', () => {
    it('1dp by default, unsigned, zero prints bare 0%', () => {
      expect(formatPlainPercent(12.34)).toBe('12.3%');
      expect(formatPlainPercent(-0.21)).toBe('-0.2%');
      expect(formatPlainPercent(0)).toBe('0%');
      expect(formatPlainPercent(-0.04)).toBe('0%');
      expect(formatPlainPercent(100)).toBe('100%');
      expect(formatPlainPercent(undefined)).toBe('0%');
    });
    it('honors an explicit decimal count', () => {
      expect(formatPlainPercent(12.345, 2)).toBe('12.35%');
    });
  });
});
