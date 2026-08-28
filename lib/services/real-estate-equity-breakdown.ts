/**
 * Pure computation for the "Asset Breakdown" bar on real estate cards.
 *
 * Decomposes a property's current value into:
 *   - Down Payment and Loan Costs: initial equity bucket (purchase price - original loan)
 *   - Principal Paid: all principal paid off to date (across refinances)
 *   - Appreciation: market growth above purchase price
 *   - Mortgage Owed: remaining balance on active loan(s)
 *
 * Refinance/paid-off loans are tracked via per-loan metadata:
 *   - mortgageStatus: 'active' | 'paid_off' | 'refinanced'
 *   - refinancedByLoanId: id of the new loan (when refinanced)
 *   - payoffBalance: balance paid off at close (when refinanced/paid_off)
 *   - purchaseDate: used to identify the original purchase-time loan
 */

export interface EquityBreakdownMortgage {
  id: string;
  name?: string;
  balance: number; // stored negative for liabilities
  originalLoanAmount: number;
  metadata?: Record<string, unknown>;
}

export interface EquityBreakdownResult {
  totalValue: number;
  downPayment: number;
  principalPaid: number;
  appreciation: number;
  mortgageOwed: number;
  totalEquity: number;
  /** Percent of current property value for each attribution bucket. */
  downPaymentPct: number;
  principalPaidPct: number;
  appreciationPct: number;
  mortgageOwedPct: number;
  totalEquityPct: number;
  /** Purchase price used when metadata.purchasePrice is absent/invalid. */
  effectivePurchasePrice: number;
  isWhollyOwned: boolean;
  isUnderwater: boolean;
}

const CLOSED_MORTGAGE_STATUSES = ['paid_off', 'refinanced'];

function toMetadataNumber(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : 0;
}

/**
 * Compute the equity breakdown for a property.
 *
 * @param propertyValue Current (estimated or manual) property value.
 * @param purchasePrice Purchase price from property metadata (falls back to
 *        initialValue, then an 80% LTV estimate of the original loan, then
 *        current value).
 * @param initialValue Legacy/initial value stored on the property metadata.
 * @param mortgages ALL linked mortgages (active + closed).
 */
