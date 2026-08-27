// Shared types + copy for "envelope budgets": budgets defined in a longer
// timeframe (quarterly/yearly) that appear in a shorter viewed period.
//
// Envelope budgets are NOT prorated limits. A $12,000/yr vacation budget is
// within budget the entire year as long as total yearly spending never exceeds
// $12,000 — even if it's all spent in January. Pace is deliberately not part
// of the model; lumpy categories are tracked over their full native period.
//
// The per-period `budgeted` value for these rows is an informational AVERAGE
// ("≈ $1,000/mo"), never a limit.

export type EnvelopeStatus = 'within' | 'nearlyUsed' | 'exceeded';

/** Minimal shape of a budget row as returned by GET /api/budgets. */
export interface EnvelopeBudgetRow {
  id: string;
  categoryId?: string;
  categoryName: string;
  /** The viewed period (optional so both local BudgetData shapes can cast). */
  periodType?: string | null;
  nativePeriodType?: 'monthly' | 'quarterly' | 'yearly' | null;
  nativePeriodKey?: string | null;
  nativeAmount?: number | null;
  prorated?: boolean;
  budgeted: number;
  actual: number;
  remaining?: number;
  type: 'income' | 'expense';
  envelopeSpent?: number | null;
  envelopeRemaining?: number | null;
  envelopePercentUsed?: number | null;
  envelopeStatus?: EnvelopeStatus | null;
  envelopeStart?: string | null;
  envelopeEnd?: string | null;
}

export function nativePeriodLabel(nativePeriodType: string | null | undefined): string {
  if (nativePeriodType === 'quarterly') return 'quarter';
  if (nativePeriodType === 'yearly') return 'year';
  return 'month';
}

export function nativeShortLabel(nativePeriodType: string | null | undefined): string {
  if (nativePeriodType === 'quarterly') return 'Q';
  if (nativePeriodType === 'yearly') return 'YR';
  return 'MO';
}

export interface EnvelopeStatusMeta {
  label: string;
  /** Tailwind badge classes (bg/text/border) */
  badgeClass: string;
  /** Tailwind fill class for progress bars */
  barClass: string;
  /** Tailwind text color class */
  textClass: string;
}

export const ENVELOPE_STATUS_META: Record<EnvelopeStatus, EnvelopeStatusMeta> = {
  within: {
    label: 'Within budget',
    badgeClass: 'bg-constructive/10 text-constructive border-constructive/20',
    barClass: 'bg-constructive',
    textClass: 'text-constructive',
  },
  nearlyUsed: {
    label: 'Nearly used',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-500',
  },
  exceeded: {
    label: 'Over budget',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
    barClass: 'bg-destructive',
    textClass: 'text-destructive',
  },
};

/** True when this row is a longer-timeframe budget shown in a shorter period. */
export function isEnvelopeRow(b: EnvelopeBudgetRow): boolean {
  return Boolean(b.prorated) || (b.nativePeriodType != null && b.nativePeriodType !== 'monthly' && b.nativePeriodType !== b.periodType && b.nativeAmount != null);
}

/**
 * Plain-language explanation of how an envelope budget is tracked.
 * Used in tooltips and the info banner.
 */
export function envelopeExplainText(b: EnvelopeBudgetRow, opts?: { formatCurrency?: (n: number) => string }): string {
  const fmt = opts?.formatCurrency ?? ((n) => `$${n.toLocaleString()}`);
  const native = b.nativePeriodType === 'quarterly' ? 'quarter' : 'year';
  const per = b.nativePeriodType === 'quarterly' ? 'month' : (b.periodType === 'quarterly' ? 'quarter' : 'month');
  const avg = Math.round(b.budgeted);
  return `Budgeted as ${fmt(b.nativeAmount ?? 0)} per ${native} (≈ ${fmt(avg)} per ${per}). ` +
    `Single ${per}s can exceed ${fmt(avg)} — this budget only goes over when the full ${native} total passes ${fmt(b.nativeAmount ?? 0)}.`;
}

/** Short human line for the row, e.g. "2026: $6,000 of $12,000 used". */
export function envelopeSummaryLine(b: EnvelopeBudgetRow, formatCurrency: (n: number) => string): string | null {
  if (b.envelopeSpent == null || b.nativeAmount == null) return null;
  const label = b.nativePeriodKey ? String(b.nativePeriodKey).replace('-Q', ' Q') : nativePeriodLabel(b.nativePeriodType);
  return `${label}: ${formatCurrency(Math.round(b.envelopeSpent))} of ${formatCurrency(b.nativeAmount)} used`;
}

/** Status chip text for a table/summary row. */
export function envelopeStatusLabel(b: EnvelopeBudgetRow): string | null {
  if (!b.envelopeStatus) return null;
  return ENVELOPE_STATUS_META[b.envelopeStatus].label;
}
