import { getDb } from '@/lib/db';
import { 
  accounts, 
  investmentHoldings, 
  investmentTransactions, 
  securityPrices, 
  securityPriceHistory,
  accountSnapshots
} from '@/lib/db/schema';
import { eq, and, inArray, sql, desc, asc, lt } from 'drizzle-orm';
import { getFinancialProvider } from './financial-provider';
import { decryptField, decryptRows, encryptField, encryptRow } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

const LOG_TAG = '[investments-service]';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface HoldingPosition {
  id?: string;
  ticker: string;
  name: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  totalCost: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  dailyChange?: number;
  dailyChangePercent?: number;
  allocationPercent: number;
  sector: string;
  assetClass: string;
  isVirtualCash?: boolean;
}

export interface InvestmentAccountDetails {
  id: string;
  name: string;
  institution: string | null;
  synced: boolean;
  trackingMode: 'balance_only' | 'positions' | 'transactions';
  cashReconciliationMode: 'automated' | 'manual';
  holdings: HoldingPosition[];
  holdingsValue: number;
  reconciledCash: number;
  totalComputedValue: number;
  reportedBalance: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  accounts: InvestmentAccountDetails[];
  history: Array<{ date: string; value: number }>;
}

// Helper to parse JSON metadata safely
function parseMetadata(metaStr: string | null): Record<string, unknown> {
  if (!metaStr) return {};
  try {
    const parsed = JSON.parse(metaStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// ─── Core Service Logic ──────────────────────────────────────────────────────

export async function getPortfolioHoldings(userId: string): Promise<PortfolioSummary> {
  const db = getDb();
  const dek = await getSessionDEK();

  // Fetch all accounts
  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

  // Decrypt accounts
  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);

  // Filter accounts of type 'investment'
  const investmentAccounts = decryptedAccounts.filter(
    (a: any) => a.type === 'investment' || a.type === 'brokerage' || a.type === 'retirement'
  );

  const accountDetailsList: InvestmentAccountDetails[] = [];
  let totalValue = 0;
  let totalCost = 0;

  // Gather all unique tickers first to fetch quotes in batch
  const allTickersSet = new Set<string>();

  // Parse metadata for all accounts to gather active tickers
  for (const account of investmentAccounts) {
    const meta = parseMetadata(account.metadata);
    const trackingMode = (meta.trackingMode as any) || 'balance_only';

    if (trackingMode === 'positions') {
      const holdings = await db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.accountId, account.id));
      holdings.forEach(h => allTickersSet.add(h.ticker.toUpperCase()));
    } else if (trackingMode === 'transactions') {
      const txns = await db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.accountId, account.id));
      txns.forEach(t => allTickersSet.add(t.ticker.toUpperCase()));
    }
  }

  // Fetch security prices cache
  const cachedPrices = await db
    .select()
    .from(securityPrices)
    .where(inArray(securityPrices.ticker, Array.from(allTickersSet).concat(['DUMMY_TICKER'])));

  const priceMap = new Map(cachedPrices.map(p => [p.ticker.toUpperCase(), p]));

  for (const account of investmentAccounts) {
    const meta = parseMetadata(account.metadata);
    const trackingMode = (meta.trackingMode as any) || 'balance_only';
    const cashReconciliationMode = (meta.cashReconciliationMode as any) || 'automated';
    const reportedBalance = parseFloat(account.balance) || 0;

    let activeHoldings: Array<{ id?: string; ticker: string; shares: number; costBasis: number; purchaseDate?: string | null }> = [];

    if (trackingMode === 'positions') {
      const holdings = await db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.accountId, account.id));
      activeHoldings = holdings.map(h => ({
        id: h.id,
        ticker: h.ticker.toUpperCase(),
        shares: parseFloat(h.shares),
        costBasis: parseFloat(h.costBasis),
        purchaseDate: h.purchaseDate,
      }));
    } else if (trackingMode === 'transactions') {
      // Roll up transaction ledger on the fly
      const txns = await db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.accountId, account.id))
        .orderBy(asc(investmentTransactions.transactionDate));

      const rollup: Record<string, { shares: number; totalCost: number }> = {};
      for (const t of txns) {
        const ticker = t.ticker.toUpperCase();
        if (!rollup[ticker]) {
          rollup[ticker] = { shares: 0, totalCost: 0 };
        }
        const shares = parseFloat(t.shares);
        const price = parseFloat(t.pricePerShare);
        const commission = parseFloat(t.commission || '0');

        if (t.type === 'buy') {
          rollup[ticker].shares += shares;
          rollup[ticker].totalCost += (shares * price) + commission;
        } else if (t.type === 'sell') {
          // If selling, reduce shares and reduce cost basis proportionally
          const oldShares = rollup[ticker].shares;
          rollup[ticker].shares -= shares;
          if (oldShares > 0) {
            rollup[ticker].totalCost -= (shares / oldShares) * rollup[ticker].totalCost;
          }
        } else if (t.type === 'dividend') {
          // Reinvested dividend adds shares
          rollup[ticker].shares += shares;
          rollup[ticker].totalCost += (shares * price);
        } else if (t.type === 'split') {
          // Split adjusts share count (price is updated in quote)
          // t.shares stores the split multiplier, e.g. 2 for 2-for-1 split
          rollup[ticker].shares *= shares;
        }
      }

      for (const [ticker, data] of Object.entries(rollup)) {
        if (data.shares > 0) {
          activeHoldings.push({
            ticker,
            shares: data.shares,
            costBasis: data.totalCost / data.shares,
            purchaseDate: null,
          });
        }
      }
    }

    let holdingsValue = 0;
    let holdingsCost = 0;
    const computedPositions: HoldingPosition[] = [];

    // Calculate valuations for each stock holding
    for (const h of activeHoldings) {
      const priceInfo = priceMap.get(h.ticker);
      const currentPrice = priceInfo ? parseFloat(priceInfo.currentPrice) : 0;
      const val = h.shares * currentPrice;
      const cost = h.shares * h.costBasis;
      const gain = val - cost;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

      holdingsValue += val;
      holdingsCost += cost;

      computedPositions.push({
        id: h.id,
        ticker: h.ticker,
        name: priceInfo?.name || h.ticker,
        shares: h.shares,
        costBasis: h.costBasis,
        currentPrice,
        totalCost: cost,
        currentValue: val,
        gainLoss: gain,
        gainLossPercent: gainPct,
        dailyChange: priceInfo?.dailyChange ? parseFloat(priceInfo.dailyChange) : undefined,
        dailyChangePercent: priceInfo?.dailyChangePercent ? parseFloat(priceInfo.dailyChangePercent) : undefined,
        allocationPercent: 0, // calculated later
        sector: priceInfo?.sector || 'Other',
        assetClass: priceInfo?.assetClass || 'Equity',
      });
    }

    // Cash sweep calculation
    let reconciledCash = 0;
    const isSynced = !!account.connectionId;

    if (isSynced && cashReconciliationMode === 'automated') {
      reconciledCash = Math.max(0, reportedBalance - holdingsValue);
      if (reconciledCash > 0.01) {
        computedPositions.push({
          ticker: 'CASH',
          name: 'Cash Sweeps & Balances',
          shares: reconciledCash,
          costBasis: 1.0,
          currentPrice: 1.0,
          totalCost: reconciledCash,
          currentValue: reconciledCash,
          gainLoss: 0,
          gainLossPercent: 0,
          allocationPercent: 0,
          sector: 'Liquidity',
          assetClass: 'Cash',
          isVirtualCash: true,
        });
        holdingsValue += reconciledCash;
        holdingsCost += reconciledCash;
      }
    }

    const totalComputedValue = isSynced ? reportedBalance : holdingsValue;

    // Calculate allocation percentages per account
    computedPositions.forEach(p => {
      p.allocationPercent = totalComputedValue > 0 ? (p.currentValue / totalComputedValue) * 100 : 0;
    });

    accountDetailsList.push({
      id: account.id,
      name: account.name,
      institution: account.institution,
      synced: isSynced,
      trackingMode,
      cashReconciliationMode,
      holdings: computedPositions,
      holdingsValue: isSynced && cashReconciliationMode === 'automated' ? (holdingsValue - reconciledCash) : holdingsValue,
      reconciledCash,
      totalComputedValue,
      reportedBalance,
    });

    totalValue += totalComputedValue;
    totalCost += holdingsCost;
  }

  // Calculate allocation percentages across the entire portfolio
  accountDetailsList.forEach(acc => {
    acc.holdings.forEach(h => {
      // Overwrite allocation percent to be portfolio-wide
      h.allocationPercent = totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0;
    });
  });

  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  // Fetch historical snapshots for all these investment accounts to build the performance chart
  let history: { date: string; value: number }[] = [];
  const investmentAccountIds = investmentAccounts.map((a: any) => a.id);

  if (investmentAccountIds.length > 0) {
    try {
      const snapshots = await db
        .select({
          snapshotDate: accountSnapshots.snapshotDate,
          balance: accountSnapshots.balance,
        })
        .from(accountSnapshots)
        .where(and(
          eq(accountSnapshots.userId, userId),
          inArray(accountSnapshots.accountId, investmentAccountIds)
        ))
        .orderBy(asc(accountSnapshots.snapshotDate));

      const dateMap = new Map<string, number>();
      for (const s of snapshots) {
        const decryptedBal = parseFloat(dek ? await decryptField(s.balance, dek) : s.balance) || 0;
        const currentVal = dateMap.get(s.snapshotDate) || 0;
        dateMap.set(s.snapshotDate, currentVal + decryptedBal);
      }

      history = Array.from(dateMap.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to fetch historical snapshots for investments chart`, err);
    }
  }

  return {
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    accounts: accountDetailsList,
    history,
  };
}

export async function syncInvestmentPrices(userId: string): Promise<{ success: boolean; syncedCount: number }> {
  const db = getDb();
  const dek = await getSessionDEK();

  // Find all active tickers for this user
  const uniqueTickers = new Set<string>();

  // Fetch accounts to check metadata
  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);
  const investmentAccounts = decryptedAccounts.filter(
    (a: any) => a.type === 'investment' || a.type === 'brokerage' || a.type === 'retirement'
  );

  for (const acc of investmentAccounts) {
    const meta = parseMetadata(acc.metadata);
    const trackingMode = meta.trackingMode || 'balance_only';
    if (trackingMode === 'positions') {
      const holdings = await db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.accountId, acc.id));
      holdings.forEach(h => uniqueTickers.add(h.ticker.toUpperCase()));
    } else if (trackingMode === 'transactions') {
      const txns = await db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.accountId, acc.id));
      txns.forEach(t => uniqueTickers.add(t.ticker.toUpperCase()));
    }
  }

  const tickersList = Array.from(uniqueTickers);
  if (tickersList.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  // Get active financial data provider
  const provider = await getFinancialProvider(userId);

  // Fetch current quotes
  const quotes = await provider.fetchQuotes(tickersList);

  // Update security_prices cache in database
  for (const q of quotes) {
    await db.insert(securityPrices).values({
      ticker: q.ticker.toUpperCase(),
      name: q.name,
      currentPrice: String(q.price),
      dailyChange: q.change ? String(q.change) : null,
      dailyChangePercent: q.changePercent ? String(q.changePercent) : null,
      sector: q.sector || null,
      assetClass: q.assetClass || null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: securityPrices.ticker,
      set: {
        name: q.name,
        currentPrice: String(q.price),
        dailyChange: q.change ? String(q.change) : null,
        dailyChangePercent: q.changePercent ? String(q.changePercent) : null,
        sector: q.sector || null,
        assetClass: q.assetClass || null,
        updatedAt: new Date(),
      }
    });

    // Fetch and cache historical prices (default 1y for net worth reconstruction)
    try {
      const history = await provider.fetchHistory(q.ticker, '1y');
      for (const h of history) {
        await db.insert(securityPriceHistory).values({
          ticker: q.ticker.toUpperCase(),
          priceDate: h.date,
          closePrice: String(h.close),
        }).onConflictDoUpdate({
          target: [securityPriceHistory.ticker, securityPriceHistory.priceDate],
          set: {
            closePrice: String(h.close),
          }
        });
      }
    } catch (hErr) {
      logger.warn(`${LOG_TAG} Failed to cache history for ${q.ticker}: ${hErr instanceof Error ? hErr.message : String(hErr)}`);
    }
  }

  // Recalculate manual account balances based on updated ticker prices
  for (const acc of investmentAccounts) {
    const isSynced = !!acc.connectionId;
    const meta = parseMetadata(acc.metadata);
    const trackingMode = meta.trackingMode || 'balance_only';

    // If it's a manual account (unsynced) and it has holdings tracking, we calculate its current balance
    if (!isSynced && (trackingMode === 'positions' || trackingMode === 'transactions')) {
      let computedBalance = 0;

      if (trackingMode === 'positions') {
        const holdings = await db
          .select()
          .from(investmentHoldings)
          .where(eq(investmentHoldings.accountId, acc.id));
        for (const h of holdings) {
          const q = quotes.find(quote => quote.ticker.toUpperCase() === h.ticker.toUpperCase());
          const price = q ? q.price : 0;
          computedBalance += parseFloat(h.shares) * price;
        }
      } else {
        // Transactions mode
        const txns = await db
          .select()
          .from(investmentTransactions)
          .where(eq(investmentTransactions.accountId, acc.id));
        
        const rollup: Record<string, number> = {};
        for (const t of txns) {
          const ticker = t.ticker.toUpperCase();
          const shares = parseFloat(t.shares);
          if (!rollup[ticker]) rollup[ticker] = 0;
          if (t.type === 'buy') rollup[ticker] += shares;
          else if (t.type === 'sell') rollup[ticker] -= shares;
          else if (t.type === 'dividend') rollup[ticker] += shares;
          else if (t.type === 'split') rollup[ticker] *= shares;
        }

        for (const [ticker, shares] of Object.entries(rollup)) {
          if (shares > 0) {
            const q = quotes.find(quote => quote.ticker.toUpperCase() === ticker.toUpperCase());
            const price = q ? q.price : 0;
            computedBalance += shares * price;
          }
        }
      }

      // Update the account's balance in the database
      const encryptedBalance = dek ? await encryptField(String(computedBalance), dek) : String(computedBalance);
      await db.update(accounts).set({
        balance: encryptedBalance,
        balanceDate: new Date(),
        updatedAt: new Date(),
      }).where(eq(accounts.id, acc.id));
    }
  }

  // Generate synthetic historical snapshots for manual investment accounts
  await generateInvestmentSyntheticSnapshots(userId);

  return { success: true, syncedCount: quotes.length };
}

export async function generateInvestmentSyntheticSnapshots(userId: string): Promise<number> {
  const db = getDb();
  const dek = await getSessionDEK();

  // Fetch accounts
  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);
  const manualInvestmentAccounts = decryptedAccounts.filter(
    (a: any) => !a.connectionId && (a.type === 'investment' || a.type === 'brokerage' || a.type === 'retirement')
  );

  let totalInserted = 0;

  for (const acc of manualInvestmentAccounts) {
    const meta = parseMetadata(acc.metadata);
    const trackingMode = meta.trackingMode || 'balance_only';

    if (trackingMode === 'balance_only') continue;

    // Delete existing synthetic snapshots for this manual account
    await db.delete(accountSnapshots).where(
      and(
        eq(accountSnapshots.accountId, acc.id),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

    // Retrieve historical stock prices mapped by (ticker, date)
    let holdingsWithHistory: Array<{ ticker: string; shares: number; purchaseDate?: string | null; history: Map<string, number> }> = [];
    let txns: any[] | undefined;
    let histMapByTicker: Map<string, Map<string, number>> | undefined;

    if (trackingMode === 'positions') {
      const holdings = await db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.accountId, acc.id));

      for (const h of holdings) {
        const hist = await db
          .select()
          .from(securityPriceHistory)
          .where(eq(securityPriceHistory.ticker, h.ticker.toUpperCase()));
        const histMap = new Map(hist.map(p => [p.priceDate, parseFloat(p.closePrice)]));

        holdingsWithHistory.push({
          ticker: h.ticker.toUpperCase(),
          shares: parseFloat(h.shares),
          purchaseDate: h.purchaseDate,
          history: histMap,
        });
      }
    } else {
      // Transactions mode
      txns = await db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.accountId, acc.id))
        .orderBy(asc(investmentTransactions.transactionDate));

      const uniqueTickers = Array.from(new Set(txns.map(t => t.ticker.toUpperCase())));

      // Load histories for each unique ticker
      histMapByTicker = new Map<string, Map<string, number>>();
      for (const ticker of uniqueTickers) {
        const hist = await db
          .select()
          .from(securityPriceHistory)
          .where(eq(securityPriceHistory.ticker, ticker));
        histMapByTicker.set(ticker, new Map(hist.map(p => [p.priceDate, parseFloat(p.closePrice)])));
      }

      // Build holdingsWithHistory for transactions mode:
      // each ticker has shares=0 (computed per-date below) but we need the history map for dates
      for (const ticker of uniqueTickers) {
        const histMap = histMapByTicker.get(ticker) || new Map();
        holdingsWithHistory.push({
          ticker,
          shares: 0,
          history: histMap,
        });
      }
    }

    // Gather all historical dates from the cached price histories
    const allDatesSet = new Set<string>();
    holdingsWithHistory.forEach(h => {
      h.history.forEach((_, date) => allDatesSet.add(date));
    });

    const sortedDates = Array.from(allDatesSet).sort();
    const todayStr = new Date().toISOString().split('T')[0];

    for (const date of sortedDates) {
      if (date >= todayStr) continue;

      let portfolioValueOnDate = 0;

      if (trackingMode === 'positions') {
        for (const h of holdingsWithHistory) {
          if (h.purchaseDate && date < h.purchaseDate) continue;
          const price = h.history.get(date) || 0;
          portfolioValueOnDate += h.shares * price;
        }
      } else {
        // Transactions mode - rollup holdings active *on or before this date*
        // Use the already-loaded txns array to compute per-date positions in memory
        const rollup: Record<string, number> = {};
        for (const t of txns) {
          if (t.transactionDate >= date) continue;
          const ticker = t.ticker.toUpperCase();
          const shares = parseFloat(t.shares);
          if (!rollup[ticker]) rollup[ticker] = 0;
          if (t.type === 'buy') rollup[ticker] += shares;
          else if (t.type === 'sell') rollup[ticker] -= shares;
          else if (t.type === 'dividend') rollup[ticker] += shares;
          else if (t.type === 'split') rollup[ticker] *= shares;
        }

        for (const [ticker, shares] of Object.entries(rollup)) {
          if (shares > 0) {
            const histMap = histMapByTicker.get(ticker);
            const price = histMap ? (histMap.get(date) || 0) : 0;
            portfolioValueOnDate += shares * price;
          }
        }
      }

      if (portfolioValueOnDate > 0) {
        const encryptedBalance = dek ? await encryptField(String(portfolioValueOnDate), dek) : String(portfolioValueOnDate);
        try {
          await db.insert(accountSnapshots).values({
            userId,
            accountId: acc.id,
            snapshotDate: date,
            balance: encryptedBalance,
            isSynthetic: true,
            isImported: false,
          }).onConflictDoUpdate({
            target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
            set: {
              balance: encryptedBalance,
              isSynthetic: true,
            }
          });
          totalInserted++;
        } catch (err) {
          logger.warn(`${LOG_TAG} Failed to save snapshot for ${acc.id} on ${date}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  logger.info(`${LOG_TAG} Created ${totalInserted} synthetic snapshots for manual investment portfolios`);
  return totalInserted;
}
