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
  return `Redfin property found! Estimate: ${formatCurrency(price)}`;
}

/**
 * Client-safe extraction of a Redfin property ID from a bare ID or a
 * pasted Redfin property link (.../home/<id>). Mirrors the server helper.
 */
export function extractRedfinPropertyId(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const urlMatch = trimmed.match(/\/home\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return undefined;
}

/**
 * True when a legacy address field holds only a pasted Redfin link or a
 * bare property ID (i.e. it carries no human address worth keeping).
 */
export function isRedfinLinkInput(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.includes('/home/') || /^\d+$/.test(trimmed);
}
