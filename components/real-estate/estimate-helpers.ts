import { formatCurrency } from '@/lib/utils/format';

export interface PropertyEstimates {
  conservative?: number | null;
  normal?: number | null;
  optimistic?: number | null;
}

export function formatCompactEstimate(label: string, amount: number | null | undefined): string | null {
  if (amount === undefined || amount === null) return null;
  return `${label} - ${formatCurrency(amount, 'USD', 'en-US', { notation: 'compact', maximumFractionDigits: 2 })}`;
}

export function formatRedfinSuccessMessage(price: number): string {
  return `Valid address! Redfin Estimate: ${formatCurrency(price)}`;
}
