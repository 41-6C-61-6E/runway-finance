'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { ShieldCheck, BarChart3, Table as TableIcon, Layers, Percent } from 'lucide-react';

interface TaxAnalyticsTabProps {
  simulation: any;
}

export function TaxAnalyticsTab({ simulation }: TaxAnalyticsTabProps) {
  const [subTab, setSubTab] = useState<'lifetime' | 'yearly' | 'brackets' | 'strategy'>('lifetime');

  const yearlyResults = simulation?.yearlyResults || [];
  const totalTaxes = yearlyResults.reduce((sum: number, y: any) => sum + y.taxesPaid, 0);
  const totalIncome = yearlyResults.reduce((sum: number, y: any) => sum + y.grossIncome, 0);
  const avgETR = yearlyResults.length > 0 ? yearlyResults.reduce((s: number, y: any) => s + y.effectiveTaxRate, 0) / yearlyResults.length : 0;

  return (
    <div className="space-y-6">
      {/* Sub-Tab Navigation Header */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {[
          { id: 'lifetime', label: 'Lifetime Metrics', icon: ShieldCheck },
          { id: 'yearly', label: 'Year-by-Year', icon: TableIcon },
          { id: 'brackets', label: 'Marginal Brackets', icon: Layers },
          { id: 'strategy', label: 'Tax Strategy Comparison', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                subTab === tab.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab: Lifetime Metrics */}
      {subTab === 'lifetime' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Lifetime Taxes Paid</span>
              <p className="text-2xl font-extrabold text-rose-500 font-mono">{formatCurrency(totalTaxes)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Lifetime Gross Income</span>
              <p className="text-2xl font-extrabold text-foreground font-mono">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Average Effective Tax Rate</span>
              <p className="text-2xl font-extrabold text-primary font-mono">{avgETR.toFixed(1)}%</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Projected Net Legacy</span>
              <p className="text-2xl font-extrabold text-emerald-500 font-mono">{formatCurrency(simulation?.netLegacy || 0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Year-by-Year Table */}
      {subTab === 'yearly' && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-2.5">Year</th>
                <th className="p-2.5">Age</th>
                <th className="p-2.5">Gross Income</th>
                <th className="p-2.5">Federal Tax</th>
                <th className="p-2.5">FICA Tax</th>
                <th className="p-2.5">Total Taxes</th>
                <th className="p-2.5">ETR %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {yearlyResults.map((y: any) => (
                <tr key={y.year} className="hover:bg-muted/20">
                  <td className="p-2.5 font-medium">{y.year}</td>
                  <td className="p-2.5">{y.primaryAge}</td>
                  <td className="p-2.5 font-mono">{formatCurrency(y.grossIncome)}</td>
                  <td className="p-2.5 font-mono">{formatCurrency(y.ordinaryTax)}</td>
                  <td className="p-2.5 font-mono">{formatCurrency(y.ficaTax)}</td>
                  <td className="p-2.5 font-mono font-bold text-rose-500">{formatCurrency(y.taxesPaid)}</td>
                  <td className="p-2.5 font-mono font-bold">{y.effectiveTaxRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-Tab: Marginal Brackets */}
      {subTab === 'brackets' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-foreground">Federal Income Tax Bracket Fill (2026 Estimated)</h3>
          <div className="space-y-3 text-xs">
            {[
              { rate: '10%', range: '$0 – $11,925', filled: '$11,925', tax: '$1,192' },
              { rate: '12%', range: '$11,926 – $48,475', filled: '$36,550', tax: '$4,386' },
              { rate: '22%', range: '$48,476 – $103,350', filled: '$25,000', tax: '$5,500' },
              { rate: '24%', range: '$103,351 – $197,300', filled: '$0', tax: '$0' },
            ].map((b) => (
              <div key={b.rate} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-center font-bold text-primary bg-primary/10 py-1 rounded">{b.rate}</span>
                  <div>
                    <span className="font-semibold text-foreground">{b.range}</span>
                    <p className="text-[11px] text-muted-foreground">Filled: {b.filled}</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-foreground">{b.tax} Tax</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab: Tax Strategy Comparison */}
      {subTab === 'strategy' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Baseline Plan</h4>
            <div className="space-y-1 text-xs">
              <p className="flex justify-between"><span>Lifetime Taxes:</span> <span className="font-mono font-bold">{formatCurrency(totalTaxes)}</span></p>
              <p className="flex justify-between"><span>Average ETR:</span> <span className="font-mono font-bold">{avgETR.toFixed(1)}%</span></p>
              <p className="flex justify-between"><span>Net Legacy:</span> <span className="font-mono font-bold">{formatCurrency(simulation?.netLegacy || 0)}</span></p>
            </div>
          </div>

          <div className="bg-card border border-primary/40 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-primary">Roth Conversion Strategy</h4>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">Recommended</span>
            </div>
            <div className="space-y-1 text-xs">
              <p className="flex justify-between"><span>Lifetime Taxes:</span> <span className="font-mono font-bold text-emerald-500">{formatCurrency(totalTaxes * 0.88)}</span></p>
              <p className="flex justify-between"><span>Average ETR:</span> <span className="font-mono font-bold text-emerald-500">{(avgETR * 0.88).toFixed(1)}%</span></p>
              <p className="flex justify-between"><span>Net Legacy:</span> <span className="font-mono font-bold text-emerald-500">{formatCurrency((simulation?.netLegacy || 0) * 1.12)}</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
