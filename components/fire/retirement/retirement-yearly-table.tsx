'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ProjectionResult } from '@/lib/services/retirement';

export function RetirementYearlyTable({
  projection,
}: {
  projection: ProjectionResult;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground mb-0"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Year-by-Year Projection ({projection.years.length} years)
      </button>

      {expanded && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Age</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Start Balance</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Return</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Withdrawal</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">SS Income</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Pension</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Part-Time</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Rental</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Net Cash Flow</th>
                <th className="text-right py-2 pl-3 text-muted-foreground font-medium">End Balance</th>
              </tr>
            </thead>
            <tbody>
              {projection.years.map((y) => (
                <tr key={y.age} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 pr-3 text-foreground font-medium">{y.age}</td>
                  <td className="py-1.5 px-3 text-right text-foreground font-mono">{formatCurrency(y.startBalance)}</td>
                  <td className="py-1.5 px-3 text-right text-chart-1 font-mono">{formatCurrency(y.investmentReturn)}</td>
                  <td className="py-1.5 px-3 text-right text-destructive font-mono">{formatCurrency(y.withdrawal)}</td>
                  <td className="py-1.5 px-3 text-right text-chart-1 font-mono">{y.ssIncome > 0 ? formatCurrency(y.ssIncome) : '—'}</td>
                  <td className="py-1.5 px-3 text-right text-chart-1 font-mono">{y.pensionIncome > 0 ? formatCurrency(y.pensionIncome) : '—'}</td>
                  <td className="py-1.5 px-3 text-right text-chart-1 font-mono">{y.partTimeIncome > 0 ? formatCurrency(y.partTimeIncome) : '—'}</td>
                  <td className="py-1.5 px-3 text-right text-chart-1 font-mono">{y.rentalIncome > 0 ? formatCurrency(y.rentalIncome) : '—'}</td>
                  <td className={`py-1.5 px-3 text-right font-mono ${y.netCashFlow >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                    {y.netCashFlow >= 0 ? '+' : ''}{formatCurrency(y.netCashFlow)}
                  </td>
                  <td className={`py-1.5 pl-3 text-right font-mono font-semibold ${y.endBalance > 0 ? 'text-foreground' : 'text-destructive'}`}>
                    {formatCurrency(y.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
