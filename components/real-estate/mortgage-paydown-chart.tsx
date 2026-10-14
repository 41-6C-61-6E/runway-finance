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
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import {
  calculateAmortizationSchedule,
  calculateAmortizationWithExtraPayments,
} from '@/lib/utils/amortization';
import { cn } from '@/lib/utils';
import { Sparkles, RotateCcw, Calculator, Calendar } from 'lucide-react';

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

  const setPresetExtra = (amount: number) => {
    setShowProjection(true);
    setExtraMonthly(String(amount));
  };

  return (
    <div className={cn('space-y-4', !inline && 'bg-card border border-border rounded-xl p-5')}>
      {/* ── 1. Unified Loan Status Banner ── */}
      <div className="p-4 bg-muted/20 border border-border/50 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{mortgage.name}</h4>
            {mortgage.interestRate > 0 && (
              <span className="px-1.5 py-0.5 text-micro font-mono font-medium rounded-md bg-muted text-muted-foreground border border-border">
                {mortgage.interestRate.toFixed(2)}% APR
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="font-mono text-base sm:text-lg font-bold text-foreground blur-number">
              {formatCurrency(currentBalance)}
            </span>
            <span className="text-[10px] text-muted-foreground block">Current Balance</span>
          </div>
        </div>

        {/* 4-Stat Metric Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
          <div className="p-2 rounded-lg bg-card/60 border border-border/40">
            <span className="text-[10px] text-muted-foreground block">Monthly P&amp;I</span>
            <span className="font-mono font-semibold text-foreground blur-number">
              {formatCurrency(monthlyPayment)}/mo
            </span>
          </div>
          <div className="p-2 rounded-lg bg-card/60 border border-border/40">
            <span className="text-[10px] text-muted-foreground block">Original Loan</span>
            <span className="font-mono font-semibold text-foreground blur-number">
              {formatCurrency(mortgage.originalLoanAmount)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-card/60 border border-border/40">
            <span className="text-[10px] text-muted-foreground block">Paid Off</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 blur-number">
              {formatPlainPercent(payoffProgress)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-card/60 border border-border/40">
            <span className="text-[10px] text-muted-foreground block">Loan Term</span>
            <span className="font-medium text-foreground">
              {termMonths} mo ({Math.round(termMonths / 12)} yr)
            </span>
          </div>
        </div>

        {/* Payoff Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="w-full h-2.5 bg-muted/60 dark:bg-muted/40 rounded-full overflow-hidden flex shadow-inner">
            <div
              className="h-full bg-emerald-500 rounded-l-full transition-all duration-300"
              style={{ width: `${Math.min(payoffProgress, 100)}%` }}
            />
            <div
              className="h-full bg-slate-400/40 dark:bg-slate-700/60 rounded-r-full flex-1"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              Paid: <strong className="text-emerald-600 dark:text-emerald-400 font-mono blur-number">{formatCurrency(Math.max(0, mortgage.originalLoanAmount - currentBalance))}</strong>
            </span>
            <span>
              Remaining: <strong className="text-slate-600 dark:text-slate-400 font-mono blur-number">{formatCurrency(currentBalance)}</strong>
            </span>
          </div>
        </div>

        {/* Escrow & PMI Badges */}
        {((mortgage.escrow !== undefined && mortgage.escrow > 0) ||
          (mortgage.pmi !== undefined && mortgage.pmi > 0) ||
          (mortgage.extraPrincipal !== undefined && mortgage.extraPrincipal > 0)) && (
          <div className="pt-2 border-t border-border/40 flex flex-wrap gap-2 text-[10px]">
            {mortgage.escrow !== undefined && mortgage.escrow > 0 && (
              <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground">
                Escrow: <strong className="font-mono text-foreground blur-number">{formatCurrency(mortgage.escrow)}</strong>
              </span>
            )}
            {mortgage.pmi !== undefined && mortgage.pmi > 0 && (
              <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground">
                PMI: <strong className="font-mono text-foreground blur-number">{formatCurrency(mortgage.pmi)}</strong>
              </span>
            )}
            {mortgage.extraPrincipal !== undefined && mortgage.extraPrincipal > 0 && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                Extra Principal: <strong className="font-mono blur-number">{formatCurrency(mortgage.extraPrincipal)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 2. Early Payoff Simulator ── */}
      <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl space-y-3">
        {currentBalance === 0 ? (
          <div className="text-center py-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
              ✓ Fully Paid Off
            </span>
            <p className="text-[11px] text-muted-foreground mt-1">This loan is completely paid off. View historical amortization below.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Early Payoff Simulator</span>
              </div>
              <button
                type="button"
                onClick={() => setShowProjection(!showProjection)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all cursor-pointer',
                  showProjection
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
                )}
              >
                {showProjection ? 'Simulator Active' : 'Enable Simulator'}
              </button>
            </div>

            {showProjection && (
              <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                {/* Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Extra Monthly Payment */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-foreground">
                      Extra Monthly Principal
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">$</span>
                      <input
                        type="number"
                        value={extraMonthly}
                        onChange={(e) => setExtraMonthly(e.target.value)}
                        placeholder="e.g. 250"
                        className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {/* Quick Preset Buttons */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-muted-foreground">Presets:</span>
                      {[100, 250, 500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPresetExtra(amt)}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer',
                            extraMonthly === String(amt)
                              ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                              : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          +${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Biweekly Option & Lump Sum */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-card/60 border border-border/50 cursor-pointer hover:bg-card transition-colors">
                      <input
                        type="checkbox"
                        checked={biweekly}
                        onChange={(e) => setBiweekly(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground block">Bi-weekly Payments</span>
                        <span className="text-[10px] text-muted-foreground block">
                          26 half-payments/yr (1 extra full payment/year)
                        </span>
                      </div>
                    </label>

                    {/* Lump Sum Input */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Lump Sum ($)</label>
                        <input
                          type="number"
                          value={lumpSum}
                          onChange={(e) => setLumpSum(e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full px-2 py-1 text-xs bg-background border border-input rounded-md font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Lump Sum Date</label>
                        <input
                          type="date"
                          value={lumpSumDate}
                          onChange={(e) => setLumpSumDate(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-background border border-input rounded-md font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {standardSummary.isNegativeAmortization && (
                  <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
                    <span className="font-semibold">Negative Amortization Warning:</span> Monthly payment does not cover accrued interest. Balance will grow.
                  </div>
                )}

                {/* Simulation Impact Banner */}
                {hasExtraPayments && (
                  <div className="p-3 bg-card border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Accelerated Payoff Outcome</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">New Payoff Date</span>
                        <span className="font-semibold text-chart-1">
                          {acceleratedSummary.payoffDate
                            ? formatSafeUTCDate(acceleratedSummary.payoffDate, { month: 'short', year: 'numeric' })
                            : 'Never'}
                        </span>
                        {acceleratedSummary.monthsSaved > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
                            {Math.floor(acceleratedSummary.monthsSaved / 12) > 0
                              ? `${Math.floor(acceleratedSummary.monthsSaved / 12)} yr ${acceleratedSummary.monthsSaved % 12} mo sooner`
                              : `${acceleratedSummary.monthsSaved} mo sooner`}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] text-muted-foreground block">Interest Saved</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 blur-number">
                          {formatCurrency(acceleratedSummary.interestSaved)}
                        </span>
                      </div>

                      {acceleratedSummary.pmiSaved !== undefined && acceleratedSummary.pmiSaved > 0 && (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">PMI Saved</span>
                          <span className="font-mono font-bold text-primary blur-number">
                            {formatCurrency(acceleratedSummary.pmiSaved)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 3. Amortization Projection Chart ── */}
      {chartDataPoints.length > 0 ? (
        <div className="h-[230px] pt-1">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
            <LineChart
              data={chartDataPoints}
              margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
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
                name="Standard Payoff"
                stroke="var(--color-chart-4)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              {showProjection && accelerated.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="With Extra Payments"
                  name="With Extra Payments"
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
        <div className="h-[200px] flex items-center justify-center">
          <ChartEmptyState variant="nodata" description="No amortization data available" />
        </div>
      )}
    </div>
  );
}
