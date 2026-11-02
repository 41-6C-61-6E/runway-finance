'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';

export function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const MilestoneIcon = data.milestone?.icon;
  const isFiltered = data.portfolioBalance !== data.totalUnfilteredPortfolio && data.totalUnfilteredPortfolio > 0;

  return (
    <div className="z-popover min-w-[260px] max-w-[320px] overflow-hidden rounded-xl border border-border bg-popover px-3.5 py-3 text-xs font-medium text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 space-y-2.5">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Year {data.year} (Age {data.age})</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-sans ${
          data.isRetired
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          {data.isRetired ? '🌴 Retired' : '📈 Accumulation'}
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div>
          <div className="flex justify-between items-center text-sm font-extrabold pb-1 border-b border-border/50">
            <span className="text-muted-foreground text-xs font-semibold font-sans">Retirement Portfolio:</span>
            <span className="text-emerald-500 font-mono">{formatCurrency(data.portfolioBalance || data.netWorth)}</span>
          </div>
          {isFiltered && (
            <div className="text-[10px] text-amber-500 font-sans text-right pt-0.5">
              Filtered ({formatCurrency(data.portfolioBalance)} of {formatCurrency(data.totalUnfilteredPortfolio)})
            </div>
          )}
        </div>

        {/* Asset Category Balances */}
        <div className="space-y-1 text-[11px] pt-0.5">
          {data.taxableBal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-amber-500 font-sans flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Taxable Brokerage:
              </span>
              <span className="font-bold text-foreground">{formatCurrency(data.taxableBal)}</span>
            </div>
          )}
          {data.taxDeferredBal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-purple-500 font-sans flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Tax-Deferred (Traditional):
              </span>
              <span className="font-bold text-foreground">{formatCurrency(data.taxDeferredBal)}</span>
            </div>
          )}
          {data.taxFreeBal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-pink-500 font-sans flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                Tax-Free (Roth):
              </span>
              <span className="font-bold text-foreground">{formatCurrency(data.taxFreeBal)}</span>
            </div>
          )}
          {data.hsaBal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-teal-500 font-sans flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                HSA:
              </span>
              <span className="font-bold text-foreground">{formatCurrency(data.hsaBal)}</span>
            </div>
          )}
          {data.cashBal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Cash & Savings:
              </span>
              <span className="font-bold text-foreground">{formatCurrency(data.cashBal)}</span>
            </div>
          )}
        </div>

        {/* Per-Account Projected Balance Breakdown */}
        {data.filteredAccountBalances && data.filteredAccountBalances.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1.5 font-sans">
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Account Projections</span>
              <span className="font-mono text-[9.5px] text-muted-foreground">
                {data.filteredAccountBalances.length} account{data.filteredAccountBalances.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {data.filteredAccountBalances
                .slice()
                .sort((a: any, b: any) => b.projectedBalance - a.projectedBalance)
                .map((acc: any, i: number) => {
                  const pct = data.portfolioBalance > 0 ? (acc.projectedBalance / data.portfolioBalance) * 100 : 0;
                  const catDot =
                    acc.category === 'taxable'
                      ? 'bg-amber-500'
                      : acc.category === 'taxDeferred'
                      ? 'bg-purple-500'
                      : acc.category === 'taxFree'
                      ? 'bg-pink-500'
                      : acc.category === 'hsa'
                      ? 'bg-teal-500'
                      : 'bg-slate-400';
                  return (
                    <div key={acc.id || i} className="flex items-center justify-between text-[11px] gap-2 py-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catDot}`} />
                        <span className="font-medium text-foreground truncate max-w-[140px]" title={acc.name}>
                          {acc.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono text-right">
                        <span className="font-bold text-foreground">{formatCurrency(acc.projectedBalance)}</span>
                        {pct > 0 && (
                          <span className="text-[9.5px] text-muted-foreground font-sans">
                            ({pct.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {data.discretionaryDeficit > 0 && (
          <div className="flex justify-between items-center pt-1 border-t border-border/40 text-amber-500 text-[11px]">
            <span className="font-sans">Annual Portfolio Draw:</span>
            <span className="font-bold">{formatCurrency(data.discretionaryDeficit)}</span>
          </div>
        )}
      </div>

      {data.milestone && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 mt-1 space-y-0.5 text-left font-sans">
          <div className="flex items-center gap-1.5 font-bold text-primary text-[11px]">
            {MilestoneIcon && <MilestoneIcon className="w-3.5 h-3.5 shrink-0" />}
            <span>{data.milestone.title}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">{data.milestone.note}</p>
        </div>
      )}
    </div>
  );
}

export function GroupedLegend({ payload }: any) {
  if (!payload) return null;
  const incomeItems = payload.filter((p: any) =>
    ['Salary / Earned', 'Social Security', 'Pension', 'Other Income'].includes(p.value)
  );
  const drawdownItems = payload.filter((p: any) =>
    ['Cash Drawdown', 'Taxable Brokerage', 'Traditional IRA/401k', 'Roth IRA/401k', 'Roth Conversion', 'HSA Drawdown'].includes(p.value)
  );
  const lineItems = payload.filter((p: any) => p.value === 'Annual Expenses');
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] pt-1">
      <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider">
        Income:
      </div>
      {incomeItems.map((item: any, i: number) => (
        <div key={i} className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.value}</span>
        </div>
      ))}
      <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider ml-2">
        Drawdowns:
      </div>
      {drawdownItems.map((item: any, i: number) => (
        <div key={i} className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.value}</span>
        </div>
      ))}
      {lineItems.length > 0 && (
        <>
          <div className="flex items-center gap-0.5 font-bold text-muted-foreground uppercase tracking-wider ml-2">
            Reference:
          </div>
          {lineItems.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-1">
              <span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: item.color }} />
              <span className="text-muted-foreground">{item.value}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-rose-500/20" />
            <span className="text-muted-foreground">Shortfall Zone</span>
          </div>
        </>
      )}
    </div>
  );
}

export function MonteCarloTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const isRetired = data.isRetired ?? false;

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[260px] max-w-[320px] z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Year {data.year} (Age {data.age})</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-sans ${
          isRetired
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          {isRetired ? '🌴 Retired' : '📈 Accumulation'}
        </span>
      </div>

      <div className="space-y-1.5 font-mono">
        <div className="flex justify-between items-center text-sm font-extrabold pb-1 border-b border-border/50">
          <span className="text-muted-foreground text-xs font-semibold font-sans">Median Outcome (P50):</span>
          <span className="text-emerald-500 font-mono">{formatCurrency(data.p50)}</span>
        </div>

        <div className="space-y-1 text-[11px] pt-0.5 font-sans">
          <div className="flex justify-between items-center">
            <span className="text-amber-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              90th Percentile (Optimistic):
            </span>
            <span className="font-bold text-foreground font-mono">{formatCurrency(data.p90)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-blue-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              75th Percentile:
            </span>
            <span className="font-bold text-foreground font-mono">{formatCurrency(data.p75)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-emerald-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              50th Percentile (Median):
            </span>
            <span className="font-bold text-foreground font-mono">{formatCurrency(data.p50)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-purple-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              25th Percentile:
            </span>
            <span className="font-bold text-foreground font-mono">{formatCurrency(data.p25)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-rose-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              10th Percentile (Conservative / 90% Confidence):
            </span>
            <span className="font-bold text-foreground font-mono">{formatCurrency(data.p10)}</span>
          </div>
        </div>
      </div>

      {data.earlyPenaltyTax > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 space-y-1 font-sans">
          <div className="flex items-center gap-1.5 font-bold text-amber-500 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Early Withdrawal Penalty: {formatCurrency(data.earlyPenaltyTax)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const incomeTotal = (data.salaryIncome || 0) + (data.ssIncome || 0) + (data.pensionIncome || 0) + (data.otherIncome || 0);

  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2.5 min-w-[260px] max-w-[320px] z-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-1.5 font-bold">
        <span className="text-foreground font-mono">Year {data.year} (Age {data.age})</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-sans ${
          data.isRetired
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          {data.isRetired ? '🌴 Retired' : '📈 Accumulation'}
        </span>
      </div>

      <div className="space-y-2 font-mono">
        {/* Expenses Line */}
        {data.expenses != null && (
          <div className="flex justify-between items-center text-[11.5px] pb-1.5 border-b border-border/50">
            <span className="text-rose-500 font-sans font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Annual Expenses:
            </span>
            <span className="font-bold text-rose-500 font-mono">{formatCurrency(data.expenses)}</span>
          </div>
        )}

        {/* Income Sources Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans">
            <span>Income Sources</span>
            <span className="font-mono text-foreground font-semibold">{formatCurrency(incomeTotal)}</span>
          </div>
          <div className="space-y-1 text-[11px] font-sans">
            {data.salaryIncome > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-emerald-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Salary / Earned:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.salaryIncome)}</span>
              </div>
            )}
            {data.ssIncome > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-cyan-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                  Social Security:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.ssIncome)}</span>
              </div>
            )}
            {data.pensionIncome > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-blue-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Pension:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.pensionIncome)}</span>
              </div>
            )}
            {data.otherIncome > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-violet-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  Other Income:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.otherIncome)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Drawdowns Section */}
        <div className="space-y-1 pt-1.5 border-t border-border/50">
          <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-sans">
            <span>Portfolio Drawdowns</span>
            {data.actualDrawdowns > 0 && (
              <span className="font-mono text-foreground font-semibold">{formatCurrency(data.actualDrawdowns)}</span>
            )}
          </div>
          <div className="space-y-1 text-[11px] font-sans">
            {data.cashDrawdown > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Cash Drawdown:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.cashDrawdown)}</span>
              </div>
            )}
            {data.taxableDrawdown > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-amber-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Taxable Brokerage:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.taxableDrawdown)}</span>
              </div>
            )}
            {data.traditionalDrawdown > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-purple-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Traditional IRA/401k:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.traditionalDrawdown)}</span>
              </div>
            )}
            {data.rothDrawdown > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-pink-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                  Roth IRA/401k:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.rothDrawdown)}</span>
              </div>
            )}
            {data.hsaDrawdown > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-teal-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  HSA Drawdown:
                </span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(data.hsaDrawdown)}</span>
              </div>
            )}
            {data.rothConversionAmount > 0 && (
              <div className="pt-2 border-t border-border/40 mt-1 space-y-1">
                <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider font-sans">
                  Tax Optimization Conversions
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1.5 font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Traditional → Roth Ladder:
                  </span>
                  <span className="font-bold text-amber-400 font-mono">{formatCurrency(data.rothConversionAmount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Withdrawal Rate summary */}
        {data.actualDrawdowns > 0 && data.withdrawalRate > 0 && (
          <div className="flex justify-between items-center pt-1.5 border-t border-border/50 font-sans text-xs">
            <span className="text-muted-foreground font-semibold">Withdrawal Rate:</span>
            <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
              data.withdrawalRate > 5
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                : data.withdrawalRate > 3.5
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            }`}>
              {formatPlainPercent(data.withdrawalRate)}
            </span>
          </div>
        )}
      </div>

      {/* Callouts */}
      {data.shortfall > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 space-y-0.5 font-sans">
          <div className="flex items-center gap-1.5 font-bold text-rose-500 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Unfunded Shortfall: {formatCurrency(data.shortfall)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Expenses exceed total income and available liquid portfolio balance.</p>
        </div>
      )}

      {data.earlyPenaltyTax > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 space-y-1 font-sans">
          <div className="flex items-center gap-1.5 font-bold text-amber-500 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Early Withdrawal Penalty: {formatCurrency(data.earlyPenaltyTax)}</span>
          </div>
          {data.earlyPenaltyDetails?.map((d: any, i: number) => (
            <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
              Age {d.age}: {formatCurrency(d.amount)} from {d.accountName} → {d.accountType.includes('hsa') ? '20%' : '10%'} penalty ({formatCurrency(d.penalty)})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
