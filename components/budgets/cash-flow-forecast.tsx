'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AccountForecast {
  accountId: string;
  accountName: string;
  startingBalance: number;
  projectedBalance: number;
  inflows: number;
  outflows: number;
}

interface ForecastMonth {
  month: string;
  label: string;
  accounts: AccountForecast[];
}

interface ForecastData {
  forecast: ForecastMonth[];
  accounts: { id: string; name: string; balance: number; type: string }[];
}

export function CashFlowForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/budgets/forecast?months=6', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Cash Flow Forecast</h3>
        </div>
        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Forecast</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Forecast</h3>
        <ChartEmptyState variant="nodata" description="Link budgets to funding accounts to see cash flow projections" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Forecast</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Projected account balances based on budgeted amounts and average income
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-border">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Account</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Current</th>
              {data.forecast.map((m) => (
                <th key={m.month} className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="border-t border-border">
            {data.accounts.map((acct) => (
              <tr key={acct.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{acct.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground capitalize">{acct.type}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(acct.balance)}</td>
                {data.forecast.map((m) => {
                  const proj = m.accounts.find((a) => a.accountId === acct.id);
                  if (!proj) return <td key={m.month} className="px-4 py-3 text-right font-mono text-muted-foreground/50">—</td>;
                  const isPositive = proj.projectedBalance >= 0;
                  return (
                    <td key={m.month} className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3 text-chart-2" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-destructive" />
                        )}
                        <span className={`font-mono blur-number ${
                          proj.projectedBalance >= proj.startingBalance ? 'text-chart-2' : 'text-destructive'
                        }`}>
                          {formatCurrency(proj.projectedBalance)}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground/50">
                        {proj.inflows > 0 || proj.outflows > 0
                          ? `${formatCurrency(proj.inflows)} in / ${formatCurrency(proj.outflows)} out`
                          : 'No budget link'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Credit card spending is budgeted at transaction time. Actual cash outflow occurs when the CC bill is paid. Forecast shows estimated timing.
        </p>
      </div>
    </div>
  );
}
