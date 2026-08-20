// ─── Tax & Financial Planning Constants ─────────────────────────────────────
// Note: For statutory tax calculations, use `DEFAULT_2026_RULES` or `getSystemTaxRules(taxYear)`.

export const CURRENT_TAX_YEAR = 2026;
export const DEFAULT_STANDARD_DEDUCTION = 15750;
export const DEFAULT_STANDARD_DEDUCTION_MFJ = 31500;
export const DEFAULT_STANDARD_DEDUCTION_HOH = 23625;

export const FI_TARGET_MULTIPLIER = 25;
export const DEFAULT_LIVING_EXPENSE = 60000;
export const DEFAULT_CURRENCY = 'USD';

export const ACA_BENCHMARKS = {
  ALE_FTE_HOURS: 16800,
  ALE_PT_HOURS: 8400,
  RATE: 0.085,
} as const;
