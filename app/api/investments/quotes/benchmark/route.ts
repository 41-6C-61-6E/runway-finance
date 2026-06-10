import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Simple server-side cache
const cache = new Map<string, { points: { date: string; close: number }[]; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for benchmark data

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get('ticker') ?? 'SPY').toUpperCase();
  const range = searchParams.get('range') ?? '1y';

  const cacheKey = `${ticker}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ points: cached.points });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ points: [] });
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return NextResponse.json({ points: [] });

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    const points = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        close: closes[i] ?? 0,
      }))
      .filter((p) => p.close > 0);

    cache.set(cacheKey, { points, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ points });
  } catch {
    return NextResponse.json({ points: [] });
  }
}
