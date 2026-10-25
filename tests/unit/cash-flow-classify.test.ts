import { describe, it, expect } from 'vitest';
import {
  classifyCashFlowAmount,
  isExcludedFromReports,
  type ClassifiableCategory,
} from '@/lib/finance/cash-flow-classify';

describe('cash-flow-classify', () => {
  describe('classifyCashFlowAmount', () => {
    it('handles transfer categories by returning zeros and isTransfer true', () => {
      const res = classifyCashFlowAmount(-500, { categoryType: 'transfer' });
      expect(res).toEqual({ income: 0, expenses: 0, isTransfer: true });

      const resPos = classifyCashFlowAmount(500, { categoryType: 'transfer' });
      expect(resPos).toEqual({ income: 0, expenses: 0, isTransfer: true });
    });

    it('handles compound categories by adding abs amount to both income and expenses', () => {
      const res1 = classifyCashFlowAmount(-250, { categoryType: 'compound' });
      expect(res1).toEqual({ income: 250, expenses: 250, isTransfer: false });

      const res2 = classifyCashFlowAmount(250, { categoryType: 'compound' });
      expect(res2).toEqual({ income: 250, expenses: 250, isTransfer: false });
    });

    it('handles standard expense (negative amount with expense category)', () => {
      const res = classifyCashFlowAmount(-120, { isIncome: false });
      expect(res).toEqual({ income: 0, expenses: 120, isTransfer: false });
    });

    it('handles uncategorized expense (negative amount, undefined category)', () => {
      const res = classifyCashFlowAmount(-45, undefined);
      expect(res).toEqual({ income: 0, expenses: 45, isTransfer: false });
    });

    it('handles standard income (positive amount with income category)', () => {
      const res = classifyCashFlowAmount(3000, { isIncome: true });
      expect(res).toEqual({ income: 3000, expenses: 0, isTransfer: false });
    });

    it('handles uncategorized income (positive amount, undefined category)', () => {
      const res = classifyCashFlowAmount(150, undefined);
      expect(res).toEqual({ income: 150, expenses: 0, isTransfer: false });
    });

    it('handles refunds/rebates (positive amount with expense category)', () => {
      const res = classifyCashFlowAmount(40, { isIncome: false });
      expect(res).toEqual({ income: 0, expenses: -40, isTransfer: false });
    });

    it('handles income deductions/clawbacks (negative amount with income category)', () => {
      const res = classifyCashFlowAmount(-50, { isIncome: true });
      expect(res).toEqual({ income: -50, expenses: 0, isTransfer: false });
    });
  });

  describe('isExcludedFromReports', () => {
    it('returns false for undefined category', () => {
      const catMap = new Map<string, ClassifiableCategory>();
      expect(isExcludedFromReports(undefined, catMap)).toBe(false);
    });

    it('returns true if category itself is excluded', () => {
      const catMap = new Map<string, ClassifiableCategory>();
      expect(isExcludedFromReports({ excludeFromReports: true }, catMap)).toBe(true);
    });

    it('returns false if neither category nor parent is excluded', () => {
      const parent: ClassifiableCategory = { excludeFromReports: false };
      const child: ClassifiableCategory = { parentId: 'p1', excludeFromReports: false };
      const catMap = new Map<string, ClassifiableCategory>([['p1', parent]]);
      expect(isExcludedFromReports(child, catMap)).toBe(false);
    });

    it('returns true if parent category is excluded', () => {
      const parent: ClassifiableCategory = { excludeFromReports: true };
      const child: ClassifiableCategory = { parentId: 'p1', excludeFromReports: false };
      const catMap = new Map<string, ClassifiableCategory>([['p1', parent]]);
      expect(isExcludedFromReports(child, catMap)).toBe(true);
    });
  });
});
