'use client';

import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { HISTORICAL_RETURNS_DATA } from '@/lib/constants/retirement-defaults';

export function HistoricalMarketData() {
  const [showHistoricalData, setShowHistoricalData] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Historical Market & CPI Inflation Benchmarks
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Empirical historical asset class returns and CPI inflation data (1928–2025) used for historical sequence-of-returns stress testing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistoricalData(!showHistoricalData)}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          {showHistoricalData ? 'Hide Data Table' : 'View Historical Table'}
        </button>
      </div>

      {showHistoricalData && (
        <div className="overflow-x-auto border border-border rounded-xl max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border sticky top-0 bg-card">
              <tr>
                <th className="p-2.5">Year</th>
                <th className="p-2.5">S&P 500 Price Growth</th>
                <th className="p-2.5">S&P 500 Dividend Yield</th>
                <th className="p-2.5">US Bond Growth</th>
                <th className="p-2.5">US Bond Yield</th>
                <th className="p-2.5">CPI Inflation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {HISTORICAL_RETURNS_DATA.map((row) => (
                <tr key={row.year} className="hover:bg-muted/20">
                  <td className="p-2 font-bold">{row.year}</td>
                  <td className={`p-2 font-bold ${row.stocksGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(row.stocksGrowth * 100).toFixed(2)}%
                  </td>
                  <td className="p-2 text-muted-foreground">{(row.stocksYield * 100).toFixed(2)}%</td>
                  <td className={`p-2 font-bold ${row.bondsGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(row.bondsGrowth * 100).toFixed(2)}%
                  </td>
                  <td className="p-2 text-muted-foreground">{(row.bondsYield * 100).toFixed(2)}%</td>
                  <td className="p-2 text-amber-500 font-bold">{(row.inflationRate * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
