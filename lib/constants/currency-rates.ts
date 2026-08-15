export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.09,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0064,
  CHF: 1.11,
  CNY: 0.14,
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  const from = (fromCurrency || 'USD').toUpperCase().trim();
  const to = (toCurrency || 'USD').toUpperCase().trim();
  if (from === to) return amount;

  const fromRate = EXCHANGE_RATES[from] ?? 1.0;
  const toRate = EXCHANGE_RATES[to] ?? 1.0;

  const usdAmount = amount * fromRate;
  return usdAmount / toRate;
}
