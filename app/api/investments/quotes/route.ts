import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-quotes]';

// Simple in-memory cache: { ticker: { data, expiresAt } }
const cache = new Map<string, { data: QuoteData; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface QuoteData {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  high52: number | null;
  low52: number | null;
  marketCap: number | null;
  shortName: string | null;
  error?: string;
}

const TICKER_MAPPINGS: Record<string, string> = {
  'LMCSTK': 'LMT',
  'LMCMBI': 'AGG',
  'LMSMPH': 'IWM',
  'LMMEPH': 'IJH',
};

const CONSTANT_PRICE_TICKERS = new Set(['SCHMMF', 'LMCSVF', 'SCHSEC']);

async function fetchYahooQuote(ticker: string): Promise<QuoteData> {
  const cached = cache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const base: QuoteData = {
    ticker,
    price: null,
    change: null,
    changePercent: null,
    high52: null,
    low52: null,
    marketCap: null,
    shortName: null,
  };

  if (CONSTANT_PRICE_TICKERS.has(ticker)) {
    const nameMap: Record<string, string> = {
      'SCHMMF': 'Schwab Money Market Fund',
      'LMCSVF': 'Lockheed Martin Stable Value Fund',
      'SCHSEC': 'Schwab Sweep Security',
    };
    const data: QuoteData = {
      ticker,
      price: 1.00,
      change: 0.0,
      changePercent: 0.0,
      high52: 1.00,
      low52: 1.00,
      marketCap: null,
      shortName: nameMap[ticker] ?? 'Stable Value Fund',
    };
    cache.set(ticker, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  try {
    const mappedTicker = TICKER_MAPPINGS[ticker] ?? ticker;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mappedTicker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { ...base, error: `HTTP ${res.status}` };
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { ...base, error: 'no_data' };

    const meta = result.meta ?? {};
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price != null && prevClose != null ? price - prevClose : null;
    const changePercent = change != null && prevClose ? (change / prevClose) * 100 : null;

    const data: QuoteData = {
      ticker,
      price: price ?? null,
      change,
      changePercent,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      marketCap: meta.marketCap ?? null,
      shortName: meta.shortName ?? meta.longName ?? null,
    };

    cache.set(ticker, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    logger.warn(`${LOG_TAG} Failed to fetch quote for ${ticker}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...base, error: 'fetch_error' };
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0 && t.length <= 10);

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  // Cap at 30 tickers to avoid abuse
  const limited = tickers.slice(0, 30);

  logger.info(`${LOG_TAG} Fetching quotes`, { tickers: limited });

  const quotes = await Promise.all(limited.map(fetchYahooQuote));

  return NextResponse.json({ quotes });
}
