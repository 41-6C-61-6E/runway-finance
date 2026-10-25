/**
 * Shared classifier for cash-flow semantics across Runway Finance.
 * Matches monthlyCashFlow calculation rules in sync.ts and cash-flow.ts.
 */

export interface ClassifiableCategory {
  categoryType?: string | null;
  isIncome?: boolean | null;
  excludeFromReports?: boolean | null;
  parentId?: string | null;
}

/**
 * Checks whether a category or any of its parents is marked excludeFromReports.
 */
export function isExcludedFromReports(
  category: ClassifiableCategory | undefined,
  catById: Map<string, ClassifiableCategory>
): boolean {
  if (!category) return false;
  if (category.excludeFromReports) return true;
  if (category.parentId) {
    const parent = catById.get(category.parentId.toString());
    if (parent?.excludeFromReports) return true;
  }
  return false;
}

/**
 * Classifies a signed cash-flow amount into income / expense deltas.
 *
 * Rules:
 * - transfer: ignored for both income and expense
 * - compound: absolute amount added to BOTH income and expenses
 * - amount > 0:
 *     if category exists and is NOT income: refund/rebate -> subtracts from expenses (-amount)
 *     otherwise: normal income -> adds to income (+amount)
 * - amount < 0:
 *     if category exists and IS income: income reversal/clawback -> subtracts |amount| from income
 *     otherwise: normal expense -> adds |amount| to expenses
 */
export function classifyCashFlowAmount(
  amount: number,
  category: ClassifiableCategory | undefined
): { income: number; expenses: number; isTransfer: boolean } {
  if (category?.categoryType === 'transfer') {
    return { income: 0, expenses: 0, isTransfer: true };
  }

  if (category?.categoryType === 'compound') {
    const absAmt = Math.abs(amount);
    return { income: absAmt, expenses: absAmt, isTransfer: false };
  }

  let income = 0;
  let expenses = 0;

  if (amount > 0) {
    if (category && !category.isIncome) {
      // Refund / rebate against expenses
      expenses -= amount;
    } else {
      income += amount;
    }
  } else if (amount < 0) {
    const absAmt = Math.abs(amount);
    if (category && category.isIncome) {
      // Income reversal / deduction
      income -= absAmt;
    } else {
      expenses += absAmt;
    }
  }

  return { income, expenses, isTransfer: false };
}
