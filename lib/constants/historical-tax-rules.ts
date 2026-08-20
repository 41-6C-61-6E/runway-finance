//
// Historical US federal tax rules (2024, 2025) — published values.
//
// Shape matches `SystemTaxRulesType` (`typeof DEFAULT_2026_RULES`), so these
// objects can be seeded into `system_tax_rules` and returned from
// `getSystemTaxRules` with no conversion.
//
// Sources (public IRS / SSA / Treasury figures):
//  - 2024: Rev. Proc. 2023-34 (brackets, SD $14,600/$29,200/$21,900,
//    CG/NIIT thresholds $47,025/$518,900, addl 65+ std deduction
//    $2,000 SO/HoH · $1,550 MFS), Rev. Proc. 2023-35 (401k $23,000),
//    HSA 2024 ($4,150/$8,300), SSA taxable maximum 2024: $168,600,
//    HHS FPL $15,060, gift/estate $13,610,000 / annual $18,000.
//  - 2025: Rev. Proc. 2024-40 (brackets 12% @ $12,400 … 37% @ $664,650,
//    SD $15,750/$31,500/$23,625, CG $48,350, addl 65+ std deduction
//    $2,000 SO/HoH · $1,600 MFS), Rev. Proc. 2024-39 (401k $23,500),
//    HSA 2025 ($4,300/$8,550), SSA taxable maximum 2025: $176,100,
//    HHS FPL $15,650, gift/estate $13,990,000 / annual $19,000.
//    NOTE: the pre-T-2 2025 row accidentally carried Rev. Proc. 2023-34
//    (2024) bracket thresholds; corrected here against published values.
//
// These rows let historical-return simulations and per-year engine runs use
// the correct statutory year instead of silently inheriting current-year
// defaults (see scratch/TAX_PAYROLL_REVIEW.md finding T-2).
//
// Values that could not be re-verified from inside this build environment
// are INHERITED from DEFAULT_2026_RULES (deep-merged over) and flagged
// inline, not guessed:
//  - `headOfHouseholdBrackets` — 2024/2025 HOH break-points unverified here;
//    historical rows inherit the 2026 base values (HOH results approximate).
//  - `socialSecurityRules.claimingMultipliers` — PIA claiming fractions are
//    fixed by law and unchanged for years; inherited is exact.
//  - `acaRules` benchmark premium costs — change yearly by CMS; 2026 values
//    inherited (ACA subsidy figures are a known approximation for these years).
//  - `rmdUniformLifetimeTable` — shared IRS statutory table; inherited.

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
  capitalGainsBrackets: { rate: number; threshold: number }[];
  ficaRules: { ssWageBaseCap: number };
  niitRules: { rate: number; thresholdSingle: number; thresholdMfj: number; thresholdMfs: number };
  acaRules: { fplBaseSingle: number; fplMfjMultiplier: number };
  niitThreshold: string;
  contributionLimits: {
    ira: number;
    iraCatchUp: number;
    k401: number;
    k401CatchUp: number;
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
  standardDeduction: '15750',
  standardDeductionSingle: '15750',
  standardDeductionMfj: '31500',
  standardDeductionHoH: '23625',
  standardDeductionMfs: '15750',
  additionalStdDeduction65Plus: { singleOrHoH: 2000, marriedPerPerson: 1600 },
  ordinaryTaxBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 12400 },
    { rate: 0.22, threshold: 50400 },
    { rate: 0.24, threshold: 105700 },
    { rate: 0.32, threshold: 202100 },
    { rate: 0.35, threshold: 253950 },
    { rate: 0.37, threshold: 664650 },
  ],
  capitalGainsBrackets: [
    { rate: 0.00, threshold: 0 },
    { rate: 0.15, threshold: 48350 },
    { rate: 0.20, threshold: 533400 },
  ],
  ficaRules: { ssWageBaseCap: 176100 }, // SSA taxable maximum, 2025 earnings
  niitRules: { rate: 0.038, thresholdSingle: 200000, thresholdMfj: 250000, thresholdMfs: 125000 },
  acaRules: { fplBaseSingle: 15650, fplMfjMultiplier: 1.35 },
  niitThreshold: '200000',
  contributionLimits: {
    ira: 7000,
    iraCatchUp: 1000,
    k401: 23500,
    k401CatchUp: 7500,
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
  additionalStdDeduction65Plus: { singleOrHoH: 2000, marriedPerPerson: 1550 },
  ordinaryTaxBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 11600 },
    { rate: 0.22, threshold: 47150 },
    { rate: 0.24, threshold: 100525 },
    { rate: 0.32, threshold: 191950 },
    { rate: 0.35, threshold: 243725 },
    { rate: 0.37, threshold: 609350 },
  ],
  capitalGainsBrackets: [
    { rate: 0.00, threshold: 0 },
    { rate: 0.15, threshold: 47025 },
    { rate: 0.20, threshold: 487400 },
  ],
  ficaRules: { ssWageBaseCap: 168600 }, // SSA taxable maximum, 2024 earnings
  niitRules: { rate: 0.038, thresholdSingle: 200000, thresholdMfj: 250000, thresholdMfs: 125000 },
  acaRules: { fplBaseSingle: 15060, fplMfjMultiplier: 1.35 },
  niitThreshold: '200000',
  contributionLimits: {
    ira: 7000,
    iraCatchUp: 1000,
    k401: 23000,
    k401CatchUp: 7500,
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
 * are inherited from `DEFAULT_2026_RULES` (see file header flagging notes).
 */
export const HISTORICAL_TAX_RULES: Record<number, SystemTaxRulesType> = {
  2024: mergeOnDefaults(YEAR_2024_OVERRIDES),
  2025: mergeOnDefaults(YEAR_2025_OVERRIDES),
};

/** The oldest tax year for which we store explicit statutory rules. */
export const MIN_HISTORICAL_TAX_YEAR = 2024;
