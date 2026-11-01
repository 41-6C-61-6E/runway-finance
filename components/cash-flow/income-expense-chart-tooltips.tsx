import React from 'react';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { formatChartXAxisDate } from '@/lib/utils/chart-format';

export interface TooltipProps {
  active?: boolean;
  payload?: any[];
  timeframe: string;
}

export function IncomeExpenseTooltip({ active, payload, timeframe }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });
  return (
    <ChartTooltip>
      <TooltipHeader>{headerDate}</TooltipHeader>
      <TooltipRow label="Income" value={formatCurrency(point.income)} color="var(--color-chart-1)" />
      <TooltipRow label="Expenses" value={formatCurrency(Math.abs(point.expenses))} color="var(--color-destructive)" />
      <TooltipRow label="Net Income" value={formatCurrency(point.net)} color="var(--color-primary)" />
    </ChartTooltip>
  );
}

export function SavingsChartTooltip({ active, payload, timeframe }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });

  const totalSavings = (point.retirement || 0) + (point.hsa || 0) + (point.brokerage || 0) + (point.savingsAccount || 0) + (point.cash || 0);

  return (
    <ChartTooltip>
      <TooltipHeader>{headerDate}</TooltipHeader>
      <TooltipRow label="Savings Rate" value={formatPlainPercent(point.savingsRate)} color="var(--color-primary)" />
      <TooltipRow label="Total Savings" value={formatCurrency(totalSavings)} color="var(--color-primary)" />
      {point.retirement !== 0 && (
        <TooltipRow label="Retirement" value={formatCurrency(point.retirement)} color="var(--color-chart-1)" />
      )}
      {point.hsa !== 0 && (
        <TooltipRow label="HSA" value={formatCurrency(point.hsa)} color="var(--color-chart-2)" />
      )}
      {point.brokerage !== 0 && (
        <TooltipRow label="Brokerage" value={formatCurrency(point.brokerage)} color="var(--color-chart-3)" />
      )}
      {point.savingsAccount !== 0 && (
        <TooltipRow label="Savings Account" value={formatCurrency(point.savingsAccount)} color="var(--color-chart-4)" />
      )}
      {point.cash !== 0 && (
        <TooltipRow label="Leftover Cash" value={formatCurrency(point.cash)} color="var(--color-chart-5)" />
      )}
    </ChartTooltip>
  );
}

