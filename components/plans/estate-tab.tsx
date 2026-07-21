'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Landmark, ShieldCheck, Heart, Percent, ArrowDown } from 'lucide-react';

interface EstateTabProps {
  simulation: any;
}

export function EstateTab({ simulation }: EstateTabProps) {
  const [heirTaxRate, setHeirTaxRate] = useState(25);
  const [stepUpBasis, setStepUpBasis] = useState(true);
  const [liquidationRate, setLiquidationRate] = useState(6);
  const [adminRate, setAdminRate] = useState(1);

  const endingNetWorth = simulation?.endingNetWorth || 0;
  const portfolio = simulation?.yearlyResults?.[simulation.yearlyResults.length - 1]?.portfolioBreakdown || {
    taxable: 0,
    taxDeferred: 0,
    taxFree: 0,
    hsa: 0,
    cash: 0,
  };

  const taxDeferredDrag = portfolio.taxDeferred * (heirTaxRate / 100);
  const adminDrag = endingNetWorth * (adminRate / 100);
  const totalDrag = taxDeferredDrag + adminDrag;
  const netLegacy = Math.max(0, endingNetWorth - totalDrag);

  return (
    <div className="space-y-6">
      {/* Controls Header */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <div className="flex justify-between font-semibold mb-1">
            <span>Heir Income Tax Rate:</span>
            <span className="font-mono text-primary">{heirTaxRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={heirTaxRate}
            onChange={(e) => setHeirTaxRate(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <div className="flex justify-between font-semibold mb-1">
            <span>Real Estate Liquidation:</span>
            <span className="font-mono text-primary">{liquidationRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="15"
            value={liquidationRate}
            onChange={(e) => setLiquidationRate(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <div className="flex justify-between font-semibold mb-1">
            <span>Probate & Admin Drag:</span>
            <span className="font-mono text-primary">{adminRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            value={adminRate}
            onChange={(e) => setAdminRate(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Estate Waterfall Funnel */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground">Estate Settlement Drag Waterfall</h3>

        <div className="space-y-3 max-w-2xl mx-auto text-xs">
          {/* Gross Estate */}
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
            <span className="font-bold text-foreground">Gross Estate at End of Plan</span>
            <span className="font-mono font-extrabold text-foreground text-sm">{formatCurrency(endingNetWorth)}</span>
          </div>

          <div className="flex justify-center"><ArrowDown className="w-4 h-4 text-muted-foreground" /></div>

          {/* Tax Deferred Drag */}
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
            <span className="text-rose-500 font-semibold">- Tax-Deferred Income Tax Drag ({heirTaxRate}%)</span>
            <span className="font-mono font-bold text-rose-500">-{formatCurrency(taxDeferredDrag)}</span>
          </div>

          {/* Admin Drag */}
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
            <span className="text-rose-500 font-semibold">- Probate & Administrative Drag ({adminRate}%)</span>
            <span className="font-mono font-bold text-rose-500">-{formatCurrency(adminDrag)}</span>
          </div>

          <div className="flex justify-center"><ArrowDown className="w-4 h-4 text-emerald-500" /></div>

          {/* Net Legacy */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
            <span className="font-extrabold text-emerald-500 text-sm">Net Inheritance Passed to Heirs</span>
            <span className="font-mono font-extrabold text-emerald-500 text-lg">{formatCurrency(netLegacy)}</span>
          </div>
        </div>
      </div>

      {/* Account Drag Breakdown Table */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
            <tr>
              <th className="p-2.5">Account Wrapper Type</th>
              <th className="p-2.5">Gross Ending Value</th>
              <th className="p-2.5">Applied Drag %</th>
              <th className="p-2.5">Tax & Friction Drag</th>
              <th className="p-2.5">Net to Heirs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            <tr className="hover:bg-muted/20">
              <td className="p-2.5 font-bold">Tax-Deferred (401k / Traditional IRA)</td>
              <td className="p-2.5 font-mono">{formatCurrency(portfolio.taxDeferred)}</td>
              <td className="p-2.5 font-mono">{heirTaxRate}%</td>
              <td className="p-2.5 font-mono text-rose-500">-{formatCurrency(taxDeferredDrag)}</td>
              <td className="p-2.5 font-mono font-bold text-emerald-500">{formatCurrency(portfolio.taxDeferred - taxDeferredDrag)}</td>
            </tr>
            <tr className="hover:bg-muted/20">
              <td className="p-2.5 font-bold">Tax-Free (Roth IRA / Roth 401k)</td>
              <td className="p-2.5 font-mono">{formatCurrency(portfolio.taxFree)}</td>
              <td className="p-2.5 font-mono">0% (Tax Free)</td>
              <td className="p-2.5 font-mono text-muted-foreground">$0</td>
              <td className="p-2.5 font-mono font-bold text-emerald-500">{formatCurrency(portfolio.taxFree)}</td>
            </tr>
            <tr className="hover:bg-muted/20">
              <td className="p-2.5 font-bold">Taxable Brokerage (Stepped-Up Basis)</td>
              <td className="p-2.5 font-mono">{formatCurrency(portfolio.taxable)}</td>
              <td className="p-2.5 font-mono">0% (Stepped Up)</td>
              <td className="p-2.5 font-mono text-muted-foreground">$0</td>
              <td className="p-2.5 font-mono font-bold text-emerald-500">{formatCurrency(portfolio.taxable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