export function computeEquityBreakdown(
  propertyValue: number,
  purchasePrice?: number,
  initialValue?: number,
  mortgages: EquityBreakdownMortgage[] = [],
): EquityBreakdownResult {
  const val = Math.max(0, propertyValue);
  if (val === 0) {
    return {
      totalValue: 0,
      downPayment: 0,
      principalPaid: 0,
      appreciation: 0,
      mortgageOwed: 0,
      totalEquity: 0,
      downPaymentPct: 0,
      principalPaidPct: 0,
      appreciationPct: 0,
      mortgageOwedPct: 0,
      totalEquityPct: 0,
      effectivePurchasePrice: 0,
      isWhollyOwned: true,
      isUnderwater: false,
    };
  }

  const meta = (m: EquityBreakdownMortgage): Record<string, unknown> => m.metadata ?? {};
  const isClosed = (m: EquityBreakdownMortgage): boolean =>
    CLOSED_MORTGAGE_STATUSES.includes(String(meta(m).mortgageStatus ?? ''));
  const originalOf = (m: EquityBreakdownMortgage): number =>
    toMetadataNumber(m.originalLoanAmount) || Math.abs(m.balance);
  const loanDate = (m: EquityBreakdownMortgage): string => {
    const d = String(meta(m).purchaseDate ?? '');
    return d || '9999-12-31';
  };

  const activeMortgages = mortgages.filter((m) => !isClosed(m));
  const closedMortgages = mortgages.filter(isClosed);

  const currentTotalMortgage = activeMortgages.reduce((sum, m) => sum + Math.abs(m.balance), 0);

  // The purchase-time loan (oldest purchaseDate) establishes the original
  // financing; closed loans that refinance it out inherit its funding role.
  const purchaseTimeLoan =
    [...mortgages].sort((a, b) => loanDate(a).localeCompare(loanDate(b)) || a.id.localeCompare(b.id))[0] ?? null;

  // With no closed loans, all active loans belong to the original financing
  // (for example, a first mortgage plus a HELOC). Once a loan has been
  // refinanced or paid off, use the original purchase-time loan as the
  // funding baseline so the refinance chain is not double-counted.
  const originalTotalMortgage = closedMortgages.length === 0
    ? activeMortgages.reduce((sum, m) => sum + originalOf(m), 0)
    : purchaseTimeLoan
      ? originalOf(purchaseTimeLoan)
      : activeMortgages.reduce((sum, m) => sum + originalOf(m), 0);

  // Determine purchase price or best estimate
  const explicitPurchasePrice = purchasePrice && purchasePrice > 0 ? purchasePrice : undefined;
  let pp = explicitPurchasePrice;
  if (!pp) {
    if (initialValue && initialValue > 0) {
      pp = initialValue;
    } else if (originalTotalMortgage > 0) {
      // Assume standard 20% down payment (80% LTV)
      pp = originalTotalMortgage / 0.8;
    } else {
      pp = val;
    }
  }

  // 1. Mortgage Balance Still Owed (active loans only)
  const mortgageOwed = currentTotalMortgage;

  // 2. Principal paid off = paydown on active loans + principal paid on
  //    closed loans. For a refinance, `payoffBalance` is the balance that
  //    remained on the old loan, so prior principal paid is original minus
  //    that balance. A paid-off loan contributes its full original amount;
  //    the final payoff itself is the last principal payment.
  const activeOriginal = activeMortgages.reduce((sum, m) => sum + originalOf(m), 0);
  const principalPaid =
    Math.max(0, activeOriginal - currentTotalMortgage) +
    closedMortgages.reduce((sum, m) => {
      const original = originalOf(m);
      if (String(meta(m).mortgageStatus ?? '') === 'paid_off') return sum + original;
      const payoffBalance = toMetadataNumber(meta(m).payoffBalance);
      return sum + Math.max(0, original - payoffBalance);
    }, 0);

  // 3. Down Payment and Loan Costs (Initial Equity at Purchase)
  const downPayment = Math.max(0, pp - originalTotalMortgage);

  // 4. Value Appreciation (Market Growth)
  const appreciation = Math.max(0, val - pp);

  // Handle edge case: Depreciated / Underwater property
  // “Underwater” here describes a property whose current value is below its
  // recorded purchase price. A debt balance above the property value is also
  // underwater in the conventional sense.
  const isUnderwater = val < pp || currentTotalMortgage > val;
  const computedTotalEquity = Math.max(0, val - currentTotalMortgage);

  if (val < pp) {
    // Property lost value: appreciation is 0, scale down payment / principal
    // paid to fit actual equity (components are best-effort attribution).
    const initialTotalEquity = downPayment + principalPaid;
    const ratio = initialTotalEquity > 0 ? Math.min(1, computedTotalEquity / initialTotalEquity) : 0;
    return scaleDown(val, pp, downPayment * ratio, principalPaid * ratio, 0, mortgageOwed, isUnderwater, activeMortgages.length, currentTotalMortgage);
  }

  return {
    totalValue: val,
    downPayment,
    principalPaid,
    appreciation,
    mortgageOwed,
    totalEquity: Math.max(0, val - mortgageOwed),
    downPaymentPct: (downPayment / val) * 100,
    principalPaidPct: (principalPaid / val) * 100,
    appreciationPct: (appreciation / val) * 100,
    mortgageOwedPct: (mortgageOwed / val) * 100,
    totalEquityPct: (Math.max(0, val - mortgageOwed) / val) * 100,
    effectivePurchasePrice: pp,
    isWhollyOwned: activeMortgages.length === 0 || currentTotalMortgage === 0,
    isUnderwater,
  };
}

function scaleDown(
  val: number,
  pp: number,
  dp: number,
  pr: number,
  ap: number,
  mortgageOwed: number,
  isUnderwater: boolean,
  activeCount: number,
  currentBalance: number,
): EquityBreakdownResult {
  const totalEquity = Math.max(0, val - mortgageOwed);
  return {
    totalValue: val,
    downPayment: dp,
    principalPaid: pr,
    appreciation: ap,
    mortgageOwed,
    totalEquity,
    downPaymentPct: (dp / val) * 100,
    principalPaidPct: (pr / val) * 100,
    appreciationPct: (ap / val) * 100,
    mortgageOwedPct: (mortgageOwed / val) * 100,
    totalEquityPct: (totalEquity / val) * 100,
    effectivePurchasePrice: pp,
    isWhollyOwned: activeCount === 0 || currentBalance === 0,
    isUnderwater,
  };
}
