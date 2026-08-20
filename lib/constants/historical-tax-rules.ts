//
// Historical US federal tax rules (2024, 2025) — published values.
//
// Shape matches `SystemTaxRulesType` (`typeof DEFAULT_2026_RULES`), so these
// objects can be seeded into `system_tax_rules` and returned from
// `getSystemTaxRules` with no conversion.
//
// Sources (public IRS / SSA / Treasury figures):
//  - 2024: Rev. Proc. 2023-34 (brackets 12% @ $11,600 … 37% @ $609,350,
//    SD $14,600 S/$29,200 MFJ/$21,900 HOH, LTCG thresholds $47,025 / $518,900,
//    addl 65+ std deduction $1,950 Single/HoH · $1,550 Married),
//    Notice 2023-75 (401k $23,000 / catch-up $7,500, IRA $7,000),
//    Rev. Proc. 2023-23 (HSA $4,150 / $8,300), SSA taxable maximum 2024: $168,600,
//    HHS FPL $15,060, gift/estate $13,610,000 / annual $18,000.
//  - 2025: Rev. Proc. 2024-40 (brackets 12% @ $11,925 … 37% @ $626,350,
//    SD $15,000 S/$30,000 MFJ/$22,500 HOH, LTCG $48,350 / $533,400,
//    addl 65+ std deduction $2,000 Single/HoH · $1,600 Married),
//    Notice 2024-80 (401k $23,500 / catch-up $7,500 / SECURE 2.0 ages 60-63 $11,250),
//    Rev. Proc. 2024-25 (HSA $4,300 / $8,550), SSA taxable maximum 2025: $176,100,
//    HHS FPL $15,650, gift/estate $13,990,000 / annual $19,000.
//

import type { SystemTaxRulesType } from "@/lib/services/system-tax-rules-service";
import { DEFAULT_2026_RULES } from "@/lib/constants/retirement-defaults";

/**
 * Shallow clone + one-level-deep merge of published-year overrides onto the
 * 2026 base rules. Arrays and leaf values are replaced wholesale; nested
 * objects (e.g. `ficaRules`, `acaRules`) are merged key-by-key so inherited
 * fields survive.
 */
function mergeOnDefaults(overrides: object): SystemTaxRulesType {
  const base = structuredClone(DEFAULT_2026_RULES) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = base[key];
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      baseValue && typeof baseValue === "object" && !Array.isArray(baseValue)
    ) {
      base[key] = { ...(baseValue as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      base[key] = value;
    }
  }
  return base as SystemTaxRulesType;
}

interface HistoricalOverrides {
  taxYear: number;
  standardDeduction: string;
  standardDeductionSingle: string;
  standardDeductionMfj: string;
  standardDeductionHoH: string;
  standardDeductionMfs: string;
  additionalStdDeduction65Plus: { singleOrHoH: number; marriedPerPerson: number };
  ordinaryTaxBrackets: { rate: number; threshold: number }[];
  headOfHouseholdBrackets?: { rate: number; threshold: number }[];
  capitalGainsBrackets: { rate: number; threshold: number }[];
  ficaRules: {
    ssTaxRate?: number;
    medicareTaxRate?: number;
    addMedicareTaxRate?: number;
    addMedicareThresholdSingle?: number;
    addMedicareThresholdMfj?: number;
    addMedicareThresholdMfs?: number;
    ssWageBaseCap: number;
  };
  socialSecurityRules?: {
    bendPoint1: number;
    bendPoint2: number;
    claimingMultipliers: Record<number, number>;
  };
  niitRules: { rate: number; thresholdSingle: number; thresholdMfj: number; thresholdMfs: number };
  acaRules: { benchmarkCostSingle?: number; benchmarkCostMfj?: number; fplBaseSingle: number; fplMfjMultiplier: number };
  niitThreshold: string;
  contributionLimits: {
    ira: number;
    iraCatchUp: number;
    k401: number;
    k401CatchUp: number;
    k401SpecialCatchUp?: number;
    hsaSingle: number;
    hsaFamily: number;
    hsaCatchUp: number;
  };
  giftEstateExemptions: { annualGiftLimit: number; lifetimeEstateLimit: number };
  fplAmount: string;
  secureActRules: { rmdAge: number; inheritedIraYears: number };
}

