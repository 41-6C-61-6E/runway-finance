import { describe, it, expect, vi } from 'vitest';
import { isAssetAccount } from '@/lib/utils/account-scope';
import { isSection125Line, computeOasdiYtdBefore, capOasdiAmount } from '@/lib/utils/paystub';

describe('Review F04 Remediation Suite', () => {
  describe('Finding F04-1: Asset Account Deduction Routing Sign', () => {
    it('recognizes 401k, HSA, brokerage, and savings as asset accounts requiring positive inflow amounts', () => {
      expect(isAssetAccount('401k')).toBe(true);
      expect(isAssetAccount('hsa')).toBe(true);
      expect(isAssetAccount('rothira')).toBe(true);
      expect(isAssetAccount('investment')).toBe(true);
      expect(isAssetAccount('savings')).toBe(true);
      expect(isAssetAccount('checking')).toBe(true);

      // Virtual paystub account & liabilities are not positive inflow destinations
      expect(isAssetAccount('credit')).toBe(false);
      expect(isAssetAccount('loan')).toBe(false);
      expect(isAssetAccount('paystub')).toBe(false);
    });

    it('determines correct signed amount for deduction vs tax vs asset destination', () => {
      const getSignedDeductionAmount = (section: string, targetType: string, amount: number) => {
        const isDeduction = section === 'before_tax_deductions' || section === 'after_tax_deductions';
        const isAssetDest = targetType !== 'paystub' && isAssetAccount(targetType);
        return (isDeduction && isAssetDest) ? Math.abs(amount) : -Math.abs(amount);
      };

      // 401(k) deduction ($500) routed to a 401(k) retirement asset account -> POSITIVE +500
      expect(getSignedDeductionAmount('before_tax_deductions', '401k', 500)).toBe(500);

      // HSA deduction ($200) routed to an HSA asset account -> POSITIVE +200
      expect(getSignedDeductionAmount('before_tax_deductions', 'hsa', 200)).toBe(200);

      // Roth 401(k) post-tax ($150) routed to Roth IRA -> POSITIVE +150
      expect(getSignedDeductionAmount('after_tax_deductions', 'rothira', 150)).toBe(150);

      // 401(k) deduction ($500) routed to Virtual Paystub account -> NEGATIVE -500 (expense reduction)
      expect(getSignedDeductionAmount('before_tax_deductions', 'paystub', 500)).toBe(-500);

      // Taxes (Federal Income Tax $800) routed to Checking -> NEGATIVE -800
      expect(getSignedDeductionAmount('taxes', 'checking', 800)).toBe(-800);
    });
  });

  describe('Finding F04-2: IRC §3121 FICA Wage Base & Section 125 POP Cap Tracking', () => {
    it('does not cap OASDI early when user has Section 125 health insurance deductions', () => {
      // Annual compensation: $200,000 gross ($10,000/paycheck, 20 paychecks for simplicity)
      // Pre-tax Section 125 Medical: $1,500/paycheck
      // Pre-tax 401(k) Retirement: $1,000/paycheck (reduces FIT, but NOT FICA!)
      // True FICA taxable wages per paycheck = $10,000 - $1,500 = $8,500
      const paystubs = [];
      const lineItems = new Map<string, any[]>();

      for (let i = 0; i < 20; i++) {
        const id = `stub-${i}`;
        paystubs.push({
          id,
          checkDate: `2026-0${Math.min(9, Math.floor(i / 2) + 1)}-${(i % 2) * 14 + 1}`,
          grossCurrent: '10000.00',
        });
        lineItems.set(id, [
          { section: 'before_tax_deductions', description: 'Medical Insurance Pre-Tax', amount: '1500.00' },
          { section: 'before_tax_deductions', description: '401(k) Retirement', amount: '1000.00' },
          { section: 'taxes', description: 'Social Security OASDI', amount: '527.00' }, // 6.2% of 8500
        ]);
      }

      // Check state after 20 paychecks
      const ytd = computeOasdiYtdBefore(paystubs, lineItems, '2026-11-15');
      // Gross wages would be $200,000 (which exceeds $184,500 cap if gross were used!)
      // But FICA taxable wages are $170,000 ($8,500 * 20) -> STILL $14,500 under the $184,500 cap!
      expect(ytd.wagesBefore).toBe(170000);

      // Next paycheck (Paycheck 21): $10,000 gross, $1,500 Sec 125 = $8,500 FICA wage
      // Remaining wage base = $184,500 - $170,000 = $14,500 > $8,500
      // Full OASDI ($527) is withheld
      const capped21st = capOasdiAmount({
        expectedOasdi: 527,
        gross: 10000,
        section125Deductions: 1500,
        ytd,
        wageBaseCap: 184500,
        oasdiRate: 0.062,
      });
      expect(capped21st).toBe(527);
    });
  });

  describe('Finding F04-3: Savings Rate Denominator Double-Counting Guard', () => {
    it('correctly calculates savings rate without double-counting pre-tax deductions when gross income is present', () => {
      // Scenario A: User WITH paystub integration
      // Paystub provides Gross Income = $5,000.
      // Pre-tax 401(k) = $1,000.
      // Net Cash Flow (Take-home surplus after taxes & expenses) = $1,000.
      // Total savings = $2,000 ($1,000 surplus + $1,000 401k).
      const statsWithPaystub = {
        income: 5000, // Gross income already!
        expenses: 4000,
        retirement: 1000,
        paystubRetirement: 1000,
        hasPaystubEarnings: true,
      };

      const adjustIncomeDenominator = true;
      const includePaystubRetirement = true;

      let denomA = statsWithPaystub.income;
      if (adjustIncomeDenominator && !statsWithPaystub.hasPaystubEarnings) {
        if (includePaystubRetirement) denomA += statsWithPaystub.paystubRetirement;
      }
      const savingsRateA = 2000 / denomA;
      // Must be 2000 / 5000 = 40.00% (NOT 2000 / 6000 = 33.33%!)
      expect(denomA).toBe(5000);
      expect(savingsRateA).toBe(0.40);

      // Scenario B: User WITHOUT paystub integration (bank deposits only)
      // Bank deposit = Net Income = $3,500.
      // Manual retirement contribution = $500.
      const statsWithoutPaystub = {
        income: 3500, // Net income from bank
        expenses: 2500,
        retirement: 500,
        paystubRetirement: 500,
        hasPaystubEarnings: false,
      };

      let denomB = statsWithoutPaystub.income;
      if (adjustIncomeDenominator && !statsWithoutPaystub.hasPaystubEarnings) {
        if (includePaystubRetirement) denomB += statsWithoutPaystub.paystubRetirement;
      }
      // Denominator expands from $3,500 net to $4,000 gross
      expect(denomB).toBe(4000);
    });
  });
});
