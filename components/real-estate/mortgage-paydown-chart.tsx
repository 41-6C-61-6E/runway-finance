'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
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
  extraPrincipal?: number;
  pmi?: number;
  escrow?: number;
}

interface MortgagePaydownChartProps {
  mortgage: MortgageDetail;
  propertyName?: string;
  inline?: boolean;
}

export function MortgagePaydownChart({ mortgage, propertyName, inline = false }: MortgagePaydownChartProps) {
  const [extraMonthly, setExtraMonthly] = useState('');
  const [lumpSum, setLumpSum] = useState('');
  const [lumpSumDate, setLumpSumDate] = useState('');
  const [biweekly, setBiweekly] = useState(false);
  const [showProjection, setShowProjection] = useState(false);

  const termMonths = mortgage.termMonths ?? 360;
  const monthlyPayment = mortgage.monthlyPayment;
  const mortgageStartDate = (mortgage.metadata as any)?.purchaseDate as string ?? '2020-01-01';

  const escrow = mortgage.escrow ?? 0;
  const pmi = mortgage.pmi ?? 0;

  const monthlyPI = useMemo(() => {
    return Math.max(0, monthlyPayment - escrow - pmi);
  }, [escrow, pmi, monthlyPayment]);

  useEffect(() => {
    const ep = mortgage.extraPrincipal ?? 0;
    setExtraMonthly(ep > 0 ? String(ep) : '');
    setShowProjection(ep > 0);
    setLumpSum('');
    setLumpSumDate('');
    setBiweekly(false);
  }, [mortgage.id, mortgage.extraPrincipal]);

  const amortParams = useMemo(() => ({
    originalBalance: mortgage.originalLoanAmount,
    annualRate: mortgage.interestRate,
    termMonths,
    monthlyPayment: monthlyPI,
    startDate: mortgageStartDate,
  }), [mortgage.originalLoanAmount, mortgage.interestRate, termMonths, monthlyPI, mortgageStartDate]);

  const { standard, accelerated, standardSummary, acceleratedSummary } = useMemo(
    () => {
      if (!showProjection) {
        const standard = calculateAmortizationSchedule(amortParams);
        const last = standard[standard.length - 1];
        const defaultDate = new Date().toISOString().split('T')[0];
        return {
          standard,
          accelerated: [],
          standardSummary: {
            payoffDate: last?.date ?? defaultDate,
            totalInterest: standard.reduce((s, r) => s + r.interest, 0),
            totalPayments: standard.length,
          },
          acceleratedSummary: {
            payoffDate: last?.date ?? defaultDate,
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

  const chartDataPoints = useMemo(() => {
    const datesSet = new Set<string>();
    standard.forEach((r) => datesSet.add(r.date));
    accelerated.forEach((r) => datesSet.add(r.date));
    const dates = Array.from(datesSet).sort();

    return dates.map((d) => {
      const stdPoint = standard.find((r) => r.date === d);
      const accPoint = accelerated.find((r) => r.date === d);
      return {
        date: d,
        Standard: stdPoint ? stdPoint.remainingBalance : null,
        'With Extra Payments': accPoint ? accPoint.remainingBalance : null,
      };
    });
  }, [standard, accelerated]);

  const maxBalance = useMemo(() => {
    const vals = [1];
    standard.forEach((r) => vals.push(r.remainingBalance));
    accelerated.forEach((r) => vals.push(r.remainingBalance));
    return Math.max(...vals);
  }, [standard, accelerated]);

  const handleReset = useCallback(() => {
    setExtraMonthly('');
    setLumpSum('');
    setLumpSumDate('');
    setBiweekly(false);
    setShowProjection(false);
  }, []);

  const hasExtraPayments = showProjection && (parseFloat(extraMonthly) > 0 || parseFloat(lumpSum) > 0 || biweekly);

  const formatXAxis = (tickStr: string) => {
    try {
      const parts = tickStr.split('-');
      if (parts.length < 3) return tickStr;
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch (e) {
      return tickStr;
    }
  };

  const xInterval = Math.max(1, Math.floor(chartDataPoints.length / 6));

  return (
    <div className={inline ? "" : "bg-card border border-border rounded-xl p-5"}>
      {!inline && (
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
      )}

      {/* Payoff Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Payoff Progress</span>
          <span className="blur-number">{payoffProgress.toFixed(1)}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-chart-2 rounded-full transition-all" style={{ width: `${Math.min(payoffProgress, 100)}%` }} />
        </div>
      </div>

      {/* Mortgage Details */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        <div>
          <span className="text-muted-foreground">Rate</span>
          <div className="font-mono font-medium text-foreground blur-number">{mortgage.interestRate.toFixed(2)}%</div>
        </div>
        <div>
          <span className="text-muted-foreground">Payment</span>
          <div className="font-mono font-medium text-foreground blur-number">{formatCurrency(monthlyPayment)}/mo</div>
        </div>
        <div>
          <span className="text-muted-foreground">Term</span>
          <div className="font-mono font-medium text-foreground blur-number">{termMonths}mo</div>
        </div>
      </div>

      {/* Payment Breakdown */}
      {((mortgage.escrow !== undefined && mortgage.escrow > 0) ||
        (mortgage.pmi !== undefined && mortgage.pmi > 0) ||
        (mortgage.extraPrincipal !== undefined && mortgage.extraPrincipal > 0)) && (
        <div className="mb-4 p-3 bg-muted/20 border border-border/50 rounded-lg grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] text-muted-foreground">
          {mortgage.escrow !== undefined && mortgage.escrow > 0 && (
            <div>
              <span className="block text-muted-foreground">Escrow</span>
              <span className="font-mono font-medium text-foreground blur-number">{formatCurrency(mortgage.escrow)}</span>
            </div>
          )}
          {mortgage.pmi !== undefined && mortgage.pmi > 0 && (
            <div>
              <span className="block text-muted-foreground">PMI</span>
              <span className="font-mono font-medium text-foreground blur-number">{formatCurrency(mortgage.pmi)}</span>
            </div>
          )}
          {mortgage.extraPrincipal !== undefined && mortgage.extraPrincipal > 0 && (
            <div>
              <span className="block text-chart-1 font-medium">Extra Principal</span>
              <span className="font-mono font-medium text-chart-1 blur-number">{formatCurrency(mortgage.extraPrincipal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Extra Payment Controls */}
      <div className="mb-4 p-3 bg-muted/30 border border-border rounded-lg">
        {currentBalance === 0 ? (
          <div className="text-center py-1">
            <span className="text-xs font-semibold text-chart-2 uppercase tracking-wider flex items-center justify-center gap-1">
              ✓ Fully Paid Off
            </span>
            <p className="text-[10px] text-muted-foreground mt-1">This loan is fully paid off. View historical amortization below.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-foreground">Extra Payment Calculator</span>
              <label className="flex items-center gap-1.5 font-normal cursor-pointer">
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
                    <label className="flex items-center gap-1.5 pb-1 font-normal cursor-pointer">
                      <input
                        type="checkbox"
                        checked={biweekly}
                        onChange={(e) => setBiweekly(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-[10px] text-muted-foreground leading-tight">Bi-weekly (½ payment every 2 weeks)</span>
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
                      className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chart */}
      {chartDataPoints.length > 0 ? (
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartDataPoints}
              margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                interval={xInterval}
                tickFormatter={formatXAxis}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={75}
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                }}
                domain={[0, Math.ceil(maxBalance * 1.1)]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const dateStr = payload[0].payload.date;
                  const formattedDate = formatXAxis(dateStr);
                  return (
                    <ChartTooltip>
                      <TooltipHeader>{formattedDate}</TooltipHeader>
                      {payload.map((p) => (
                        <TooltipRow
                          key={p.name}
                          label={String(p.name)}
                          value={formatCurrency(Number(p.value))}
                          color={p.color}
                        />
                      ))}
                    </ChartTooltip>
                  );
                }}
              />
              {showProjection && accelerated.length > 0 && (
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="Standard"
                stroke="var(--color-chart-4)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              {showProjection && accelerated.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="With Extra Payments"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[250px] flex items-center justify-center">
          <ChartEmptyState variant="nodata" description="No amortization data available" />
        </div>
      )}
    </div>
  );
}
