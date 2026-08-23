/**
 * Shared investment transaction classification + monthly flow decomposition.
 *
 * Sign convention (app-wide — stored amounts in investment accounts):
 *   positive ⇒ money into the account (dividend received, deposit, sell proceeds)
 *   negative ⇒ money out of the account  (buy, withdrawal, fee)
 *
 * Capital-flow decomposition (for the "Capital Flow" chart):
 *   - contributions:  positive external cash in  (deposits, rollovers in)
 *   - withdrawals:    external cash out (withdrawals, fees)
 *   - income:         dividends + interest (reinvestments excluded)
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

/**
 * Order matters: more specific patterns must come before the ones they shadow.
 *
 * Matching is whole-word (see `matchesAny`), so every inflection is a separate
 * keyword ("fee" does not match "fees" or "fee reversals"; "buy" does not
 * match "buys" unless listed — both are listed).
 *
 * Trades come BEFORE the capital-flow rules: broker trade lines ("Investment
 * buy", "Investment purchase", "Limit sell order") must never be captured by
 * the deposit/withdrawal heuristics, since trades move no money across the
 * account boundary.
 *
 * Reinvestment purchases ("AUTOMATIC REINVESTMENT — BOUGHT 0.4 SH VOO") are an
 * internal rotation (cash dividend → shares): classified `reinvestment` and
 * excluded from all cash-flow buckets — the only money that ever crossed the
 * boundary is the dividend itself.
 *
 * "distribution" is deliberately NOT a standalone withdrawal keyword:
 * "Capital Gains Distribution" is income. Only explicit withdrawal phrasings
 * ("IRA distribution", "distribution to …") match as withdrawals.
 */
const KEYWORD_MAP: { keywords: string[]; type: TransactionType }[] = [
  // Reinvestments (DRIP purchases bought with the dividend cash)
  { keywords: ['reinvest', 'reinvestment', 'reinvested', 'reinvesting', 'drip', 'dripped'], type: 'reinvestment' },
  // Trades (internal reallocations — no money crosses the boundary)
  {
    keywords: [
      'buy',
      'buys',
      'bought',
      'purchase',
      'purchases',
      'purchased',
      'acquired',
      'acquisition',
      'market buy',
      'limit buy',
      'limit buy order',
    ],
    type: 'buy',
  },
  {
    keywords: ['sell', 'sells', 'sold', 'sale', 'proceeds', 'redemption', 'redemptions', 'market sell', 'limit sell'],
    type: 'sell',
  },
  // Fee reversals are corrections of fee lines, not capital flows
  {
    keywords: [
      'fee reversals',
      'fee reversal',
      'commission reversals',
      'commission reversal',
      'reversals: fee',
      'reversal: fee',
      'fee refunds',
      'fee refund',
    ],
    type: 'fee',
  },
  // Reversals of contributions/withdrawals — money back out (or back in);
  // the signed amount decides the bucket.
  { keywords: ['reversals', 'reversal'], type: 'withdrawal' },
  // External withdrawals / distributions
  {
    keywords: [
      'rollover out',
      'rollover to',
      '401k distribution',
      '457 distribution',
      '403b distribution',
      'ira distribution',
      'roth distribution',
      'distribution to',
      'distributions to',
      'transfer out: ',
      'transfer out - ',
      'transfer out to',
      'journal out',
      'wire out',
      'ach withdrawal',
      'withdrawals',
      'withdrawal',
    ],
    type: 'withdrawal',
  },
  // Capital contributions — after the trade, reversal & withdrawal rules above
  {
    keywords: [
      'contributions',
      'contribution',
      'deposits',
      'deposit',
      'deposit from',
      'deposit to account',
      'ach deposit',
      'direct deposit',
      'funding',
      'wire in',
      'rollover in',
      'rollover into',
      'rollover transfer in',
      'transfer in: ',
      'transfer in - ',
      'transfer in from',
    ],
    type: 'deposit',
  },
  // Fees & taxes withheld — "fee" after reversal/withdrawal rules; before the
  // interest rule since "margin interest" contains the word "interest".
  {
    keywords: [
      'fees',
      'fee',
      'commissions',
      'commission',
      'expense ratio',
      'margin interest',
      'interest charges',
      'interest charge',
      'interest penalty',
      'backup withholding',
      'withholding',
      'tax withheld',
    ],
    type: 'fee',
  },
  // Dividends (capital gains distributions are dividend-equivalent income)
  {
    keywords: [
      'dividends',
      'dividend',
      'div',
      'cap gain dst',
      'cap gain dist',
      'cap gains',
      'capital gains',
      'capital gain dst',
      'capital gain distribution',
    ],
    type: 'dividend',
  },
  // Interest / yield
  {
    keywords: [
      'interests',
      'interest',
      'accrued interest',
      'interest payments',
      'interest payment',
      'credit interest',
      'int',
      'yields',
      'yield',
      'sec yield',
      'fed mmkt div',
    ],
    type: 'interest',
  },
  // Generic transfers (internal sweeps, journal entries, account-to-account)
  { keywords: ['transfers', 'transfer', 'journals', 'journal', 'journal entry', 'sweeps', 'sweep'], type: 'transfer' },
];

/**
 * Word-boundary keyword match. Letters/digits on either side block a match
 * ("int" ≠ inside "interest", "buy" ≠ inside "buys" unless listed); anything
 * else — spaces, hyphens, colons, digits, sentence end — is a boundary.
 */
function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s+');
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text);
  });
}

export function classifyTransaction(description: string, payee: string | null, amount: number): TransactionType {
  const text = `${description ?? ''} ${payee ?? ''}`.toLowerCase();
  for (const { keywords, type } of KEYWORD_MAP) {
    if (matchesAny(text, keywords)) {
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
    // A negative "deposit" is a reversed/voided contribution — money back out.
    return { bucket: 'withdrawals', mag: -amount };
  }
  if (isWithdrawalType(type)) {
    // Magnitude-based: corrections arrive separately as "reversal" transactions,
    // so a mis-signed row simply counts as its magnitude in the outflow bucket.
    return { bucket: 'withdrawals', mag: Math.abs(amount) };
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
  /** month → withdrawal magnitude (fees included) */
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
