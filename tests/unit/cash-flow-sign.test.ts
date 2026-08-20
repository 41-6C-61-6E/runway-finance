import { describe, it, expect } from 'vitest';
import { toCashFlowAmount } from '@/lib/utils/account-scope';

describe('toCashFlowAmount', () => {
  describe('asset accounts (standard sign convention)', () => {
    it.each([
      'checking',
      'savings',
      'investment',
      'brokerage',
      'retirement',
      'rothira',
      'hsa',
      'paystub',
      'realestate',
      'primaryhome',
    ])('returns positive deposit unchanged for %s', (type) => {
      expect(toCashFlowAmount(1500, type)).toBe(1500);
    });

    it.each(['checking', 'savings', 'investment', 'brokerage'])('returns negative expense unchanged for %s', (type) => {
      expect(toCashFlowAmount(-1500, type)).toBe(-1500);
    });
  });

  describe('liability accounts (payments stored POSITIVE)', () => {
    it.each([
      'credit',
      'loan',
      'mortgage',
      'otherLiability',
      'otherliability',
      'studentloan',
      'autoloan',
      'otherloan',
    ])('flips positive payment to negative cash-flow amount for %s', (type) => {
      // A +7350 mortgage/loan payment is money OUT (debt reduction).
      expect(toCashFlowAmount(7350, type)).toBe(-7350);
    });

    it.each(['credit', 'loan', 'mortgage'])('flips negative charge/disbursement to positive for %s', (type) => {
      // A -900 credit card charge is money IN (debt accrual).
      expect(toCashFlowAmount(-900, type)).toBe(900);
    });

    it('handles unknown/null account types by leaving the sign as-is', () => {
      expect(toCashFlowAmount(250, undefined)).toBe(250);
      expect(toCashFlowAmount(-250, null)).toBe(-250);
      expect(toCashFlowAmount(250, '')).toBe(250);
      expect(toCashFlowAmount(-250, 'unknown-type')).toBe(-250);
    });
  });

  describe('edge cases', () => {
    it('returns 0 regardless of account type', () => {
      expect(toCashFlowAmount(0, 'mortgage')).toBe(0);
      expect(toCashFlowAmount(0, 'checking')).toBe(0);
    });

    it('preserves fractional amounts (no precision loss)', () => {
      expect(toCashFlowAmount(1999.99, 'credit')).toBe(-1999.99);
      expect(toCashFlowAmount(-0.01, 'loan')).toBe(0.01);
    });
  });
});
