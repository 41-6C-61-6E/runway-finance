import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

const LOG_TAG = '[financial-provider]';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TickerSearchResult {
  ticker: string;
  name: string;
}

export interface TickerQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
  sector?: string;
  assetClass?: string;
}

export interface TickerHistory {
  date: string;
  close: number;
}

export interface FinancialProvider {
  searchTicker(query: string): Promise<TickerSearchResult[]>;
  fetchQuotes(tickers: string[]): Promise<TickerQuote[]>;
  fetchHistory(ticker: string, range: string): Promise<TickerHistory[]>;
}

// ─── Yahoo Finance Provider (Default, Keyless) ────────────────────────────────

class YahooFinanceProvider implements FinancialProvider {
  async searchTicker(query: string): Promise<TickerSearchResult[]> {
    if (!query) return [];
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { quotes?: Array<{ symbol?: string; shortname?: string; longname?: string }> };
      if (!data.quotes) return [];
      return data.quotes
        .filter((q) => q.symbol)
        .map((q) => ({
          ticker: q.symbol!,
          name: q.longname || q.shortname || q.symbol!,
        }));
    } catch (err) {
      logger.warn(`${LOG_TAG} Yahoo search failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async fetchQuotes(tickers: string[]): Promise<TickerQuote[]> {
    if (tickers.length === 0) return [];
    // Yahoo Quote v7 supports comma-separated list
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.map(encodeURIComponent).join(',')}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { quoteResponse?: { result?: Array<{ symbol: string; regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number; longName?: string; shortName?: string; quoteType?: string }> } };
      const results = data.quoteResponse?.result || [];
      return results.map((r) => {
        let assetClass = 'Equity';
        if (r.quoteType === 'ETF') assetClass = 'ETF';
        else if (r.quoteType === 'MUTUALFUND') assetClass = 'Mutual Fund';
        else if (r.quoteType === 'CRYPTOCURRENCY') assetClass = 'Crypto';

        return {
          ticker: r.symbol,
          price: r.regularMarketPrice || 0,
          change: r.regularMarketChange || 0,
          changePercent: r.regularMarketChangePercent || 0,
          name: r.longName || r.shortName || r.symbol,
          sector: 'Other',
          assetClass,
        };
      });
    } catch (err) {
      logger.warn(`${LOG_TAG} Yahoo quotes fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async fetchHistory(ticker: string, range: string): Promise<TickerHistory[]> {
    let interval = '1d';
    // Map standard ranges to Yahoo ranges & intervals
    let yahooRange = '1y';
    if (range === '1m') { yahooRange = '1mo'; }
    else if (range === '3m') { yahooRange = '3mo'; }
    else if (range === '6m') { yahooRange = '6mo'; }
    else if (range === '5y') { yahooRange = '5y'; }
    else if (range === 'all') { yahooRange = 'max'; }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yahooRange}&interval=${interval}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> } };
      const result = data.chart?.result?.[0];
      const timestamps = result?.timestamp;
      const closes = result?.indicators?.quote?.[0]?.close;
      if (!timestamps || !closes) return [];

