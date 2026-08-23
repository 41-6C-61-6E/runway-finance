/**
 * Shared investment transaction classification + monthly flow decomposition.
 *
 * Sign convention (app-wide, see `toCashFlowAmount`):
 *   positive ⇒ money into the account (dividend received, deposit, sell proceeds)
 *   negative ⇒ money out of the account  (buy, withdrawal, fee)
 *
 * Capital-flow decomposition (for the "how my capital is working" chart):
 *   - contributions:  positive external cash in  (deposits, transfers in)
 *   - withdrawals:    negative external cash out (withdrawals, fees, transfers out)
 *   - income:         dividends + interest (reinvestments handled separately)
 *   - growth/losses:  residual = snapshot balance change − all transaction flows
 *                     (captures market gains/losses, FX, and unrecorded flows)
 */

export type TransactionType =
  | 'dividend'
  | 'interest'
  | 'buy'
  | 'sell'
  | 'fee'
  | 'deposit'
  | 'withdrawal'
  | 'reinvestment'
  | 'transfer'
  | 'other';

export interface InvestmentTxnInput {
  description: string;
  payee?: string | null;
  amount: number;
}

/**
 * Order matters: more specific patterns must come before the ones they shadow.
 * Note that a reinvestment purchase ("AUTOMATIC REINVESTMENT — BOUGHT 0.4 SH VOO")
 * starts the account balance at ~0 and is an internal rotation, NOT income or an
 * external contribution — it is classified `reinvestment` and excluded from all
 * cash-flow buckets (net effect on the balance is zero: the cash dividend that
 * funded it is the only money that ever crossed the boundary).
 */
const KEYWORD_MAP: { keywords: string[]; type: TransactionType }[] = [
  // Capital contributions — must precede deposit/buy heuristics
  { keywords: ['contribution', 'direct deposit', 'funding', 'ach deposit', 'wire in', 'deposit to account'], type: 'deposit' },
  { keywords: ['rollover in', 'rollover into', 'rollover transfer in', 'transfer in: ', 'transfer in - ', 'transfer in from'], type: 'deposit' },
  // External withdrawals — must precede the generic transfer/fee rules
  { keywords: ['rollover out', 'rollover to', 'distribution to', 'transfer out: ', 'transfer out - ', 'transfer out to', 'journal out', 'wire out', 'ach withdrawal', 'withdrawal'], type: 'withdrawal' },
  // Dividends (capital gains distributions are dividend-equivalent income)
  { keywords: ['dividend', 'div ', 'div.', 'dividnd', 'qualified div', 'ordinary div', 'capital gain distribution', 'cap gain dst', 'short term cap gain', 'long term cap gain', 'special dividend'], type: 'dividend' },
  // Interest / yield
  { keywords: ['interest', 'int ', 'int.', 'accrued interest', 'yield', 'sec yield', 'fed mmkt div', 'interest payment', 'credit interest', 'cash dividend - money market'], type: 'interest' },
  // Reinvestments (DRIP purchases bought with the dividend cash)
  { keywords: ['reinvest', 'drip'], type: 'reinvestment' },
  // Trades
  { keywords: ['buy ', 'bought', 'purchase', 'acquired', 'market buy', 'limit buy', 'limit buy order'], type: 'buy' },
  { keywords: ['sell', 'sold', 'proceeds', 'redemption', 'market sell', 'limit sell'], type: 'sell' },
  // Fees & taxes withheld
  { keywords: ['fee', 'commission', 'expense ratio', 'management fee', 'advisory fee', 'service charge', 'margin interest', 'wire fee', 'foreign transaction fee', 'sec fee', 'tax withheld', ' withholding', 'backup withholding'], type: 'fee' },
  // Generic transfers (internal sweeps, journal entries, account-to-account)
  { keywords: ['transfer', 'journal', 'sweep'], type: 'transfer' },
];

export function classifyTransaction(description: string, payee: string | null, amount: number): TransactionType {
  const text = `${description ?? ''} ${payee ?? ''}`.toLowerCase();
  for (const { keywords, type } of KEYWORD_MAP) {
    if (keywords.some((kw) => text.includes(kw))) {
      return type;
    }
  }
  return 'other';
}

/** Types that count as investment income (cash earned by the portfolio). */
export const INCOME_TYPES: readonly TransactionType[] = ['dividend', 'interest'];
/** Types that are external capital *in*. */
export const CONTRIBUTION_TYPES: readonly TransactionType[] = ['deposit'];
/** Types that are external capital *out*. */
export const WITHDRAWAL_TYPES: readonly TransactionType[] = ['withdrawal', 'fee'];

