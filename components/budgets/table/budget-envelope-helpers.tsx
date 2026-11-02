'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { isEnvelopeRow, envelopeExplainText, type EnvelopeBudgetRow } from '@/lib/utils/budget-envelope';
import { formatCurrency } from '@/lib/utils/format';
import type { BudgetData } from './types';

export const isEnvelope = (b: BudgetData): boolean => isEnvelopeRow(b as EnvelopeBudgetRow);

export const renderEnvelopeBadge = (b: BudgetData): React.ReactNode => {
  if (!isEnvelope(b)) return null;
  const per = b.nativePeriodType === 'quarterly' ? 'qt' : 'yr';
  return (
    <span
      title={envelopeExplainText(b as EnvelopeBudgetRow, { formatCurrency })}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold border rounded shrink-0 bg-muted/60 text-muted-foreground border-border/60"
    >
      <Layers className="w-3 h-3 shrink-0" />
      {formatCurrency(b.nativeAmount ?? 0)}/{per}
    </span>
  );
};

export const renderBudgetCell = (b: BudgetData, periodType?: string): React.ReactNode => {
  if (!isEnvelope(b)) return <>{formatCurrency(b.budgeted)}</>;
  return (
    <span
      className="text-muted-foreground"
      title={`Averaged from ${formatCurrency(b.nativeAmount ?? 0)} per ${b.nativePeriodType === 'quarterly' ? 'quarter' : 'year'} — not a separate ${periodType === 'quarterly' ? 'quarterly' : 'monthly'} budget`}
    >
      {formatCurrency(b.budgeted)}
      <span className="text-[11px] font-sans text-muted-foreground/70 ml-0.5">avg</span>
    </span>
  );
};

export const envelopeSubText = (b: BudgetData): string | null => {
  if (!isEnvelope(b) || b.envelopeSpent == null || b.envelopeRemaining == null || b.nativeAmount == null) return null;
  const per = b.nativePeriodType === 'quarterly' ? 'qt' : 'yr';
  if (b.envelopeRemaining < 0) return `${formatCurrency(Math.abs(b.envelopeRemaining))} over ${formatCurrency(b.nativeAmount)}/${per}`;
  if (b.envelopeStatus === 'nearlyUsed') return `${formatCurrency(b.envelopeRemaining)} of ${formatCurrency(b.nativeAmount)}/${per} left`;
  return `${formatCurrency(b.envelopeRemaining)} of ${formatCurrency(b.nativeAmount)}/${per}`;
};