      return timestamps
        .map((ts, idx) => {
          const date = new Date(ts * 1000).toISOString().split('T')[0];
          const close = closes[idx];
          return { date, close: close ?? 0 };
        })
        .filter((h) => h.close > 0);
    } catch (err) {
      logger.warn(`${LOG_TAG} Yahoo history failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

// ─── Polygon.io Provider ─────────────────────────────────────────────────────

class PolygonProvider implements FinancialProvider {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchTicker(query: string): Promise<TickerSearchResult[]> {
    if (!query) return [];
    const url = `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&limit=10&apiKey=${this.apiKey}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { results?: Array<{ ticker: string; name: string }> };
      return (data.results || []).map((r) => ({
        ticker: r.ticker,
        name: r.name,
      }));
    } catch (err) {
      logger.warn(`${LOG_TAG} Polygon search failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async fetchQuotes(tickers: string[]): Promise<TickerQuote[]> {
    if (tickers.length === 0) return [];
    // Polygon last trade API works per ticker, we'll batch them in parallel
    const quotes = await Promise.all(
      tickers.map(async (ticker) => {
        const url = `https://api.polygon.io/v2/last/trade/R/${encodeURIComponent(ticker)}?apiKey=${this.apiKey}`;
        try {
          // Fetch last trade price
          const tradeRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!tradeRes.ok) throw new Error(`HTTP ${tradeRes.status}`);
          const tradeData = await tradeRes.json() as { results?: { p?: number } };
          const price = tradeData.results?.p || 0;

          // Fetch daily open/close for change calculations
          const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${this.apiKey}`;
          const prevRes = await fetch(prevUrl, { signal: AbortSignal.timeout(8000) });
          let change = 0;
          let changePercent = 0;
          let name = ticker;
          if (prevRes.ok) {
            const prevData = await prevRes.json() as { results?: Array<{ c?: number }> };
            const prevClose = prevData.results?.[0]?.c || price;
            change = price - prevClose;
            changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
          }

          // Fetch ticker details for long name
          const detailUrl = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${this.apiKey}`;
          const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
          if (detailRes.ok) {
            const detailData = await detailRes.json() as { results?: { name?: string } };
            name = detailData.results?.name || ticker;
          }

          return {
            ticker,
            price,
            change,
            changePercent,
            name,
            sector: 'Other',
            assetClass: 'Equity',
          };
        } catch (err) {
          logger.warn(`${LOG_TAG} Polygon quote failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      })
    );
    return quotes.filter((q): q is NonNullable<typeof q> => q !== null);
  }

  async fetchHistory(ticker: string, range: string): Promise<TickerHistory[]> {
    // Map standard ranges to startDates
    const endDate = new Date().toISOString().split('T')[0];
    const start = new Date();
    if (range === '1m') start.setMonth(start.getMonth() - 1);
    else if (range === '3m') start.setMonth(start.getMonth() - 3);
    else if (range === '6m') start.setMonth(start.getMonth() - 6);
    else if (range === '5y') start.setFullYear(start.getFullYear() - 5);
    else if (range === 'all') start.setFullYear(start.getFullYear() - 15);
    else start.setFullYear(start.getFullYear() - 1); // 1y default

    const startDate = start.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { results?: Array<{ t: number; c: number }> };
      return (data.results || []).map((r) => ({
        date: new Date(r.t).toISOString().split('T')[0],
        close: r.c,
      }));
    } catch (err) {
      logger.warn(`${LOG_TAG} Polygon history failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

// ─── Alpha Vantage Provider ──────────────────────────────────────────────────

class AlphaVantageProvider implements FinancialProvider {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchTicker(query: string): Promise<TickerSearchResult[]> {
    if (!query) return [];
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${this.apiKey}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { bestMatches?: Array<Record<string, string>> };
      return (data.bestMatches || []).map((m) => ({
        ticker: m['1. symbol'] || '',
        name: m['2. name'] || m['1. symbol'] || '',
      })).filter((r) => r.ticker);
    } catch (err) {
      logger.warn(`${LOG_TAG} Alpha Vantage search failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async fetchQuotes(tickers: string[]): Promise<TickerQuote[]> {
    if (tickers.length === 0) return [];
    // Alpha Vantage does not support batch quotes on free/standard key easily,
    // so we fetch individually.
    const quotes = await Promise.all(
      tickers.map(async (ticker) => {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as { 'Global Quote'?: Record<string, string> };
          const quote = data['Global Quote'];
          if (!quote) return null;
          const price = parseFloat(quote['05. price'] || '0');
          const change = parseFloat(quote['09. change'] || '0');
          const changePctStr = quote['10. change percent'] || '0%';
          const changePercent = parseFloat(changePctStr.replace('%', ''));
          return {
            ticker,
            price,
            change,
            changePercent,
            name: ticker,
            sector: 'Other',
            assetClass: 'Equity',
          };
        } catch (err) {
          logger.warn(`${LOG_TAG} Alpha Vantage quote failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      })
    );
    return quotes.filter((q): q is NonNullable<typeof q> => q !== null);
  }

  async fetchHistory(ticker: string, range: string): Promise<TickerHistory[]> {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${this.apiKey}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { 'Time Series (Daily)'?: Record<string, { '4. close': string }> };
      const series = data['Time Series (Daily)'];
      if (!series) return [];

      const list = Object.entries(series).map(([date, values]) => ({
        date,
        close: parseFloat(values['4. close']),
      })).sort((a, b) => a.date.localeCompare(b.date));

      // Filter based on range
      const limitDate = new Date();
      if (range === '1m') limitDate.setMonth(limitDate.getMonth() - 1);
      else if (range === '3m') limitDate.setMonth(limitDate.getMonth() - 3);
      else if (range === '6m') limitDate.setMonth(limitDate.getMonth() - 6);
      else if (range === '5y') limitDate.setFullYear(limitDate.getFullYear() - 5);
      else if (range === 'all') limitDate.setFullYear(limitDate.getFullYear() - 15);
      else limitDate.setFullYear(limitDate.getFullYear() - 1); // 1y default

      const limitStr = limitDate.toISOString().split('T')[0];
      return list.filter((h) => h.date >= limitStr);
    } catch (err) {
      logger.warn(`${LOG_TAG} Alpha Vantage history failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}

// ─── Provider Factory & Registry ─────────────────────────────────────────────

export async function getFinancialProvider(userId: string): Promise<FinancialProvider> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ apiKeys: userSettings.apiKeys })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings?.apiKeys) {
      return new YahooFinanceProvider();
    }

    const dek = await getSessionDEK();
    const decrypted = await decryptField(settings.apiKeys, dek);
    const keys = JSON.parse(decrypted || '{}') as Record<string, string>;

    const providerType = keys.investmentsProvider || 'yahoo'; // default to yahoo
    if (providerType === 'polygon' && keys.polygonApiKey) {
      return new PolygonProvider(keys.polygonApiKey);
    } else if (providerType === 'alphavantage' && keys.alphaVantageApiKey) {
      return new AlphaVantageProvider(keys.alphaVantageApiKey);
    }
  } catch (err) {
    logger.debug(`${LOG_TAG} Failed to read decrypted API keys settings, falling back to Yahoo Finance: ${err instanceof Error ? err.message : String(err)}`);
  }

  return new YahooFinanceProvider();
}
