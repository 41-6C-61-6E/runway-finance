'use client';
import type { PlanChartYear } from './types';

import React from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { TableScroll } from '@/components/ui/table-scroll';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';

export interface YearlySimulationTableProps {
  chartData: PlanChartYear[];
  isYearlyTableCollapsed: boolean;
  setIsYearlyTableCollapsed: (collapsed: boolean) => void;
  localRetirementAge: number;
  setSelectedYearDetail: (year: PlanChartYear) => void;
}

export function YearlySimulationTable({
  chartData,
  isYearlyTableCollapsed,
  setIsYearlyTableCollapsed,
  localRetirementAge,
  setSelectedYearDetail,
}: YearlySimulationTableProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isYearlyTableCollapsed}
          onToggle={setIsYearlyTableCollapsed}
          title={
            <span className="flex items-center gap-2 font-bold text-sm text-foreground">
              <Calendar className="w-4 h-4 text-primary" />
              Detailed Year-by-Year Account Drawdown & Tax Table
            </span>
          }
          actions={
            <span className="text-xs text-muted-foreground font-mono">{chartData.length} years</span>
          }
        />

        {/* Early Withdrawal Penalty Alert Banner */}
        {!isYearlyTableCollapsed && (() => {
          const totalPenalties = chartData.reduce((sum: number, y: any) => sum + (y.earlyPenaltyTax || 0), 0);
          const penaltyYears = chartData.filter((y: PlanChartYear) => y.earlyPenaltyTax > 0);
          if (totalPenalties <= 0) return null;
          return (
            <div className="mx-4 mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    Early withdrawal penalties detected in {penaltyYears.length} year{penaltyYears.length !== 1 ? 's' : ''}, totaling {formatCurrency(totalPenalties)}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {penaltyYears.map((y: PlanChartYear) => (
                      <div key={y.year} className="text-[10px] text-amber-700 dark:text-amber-300 font-mono">
                        Age {y.age} ({y.year}): {y.earlyWithdrawalWarnings?.map((w: string) => w).join(' ') || formatCurrency(y.earlyPenaltyTax) + ' penalty'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {!isYearlyTableCollapsed && (
          <div>
            <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <span>💡 Click any row below to open the complete 4-section Year Breakdown Modal (Tax Waterfall, Cash Flow, Account Balances &amp; Rules Engine).</span>
              </span>
            </div>
            <TableScroll maxHeight={550} className="border-t border-border">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/60 text-muted-foreground font-semibold sticky top-0 bg-card z-20">
                <tr>
                  <th className="p-2.5 sticky left-0 bg-card z-30 shadow-xs border-r border-border/50">Year</th>
                  <th className="p-2.5 sticky left-14 bg-card z-30 shadow-xs border-r border-border/50">Age</th>
                  <th className="p-2.5">Portfolio Balance</th>
                  <th className="p-2.5">Gross Income</th>
                  <th className="p-2.5">Expenses</th>
                  <th className="p-2.5" title="Total Taxes Paid (FICA, Ordinary, Cap Gains, NIIT, State, Penalties)">Taxes Paid</th>
                  <th className="p-2.5" title="IRS Early Withdrawal Penalties">Penalty</th>
                  <th className="p-2.5" title="Effective Tax Rate % (Total Taxes / Total Tax Base)">ETR %</th>
                  <th className="p-2.5" title="Withdrawal from Taxable Brokerage Accounts">Taxable Draw</th>
                  <th className="p-2.5" title="Withdrawal from Traditional IRA / 401(k) Accounts">Trad Draw</th>
                  <th className="p-2.5" title="Withdrawal from Tax-Free Roth IRA / 401(k) Accounts">Roth Draw</th>
                  <th className="p-2.5" title="Portfolio Withdrawal Rate (Discretionary Portfolio Draw / Net Worth)">Withdraw Rate</th>
                  <th className="p-2.5" title="Traditional to Roth Conversion Ladder Amount">Roth Conv</th>
                  <th className="p-2.5" title="Modified Adjusted Gross Income (MAGI)">MAGI</th>
                  <th className="p-2.5">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {chartData.map((y: PlanChartYear) => {
                  const isRetired = y.isRetired;
                  const isRetirementYear = y.age === localRetirementAge;
                  return (
                    <tr
                      key={y.year}
                      onClick={() => setSelectedYearDetail(y)}
                      className={`hover:bg-primary/10 transition-colors cursor-pointer group ${isRetirementYear ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}`}
                      title="Click row for full tax waterfall, cash flow & account breakdown"
                    >
                      <td className="p-2.5 font-medium sticky left-0 bg-card group-hover:bg-accent/40 z-10 border-r border-border/50">{y.year}</td>
                      <td className="p-2.5 sticky left-14 bg-card group-hover:bg-accent/40 z-10 border-r border-border/50">{y.age}</td>
                      <td className="p-2.5 font-bold text-foreground">{formatCurrency(y.netWorth)}</td>
                      <td className="p-2.5 text-emerald-500">{formatCurrency(y.income)}</td>
                      <td className="p-2.5 text-rose-500">{formatCurrency(y.expenses)}</td>
                      <td className="p-2.5 text-rose-400 font-bold">{formatCurrency(y.taxesPaid)}</td>
                      <td className="p-2.5" title={y.earlyWithdrawalWarnings?.join('\n') || ''}>
                        {y.earlyPenaltyTax > 0 ? (
                          <span className="text-amber-500 font-bold font-mono">{formatCurrency(y.earlyPenaltyTax)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{y.effectiveTaxRate ? `${formatPlainPercent(y.effectiveTaxRate)}` : '0%'}</td>
                      <td className="p-2.5 text-amber-500">{formatCurrency(y.taxableDrawdown)}</td>
                      <td className="p-2.5 text-purple-500">{formatCurrency(y.traditionalDrawdown)}</td>
                      <td className="p-2.5 text-pink-500">{formatCurrency(y.rothDrawdown)}</td>
                      <td className="p-2.5 font-bold">
                        {y.withdrawalRate > 0 ? (
                          <span className={y.withdrawalRate > 5 ? 'text-rose-500' : y.withdrawalRate > 3.5 ? 'text-amber-500' : 'text-emerald-500'}>
                            {formatPlainPercent(y.withdrawalRate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-cyan-500">{formatCurrency(y.rothConversionAmount)}</td>
                      <td className="p-2.5 text-foreground">{formatCurrency(y.magi)}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full font-sans ${
                            isRetired ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                          }`}
                        >
                          {isRetired ? '🌴 Drawdown' : '📈 Save'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </TableScroll>
          </div>
        )}
      </div>

  );
}
