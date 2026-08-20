/**
 * ── L-1 (scratch/TAX_PAYROLL_REVIEW.md): shared progressive-tax helpers. ──
 *
 * The retirement engine previously inlined the same bracket-walk loop three
 * times and modeled state income tax as a flat "modifier" applied to taxable
 * income. Graduated states (CA, NY, NJ) behave very differently from flat
 * ones (FL, CO, TN): a flat 9% on $300k gross overstates the tax on the low
 * dollars and understates it on the top marginal dollars.
 *
 * These helpers are the single source of truth for the walk, and — via
 * `computeStateTax` — let a plan opt into a real state bracket table
 * (`stateTaxBrackets` + `stateTaxStandardDeduction` on the plan settings)
 * while plans without the table fall back to the exact prior flat-rate
 * behavior (bit-identical when no table is set).
 */

export interface TaxBracket {
  /** Inclusive lower threshold (0 for the first bracket). */
  threshold: number;
  /** Marginal rate applied to income from `threshold` up to the next bracket. */
  rate: number;
}

/**
 * Progressive bracket walk: tax owed on `taxableIncome` given ascending
 * brackets. Equivalent to the engine's inline loops; extracted so the same
 * math serves federal ordinary income, federal capital gains, and the
 * optional state table.
 */
export function computeBracketTax(
  taxableIncome: number,
  brackets: TaxBracket[],
  scale: number = 1
): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const thresh = b.threshold * scale;
    if (taxableIncome > thresh) {
      const nextB = brackets[i + 1];
      const nextThresh = nextB ? nextB.threshold * scale : Infinity;
      const taxableChunk = Math.min(taxableIncome - thresh, nextThresh - thresh);
      tax += taxableChunk * b.rate;
    }
  }
  return tax;
}

export interface StateTaxConfig {
  /** Optional state code (for display only, e.g. "CA"). */
  stateCode?: string;
  /**
   * Graduated state brackets (ascending thresholds). When present and
   * non-empty, state tax is computed progressively with an optional flat
   * "floor" rate applied to the first dollars of *gross* income (CA uses
   * `tax = 1%×gross + progressive(AGI − floor×gross − stdDed)`).
   */
  stateTaxBrackets?: TaxBracket[];
  /** Flat state standard deduction (base-year dollars; inflated like the federal one). */
  stateTaxStandardDeduction?: number;
  /** Optional flat floor rate on gross (CA: 1.0 meaning 1%). Default 0. */
  stateGrossFloorRate?: number;
  /** MFJ threshold multiplier (2 for married filing jointly). Default 1. */
  bracketMultOverride?: number;
}

/**
 * State income tax for one simulation year.
 *
 * - No brackets configured → the historical flat modifier:
 *   `taxableOrdinary × (incomeTaxModifier / 100)`, bit-identical to the
 *   pre-L-1 engine behavior.
 * - Brackets configured → optional gross floor + progressive walk on
 *   (taxableOrdinary − state standard deduction), never below zero.
 *
 * `scale` is the same inflation-compounding factor the engine multiplies
 * federal thresholds by, so state brackets drift with inflation identically.
 * `bracketsScaleMultiplier` covers married-filing-joint threshold doubling.
 */
export function computeStateTax(
  taxableOrdinary: number,
  grossIncome: number,
  incomeTaxModifier: number,
  cfg: StateTaxConfig | undefined,
  scale: number = 1
): number {
  const modifierRate = (incomeTaxModifier || 0) / 100;
  const brackets = cfg?.stateTaxBrackets;

  if (!brackets || brackets.length === 0) {
    // Flat-modifier fallback — legacy behavior, unchanged for existing plans.
    return taxableOrdinary * modifierRate;
  }

  const scaleFactor = scale * (cfg.bracketMultOverride ?? 1);
  const stdDed = (cfg.stateTaxStandardDeduction || 0) * scaleFactor;
  const floorRate = (cfg.stateGrossFloorRate || 0) / 100;
  const base = Math.max(0, taxableOrdinary - stdDed);
  return grossIncome * floorRate + computeBracketTax(base, brackets, scaleFactor);
}

/**
 * A few well-known state tables (base-year figures, single filer) so the UI
 * can prefill them. Thresholds/rates are from each state's published
 * schedule (2025/2026 figures as available); they are *defaults the user can
 * edit* — not an authoritative tax calculation. MFJ: double thresholds ×2
 * in the UI or engine before simulating.
 */
export const STATE_TAX_TABLE_PRESETS: Record<
  string,
  { name: string; brackets: TaxBracket[]; stdDeduction: number; grossFloorRate?: number }
> = {
  CA: {
    name: 'California',
    brackets: [
      { threshold: 0, rate: 0.01 },
      { threshold: 10516, rate: 0.02 },
      { threshold: 24146, rate: 0.04 },
      { threshold: 37776, rate: 0.06 },
      { threshold: 48292, rate: 0.08 },
      { threshold: 61922, rate: 0.093 },
      { threshold: 341368, rate: 0.103 },
      { threshold: 426711, rate: 0.113 },
      { threshold: 437226, rate: 0.123 },
      { threshold: 619224, rate: 0.133 },
    ],
    stdDeduction: 5363,
  },
  NY: {
    name: 'New York',
    brackets: [
      { threshold: 0, rate: 0.04 },
      { threshold: 8500, rate: 0.055 },
      { threshold: 11700, rate: 0.06 },
      { threshold: 13900, rate: 0.0685 },
      { threshold: 80650, rate: 0.0585 },
      { threshold: 215400, rate: 0.0882 },
      { threshold: 806500, rate: 0.0965 },
      { threshold: 2500000, rate: 0.103 },
      { threshold: 5000000, rate: 0.109 },
      { threshold: 25000000, rate: 0.14 },
    ],
    stdDeduction: 0,
  },
  NJ: {
    name: 'New Jersey',
    brackets: [
      { threshold: 0, rate: 0.014 },
      { threshold: 20000, rate: 0.02 },
      { threshold: 35000, rate: 0.035 },
      { threshold: 40000, rate: 0.05525 },
      { threshold: 75000, rate: 0.0637 },
      { threshold: 500000, rate: 0.0897 },
      { threshold: 1000000, rate: 0.1075 },
    ],
    stdDeduction: 0,
  },
  FL: { name: 'Florida (no state income tax)', brackets: [], stdDeduction: 0 },
  CO: { name: 'Colorado (flat)', brackets: [{ threshold: 0, rate: 0.044 }], stdDeduction: 0 },
  TN: {
    name: 'Tennessee (BUT: flat ~0.25% on income, tax-free after 2025)',
    brackets: [{ threshold: 0, rate: 0.0025 }],
    stdDeduction: 0,
  },
};
