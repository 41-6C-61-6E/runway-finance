export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.09,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0064,
  CHF: 1.11,
  CNY: 0.14,
  INR: 0.012,
  SGD: 0.75,
  NZD: 0.60,
  MXN: 0.055,
  BRL: 0.18,
  KRW: 0.00073,
  SEK: 0.095,
  NOK: 0.092,
  HKD: 0.128,
  TWD: 0.031,
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  const from = (fromCurrency || 'USD').toUpperCase().trim();
  const to = (toCurrency || 'USD').toUpperCase().trim();
  if (from === to) return amount;

  const fromRate = EXCHANGE_RATES[from] ?? 1.0;
  const toRate = EXCHANGE_RATES[to] && EXCHANGE_RATES[to] > 0 ? EXCHANGE_RATES[to] : 1.0;

  const usdAmount = amount * fromRate;
  return usdAmount / toRate;
}
