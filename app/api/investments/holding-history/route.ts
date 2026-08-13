import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, holdings, holdingSnapshots } from '@/lib/db/schema';
import { eq, and, gte, inArray, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { isInvestmentAccount } from '@/lib/utils/account-scope';

const LOG_TAG = '[api-investments-holding-history]';

// In-memory cache for ticker historical daily prices (1 hour TTL)
const tickerPriceCache = new Map<string, { prices: Map<string, number>; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const TICKER_MAPPINGS: Record<string, string> = {
  'LMCSTK': 'LMT',
  'LMCMBI': 'AGG',
  'LMSMPH': 'IWM',
  'LMMEPH': 'IJH',
};

const CONSTANT_PRICE_TICKERS = new Set(['SCHMMF', 'LMCSVF', 'SCHSEC']);

async function fetchTickerDailyPrices(ticker: string, days: number = 30): Promise<Map<string, number>> {
  const cleanTicker = ticker.trim().toUpperCase();
  const cacheKey = `${cleanTicker}:${days}`;
  const cached = tickerPriceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.prices;
  }

  const priceMap = new Map<string, number>();

  if (CONSTANT_PRICE_TICKERS.has(cleanTicker)) {
    const today = new Date();
    for (let i = days; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      priceMap.set(d.toISOString().split('T')[0], 1.00);
    }
    tickerPriceCache.set(cacheKey, { prices: priceMap, expiresAt: Date.now() + CACHE_TTL_MS });
    return priceMap;
  }

  try {
    const mappedTicker = TICKER_MAPPINGS[cleanTicker] ?? cleanTicker;
    const startTs = Math.floor((Date.now() - (days + 5) * 24 * 60 * 60 * 1000) / 1000);
    const endTs = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mappedTicker)}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const json = await res.json() as any;
      const timestamps = json?.chart?.result?.[0]?.timestamp as number[] | undefined;
      const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close as number[] | undefined;

      if (timestamps && closes) {
        for (let i = 0; i < timestamps.length; i++) {
          const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const price = parseFloat(String(closes[i]));
          if (!isNaN(price) && price > 0) {
            priceMap.set(dateStr, price);
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`${LOG_TAG} Failed to fetch Yahoo Finance price history for ${ticker}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (priceMap.size > 0) {
    tickerPriceCache.set(cacheKey, { prices: priceMap, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return priceMap;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  // Optional filters
  const tickerParam = searchParams.get('ticker');
  const securityIdParam = searchParams.get('securityId');
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10), 7), 365);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  // Generate target daily date list
  const dailyDates: string[] = [];
  const curr = new Date(startDate);
  const stop = new Date();
  while (curr <= stop) {
    dailyDates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }

  try {
    // 1. Get all user investment accounts
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const investmentAccounts = decryptedAccounts.filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    if (investmentAccounts.length === 0) {
      return NextResponse.json({ history: [] });
    }

    const accountIds = investmentAccounts.map((acc) => acc.id);

    // 2. Fetch current holdings
    const dbHoldings = await getDb()
      .select()
      .from(holdings)
      .where(inArray(holdings.accountId, accountIds));

    const decryptedHoldings = await decryptRows('holdings', dbHoldings, dek);

    // Filter holdings if specified
    let filteredHoldings = decryptedHoldings;
    if (tickerParam) {
      filteredHoldings = filteredHoldings.filter(
        (h) => h.ticker?.toUpperCase() === tickerParam.toUpperCase()
      );
    }
    if (securityIdParam) {
      filteredHoldings = filteredHoldings.filter((h) => h.securityId === securityIdParam);
    }

    // 3. Fetch snapshots for fallback / non-ticker holdings
    const snapshotConditions = [
      eq(holdingSnapshots.userId, dataUserId),
      inArray(holdingSnapshots.accountId, accountIds),
      gte(holdingSnapshots.snapshotDate, startStr),
    ];
    if (tickerParam) {
      snapshotConditions.push(eq(holdingSnapshots.ticker, tickerParam));
    }
    if (securityIdParam) {
      snapshotConditions.push(eq(holdingSnapshots.securityId, securityIdParam));
    }

    const rawSnapshots = await getDb()
      .select()
      .from(holdingSnapshots)
      .where(and(...snapshotConditions))
      .orderBy(asc(holdingSnapshots.snapshotDate));

    const decryptedSnapshots = rawSnapshots.length > 0
      ? await decryptRows('holding_snapshots', rawSnapshots, dek)
      : [];

    // Group snapshots by security key
    const snapshotsByKey = new Map<string, typeof decryptedSnapshots>();
    for (const snap of decryptedSnapshots) {
      const key = snap.ticker || snap.securityId || snap.name || '';
      if (!snapshotsByKey.has(key)) {
        snapshotsByKey.set(key, []);
      }
      snapshotsByKey.get(key)!.push(snap);
    }

    // 4. Collect unique tickers to fetch Yahoo market price history in parallel
    const uniqueTickers = new Set<string>();
    for (const h of filteredHoldings) {
      if (h.ticker && h.ticker.trim().length > 0) {
        uniqueTickers.add(h.ticker.trim().toUpperCase());
      }
    }

    const tickerPricesMap = new Map<string, Map<string, number>>();
    if (uniqueTickers.size > 0) {
      await Promise.all(
        Array.from(uniqueTickers).map(async (t) => {
          const prices = await fetchTickerDailyPrices(t, days);
          if (prices.size > 0) {
            tickerPricesMap.set(t, prices);
          }
        })
      );
    }

    // 5. Build daily point series for each holding
    const groupedHoldings: Record<
      string,
      {
        ticker: string | null;
        name: string | null;
        totalQuantity: number;
        currentPrice: number;
        currentValue: number;
        points: { date: string; price: number; value: number }[];
      }
    > = {};

    for (const h of filteredHoldings) {
      const key = h.ticker || h.securityId || h.name || 'unknown';
      const qty = parseFloat(h.quantity) || 0;
      const price = parseFloat(h.price) || 0;
      const val = parseFloat(h.value) || qty * price;

      if (!groupedHoldings[key]) {
        groupedHoldings[key] = {
          ticker: h.ticker ?? null,
          name: h.name ?? null,
          totalQuantity: 0,
          currentPrice: price,
          currentValue: 0,
          points: [],
        };
      }

      groupedHoldings[key].totalQuantity += qty;
      groupedHoldings[key].currentValue += val;
      if (price > 0) {
        groupedHoldings[key].currentPrice = price;
      }
    }

    // Generate daily points for each grouped holding
    for (const [key, item] of Object.entries(groupedHoldings)) {
      const tickerUpper = item.ticker?.toUpperCase().trim();
      const marketPrices = tickerUpper ? tickerPricesMap.get(tickerUpper) : undefined;
      const snaps = snapshotsByKey.get(key) || [];

      if (marketPrices && marketPrices.size > 0) {
        let lastKnownPrice = item.currentPrice;

        // Find the earliest available price to avoid 0 at start
        for (const d of dailyDates) {
          if (marketPrices.has(d)) {
            lastKnownPrice = marketPrices.get(d)!;
            break;
          }
        }

        for (const dateStr of dailyDates) {
          if (marketPrices.has(dateStr)) {
            lastKnownPrice = marketPrices.get(dateStr)!;
          }
          item.points.push({
            date: dateStr,
            price: lastKnownPrice,
            value: Number((item.totalQuantity * lastKnownPrice).toFixed(2)),
          });
        }
      } else if (snaps.length > 0) {
        const snapPriceByDate = new Map<string, { price: number; value: number }>();
        for (const s of snaps) {
          const sDate = String(s.snapshotDate);
          snapPriceByDate.set(sDate, {
            price: parseFloat(s.price) || item.currentPrice,
            value: parseFloat(s.value) || item.currentValue,
          });
        }

        let lastPrice = parseFloat(snaps[0].price) || item.currentPrice;
        let lastVal = parseFloat(snaps[0].value) || item.currentValue;

        for (const dateStr of dailyDates) {
          if (snapPriceByDate.has(dateStr)) {
            const sp = snapPriceByDate.get(dateStr)!;
            lastPrice = sp.price;
            lastVal = sp.value;
          }
          item.points.push({
            date: dateStr,
            price: lastPrice,
            value: Number(lastVal.toFixed(2)),
          });
        }
      } else {
        for (const dateStr of dailyDates) {
          item.points.push({
            date: dateStr,
            price: item.currentPrice,
            value: item.currentValue,
          });
        }
      }
    }

    const history = Object.entries(groupedHoldings).map(([key, { ticker: t, name, points }]) => ({
      key,
      ticker: t,
      name,
      points,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching holding history`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch holding history' },
      { status: 500 }
    );
  }
}