export function isIncomeType(t: TransactionType): boolean {
  return (INCOME_TYPES as readonly string[]).includes(t);
}
export function isContributionType(t: TransactionType): boolean {
  return (CONTRIBUTION_TYPES as readonly string[]).includes(t);
}
export function isWithdrawalType(t: TransactionType): boolean {
  return (WITHDRAWAL_TYPES as readonly string[]).includes(t);
}
/** Reinvestments + internal transfers net to zero capital impact; they are shown for
 *  transparency but excluded from every bucket (and never mislabeled as income). */
export function isNeutralType(t: TransactionType): boolean {
  return t === 'reinvestment' || t === 'transfer';
}

/**
 * Bucket a signed cash-flow amount (positive in / negative out) into the
 * non-negative magnitude buckets used by the signed stacked-bar chart.
 * Returns `null` for internal/neutral flows.
 */
export function bucketCashFlow(
  type: TransactionType,
  amount: number
): { bucket: 'contributions' | 'withdrawals' | 'income'; mag: number } | null {
  if (amount === 0) return null;
  if (isNeutralType(type) || type === 'buy' || type === 'sell' || type === 'other') return null;
  if (isIncomeType(type)) {
    // Income transactions should be positive (money in). A negative "dividend"
    // (e.g. a clawback) nets against income.
    return { bucket: 'income', mag: Math.abs(amount) };
  }
  if (isContributionType(type)) {
    if (amount > 0) return { bucket: 'contributions', mag: amount };
    // A negative "deposit" is a corrected/reversed contribution — treat as withdrawal.
    return { bucket: 'withdrawals', mag: -amount };
  }
  if (isWithdrawalType(type)) {
    if (amount < 0) return { bucket: 'withdrawals', mag: -amount };
    // A positive "withdrawal" is a reversal — treat as contribution.
    return { bucket: 'contributions', mag: amount };
  }
  return null;
}

/** "YYYY-MM" of a date string (YYYY-MM-DD or ISO). */
export function yearMonthOf(dateStr: string): string {
  return String(dateStr).slice(0, 7);
}

/** Add (or subtract) whole months, clamped to the last day of the target month. */
export function addMonthsClamped(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map((v) => parseInt(v, 10));
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Inclusive list of "YYYY-MM" values from startMonth to endMonth. */
export function monthsBetween(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let cur = startMonth;
  let guard = 0;
  while (cur <= endMonth && guard < 600) {
    out.push(cur);
    cur = addMonthsClamped(cur, 1);
    guard++;
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface MonthlyFlow {
  month: string; // "YYYY-MM"
  contributions: number;
  withdrawals: number;
  income: number;
  growth: number;
  losses: number;
  net: number;
  /** Change in snapshot balance for the month (null when no snapshots exist). */
  delta: number | null;
}

export interface MonthlyFlowInput {
  /** month → contribution magnitude */
  contributions: Record<string, number>;
  /** month → withdrawal magnitude (fees included, as stored negative) */
  withdrawals: Record<string, number>;
  /** month → income magnitude (dividends + interest) */
  income: Record<string, number>;
  /** month → net signed cash flow of ALL classified txns (excl. reinvest/transfer) */
  cashFlows: Record<string, number>;
  /** month → (month-end balance − month-start balance), null if uncomputable */
  deltas: Record<string, number | null>;
}

/**
 * Assemble signed-stacked monthly series. Residual (growth/losses) is derived
 * from snapshot deltas when available:
 *
 *   growth − losses ≈ (endBal − startBal) − (contributions − withdrawals + income)
 *
 * When no snapshots exist for a month, growth/losses are reported as 0 and
 * `net` falls back to the net transaction flow so the chart still shows
 * contributions/withdrawals/income. `net` always equals the signed sum of the
 * five buckets, so the tooltip "Net change" matches the bar's visual height.
 */
export function buildMonthlyFlows(months: string[], input: MonthlyFlowInput): MonthlyFlow[] {
  return months.map((month) => {
    const contributions = round2(input.contributions[month] ?? 0);
    const withdrawals = round2(input.withdrawals[month] ?? 0);
    const income = round2(input.income[month] ?? 0);

    const delta = input.deltas[month] ?? null;
    let growth: number;
    let losses: number;
    if (delta !== null && delta !== undefined) {
      const residual = round2(delta - (contributions - withdrawals + income));
      growth = Math.max(0, residual);
      losses = Math.max(0, -residual);
    } else {
      // No balance snapshots: can't separate market growth from flows.
      growth = 0;
      losses = 0;
    }

    const net = round2(contributions - withdrawals + income + growth - losses);
    return { month, contributions, withdrawals, income, growth, losses, net, delta: delta !== null && delta !== undefined ? round2(delta) : null };
  });
}

/** Simple percent formatting helper (keeps components free of math). */
export function formatSignedPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
