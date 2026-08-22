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
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const termMonths = mortgage.termMonths ?? 360;
  const monthlyPayment = mortgage.monthlyPayment;
  const mortgageStartDate = (mortgage.metadata as any)?.purchaseDate as string ?? '2020-01-01';

  const escrow = mortgage.escrow ?? 0;
  const pmi = mortgage.pmi ?? 0;

  const monthlyPI = monthlyPayment;

  useEffect(() => {
    const ep = mortgage.extraPrincipal ?? 0;
    setExtraMonthly(ep > 0 ? String(ep) : '');
    setShowProjection(ep > 0);
    setLumpSum('');
    setLumpSumDate('');
    setBiweekly(false);
  }, [mortgage.id, mortgage.extraPrincipal]);

  const originalPropertyPrice = ((mortgage.metadata as any)?.purchasePrice as number) || (mortgage.originalLoanAmount > 0 ? mortgage.originalLoanAmount / 0.8 : undefined);

  const amortParams = useMemo(() => ({
    originalBalance: mortgage.originalLoanAmount,
    annualRate: mortgage.interestRate,
    termMonths,
    monthlyPayment: monthlyPI,
    startDate: mortgageStartDate,
    originalPropertyPrice,
    monthlyPmi: pmi,
  }), [mortgage.originalLoanAmount, mortgage.interestRate, termMonths, monthlyPI, mortgageStartDate, originalPropertyPrice, pmi]);

  const { standard, accelerated, standardSummary, acceleratedSummary } = useMemo(
    () => {
      if (!showProjection) {
        const standard = calculateAmortizationSchedule(amortParams);
        const zeroRow = standard.find((r) => r.remainingBalance <= 0);
        const defaultDate = new Date().toISOString().split('T')[0];
        const isNegative = !zeroRow && standard[standard.length - 1]?.remainingBalance > mortgage.originalLoanAmount;
        return {
          standard,
          accelerated: [],
          standardSummary: {
            payoffDate: zeroRow ? zeroRow.date : null,
            totalInterest: standard.reduce((s, r) => s + r.interest, 0),
            totalPayments: zeroRow ? zeroRow.month : standard.length,
            isNegativeAmortization: isNegative,
          },
          acceleratedSummary: {
            payoffDate: zeroRow ? zeroRow.date : null,
            totalInterest: 0,
            totalPayments: 0,
            interestSaved: 0,
            monthsSaved: 0,
            pmiSaved: 0,
            isNegativeAmortization: isNegative,
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
    [amortParams, showProjection, extraMonthly, lumpSum, lumpSumDate, biweekly, mortgage.originalLoanAmount]
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

  const formatXAxis = useCallback((tickStr: string) => {
    return formatChartXAxisDate(tickStr, 'all', { isMonthly: true });
  }, []);

  const xAxisTicks = useMemo(() => {
    return getChartXTicksUnified(chartDataPoints, 'all', isMobile, 'date');
  }, [chartDataPoints, isMobile]);

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

      {/* Mortgage Payoff Progress */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Mortgage Payoff</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold blur-number">
              {payoffProgress.toFixed(1)}% Paid
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="text-slate-500 dark:text-slate-400 blur-number">
              {(100 - Math.min(payoffProgress, 100)).toFixed(1)}% Owed
            </span>
          </div>
        </div>
        <div className="w-full h-3 bg-muted/60 dark:bg-muted/40 rounded-full p-0.5 overflow-hidden flex items-stretch gap-0.5 border border-border/40 shadow-inner">
          <div
            className="h-full bg-emerald-500 dark:bg-emerald-500/90 rounded-l-full transition-all duration-300 shadow-xs"
            style={{ width: `${Math.min(payoffProgress, 100)}%` }}
            title={`Paid Off: ${formatCurrency(Math.max(0, mortgage.originalLoanAmount - currentBalance))} (${payoffProgress.toFixed(1)}%)`}
          />
          <div
            className="h-full bg-slate-400/40 dark:bg-slate-700/70 rounded-r-full flex-1 transition-all duration-300 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:4px_4px]"
            title={`Remaining Balance: ${formatCurrency(currentBalance)} (${(100 - Math.min(payoffProgress, 100)).toFixed(1)}%)`}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
          <span>
            Paid:{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-medium blur-number">
              {formatCurrency(Math.max(0, mortgage.originalLoanAmount - currentBalance))}
            </strong>
          </span>
          <span>
            Original:{' '}
            <strong className="text-foreground font-mono font-medium blur-number">
              {formatCurrency(mortgage.originalLoanAmount)}
            </strong>
          </span>
          <span>
            Owed:{' '}
            <strong className="text-slate-600 dark:text-slate-400 font-mono font-medium blur-number">
              {formatCurrency(currentBalance)}
            </strong>
          </span>
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

                {standardSummary.isNegativeAmortization && (
                  <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-[11px] text-destructive">
                    <span className="font-semibold">Negative Amortization:</span> Monthly payment does not cover interest accrued. Balance will grow over time.
                  </div>
                )}

                {hasExtraPayments && (
                  <div className="flex items-start justify-between pt-2 border-t border-border gap-2">
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Payoff:</span>
                        <span className="font-medium text-chart-1">
                          {acceleratedSummary.payoffDate ? formatSafeUTCDate(acceleratedSummary.payoffDate, { month: 'short', year: 'numeric' }) : 'Never'}
                        </span>
                        <span className="text-muted-foreground">
                          (vs {standardSummary.payoffDate ? formatSafeUTCDate(standardSummary.payoffDate, { month: 'short', year: 'numeric' }) : 'Never'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Interest saved:</span>
                        <span className="font-medium text-chart-2 blur-number">{formatCurrency(acceleratedSummary.interestSaved)}</span>
                        {acceleratedSummary.monthsSaved > 0 && (
                          <span className="text-muted-foreground">| {acceleratedSummary.monthsSaved}mo sooner</span>
                        )}
                      </div>
                      {acceleratedSummary.pmiSaved !== undefined && acceleratedSummary.pmiSaved > 0 && (
                        <div className="flex items-center gap-2 text-chart-1">
                          <span className="text-muted-foreground">PMI saved:</span>
                          <span className="font-medium blur-number">{formatCurrency(acceleratedSummary.pmiSaved)}</span>
                          {acceleratedSummary.pmiRemovalDate78 && (
                            <span className="text-muted-foreground">
                              (ends {formatSafeUTCDate(acceleratedSummary.pmiRemovalDate78, { month: 'short', year: 'numeric' })})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
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
          <div className="h-full w-full overflow-x-auto overflow-y-hidden">
            <div className="min-w-max h-full">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
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
                ticks={xAxisTicks}
                tickFormatter={formatXAxis}
                minTickGap={30}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={75}
                tickFormatter={(v: number) => formatChartYAxisCurrency(v, 0, Math.ceil(maxBalance * 1.1))}
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
          </div>
        </div>
      ) : (
        <div className="h-[250px] flex items-center justify-center">
          <ChartEmptyState variant="nodata" description="No amortization data available" />
        </div>
      )}
    </div>
  );
}