const YEAR_2025_OVERRIDES: HistoricalOverrides = {
  taxYear: 2025,
  standardDeduction: '15000',
  standardDeductionSingle: '15000',
  standardDeductionMfj: '30000',
  standardDeductionHoH: '22500',
  standardDeductionMfs: '15000',
  additionalStdDeduction65Plus: { singleOrHoH: 2000, marriedPerPerson: 1600 },
  ordinaryTaxBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 11925 },
    { rate: 0.22, threshold: 48475 },
    { rate: 0.24, threshold: 103350 },
    { rate: 0.32, threshold: 197300 },
    { rate: 0.35, threshold: 250525 },
    { rate: 0.37, threshold: 626350 },
  ],
  headOfHouseholdBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 17000 },
    { rate: 0.22, threshold: 64850 },
    { rate: 0.24, threshold: 103350 },
    { rate: 0.32, threshold: 197300 },
    { rate: 0.35, threshold: 250500 },
    { rate: 0.37, threshold: 626350 },
  ],
  capitalGainsBrackets: [
    { rate: 0.00, threshold: 0 },
    { rate: 0.15, threshold: 48350 },
    { rate: 0.20, threshold: 533400 },
  ],
  ficaRules: {
    ssTaxRate: 0.062,
    medicareTaxRate: 0.0145,
    addMedicareTaxRate: 0.009,
    addMedicareThresholdSingle: 200000,
    addMedicareThresholdMfj: 250000,
    addMedicareThresholdMfs: 125000,
    ssWageBaseCap: 176100, // SSA taxable maximum, 2025 earnings
  },
  socialSecurityRules: {
    bendPoint1: 1226,
    bendPoint2: 7391,
    claimingMultipliers: {
      62: 0.70,
      63: 0.75,
      64: 0.80,
      65: 0.8667,
      66: 0.9333,
      67: 1.00,
      68: 1.08,
      69: 1.16,
      70: 1.24,
    },
  },
  niitRules: { rate: 0.038, thresholdSingle: 200000, thresholdMfj: 250000, thresholdMfs: 125000 },
  acaRules: { fplBaseSingle: 15650, fplMfjMultiplier: 1.35 },
  niitThreshold: '200000',
  contributionLimits: {
    ira: 7000,
    iraCatchUp: 1000,
    k401: 23500,
    k401CatchUp: 7500,
    k401SpecialCatchUp: 11250, // SECURE 2.0 ages 60-63
    hsaSingle: 4300,
    hsaFamily: 8550,
    hsaCatchUp: 1000,
  },
  giftEstateExemptions: { annualGiftLimit: 19000, lifetimeEstateLimit: 13990000 },
  fplAmount: '15650',
  secureActRules: { rmdAge: 73, inheritedIraYears: 10 },
};

const YEAR_2024_OVERRIDES: HistoricalOverrides = {
  taxYear: 2024,
  standardDeduction: '14600',
  standardDeductionSingle: '14600',
  standardDeductionMfj: '29200',
  standardDeductionHoH: '21900',
  standardDeductionMfs: '14600',
  additionalStdDeduction65Plus: { singleOrHoH: 1950, marriedPerPerson: 1550 },
  ordinaryTaxBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 11600 },
    { rate: 0.22, threshold: 47150 },
    { rate: 0.24, threshold: 100525 },
    { rate: 0.32, threshold: 191950 },
    { rate: 0.35, threshold: 243725 },
    { rate: 0.37, threshold: 609350 },
  ],
  headOfHouseholdBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 16550 },
    { rate: 0.22, threshold: 63100 },
    { rate: 0.24, threshold: 100500 },
    { rate: 0.32, threshold: 191950 },
    { rate: 0.35, threshold: 243700 },
    { rate: 0.37, threshold: 609350 },
  ],
  capitalGainsBrackets: [
    { rate: 0.00, threshold: 0 },
    { rate: 0.15, threshold: 47025 },
    { rate: 0.20, threshold: 518900 }, // Rev. Proc. 2023-34 published single LTCG 20% floor
  ],
  ficaRules: {
    ssTaxRate: 0.062,
    medicareTaxRate: 0.0145,
    addMedicareTaxRate: 0.009,
    addMedicareThresholdSingle: 200000,
    addMedicareThresholdMfj: 250000,
    addMedicareThresholdMfs: 125000,
    ssWageBaseCap: 168600, // SSA taxable maximum, 2024 earnings
  },
  socialSecurityRules: {
    bendPoint1: 1174,
    bendPoint2: 7078,
    claimingMultipliers: {
      62: 0.70,
      63: 0.75,
      64: 0.80,
      65: 0.8667,
      66: 0.9333,
      67: 1.00,
      68: 1.08,
      69: 1.16,
      70: 1.24,
    },
  },
  niitRules: { rate: 0.038, thresholdSingle: 200000, thresholdMfj: 250000, thresholdMfs: 125000 },
  acaRules: { fplBaseSingle: 15060, fplMfjMultiplier: 1.35 },
  niitThreshold: '200000',
  contributionLimits: {
    ira: 7000,
    iraCatchUp: 1000,
    k401: 23000,
    k401CatchUp: 7500,
    k401SpecialCatchUp: 7500,
    hsaSingle: 4150,
    hsaFamily: 8300,
    hsaCatchUp: 1000,
  },
  giftEstateExemptions: { annualGiftLimit: 18000, lifetimeEstateLimit: 13610000 },
  fplAmount: '15060',
  secureActRules: { rmdAge: 73, inheritedIraYears: 10 },
};

/**
 * Full rule sets for tax years with published values. Missing top-level keys
 * are inherited from `DEFAULT_2026_RULES`.
 */
export const HISTORICAL_TAX_RULES: Record<number, SystemTaxRulesType> = {
  2024: mergeOnDefaults(YEAR_2024_OVERRIDES),
  2025: mergeOnDefaults(YEAR_2025_OVERRIDES),
};

/** The oldest tax year for which we store explicit statutory rules. */
export const MIN_HISTORICAL_TAX_YEAR = 2024;
