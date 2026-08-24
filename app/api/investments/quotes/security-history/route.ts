import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  isConstantPriceTicker,
  resolvePriceSourceTicker,
} from '@/lib/utils/ticker-mappings';

const LOG_TAG = '[api-security-history]';

// In-memory cache for security historical charts
const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawTicker = (searchParams.get('ticker') ?? '').trim().toUpperCase();
  const range = (searchParams.get('range') ?? '1m').toLowerCase(); // '1w' | '1m' | '3m' | '1y' | '5y' | 'all'
  // Optional client-side override of the price source (e.g. a user-assigned
  // public ETF equivalent for an internally-named fund).
  const sourceOverride = (searchParams.get('source') ?? '').trim().toUpperCase();

  if (!rawTicker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  // Constant-price short-circuit happens below; resolve source for caching.
  const resolvedSource = resolvePriceSourceTicker(rawTicker, sourceOverride) || rawTicker;
  const cacheKey = `${resolvedSource}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  if (isConstantPriceTicker(rawTicker)) {
    const today = new Date();
    const points = [];
    const count = range === '1w' ? 7 : range === '1m' ? 30 : range === '3m' ? 90 : 365;
    for (let i = count; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      points.push({
        date: d.toISOString().split('T')[0],
        close: 1.00,
        high: 1.00,
        low: 1.00,
        open: 1.00,
      });
    }
    const result = {
      ticker: rawTicker,
      range,
      points,
      previousClose: 1.00,
      currentPrice: 1.00,
      change: 0,
      changePercent: 0,
    };
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(result);
  }

  const rangeConfigMap: Record<string, { yahooRange: string; interval: string }> = {
    '1w': { yahooRange: '5d', interval: '15m' },
    '1m': { yahooRange: '1mo', interval: '1d' },
    '3m': { yahooRange: '3mo', interval: '1d' },
    '1y': { yahooRange: '1y', interval: '1d' },
    '5y': { yahooRange: '5y', interval: '1wk' },
    'all': { yahooRange: '10y', interval: '1mo' },
  };

  const { yahooRange, interval } = rangeConfigMap[range] || rangeConfigMap['1m'];

  try {
    const mappedTicker = resolvedSource;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mappedTicker)}?interval=${interval}&range=${yahooRange}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ points: [], error: `HTTP ${res.status}` });
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ points: [] });
    }

    const meta = result.meta ?? {};
    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const closes: number[] = quote.close ?? [];
    const opens: number[] = quote.open ?? [];
    const highs: number[] = quote.high ?? [];
    const lows: number[] = quote.low ?? [];

    const points: { date: string; close: number; open?: number; high?: number; low?: number }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || isNaN(close) || close <= 0) continue;

      const dateObj = new Date(timestamps[i] * 1000);
      const dateStr = range === '1w'
        ? dateObj.toISOString() // Full timestamp for intraday/1w
        : dateObj.toISOString().split('T')[0];

      points.push({
        date: dateStr,
        close: Number(close.toFixed(2)),
        open: opens[i] != null ? Number(opens[i].toFixed(2)) : undefined,
        high: highs[i] != null ? Number(highs[i].toFixed(2)) : undefined,
        low: lows[i] != null ? Number(lows[i].toFixed(2)) : undefined,
      });
    }

    const currentPrice = meta.regularMarketPrice ?? (points.length > 0 ? points[points.length - 1].close : null);
    const startPrice = points.length > 0 ? points[0].close : null;
    const change = currentPrice != null && startPrice != null ? currentPrice - startPrice : null;
    const changePercent = change != null && startPrice ? (change / startPrice) * 100 : null;

    const responseData = {
      ticker: rawTicker,
      shortName: meta.shortName ?? meta.longName ?? rawTicker,
      range,
      currency: meta.currency ?? 'USD',
      currentPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      change,
      changePercent,
      points,
    };

    cache.set(cacheKey, { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(responseData);
  } catch (err) {
    logger.warn(`${LOG_TAG} Error fetching security history for ${rawTicker}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ points: [], error: 'fetch_failed' });
  }
}
