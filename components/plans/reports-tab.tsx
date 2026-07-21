'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Sliders, BarChart2, Table as TableIcon, Eye, FileSpreadsheet } from 'lucide-react';

interface ReportsTabProps {
  simulation: any;
}

export function ReportsTab({ simulation }: ReportsTabProps) {
  const [plotPreset, setPlotPreset] = useState<'netWorth' | 'income' | 'expenses' | 'taxes'>('netWorth');
  const [tablePreset, setTablePreset] = useState<'summary' | 'income' | 'rates'>('summary');
  const [currencyMode, setCurrencyMode] = useState<'todays' | 'future'>('todays');

  const yearlyResults = simulation?.yearlyResults || [];

  const handleExportCSV = () => {
    if (!yearlyResults.length) return;
    const headers = ['Year', 'Age', 'Total Assets', 'Total Liabilities', 'Net Worth', 'Gross Income', 'Total Expenses', 'Taxes Paid'];
    const rows = yearlyResults.map((y: any) => [y.year, y.primaryAge, y.totalAssets, y.totalLiabilities, y.netWorth, y.grossIncome, y.totalExpenses, y.taxesPaid]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `retirement_projections_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
        {/* Left Toolbar Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Plots Preset Selector */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            {(['netWorth', 'income', 'expenses', 'taxes'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlotPreset(p)}
                className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-md transition-all ${
                  plotPreset === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.replace(/([A-Z])/g, ' $1')}
              </button>
            ))}
          </div>

          {/* Table Preset Selector */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
            <TableIcon className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            {(['summary', 'income', 'rates'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTablePreset(t)}
                className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-md transition-all ${
                  tablePreset === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrencyMode(currencyMode === 'todays' ? 'future' : 'todays')}
            className="px-3 py-1.5 bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground border border-border rounded-lg transition-all"
          >
            {currencyMode === 'todays' ? "Today's Currency ($)" : 'Future Value ($)'}
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground capitalize">{plotPreset.replace(/([A-Z])/g, ' $1')} Curve</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={yearlyResults}>
              <XAxis dataKey="year" stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} />
              <YAxis stroke="currentColor" className="text-xs text-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(val: any) => [formatCurrency(Number(val)), 'Amount']} />
              <Area
                type="monotone"
                dataKey={plotPreset === 'netWorth' ? 'netWorth' : plotPreset === 'income' ? 'grossIncome' : plotPreset === 'expenses' ? 'totalExpenses' : 'taxesPaid'}
                stroke="var(--color-chart-1)"
                fill="var(--color-chart-1)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Spreadsheet Data Grid */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
            <tr>
              <th className="p-2.5">Year</th>
              <th className="p-2.5">Age</th>
              <th className="p-2.5">Net Worth</th>
              <th className="p-2.5">Liquid Net Worth</th>
              <th className="p-2.5">Gross Income</th>
              <th className="p-2.5">Total Expenses</th>
              <th className="p-2.5">Taxes Paid</th>
              <th className="p-2.5">Surplus / Deficit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {yearlyResults.map((y: any) => (
              <tr key={y.year} className="hover:bg-muted/20">
                <td className="p-2.5 font-medium">{y.year}</td>
                <td className="p-2.5">{y.primaryAge}</td>
                <td className="p-2.5 font-mono font-bold text-foreground">{formatCurrency(y.netWorth)}</td>
                <td className="p-2.5 font-mono text-muted-foreground">{formatCurrency(y.liquidNetWorth)}</td>
                <td className="p-2.5 font-mono text-emerald-500">{formatCurrency(y.grossIncome)}</td>
                <td className="p-2.5 font-mono text-rose-500">{formatCurrency(y.totalExpenses)}</td>
                <td className="p-2.5 font-mono text-rose-400">{formatCurrency(y.taxesPaid)}</td>
                <td className={`p-2.5 font-mono font-bold ${y.netCashFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(y.netCashFlow)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
