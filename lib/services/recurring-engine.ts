import { logger } from '@/lib/logger';

export interface RawTransactionInput {
  id: string;
  accountId: string;
  amount: number | string;
  description: string;
  payee?: string | null;
  date: string;
  categoryId?: string | null;
  categoryName?: string | null;
  isIncome?: boolean;
}

export interface DetectedRecurringStream {
  id: string;
  name: string;
  payee: string;
  normalizedName: string;
  amount: number;
  type: 'income' | 'subscription' | 'bill' | 'loan' | 'transfer' | 'other';
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly';
  intervalDays: number;
  anchorDate: string;
  nextExpectedDate: string;
  accountId: string | null;
  categoryId: string | null;
  isAutoDetected: boolean;
  isConfirmed: boolean;
  isActive: boolean;
  confidence: number;
  isVariableAmount: boolean;
  averageAmount: number;
  matchedTransactionIds: string[];
  lastOccurrenceDate: string;
  status: 'active' | 'upcoming_soon' | 'overdue' | 'paused';
  priceHistory?: Array<{ date: string; amount: number }>;
}

export interface ForecastDayEvent {
  id: string;
  name: string;
  amount: number;
  type: 'income' | 'subscription' | 'bill' | 'loan' | 'transfer' | 'other' | 'one_off';
  accountId?: string | null;
  streamId?: string;
  isCustom?: boolean;
}

export interface BalanceForecastPoint {
  date: string;
  totalBalance: number;
  accounts: Record<string, number>;
  inflows: number;
  outflows: number;
  netDelta: number;
  events: ForecastDayEvent[];
}

export interface ForecastSummary {
  currentBalance: number;
  projectedEndBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string;
  totalUpcomingInflows: number;
  totalUpcomingOutflows: number;
  netProjectedSavings: number;
  safeToSpendDaily: number;
  runwayDays: number | null; // null if indefinite (> horizon)
  subscriptionMonthlyTotal: number;
  subscriptionYearlyTotal: number;
  billsMonthlyTotal: number;
  incomeMonthlyTotal: number;
  activeStreamsCount: number;
}

export interface SubscriptionInsight {
  type: 'price_increase' | 'duplicate_category' | 'high_burn' | 'upcoming_renewal';
  title: string;
  description: string;
  streamId?: string;
  streamName?: string;
  oldAmount?: number;
  newAmount?: number;
  impactMonthly?: number;
  severity: 'info' | 'warning' | 'critical';
}

// ── 1. Merchant Normalization & Cleaning ─────────────────────────────────────

const SUBSCRIPTION_KEYWORDS = new Set([
  'netflix', 'spotify', 'hulu', 'disney', 'disney+', 'hbo', 'max', 'apple.com', 'apple', 'icloud',
  'youtube', 'prime video', 'amazon prime', 'amzn prime', 'openai', 'chatgpt', 'github', 'adobe',
  'audible', 'patreon', 'slack', 'dropbox', 'medium', 'nytimes', 'wsj', 'claude', 'anthropic',
  'google one', 'playstation', 'psn', 'xbox', 'game pass', 'nintendo', 'paramount', 'peacock',
  'curiositystream', 'crunchyroll', '1password', 'bitwarden', 'dashlane', 'nordvpn', 'expressvpn',
  'grammarly', 'duolingo', 'headspace', 'calm', 'strava', 'whoop', 'peloton', 'fitbit', 'gym',
  'planet fitness', 'equinox', 'anytime fitness', 'chewy', 'barkbox', 'hellofresh', 'blue apron'
]);

const BILL_KEYWORDS = new Set([
  'electric', 'energy', 'power', 'edison', 'coned', 'pge', 'water', 'sewer', 'gas',
  'internet', 'comcast', 'xfinity', 'at&t', 'verizon', 't-mobile', 'spectrum', 'charter',
  'cox', 'centurylink', 'frontier', 'insurance', 'geico', 'progressive', 'state farm',
  'allstate', 'liberty mutual', 'usaa', 'metlife', 'prudential', 'anthem', 'cigna', 'aetna',
  'humana', 'kaiser', 'trash', 'waste management', 'hoa', 'condo fee'
]);

