'use client';
import type { PlanChartYear } from './types';

import React from 'react';
import { Calendar, AlertTriangle, ArrowUpCircle, Scale, Building2, Layers, X } from 'lucide-react';
import { ModalBackdrop } from '@/components/ui/modal-overlay';
import { TableScroll } from '@/components/ui/table-scroll';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';

export interface YearDetailModalProps {
  isOpen: boolean;
  yearData: PlanChartYear;
  onClose: () => void;
}

export function YearDetailModal({ isOpen, yearData, onClose }: YearDetailModalProps) {
  if (!isOpen || !yearData) return null;

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Year {yearData.year} Audit Breakdown (Age {yearData.age})
              </h2>
              <p className="text-xs text-muted-foreground">
                {yearData.isRetired ? '🌴 Retirement Phase • Distribution' : '📈 Accumulation Phase • Savings'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Inflows & Income Breakdown */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-sans">
            <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
            Income & Cash Inflows
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Salary Income</span>
              <span className="font-bold text-emerald-500">{formatCurrency(yearData.salaryIncome || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Social Security</span>
              <span className="font-bold text-cyan-500">{formatCurrency(yearData.ssIncome || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Pension Income</span>
              <span className="font-bold text-blue-500">{formatCurrency(yearData.pensionIncome || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Other Income</span>
              <span className="font-bold text-purple-500">{formatCurrency(yearData.otherIncome || 0)}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Comprehensive Tax Waterfall */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-sans">
            <Scale className="w-4 h-4 text-rose-500" />
            Comprehensive Tax Waterfall
          </h3>
          <div className="bg-muted/20 border border-border rounded-xl p-3.5 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center text-muted-foreground font-sans text-[11px]">
              <span>Gross Income:</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(yearData.income || 0)}</span>
            </div>
            <div className="flex justify-between items-center text-rose-400">
              <span className="font-sans">FICA Tax (SS 6.2% + Medicare 1.45%):</span>
              <span>{formatCurrency(yearData.ficaTax || 0)}</span>
            </div>
            <div className="flex justify-between items-center text-rose-400">
              <span className="font-sans">Federal & State Ordinary Tax:</span>
              <span>{formatCurrency(yearData.ordinaryTax || 0)}</span>
            </div>
            {yearData.capGainsTax > 0 && (
              <div className="flex justify-between items-center text-amber-500">
                <span className="font-sans">Capital Gains Tax:</span>
                <span>{formatCurrency(yearData.capGainsTax)}</span>
              </div>
            )}
            {yearData.niitTax > 0 && (
              <div className="flex justify-between items-center text-rose-500">
                <span className="font-sans">NIIT (3.8% Net Investment Tax):</span>
                <span>{formatCurrency(yearData.niitTax)}</span>
              </div>
            )}
            {yearData.amtTax > 0 && (
              <div className="flex justify-between items-center text-orange-500">
                <span className="font-sans">AMT (Alternative Minimum Tax):</span>
                <span>{formatCurrency(yearData.amtTax)}</span>
              </div>
            )}
            {yearData.stateTax > 0 && (
              <div className="flex justify-between items-center text-purple-400">
                <span className="font-sans">State Income Tax:</span>
                <span>{formatCurrency(yearData.stateTax)}</span>
              </div>
            )}
            {yearData.earlyPenaltyTax > 0 && (
              <div className="flex justify-between items-center text-amber-500 font-bold bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                <span className="font-sans flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Early Withdrawal Penalties:
                </span>
                <span>{formatCurrency(yearData.earlyPenaltyTax)}</span>
              </div>
            )}
            <div className="flex justify-between items-center font-bold text-foreground border-t border-border pt-2 text-sm">
              <span className="font-sans">Total Taxes Paid:</span>
              <span className="text-rose-500">{formatCurrency(yearData.taxesPaid || 0)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-muted-foreground font-sans pt-0.5">
              <span>Effective Tax Rate (ETR %):</span>
              <span className="font-mono font-bold text-foreground">{yearData.effectiveTaxRate ? `${formatPlainPercent(yearData.effectiveTaxRate)}` : '0%'}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Cash Flow & Deficit Drawdown Sequence */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-sans">
            <Layers className="w-4 h-4 text-primary" />
            Portfolio Drawdowns & Conversion Sequence
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Cash Drawdown</span>
              <span className="font-bold text-slate-400">{formatCurrency(yearData.cashDrawdown || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Taxable Brokerage</span>
              <span className="font-bold text-amber-500">{formatCurrency(yearData.taxableDrawdown || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Traditional IRA/401(k)</span>
              <span className="font-bold text-purple-500">{formatCurrency(yearData.traditionalDrawdown || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Roth IRA/401(k)</span>
              <span className="font-bold text-pink-500">{formatCurrency(yearData.rothDrawdown || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">HSA Drawdown</span>
              <span className="font-bold text-teal-500">{formatCurrency(yearData.hsaDrawdown || 0)}</span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Roth Conversion</span>
              <span className="font-bold text-cyan-500">{formatCurrency(yearData.rothConversionAmount || 0)}</span>
            </div>
          </div>
        </div>

        {/* Section 4: Per-Account Ledger Table */}
        {yearData.accountBalances && yearData.accountBalances.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Building2 className="w-4 h-4 text-primary" />
              Projected Account Balances & Drawdowns
            </h3>
            <TableScroll maxHeight={192} className="border border-border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-2">Account</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2 text-right">Projected Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {yearData.accountBalances.map((acc: Record<string, any>, i: number) => (
                    <tr key={acc.id || i} className="hover:bg-muted/20">
                      <td className="p-2 font-sans font-medium text-foreground">{acc.name}</td>
                      <td className="p-2 font-sans">
                        {acc.category === 'taxDeferred' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300">Pre-Tax Traditional</span>
                        ) : acc.category === 'taxFree' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-700 dark:text-pink-300">Tax-Free Roth</span>
                        ) : acc.category === 'taxable' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Taxable Brokerage</span>
                        ) : acc.category === 'hsa' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">HSA</span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 capitalize">{acc.category}</span>
                        )}
                      </td>
                      <td className="p-2 font-sans capitalize">{acc.owner}</td>
                      <td className="p-2 text-right font-bold text-emerald-500">{formatCurrency(acc.projectedBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-xs hover:bg-primary/90 transition-all cursor-pointer"
          >
            Close Audit View
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
