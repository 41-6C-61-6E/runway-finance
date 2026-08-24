import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  isConstantPriceTicker,
  constantPriceName,
  resolvePriceSourceTicker,
} from '@/lib/utils/ticker-mappings';

const LOG_TAG = '[api-investments-quotes]';

// Simple in-memory cache keyed by the PRICE SOURCE that was fetched (not the
// requested holding ticker), so proxies and their canonical symbols share an
// entry.
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
  // Set when price was sourced from a proxy (e.g. a user-assigned public ETF
  // equivalent) rather than the holding's own ticker.
  priceSource?: string;
  error?: string;
}

const QUOTE_TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

function isValidTickerInput(input: string): boolean {
  return QUOTE_TICKER_RE.test(input);
}

/**
 * Parse the client-supplied `mapping` query param: comma-separated
 * "TICKER:SOURCE" pairs (e.g. "LMSMPH:VFINX"). Built by the client from
 * user-set public-equivalent values, so overrides assigned via the Holding
 * detail drawer flow through to prices without a dedicated price-source
 * store on the server. Pairs failing the ticker regex are dropped.
 */
function parseClientMapping(raw: string | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!raw) return m;
  for (const part of raw.split(',')) {
    const sep = part.indexOf(':');
    if (sep <= 0 || sep === part.length - 1) continue;
    const key = part.slice(0, sep).trim().toUpperCase();
    const val = part.slice(sep + 1).trim().toUpperCase();
    if (!isValidTickerInput(key) || !isValidTickerInput(val)) continue;
    m.set(key, val);
  }
  return m;
}

function makeConstantQuote(ticker: string): QuoteData {
  return {
    ticker,
    price: 1.0,
    change: 0.0,
    changePercent: 0.0,
    high52: 1.0,
    low52: 1.0,
    marketCap: null,
    shortName: constantPriceName(ticker),
  };
}

async function fetchYahooQuote(priceSource: string): Promise<QuoteData> {
  const cached = cache.get(priceSource);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const base: QuoteData = {
    ticker: priceSource,
    price: null,
    change: null,
    changePercent: null,
    high52: null,
    low52: null,
    marketCap: null,
    shortName: null,
  };

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(priceSource)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        UserAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`Yahoo quote responded ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { ...base, error: 'no_data' };

    const meta = result.meta ?? {};
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price != null && prevClose != null ? price - prevClose : null;
    const changePercent = change != null && prevClose ? (change / prevClose) * 100 : null;

    const data: QuoteData = {
      ticker: priceSource,
      price: price ?? null,
      change,
      changePercent,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      marketCap: meta.marketCap ?? null,
      shortName: meta.shortName ?? meta.longName ?? null,
    };
    cache.set(priceSource, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    logger.warn(`${LOG_TAG} Failed to fetch quote for ${priceSource}`, {
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
  const requested = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => isValidTickerInput(t));

  if (requested.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  // Cap at 30 tickers to avoid abuse
  const limited = requested.slice(0, 30);
  const clientMapping = parseClientMapping(searchParams.get('mapping'));

  logger.info(`${LOG_TAG} Fetching quotes`, {
    tickers: limited,
    clientMappings: [...clientMapping.entries()],
  });

  // Resolve the price source for each requested ticker:
  //   constant-price (money-market / stable-value) → flat $1.00 quote
  //   everything else                              → client mapping → static
  //                                                  proxy table → the ticker
  const quotes = await Promise.all(
    limited.map(async (ticker) => {
      if (isConstantPriceTicker(ticker)) return makeConstantQuote(ticker);

      const priceSource = resolvePriceSourceTicker(ticker, clientMapping.get(ticker));
      const q = await fetchYahooQuote(priceSource);

      // Re-key the quote under the requested holding ticker when a proxy was
      // used, so the client's ticker-keyed lookup keeps working, and record
      // where the price actually came from.
      if (q.price == null || priceSource === ticker) return q;
      return { ...q, ticker, priceSource };
    }),
  );

  return NextResponse.json({ quotes });
}
