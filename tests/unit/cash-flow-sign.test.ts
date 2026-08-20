import { describe, it, expect } from 'vitest';
import { toCashFlowAmount } from '@/lib/utils/account-scope';

describe('toCashFlowAmount', () => {
  describe('asset and liability accounts (standard unified sign convention)', () => {
    it.each([
      'checking',
      'savings',
      'investment',
      'brokerage',
      'retirement',
      'credit',
      'loan',
      'mortgage',
      'studentloan',
      'autoloan',
    ])('returns positive inflow unchanged for %s', (type) => {
      expect(toCashFlowAmount(1500, type)).toBe(1500);
    });

    it.each([
      'checking',
      'savings',
      'investment',
      'brokerage',
      'credit',
      'loan',
      'mortgage',
      'studentloan',
      'autoloan',
    ])('returns negative outflow unchanged for %s', (type) => {
      expect(toCashFlowAmount(-1500, type)).toBe(-1500);
    });
  });

  describe('edge cases', () => {
    it('returns 0 regardless of account type', () => {
      expect(toCashFlowAmount(0, 'mortgage')).toBe(0);
      expect(toCashFlowAmount(0, 'checking')).toBe(0);
      expect(toCashFlowAmount(0, 'credit')).toBe(0);
    });

    it('preserves fractional amounts (no precision loss)', () => {
      expect(toCashFlowAmount(1999.99, 'credit')).toBe(1999.99);
      expect(toCashFlowAmount(-0.01, 'loan')).toBe(-0.01);
    });
  });
});

