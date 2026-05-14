'use client';

import { useState, useMemo, useCallback } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { SyntheticLineLayer } from '@/components/charts/synthetic-line-layer';
import {
  calculateAmortizationSchedule,
  calculateAmortizationWithExtraPayments,
} from '@/lib/utils/amortization';

interface MortgageDetail {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  escrowAmount?: number;
  termMonths?: number;
  metadata?: Record<string, unknown>;
}

interface MortgagePaydownChartProps {
  mortgage: MortgageDetail;
  propertyName?: string;
}

export function MortgagePaydownChart({ mortgage, propertyName }: MortgagePaydownChartProps) {
  const [extraMonthly, setExtraMonthly] = useState('');
  const [lumpSum, setLumpSum] = useState('');
  const [lumpSumDate, setLumpSumDate] = useState('');
  const [biweekly, setBiweekly] = useState(false);
  const [showProjection, setShowProjection] = useState(false);

  const termMonths = mortgage.termMonths ?? 360;
  const monthlyPayment = mortgage.monthlyPayment;
  const mortgageStartDate = (mortgage.metadata as any)?.purchaseDate as string ?? '2020-01-01';

  const amortParams = useMemo(() => ({
    originalBalance: mortgage.originalLoanAmount,
    annualRate: mortgage.interestRate,
    termMonths,
    monthlyPayment,
    startDate: mortgageStartDate,
  }), [mortgage.originalLoanAmount, mortgage.interestRate, termMonths, monthlyPayment, mortgageStartDate]);

  const fullSchedule = useMemo(() => calculateAmortizationSchedule(amortParams), [amortParams]);

  const { standard, accelerated, standardSummary, acceleratedSummary } = useMemo(
    () => {
      if (!showProjection) {
        const standard = calculateAmortizationSchedule(amortParams);
        const last = standard[standard.length - 1];
        return {
          standard,
          accelerated: [],
          standardSummary: {
            payoffDate: last.date,
            totalInterest: standard.reduce((s, r) => s + r.interest, 0),
            totalPayments: standard.length,
          },
          acceleratedSummary: {
            payoffDate: last.date,
            totalInterest: 0,
            totalPayments: 0,
            interestSaved: 0,
            monthsSaved: 0,
          },
        };
      }
      return calculateAmortizationWithExtraPayments(amortParams, {
        monthlyExtra: parseFloat(extraMonthly) || 0,
        lumpSumAmount: parseFloat(lumpSum) || 0,
        lumpSumDate: lumpSumDate || undefined,
        biweekly,
      });
    },
    [amortParams, showProjection, extraMonthly, lumpSum, lumpSumDate, biweekly]
  );

  const currentBalance = Math.abs(mortgage.balance);
  const payoffProgress = mortgage.originalLoanAmount > 0
    ? ((mortgage.originalLoanAmount - currentBalance) / mortgage.originalLoanAmount) * 100
    : 0;

  const chartData = useMemo(() => {
    const series: Array<{
      id: string;
      data: Array<{ x: string; y: number }>;
    }> = [];

    const origination = new Date(mortgageStartDate);
    const now = new Date();

    // Standard amortization line (all history + projection)
    series.push({
      id: 'Standard',
      data: standard
        .filter((r) => {
          const d = new Date(r.date);
          return showProjection ? true : d <= now;
        })
        .map((r) => ({
          x: r.date.slice(0, 7),
          y: r.remainingBalance,
        })),
    });

    // Accelerated line (only if showing projection with extra payments)
    if (showProjection && accelerated.length > 0) {
      series.push({
        id: 'With Extra Payments',
        data: accelerated.map((r) => ({
          x: r.date.slice(0, 7),
          y: r.remainingBalance,
        })),
      });
    }

    return series;
  }, [standard, accelerated, showProjection]);

  const handleReset = useCallback(() => {
    setExtraMonthly('');
    setLumpSum('');
    setLumpSumDate('');
    setBiweekly(false);
    setShowProjection(false);
  }, []);

  const hasExtraPayments = showProjection && (parseFloat(extraMonthly) > 0 || parseFloat(lumpSum) > 0 || biweekly);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{mortgage.name}</h3>
          {propertyName && (
            <p className="text-[10px] text-muted-foreground">{propertyName}</p>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-bold text-foreground blur-number">
            {formatCurrency(currentBalance)}
          </div>
          <div className="text-[10px] text-muted-foreground">Current Balance</div>
        </div>
      </div>

      {/* Payoff Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Payoff Progress</span>
          <span>{payoffProgress.toFixed(1)}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-chart-2 rounded-full transition-all" style={{ width: `${Math.min(payoffProgress, 100)}%` }} />
        </div>
      </div>

      {/* Mortgage Details */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        <div>
          <span className="text-muted-foreground">Rate</span>
          <div className="font-mono font-medium text-foreground">{mortgage.interestRate.toFixed(2)}%</div>
        </div>
        <div>
          <span className="text-muted-foreground">Payment</span>
          <div className="font-mono font-medium text-foreground">{formatCurrency(monthlyPayment)}/mo</div>
        </div>
        <div>
          <span className="text-muted-foreground">Term</span>
          <div className="font-mono font-medium text-foreground">{termMonths}mo</div>
        </div>
      </div>

      {/* Extra Payment Controls */}
      <div className="mb-4 p-3 bg-muted/30 border border-border rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-foreground">Extra Payment Calculator</span>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showProjection}
              onChange={(e) => setShowProjection(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">Enable</span>
          </label>
        </div>

        {showProjection && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Extra Monthly</label>
                <input
                  type="number"
                  value={extraMonthly}
                  onChange={(e) => setExtraMonthly(e.target.value)}
                  placeholder="e.g., 500"
                  className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded font-mono"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1.5 pb-1">
                  <input
                    type="checkbox"
                    checked={biweekly}
                    onChange={(e) => setBiweekly(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">Bi-weekly (½ payment every 2 weeks)</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Lump Sum</label>
                <input
                  type="number"
                  value={lumpSum}
                  onChange={(e) => setLumpSum(e.target.value)}
                  placeholder="e.g., 10000"
                  className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Lump Sum Date</label>
                <input
                  type="date"
                  value={lumpSumDate}
                  onChange={(e) => setLumpSumDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-input rounded font-mono"
                />
              </div>
            </div>

            {hasExtraPayments && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Payoff:</span>
                    <span className="font-medium text-chart-1">{acceleratedSummary.payoffDate}</span>
                    <span className="text-muted-foreground">(vs {standardSummary.payoffDate})</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-muted-foreground">Interest saved:</span>
                    <span className="font-medium text-chart-2">{formatCurrency(acceleratedSummary.interestSaved)}</span>
                    <span className="text-muted-foreground">| {acceleratedSummary.monthsSaved}mo sooner</span>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && chartData[0].data.length > 0 ? (
        <div className="h-[250px]">
          <ResponsiveLine
            data={chartData}
            margin={{ top: 10, right: 20, left: 80, bottom: 30 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: Math.max(...chartData.flatMap((s) => s.data.map((d) => d.y)), 1) * 1.1 }}
            curve="monotoneX"
            axisLeft={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            axisBottom={{
              tickSize: 0, tickPadding: 8, tickValues: 4,
              format: (v: string) => v,
            }}
            enableGridY={true}
            enableGridX={false}
            enablePoints={false}
            enableArea={false}
            colors={['var(--color-chart-4)', 'var(--color-chart-2)']}
            lineWidth={2}
            theme={nivoTheme}
            animate={chartData[0]?.data.length < 100}
            useMesh={true}
            layers={[
              'grid',
              'axes',
              ...(hasExtraPayments ? [(props: any) => <SyntheticLineLayer key="synthetic" {...props} />] : []),
              'lines',
              'points',
              'slices',
              'crosshair',
              'legends',
            ] as any}
            legends={chartData.length > 1 ? [
              {
                anchor: 'top-right',
                direction: 'column',
                justify: false,
                translateX: 20,
                translateY: 0,
                itemsSpacing: 2,
                itemDirection: 'left-to-right',
                itemWidth: 120,
                itemHeight: 16,
                itemOpacity: 0.75,
                symbolSize: 10,
                symbolShape: 'circle',
              },
            ] : undefined}
            tooltip={({ point }) => (
              <ChartTooltip>
                <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
                <TooltipRow label={String(point.seriesId)} value={formatCurrency(Number(point.data.y))} />
              </ChartTooltip>
            )}
          />
        </div>
      ) : (
        <div className="h-[250px] flex items-center justify-center">
          <ChartEmptyState variant="nodata" description="No amortization data available" />
        </div>
      )}
    </div>
  );
}
