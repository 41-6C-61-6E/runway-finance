/**
 * Centralized third-party endpoints and external URL builders.
 */

export const EXTERNAL_URLS = {
  yahooFinanceChart: 'https://query1.finance.yahoo.com/v8/finance/chart',
  googleFavicon: (domain: string, sz = 128) =>
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`,
  duckDuckGoFavicon: (domain: string) =>
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
  googleSearch: (query: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  redfinStingray: 'https://www.redfin.com/stingray',
  fredSeries: 'https://api.stlouisfed.org/fred/series/observations',
  openAiBase: 'https://api.openai.com/v1',
} as const;

