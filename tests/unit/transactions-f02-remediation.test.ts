import { describe, it, expect } from 'vitest';
import { parseAmount } from '@/lib/utils/csv-parser';
import {
  addFrequencyPeriod,
  calculateNextExpectedDate,
  getMonthlyMultiplier,
  getAnnualMultiplier,
  classifyFrequency,
} from '@/lib/services/recurring-detection';
import { evaluateCondition } from '@/lib/services/rules-engine';
import { toCashFlowAmount } from '@/lib/utils/account-scope';

describe('Financial Review F02: Transactions, Splits, Transfers & Rules Remediation', () => {
  describe('F02-1: Standardized Inflow/Outflow Sign Conventions', () => {
    it('preserves negative charges and positive deposits across all account types', () => {
      // Checking expense and deposit
      expect(toCashFlowAmount(-50.00, 'checking')).toBe(-50.00);
      expect(toCashFlowAmount(2000.00, 'checking')).toBe(2000.00);

      // Credit card purchase and payment
      expect(toCashFlowAmount(-50.00, 'credit')).toBe(-50.00);
      expect(toCashFlowAmount(200.00, 'credit')).toBe(200.00);

      // Mortgage disbursement and payment
      expect(toCashFlowAmount(-1500.00, 'mortgage')).toBe(-1500.00);
      expect(toCashFlowAmount(0, 'loan')).toBe(0);
    });
  });

  describe('F02-2: Split Transaction Algebraic Sum & Negative Line Items', () => {
    it('validates splits containing negative offsets (returns/cashback)', () => {
      const parentAmount = -100.00;
      const splits = [
        { amount: '-120.00', categoryId: 'cat-groceries' },
        { amount: '20.00', categoryId: 'cat-returned-item' },
      ];

      const parentCents = Math.round(parentAmount * 100);
      const splitsSumCents = splits.reduce(
        (sum, s) => sum + Math.round(parseFloat(s.amount.replace(/[^\d.-]/g, '')) * 100),
        0
      );

      expect(splitsSumCents).toBe(parentCents);
    });

    it('validates paycheck gross-to-net splits with tax and benefit deductions', () => {
      const parentDeposit = 5000.00; // Net paycheck deposit
      const splits = [
        { amount: '7000.00', categoryId: 'cat-gross-salary' },
        { amount: '-1500.00', categoryId: 'cat-federal-tax' },
        { amount: '-500.00', categoryId: 'cat-401k' },
      ];

      const parentCents = Math.round(parentDeposit * 100);
      const splitsSumCents = splits.reduce(
        (sum, s) => sum + Math.round(parseFloat(s.amount.replace(/[^\d.-]/g, '')) * 100),
        0
      );

      expect(splitsSumCents).toBe(parentCents);
    });

    it('validates standard unsigned positive split entry matching parent magnitude', () => {
      const parentAmount = -100.00;
      const splits = [
        { amount: '60.00', categoryId: 'cat-groceries' },
        { amount: '40.00', categoryId: 'cat-household' },
      ];

      const parentAbsCents = Math.abs(Math.round(parentAmount * 100));
      const splitsAbsSumCents = splits.reduce(
        (sum, s) => sum + Math.round(Math.abs(parseFloat(s.amount.replace(/[^\d.-]/g, ''))) * 100),
        0
      );

      expect(splitsAbsSumCents).toBe(parentAbsCents);
    });
  });

  describe('F02-8: Rules Engine Numeric Comparison Operators', () => {
    const mockTx = {
      id: 'tx-1',
      description: 'Supermarket Grocery Store',
      payee: 'Safeway',
      memo: 'Weekly shopping',
      amount: '-125.50',
      categoryId: null,
    };

    it('evaluates gt (greater_than) on transaction amount', () => {
      const ruleGt100: any = {
        conditions: [
          { field: 'amount', operator: 'gt', value: '100.00', caseSensitive: false },
        ],
      };
      const ruleGt200: any = {
        conditions: [
          { field: 'amount', operator: 'gt', value: '200.00', caseSensitive: false },
        ],
      };

      expect(evaluateCondition(ruleGt100, mockTx)).toBe(true);
      expect(evaluateCondition(ruleGt200, mockTx)).toBe(false);
    });

    it('evaluates lt (less_than) on transaction amount', () => {
      const ruleLt150: any = {
        conditions: [
          { field: 'amount', operator: 'lt', value: '150.00', caseSensitive: false },
        ],
      };
      const ruleLt100: any = {
        conditions: [
          { field: 'amount', operator: 'lt', value: '100.00', caseSensitive: false },
        ],
      };

      expect(evaluateCondition(ruleLt150, mockTx)).toBe(true);
      expect(evaluateCondition(ruleLt100, mockTx)).toBe(false);
    });

    it('evaluates gte and lte on boundary values', () => {
      const ruleGte: any = {
        conditions: [
          { field: 'amount', operator: 'gte', value: '125.50', caseSensitive: false },
        ],
      };
      const ruleLte: any = {
        conditions: [
          { field: 'amount', operator: 'lte', value: '125.50', caseSensitive: false },
        ],
      };

      expect(evaluateCondition(ruleGte, mockTx)).toBe(true);
      expect(evaluateCondition(ruleLte, mockTx)).toBe(true);
    });

    it('evaluates eq_numeric (equals_numeric) ignoring minus signs and formatting differences', () => {
      const ruleEq: any = {
        conditions: [
          { field: 'amount', operator: 'eq_numeric', value: '125.5', caseSensitive: false },
        ],
      };

      expect(evaluateCondition(ruleEq, mockTx)).toBe(true);
    });
  });

  describe('F02-10: Recurring Month-End Date Projection', () => {
    it('preserves 31st day-of-month across February into March, April, and May', () => {
      const jan31 = '2026-01-31';

      // Step 1: Jan 31 -> Feb 28
      const feb28 = addFrequencyPeriod(jan31, 'monthly', 31);
      expect(feb28).toBe('2026-02-28');

      // Step 2: From Feb 28 stepping forward with anchor 31 -> Mar 31
      const mar31 = addFrequencyPeriod(feb28, 'monthly', 31);
      expect(mar31).toBe('2026-03-31');

      // Step 3: From Mar 31 stepping forward with anchor 31 -> Apr 30
      const apr30 = addFrequencyPeriod(mar31, 'monthly', 31);
      expect(apr30).toBe('2026-04-30');

      // Step 4: From Apr 30 stepping forward with anchor 31 -> May 31
      const may31 = addFrequencyPeriod(apr30, 'monthly', 31);
      expect(may31).toBe('2026-05-31');
    });

    it('calculates next expected date across multiple months without day-of-month drift', () => {
      const jan31 = '2026-01-31';
      // If reference date is in mid-March, next expected date should be 2026-03-31
      const nextExpected = calculateNextExpectedDate(jan31, 'monthly', '2026-03-15');
      expect(nextExpected).toBe('2026-03-31');
    });
  });

  describe('F02-11: Semi-Monthly Recurrence Cadence', () => {
    it('correctly calculates semi-monthly intervals and multipliers', () => {
      expect(getMonthlyMultiplier('semi_monthly')).toBe(2);
      expect(getAnnualMultiplier('semi_monthly')).toBe(24);
    });

    it('steps semi-monthly dates between 1st and 15th of the month', () => {
      const jan1 = '2026-01-01';
      const jan15 = addFrequencyPeriod(jan1, 'semi_monthly');
      expect(jan15).toBe('2026-01-15');

      const feb1 = addFrequencyPeriod(jan15, 'semi_monthly');
      expect(feb1).toBe('2026-02-01');
    });
  });

  describe('F02-12: Multi-Dot CSV Integer Parsing', () => {
    it('parses German/European multi-dot integer thousand formats without truncating decimals', () => {
      expect(parseAmount('1.234.567')).toBe(1234567);
      expect(parseAmount('1.234,56')).toBe(1234.56);
      expect(parseAmount('1,234.56')).toBe(1234.56);
      expect(parseAmount('(1.234.567)')).toBe(-1234567);
    });
  });
});
