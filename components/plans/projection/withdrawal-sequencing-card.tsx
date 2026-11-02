'use client';
import type { PlanChartYear } from './types';

import React from 'react';
import { Layers, AlertTriangle, ChevronDown, Check } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from 'recharts';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ClickOutsideBackdrop } from '@/components/ui/modal-overlay';
import { formatCurrency, formatPlainPercent, formatCompactCurrency } from '@/lib/utils/format';
import { DrawdownTooltip, GroupedLegend } from './projection-tooltips';
import { ProjectionOptionsPopover } from '../projection-options-popover';

export const WITHDRAWAL_STRATEGIES = [
  { id: 'textbook', title: 'Taxable First (Textbook)', desc: 'Cash → Taxable → Traditional → Roth' },
  { id: 'proportional', title: 'Proportional (Pro-Rata)', desc: 'Draw proportionally across all portfolio accounts' },
  { id: 'tax_deferred_first', title: 'Tax-Deferred First (Waterfall)', desc: 'Traditional before Taxable & Roth to minimize RMDs' },
  { id: 'tax_optimized', title: 'Tax Bracket Filling', desc: 'Fill lower tax brackets with Traditional first' },
  { id: 'roth_ladder', title: 'Roth Conversion Ladder', desc: 'Annual pre-tax conversions to Roth up to 12% bracket', isRothLadder: true, enableRothConversions: true },
];

export interface WithdrawalSequencingCardProps {
  chartData: PlanChartYear[];
  isCashFlowCollapsed: boolean;
  setIsCashFlowCollapsed: (v: boolean) => void;
  showStrategyDropdown: boolean;
  setShowStrategyDropdown: (v: boolean) => void;
  activeStrategyLabel: string;
  activeWithdrawalMethod: string;
  handleSelectWithdrawalMethod: (strategyId: string) => void;
  dollarMode: 'real' | 'nominal';
  setDollarMode: (m: 'real' | 'nominal') => void;
  viewMode: 'deterministic' | 'monte_carlo';
  setViewMode: (v: 'deterministic' | 'monte_carlo') => void;
}

export function WithdrawalSequencingCard({
  chartData,
  isCashFlowCollapsed,
  setIsCashFlowCollapsed,
  showStrategyDropdown,
  setShowStrategyDropdown,
  activeStrategyLabel,
  activeWithdrawalMethod,
  handleSelectWithdrawalMethod,
  dollarMode,
  setDollarMode,
  viewMode,
  setViewMode,
}: WithdrawalSequencingCardProps) {
  return (
      <div className="bg-card border border-border rounded-xl shadow-sm space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isCashFlowCollapsed}
          onToggle={setIsCashFlowCollapsed}
          icon={Layers}
          title="Withdrawal Sequencing"
          description="Visualizes salary, pension, Social Security, and portfolio drawdown sequence against expenses"
          actions={
            <div className="flex items-center gap-2">
              {(() => {
                const totalPenalties = chartData.reduce((sum: number, y: any) => sum + (y.earlyPenaltyTax || 0), 0);
                const penaltyYearCount = chartData.filter((y: PlanChartYear) => y.earlyPenaltyTax > 0).length;
                if (totalPenalties <= 0) return null;
                return (
                  <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1" title={`Early withdrawal penalties in ${penaltyYearCount} year(s)`}>
                    <AlertTriangle className="w-3 h-3" />
                    {penaltyYearCount} yr{penaltyYearCount !== 1 ? 's' : ''} w/ penalties
                  </span>
                );
              })()}
              <div className="relative inline-block text-left">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStrategyDropdown(!showStrategyDropdown);
                  }}
                  title="Change drawdown strategy"
                  className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                    showStrategyDropdown
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15'
                  }`}
                >
                  {activeStrategyLabel}
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showStrategyDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showStrategyDropdown && (
                  <>
                    <ClickOutsideBackdrop
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStrategyDropdown(false);
                      }}
                    />
                    <div
                      className="absolute right-0 top-full mt-1.5 w-72 bg-card border border-border rounded-xl shadow-xl p-1.5 z-50 space-y-0.5 text-left animate-in fade-in zoom-in-95 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2 pt-1.5 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Drawdown Strategy
                      </div>
                      {WITHDRAWAL_STRATEGIES.map((strat) => {
                        const isActive = strat.id === activeWithdrawalMethod;
                        return (
                          <button
                            key={strat.id}
                            type="button"
                            onClick={() => handleSelectWithdrawalMethod(strat.id)}
                            className={`w-full text-left p-2 rounded-lg transition-colors cursor-pointer ${
                              isActive ? 'bg-primary/10' : 'hover:bg-muted/70'
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className={`text-[11px] font-bold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                                {strat.title}
                              </span>
                              {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{strat.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <ProjectionOptionsPopover
                dollarMode={dollarMode}
                onToggleDollarMode={setDollarMode}
                viewMode={viewMode}
                onToggleViewMode={setViewMode}
              />
            </div>
          }
        />

        {!isCashFlowCollapsed && (
          <div className="p-5">

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
            <ComposedChart data={chartData} maxBarSize={40} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="age" stroke="currentColor" className="text-xs text-muted-foreground" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} />
              <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} tickFormatter={(val) => formatCompactCurrency(val)} />
              <Tooltip content={<DrawdownTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
              <Legend content={<GroupedLegend />} />

              {/* Shortfall zone shading: solid transparent red area where expenses exceed earned income */}
              {chartData
                .filter((d: PlanChartYear) => d.expenses != null && d.expenses > ((d.salaryIncome || 0) + (d.ssIncome || 0) + (d.pensionIncome || 0) + (d.otherIncome || 0)))
                .map((d: PlanChartYear) => {
                  const incomeTotal = (d.salaryIncome || 0) + (d.ssIncome || 0) + (d.pensionIncome || 0) + (d.otherIncome || 0);
                  return (
                    <ReferenceArea
                      key={`shortfall-area-${d.year || d.age}`}
                      x1={d.age}
                      x2={d.age}
                      y1={incomeTotal}
                      y2={d.expenses}
                      fill="rgba(244, 63, 94, 0.20)"
                      stroke="none"
                    />
                  );
                })}

              <Bar dataKey="salaryIncome" name="Salary / Earned" stackId="sources" fill="#10b981" />
              <Bar dataKey="ssIncome" name="Social Security" stackId="sources" fill="#06b6d4" />
              <Bar dataKey="pensionIncome" name="Pension" stackId="sources" fill="#3b82f6" />
              <Bar dataKey="otherIncome" name="Other Income" stackId="sources" fill="#8b5cf6" />

              <Bar dataKey="cashDrawdown" name="Cash Drawdown" stackId="sources" fill="#94a3b8" />
              <Bar dataKey="taxableDrawdown" name="Taxable Brokerage" stackId="sources" fill="#f59e0b" />
              <Bar dataKey="traditionalDrawdown" name="Traditional IRA/401k" stackId="sources" fill="#a855f7" />
              <Bar dataKey="rothDrawdown" name="Roth IRA/401k" stackId="sources" fill="#ec4899" />
              <Bar dataKey="hsaDrawdown" name="HSA Drawdown" stackId="sources" fill="#14b8a6" />

              {chartData.some((d: PlanChartYear) => d.isRetired) && (
                <Line type="monotone" dataKey="expenses" name="Annual Expenses" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
          </div>
        )}
      </div>
  );
}