const LOAN_KEYWORDS = new Set([
  'mortgage', 'rent', 'auto loan', 'student loan', 'car loan', 'chase auto', 'toyota financial',
  'honda financial', 'ford credit', 'navient', 'nelnet', 'fedloan', 'sofi', 'lendingclub',
  'marcus', 'discover personal', 'earnest', 'mohela', 'aidvantage'
]);

const INCOME_KEYWORDS = new Set([
  'payroll', 'direct dep', 'direct deposit', 'salary', 'wages', 'adp', 'gusto', 'paychex',
  'workday', 'intuit payroll', 'employer', 'stipend', 'dividend', 'interest payment'
]);

export function normalizePayee(rawName: string): string {
  if (!rawName) return 'Unknown';
  let cleaned = rawName.trim();

  // Strip prefixes like "SQ *", "TST*", "PAYPAL *", "AMZN MKTP", etc.
  cleaned = cleaned.replace(/^(SQ\s*\*|TST\s*\*|PAYPAL\s*\*|AMZN\s*MKTP\s*|AMAZON\s*COM\s*|CHECKCARD\s*|DEBIT\s*CARD\s*PURCHASE\s*|ACH\s*(DEPOSIT|DEBIT)\s*|DIRECT\s*DEP(OSIT)?\s*|POS\s*PURCHASE\s*)/i, '');

  // Strip trailing transaction reference IDs, dates, phone numbers, state codes
  cleaned = cleaned.replace(/#\d+|\*\w+|\b\d{4,}\b|\b[A-Z]{2}\s+\d{5}\b/gi, '');
  cleaned = cleaned.replace(/\s+(CA|NY|TX|FL|WA|IL|OH|PA|NC|GA|VA|MA|AZ|CO|OR|NV)\b/gi, '');
  cleaned = cleaned.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Clean trailing punctuation
  cleaned = cleaned.replace(/[-*._,]+$/, '').trim();

  if (!cleaned) return rawName.trim();

  // Common title casing
  return cleaned
    .split(' ')
    .map((w) => (w.length <= 3 && !['THE', 'AND', 'FOR', 'COM', 'INC', 'LLC'].includes(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export function classifyStreamType(
  normalizedName: string,
  amount: number,
  categoryName?: string | null,
  isIncome?: boolean
): 'income' | 'subscription' | 'bill' | 'loan' | 'transfer' | 'other' {
  if (isIncome === true) return 'income';

  const lower = (normalizedName + ' ' + (categoryName || '')).toLowerCase();

  for (const kw of INCOME_KEYWORDS) {
    if (lower.includes(kw)) return 'income';
  }
  for (const kw of LOAN_KEYWORDS) {
    if (lower.includes(kw)) return 'loan';
  }
  for (const kw of SUBSCRIPTION_KEYWORDS) {
    if (lower.includes(kw)) return 'subscription';
  }
  for (const kw of BILL_KEYWORDS) {
    if (lower.includes(kw)) return 'bill';
  }

  const catLower = (categoryName || '').toLowerCase();
  if (catLower.includes('income') || catLower.includes('salary') || catLower.includes('payroll')) return 'income';
  if (catLower.includes('transfer')) return 'transfer';
  if (catLower.includes('subscription') || catLower.includes('entertainment') || catLower.includes('software')) return 'subscription';
  if (catLower.includes('utility') || catLower.includes('bill') || catLower.includes('insurance') || catLower.includes('telecom')) return 'bill';
  if (catLower.includes('housing') || catLower.includes('rent') || catLower.includes('mortgage') || catLower.includes('loan')) return 'loan';

  return 'subscription';
}

// ── 2. Periodicity & Interval Detection ──────────────────────────────────────

interface IntervalAnalysis {
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly';
  intervalDays: number;
  confidence: number;
  meanDelta: number;
}

export function analyzeIntervals(dates: string[]): IntervalAnalysis | null {
  if (dates.length < 2) return null;

  // Sort dates ascending
  const sortedDates = [...dates].sort();
  const timestamps = sortedDates.map((d) => new Date(d + 'T00:00:00Z').getTime());
  const deltas: number[] = [];

  for (let i = 1; i < timestamps.length; i++) {
    const diffDays = Math.round((timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) deltas.push(diffDays);
  }

  if (deltas.length === 0) return null;

  const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  const variance = deltas.reduce((sum, d) => sum + Math.pow(d - meanDelta, 2), 0) / deltas.length;
  const stdDev = Math.sqrt(variance);

  // Check Weekly (6-8 days)
  if (meanDelta >= 5.5 && meanDelta <= 8.5 && stdDev <= 2.5) {
    const conf = Math.min(100, Math.round(75 + (dates.length >= 3 ? 20 : 0) - stdDev * 4));
    return { frequency: 'weekly', intervalDays: 7, confidence: Math.max(50, conf), meanDelta };
  }

  // Check Bi-weekly (12-16 days)
  if (meanDelta >= 12 && meanDelta <= 16.5 && stdDev <= 3.5) {
    const conf = Math.min(100, Math.round(80 + (dates.length >= 3 ? 15 : 0) - stdDev * 3));
    return { frequency: 'biweekly', intervalDays: 14, confidence: Math.max(50, conf), meanDelta };
  }

  // Check Semi-monthly (13-17 days with characteristic 1st/15th or 15th/end-of-month pattern)
  const daysOfMonth = sortedDates.map((d) => parseInt(d.split('-')[2], 10));
  const hasFirstHalf = daysOfMonth.some((day) => day <= 5 || (day >= 28 && day <= 31));
  const hasMidMonth = daysOfMonth.some((day) => day >= 13 && day <= 17);
  if (meanDelta >= 13 && meanDelta <= 18 && hasFirstHalf && hasMidMonth) {
    const conf = Math.min(100, Math.round(85 + (dates.length >= 4 ? 10 : 0)));
    return { frequency: 'semimonthly', intervalDays: 15, confidence: conf, meanDelta };
  }

  // Check Monthly (26-34 days)
  if (meanDelta >= 26 && meanDelta <= 34.5 && stdDev <= 5.5) {
    const conf = Math.min(100, Math.round(80 + (dates.length >= 3 ? 15 : 0) - stdDev * 2));
    return { frequency: 'monthly', intervalDays: 30, confidence: Math.max(50, conf), meanDelta };
  }

  // Check Quarterly (82-98 days)
  if (meanDelta >= 82 && meanDelta <= 98 && stdDev <= 10) {
    const conf = Math.min(100, Math.round(75 + (dates.length >= 3 ? 15 : 0)));
    return { frequency: 'quarterly', intervalDays: 91, confidence: conf, meanDelta };
  }

  // Check Yearly (350-380 days)
  if (meanDelta >= 350 && meanDelta <= 380 && stdDev <= 15) {
    const conf = Math.min(100, Math.round(75 + (dates.length >= 3 ? 15 : 0)));
    return { frequency: 'yearly', intervalDays: 365, confidence: conf, meanDelta };
  }

  return null;
}

// ── 3. Next Date Calculation ─────────────────────────────────────────────────

export function calculateNextExpectedDate(
  lastDateStr: string,
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly',
  todayStr?: string
): string {
  const today = todayStr ? new Date(todayStr + 'T00:00:00Z') : new Date();
  today.setUTCHours(0, 0, 0, 0);

  let current = new Date(lastDateStr + 'T00:00:00Z');
  const anchorDay = current.getUTCDate();

  // Advance iteratively until next date is in the future (>= today)
  let guard = 0;
  while (current.getTime() < today.getTime() && guard < 120) {
    guard++;
    switch (frequency) {
      case 'weekly':
        current.setUTCDate(current.getUTCDate() + 7);
        break;
      case 'biweekly':
        current.setUTCDate(current.getUTCDate() + 14);
        break;
      case 'semimonthly': {
        const day = current.getUTCDate();
        if (day <= 10) {
          current.setUTCDate(15);
        } else if (day <= 20) {
          // Advance to end of month / 1st of next month
          current.setUTCMonth(current.getUTCMonth() + 1, 1);
        } else {
          current.setUTCDate(15);
          current.setUTCMonth(current.getUTCMonth() + 1);
        }
        break;
      }
      case 'monthly': {
        const targetMonth = current.getUTCMonth() + 1;
        const targetYear = current.getUTCFullYear();
        const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const targetDay = Math.min(anchorDay, daysInTargetMonth);
        current = new Date(Date.UTC(targetYear, targetMonth, targetDay));
        break;
      }
      case 'quarterly': {
        const targetMonth = current.getUTCMonth() + 3;
        const targetYear = current.getUTCFullYear();
        const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const targetDay = Math.min(anchorDay, daysInTargetMonth);
        current = new Date(Date.UTC(targetYear, targetMonth, targetDay));
        break;
      }
      case 'yearly': {
        current.setUTCFullYear(current.getUTCFullYear() + 1);
        break;
      }
    }
  }

  return current.toISOString().split('T')[0];
}

// ── 4. Detection Engine Main Pipeline ────────────────────────────────────────

export function detectRecurringStreams(
  transactions: RawTransactionInput[],
  options: {
    minOccurrences?: number;
    lookbackDays?: number;
    referenceDate?: string;
  } = {}
): DetectedRecurringStream[] {
  const minOccurrences = options.minOccurrences ?? 2;
  const refDateStr = options.referenceDate || new Date().toISOString().split('T')[0];
  const refDate = new Date(refDateStr + 'T00:00:00Z');

  // 1. Group transactions by normalized payee & direction & account
  const clusters = new Map<string, RawTransactionInput[]>();

  for (const tx of transactions) {
    const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    if (isNaN(rawAmt) || rawAmt === 0) continue;

    const norm = normalizePayee(tx.payee || tx.description);
    const isPositive = rawAmt > 0 || tx.isIncome === true;
    const direction = isPositive ? 'IN' : 'OUT';
    // Grouping key: Normalized Name + Direction + AccountId (or generic if account agnostic)
    const clusterKey = `${norm.toLowerCase()}||${direction}||${tx.accountId || 'any'}`;

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, []);
    }
    clusters.get(clusterKey)!.push({
      ...tx,
      amount: rawAmt,
      payee: norm,
    });
  }

  const detected: DetectedRecurringStream[] = [];

  for (const [key, txList] of clusters.entries()) {
    if (txList.length < minOccurrences) continue;

    // Sort transactions chronologically
    txList.sort((a, b) => a.date.localeCompare(b.date));

    const dates = txList.map((t) => t.date);
    const intervalResult = analyzeIntervals(dates);
    if (!intervalResult) continue;

    const amounts = txList.map((t) => Math.abs(typeof t.amount === 'number' ? t.amount : parseFloat(t.amount)));
    const meanAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const varianceAmount = amounts.reduce((s, a) => s + Math.pow(a - meanAmount, 2), 0) / amounts.length;
    const stdDevAmount = Math.sqrt(varianceAmount);
    const relAmountStd = meanAmount > 0 ? stdDevAmount / meanAmount : 0;

    const isVariable = relAmountStd >= 0.05;
    const latestTx = txList[txList.length - 1];
    const firstTx = txList[0];
    const latestAmount = Math.abs(typeof latestTx.amount === 'number' ? latestTx.amount : parseFloat(latestTx.amount));

    const isPositiveDirection = key.includes('||IN||');
    const normName = latestTx.payee || normalizePayee(latestTx.description);
    const type = classifyStreamType(normName, latestAmount, latestTx.categoryName, isPositiveDirection || latestTx.isIncome);

    const nextExpected = calculateNextExpectedDate(latestTx.date, intervalResult.frequency, refDateStr);

    // Status evaluation
    const nextDateObj = new Date(nextExpected + 'T00:00:00Z');
    const diffDays = Math.round((nextDateObj.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
    let status: 'active' | 'upcoming_soon' | 'overdue' | 'paused' = 'active';

    if (diffDays <= 7 && diffDays >= 0) {
      status = 'upcoming_soon';
    } else if (diffDays < 0) {
      const daysSinceLast = Math.round((refDate.getTime() - new Date(latestTx.date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > intervalResult.intervalDays * 2.2) {
        status = 'paused';
      } else {
        status = 'overdue';
      }
    }

    // Boost confidence if matches high-signature subscription or recurring utility
    let finalConfidence = intervalResult.confidence;
    const lowerName = normName.toLowerCase();
    if (SUBSCRIPTION_KEYWORDS.has(lowerName) || BILL_KEYWORDS.has(lowerName) || LOAN_KEYWORDS.has(lowerName)) {
      finalConfidence = Math.min(100, finalConfidence + 10);
    }
    if (txList.length >= 4) {
      finalConfidence = Math.min(100, finalConfidence + 5);
    }

    // Price history tracking
    const priceHistory = txList.map((t) => ({
      date: t.date,
      amount: Math.abs(typeof t.amount === 'number' ? t.amount : parseFloat(t.amount)),
    }));

    detected.push({
      id: `detected-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
      name: normName,
      payee: normName,
      normalizedName: normName,
      amount: isVariable ? meanAmount : latestAmount,
      type,
      frequency: intervalResult.frequency,
      intervalDays: intervalResult.intervalDays,
      anchorDate: firstTx.date,
      nextExpectedDate: nextExpected,
      accountId: latestTx.accountId || null,
      categoryId: latestTx.categoryId || null,
      isAutoDetected: true,
      isConfirmed: false,
      isActive: status !== 'paused',
      confidence: finalConfidence,
      isVariableAmount: isVariable,
      averageAmount: meanAmount,
      matchedTransactionIds: txList.map((t) => t.id),
      lastOccurrenceDate: latestTx.date,
      status,
      priceHistory,
    });
  }

  // Sort detected streams by type (income first, then loans, subscriptions, bills), then amount descending
  const typeOrder = { income: 1, loan: 2, bill: 3, subscription: 4, transfer: 5, other: 6 };
  detected.sort((a, b) => {
    const orderDiff = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
    if (orderDiff !== 0) return orderDiff;
    return b.amount - a.amount;
  });

  return detected;
}

// ── 5. Forward Balance Projection Engine ─────────────────────────────────────

export interface AccountBalanceInput {
  id: string;
  name: string;
  balance: number;
  type: string;
  isLiquid?: boolean;
}

export interface RecurringForecastOptions {
  accounts: AccountBalanceInput[];
  recurringStreams: DetectedRecurringStream[];
  budgets?: Array<{
    amount: number;
    isIncome?: boolean;
    fundingAccountId?: string | null;
    periodType?: string;
  }>;
  horizonDays: number; // 30, 60, 90, 180, 365
  startDate?: string;
  includeBudgets?: boolean;
  safeReserve?: number;
}

export function generateBalanceForecast(options: RecurringForecastOptions): {
  points: BalanceForecastPoint[];
  summary: ForecastSummary;
} {
  const {
    accounts,
    recurringStreams,
    budgets = [],
    horizonDays,
    startDate = new Date().toISOString().split('T')[0],
    includeBudgets = true,
    safeReserve = 1000,
  } = options;

  const start = new Date(startDate + 'T00:00:00Z');

  // Track running balances per account
  const currentAccountBalances: Record<string, number> = {};
  let totalStartingBalance = 0;

  for (const acc of accounts) {
    currentAccountBalances[acc.id] = acc.balance;
    totalStartingBalance += acc.balance;
  }

  // Calculate monthly discretionary budget burn (non-recurring)
  const monthlyDiscretionaryBudget = includeBudgets
    ? budgets
        .filter((b) => !b.isIncome)
        .reduce((sum, b) => {
          const amt = b.amount;
          const monthly = b.periodType === 'quarterly' ? amt / 3 : b.periodType === 'yearly' ? amt / 12 : amt;
          return sum + monthly;
        }, 0)
    : 0;

  const dailyDiscretionaryBurn = monthlyDiscretionaryBudget / 30.4;
  // Choose default liquid account for discretionary burn (or largest liquid account)
  const defaultLiquidAcc = accounts.find((a) => ['checking', 'cash', 'depository'].includes(a.type.toLowerCase())) || accounts[0];
  const defaultAccountId = defaultLiquidAcc?.id || (accounts.length > 0 ? accounts[0].id : 'default');

  const points: BalanceForecastPoint[] = [];

  let lowestBalance = totalStartingBalance;
  let lowestBalanceDate = startDate;
  let totalUpcomingInflows = 0;
  let totalUpcomingOutflows = 0;
  let runwayDays: number | null = null;

  // Active recurring stream schedule helper
  // Map recurring streams to expected fire dates across the horizon
  const scheduledEventsByDate = new Map<string, ForecastDayEvent[]>();

  for (const stream of recurringStreams) {
    if (!stream.isActive) continue;

    // Project occurrences across horizon
    let eventDate = new Date(stream.nextExpectedDate + 'T00:00:00Z');
    let loopGuard = 0;

    while (loopGuard < 150) {
      loopGuard++;
      const diffDays = Math.round((eventDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > horizonDays) break;

      if (diffDays >= 0) {
        const dateKey = eventDate.toISOString().split('T')[0];

        if (!scheduledEventsByDate.has(dateKey)) scheduledEventsByDate.set(dateKey, []);
        scheduledEventsByDate.get(dateKey)!.push({
          id: `${stream.id}-${dateKey}`,
          name: stream.name,
          amount: stream.amount,
          type: stream.type,
          accountId: stream.accountId || defaultAccountId,
          streamId: stream.id,
        });
      }

      // Step to next recurrence
      const nextDateStr = calculateNextExpectedDate(eventDate.toISOString().split('T')[0], stream.frequency);
      const nextDateObj = new Date(nextDateStr + 'T00:00:00Z');
      if (nextDateObj.getTime() <= eventDate.getTime()) {
        // Fallback safety step
        eventDate.setUTCDate(eventDate.getUTCDate() + (stream.intervalDays || 30));
      } else {
        eventDate = nextDateObj;
      }
    }
  }

  // Iterate day by day from Day 0 to Day horizonDays
  for (let day = 0; day <= horizonDays; day++) {
    const currentDayDate = new Date(start);
    currentDayDate.setUTCDate(currentDayDate.getUTCDate() + day);
    const dateStr = currentDayDate.toISOString().split('T')[0];

    const dayEvents = scheduledEventsByDate.get(dateStr) || [];

    let dayInflows = 0;
    let dayOutflows = 0;

    // Apply baseline events
    for (const evt of dayEvents) {
      const targetAccId = evt.accountId || defaultAccountId;
      if (evt.type === 'income') {
        dayInflows += evt.amount;
        if (currentAccountBalances[targetAccId] !== undefined) {
          currentAccountBalances[targetAccId] += evt.amount;
        }
      } else {
        dayOutflows += evt.amount;
        if (currentAccountBalances[targetAccId] !== undefined) {
          currentAccountBalances[targetAccId] -= evt.amount;
        }
      }
    }

    // Apply baseline discretionary burn (excluding Day 0 to reflect current state)
    if (day > 0 && dailyDiscretionaryBurn > 0) {
      dayOutflows += dailyDiscretionaryBurn;
      if (currentAccountBalances[defaultAccountId] !== undefined) {
        currentAccountBalances[defaultAccountId] -= dailyDiscretionaryBurn;
      }
    }

    totalUpcomingInflows += dayInflows;
    totalUpcomingOutflows += dayOutflows;

    let totalDayBalance = 0;
    for (const bal of Object.values(currentAccountBalances)) {
      totalDayBalance += bal;
    }

    if (totalDayBalance < lowestBalance) {
      lowestBalance = totalDayBalance;
      lowestBalanceDate = dateStr;
    }

    if (totalDayBalance < 0 && runwayDays === null && day > 0) {
      runwayDays = day;
    }

    points.push({
      date: dateStr,
      totalBalance: Math.round(totalDayBalance * 100) / 100,
      accounts: { ...currentAccountBalances },
      inflows: Math.round(dayInflows * 100) / 100,
      outflows: Math.round(dayOutflows * 100) / 100,
      netDelta: Math.round((dayInflows - dayOutflows) * 100) / 100,
      events: dayEvents,
    });
  }

  const finalDay = points[points.length - 1];
  const projectedEndBalance = finalDay ? finalDay.totalBalance : totalStartingBalance;
  const netProjectedSavings = totalUpcomingInflows - totalUpcomingOutflows;

  // Calculate monthly stats from active recurring streams
  let subMonthly = 0;
  let billsMonthly = 0;
  let incomeMonthly = 0;
  let activeStreamsCount = 0;

  for (const s of recurringStreams) {
    if (!s.isActive) continue;
    activeStreamsCount++;
    const multiplier = s.frequency === 'weekly' ? 4.33 : s.frequency === 'biweekly' ? 2.17 : s.frequency === 'quarterly' ? 1 / 3 : s.frequency === 'yearly' ? 1 / 12 : 1;
    const monthlyAmt = s.amount * multiplier;

    if (s.type === 'income') {
      incomeMonthly += monthlyAmt;
    } else if (s.type === 'subscription') {
      subMonthly += monthlyAmt;
    } else if (s.type === 'bill') {
      billsMonthly += monthlyAmt;
    }
  }

  // Safe-to-spend calculation: daily buffer that keeps lowest projected point >= safeReserve
  const excessBuffer = Math.max(0, lowestBalance - safeReserve);
  const safeToSpendDaily = horizonDays > 0 ? Math.round((excessBuffer / horizonDays) * 100) / 100 : 0;

  return {
    points,
    summary: {
      currentBalance: Math.round(totalStartingBalance * 100) / 100,
      projectedEndBalance: Math.round(projectedEndBalance * 100) / 100,
      lowestBalance: Math.round(lowestBalance * 100) / 100,
      lowestBalanceDate,
      totalUpcomingInflows: Math.round(totalUpcomingInflows * 100) / 100,
      totalUpcomingOutflows: Math.round(totalUpcomingOutflows * 100) / 100,
      netProjectedSavings: Math.round(netProjectedSavings * 100) / 100,
      safeToSpendDaily,
      runwayDays,
      subscriptionMonthlyTotal: Math.round(subMonthly * 100) / 100,
      subscriptionYearlyTotal: Math.round(subMonthly * 12 * 100) / 100,
      billsMonthlyTotal: Math.round(billsMonthly * 100) / 100,
      incomeMonthlyTotal: Math.round(incomeMonthly * 100) / 100,
      activeStreamsCount,
    },
  };
}

// ── 6. Subscription Intelligence & Price Change Detector ─────────────────────

export function generateSubscriptionInsights(
  recurringStreams: DetectedRecurringStream[]
): SubscriptionInsight[] {
  const insights: SubscriptionInsight[] = [];

  for (const stream of recurringStreams) {
    // 1. Price Change Detection
    if (stream.priceHistory && stream.priceHistory.length >= 2) {
      const history = [...stream.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
      const latest = history[history.length - 1];
      const previous = history[history.length - 2];

      if (latest.amount > previous.amount * 1.05 && latest.amount - previous.amount >= 1.0) {
        const diff = latest.amount - previous.amount;
        insights.push({
          type: 'price_increase',
          title: `Price Increase Detected for ${stream.name}`,
          description: `${stream.name} increased from $${previous.amount.toFixed(2)} to $${latest.amount.toFixed(2)} (+${diff.toFixed(2)}/mo).`,
          streamId: stream.id,
          streamName: stream.name,
          oldAmount: previous.amount,
          newAmount: latest.amount,
          impactMonthly: diff,
          severity: diff >= 10 ? 'warning' : 'info',
        });
      }
    }
  }

  // 2. High Total Burn Alert
  const totalSubMonthly = recurringStreams
    .filter((s) => s.isActive && s.type === 'subscription')
    .reduce((sum, s) => sum + s.amount, 0);

  if (totalSubMonthly >= 200) {
    insights.push({
      type: 'high_burn',
      title: 'High Subscription Burn',
      description: `You are spending $${totalSubMonthly.toFixed(2)}/month across active subscriptions ($${(totalSubMonthly * 12).toFixed(2)}/year). Reviewing unused services could free up significant cash flow.`,
      severity: totalSubMonthly >= 350 ? 'warning' : 'info',
    });
  }

  return insights;
}
