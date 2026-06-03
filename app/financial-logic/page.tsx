'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { ASSET_ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES } from '@/lib/utils/account-scope';
import {
  buildNetWorthTraces,
  buildCashFlowTrace,
  buildRealEstateTrace,
  buildFireTrace,
  buildBudgetTrace,
  buildGoalsTrace,
} from '@/lib/services/trace-engine';
import { CalculationTraceOverlay, formatTraceResult } from '@/components/financial-logic/calculation-trace';
import type { AccountData, CalculationTrace } from '@/lib/types/financial';
import { PageHeader } from '@/components/page-header';

interface FetchedData {
  accounts: AccountData[];
  cashFlow: { totalIncome: number; totalExpenses: number; netIncome: number; savingsRate: number };
  realEstate: { totalValue: number; totalMortgage: number; totalEquity: number; overallLtv: number; properties: any[] };
  fireSettings: { fireNumber: number; currentInvestableAssets: number; percentToFire: number; yearsToFI: number; safeWithdrawalRate: number; targetAnnualExpenses: number };
  budgets: { incomeBudgeted: number; incomeActual: number; expenseBudgeted: number; expenseActual: number };
  goals: { totalTarget: number; totalCurrent: number; overallProgress: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  netWorth: 'Net Worth',
  cashFlow: 'Cash Flow',
  realEstate: 'Real Estate',
  fire: 'FIRE',
  budgets: 'Budgets',
  goals: 'Goals',
};

const CATEGORY_ORDER = ['netWorth', 'cashFlow', 'realEstate', 'fire', 'budgets', 'goals'];

function GroupedTraceTree({ traces }: { traces: CalculationTrace[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(traces.map((t) => t.id)));
  const [expandedTrace, setExpandedTrace] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map: Record<string, CalculationTrace[]> = {};
    for (const t of traces) {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    }
    return map;
  }, [traces]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTrace = (id: string) => {
    setExpandedTrace((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => {
        const catTraces = grouped[cat];
        const catResult = catTraces.reduce((s, t) => s + t.result, 0);
        return (
          <div key={cat} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(cat)}
              className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expanded.has(cat) ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Calculator className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[cat]}</span>
                <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded font-medium">
                  {catTraces.length} metrics
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {catTraces.slice(0, 2).map((t) => (
                  <span key={t.id} className="text-muted-foreground">
                    {t.title}: <span className="font-mono text-foreground font-medium">{formatTraceResult(t.result, t.format)}</span>
                  </span>
                ))}
              </div>
            </button>

            {expanded.has(cat) && (
              <div className="border-t border-border">
                {catTraces.map((trace) => (
                  <div key={trace.id} className="border-b border-border/50 last:border-0">
                    <button
                      onClick={() => toggleTrace(trace.id)}
                      className="flex items-center justify-between w-full px-5 py-2.5 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">
                          {expandedTrace.has(trace.id) ? '−' : '+'}
                        </span>
                        <span className="text-sm text-foreground">{trace.title}</span>
                      </div>
                      <span className="text-sm font-mono font-medium text-foreground">
                        {formatTraceResult(trace.result, trace.format)}
                      </span>
                    </button>
                    {expandedTrace.has(trace.id) && (
                      <div className="px-5 pb-3">
                        <CalculationTraceOverlay trace={trace} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AccountClassificationTable({ accounts }: { accounts: AccountData[] }) {
  const rows = useMemo(
    () =>
      accounts.map((a) => ({
        name: a.name,
        type: a.type,
        balance: typeof a.balance === 'string' ? parseFloat(a.balance) : a.balance,
        classification: isAssetAccount(a.type)
          ? 'Asset'
          : isLiabilityAccount(a.type)
            ? 'Liability'
            : 'Uncategorized',
        excluded: !!a.isHidden || !!a.isExcludedFromNetWorth,
      })),
    [accounts]
  );

  if (!accounts.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        Account Classification ({rows.length} accounts)
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Account</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Type</th>
              <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Balance</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Classification</th>
              <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-4 font-medium text-foreground">{row.name}</td>
                <td className="py-1.5 pr-4 font-mono text-muted-foreground">{row.type}</td>
                <td className="py-1.5 pr-4 text-right font-mono text-foreground">
                  {formatBalance(row.balance)}
                </td>
                <td className="py-1.5 pr-4">
                  <ClassificationBadge label={row.classification} />
                </td>
                <td className="py-1.5">
                  {row.excluded ? (
                    <span className="text-destructive/70 text-[10px] font-medium">Excluded</span>
                  ) : (
                    <span className="text-chart-1/70 text-[10px] font-medium">Included</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeReference() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Asset Types ({ASSET_ACCOUNT_TYPES.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {ASSET_ACCOUNT_TYPES.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 bg-chart-1/10 text-chart-1 rounded text-[10px] font-mono"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Liability Types ({LIABILITY_ACCOUNT_TYPES.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {LIABILITY_ACCOUNT_TYPES.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 bg-destructive/10 text-destructive rounded text-[10px] font-mono"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FinancialLogicPage() {
  const [data, setData] = useState<FetchedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [accountsRes, cashFlowRes, realEstateRes, fireRes, budgetsRes, goalsRes] = await Promise.all([
          fetch('/api/accounts?includeHidden=true'),
          fetch('/api/cash-flow/summary'),
          fetch('/api/real-estate'),
          fetch('/api/fire/scenarios'),
          fetch('/api/cash-flow/budgets?month=' + new Date().toISOString().slice(0, 7)),
          fetch('/api/financial-goals'),
        ]);

        const accounts: AccountData[] = accountsRes.ok ? await accountsRes.json() : [];
        const cashFlow = cashFlowRes.ok ? await cashFlowRes.json() : {};
        const realEstate = realEstateRes.ok ? await realEstateRes.json() : {};
        const fireData = fireRes.ok ? await fireRes.json() : [];
        const budgets = budgetsRes.ok ? await budgetsRes.json() : { income: [], expenses: [] };
        const goals = goalsRes.ok ? await goalsRes.json() : [];

        const fireSettings = Array.isArray(fireData) && fireData.length > 0
          ? fireData[0]
          : {};

        const incomeBudgeted = (budgets.income ?? []).reduce((s: number, b: any) => s + (parseFloat(b.budgeted ?? b.amount ?? 0) || 0), 0);
        const incomeActual = (budgets.income ?? []).reduce((s: number, b: any) => s + (parseFloat(b.actual ?? 0) || 0), 0);
        const expenseBudgeted = (budgets.expenses ?? []).reduce((s: number, b: any) => s + (parseFloat(b.budgeted ?? b.amount ?? 0) || 0), 0);
        const expenseActual = (budgets.expenses ?? []).reduce((s: number, b: any) => s + (parseFloat(b.actual ?? 0) || 0), 0);

        const totalTarget = Array.isArray(goals) ? goals.reduce((s: number, g: any) => s + (parseFloat(g.targetAmount) || 0), 0) : 0;
        const totalCurrent = Array.isArray(goals) ? goals.reduce((s: number, g: any) => s + (parseFloat(g.currentAmount) || 0), 0) : 0;

        setData({
          accounts,
          cashFlow: {
            totalIncome: cashFlow.totalIncome ?? 0,
            totalExpenses: cashFlow.totalExpenses ?? 0,
            netIncome: cashFlow.netIncome ?? 0,
            savingsRate: cashFlow.savingsRate ?? 0,
          },
          realEstate: {
            totalValue: realEstate.totalValue ?? 0,
            totalMortgage: realEstate.totalMortgage ?? 0,
            totalEquity: realEstate.totalEquity ?? 0,
            overallLtv: realEstate.overallLtv ?? 0,
            properties: realEstate.properties ?? [],
          },
          fireSettings: {
            fireNumber: parseFloat(fireSettings.fireNumber ?? fireSettings.targetAmount ?? 0),
            currentInvestableAssets: parseFloat(fireSettings.currentInvestableAssets ?? 0),
            percentToFire: parseFloat(fireSettings.percentToFire ?? 0),
            yearsToFI: parseFloat(fireSettings.yearsToFI ?? 0),
            safeWithdrawalRate: parseFloat(fireSettings.safeWithdrawalRate ?? 0.04),
            targetAnnualExpenses: parseFloat(fireSettings.targetAnnualExpenses ?? 0),
          },
          budgets: { incomeBudgeted, incomeActual, expenseBudgeted, expenseActual },
          goals: {
            totalTarget,
            totalCurrent,
            overallProgress: totalTarget > 0 ? Math.min((totalCurrent / totalTarget) * 100, 100) : 0,
          },
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const traces = useMemo(() => {
    if (!data) return [];
    return [
      ...buildNetWorthTraces(data.accounts),
      buildCashFlowTrace(data.cashFlow),
      buildRealEstateTrace(data.realEstate),
      buildFireTrace(data.fireSettings),
      buildBudgetTrace({ ...data.budgets, totalBudgeted: data.budgets.incomeBudgeted, totalActual: data.budgets.incomeActual, remaining: data.budgets.incomeActual - data.budgets.incomeBudgeted, percentUsed: data.budgets.incomeBudgeted > 0 ? (data.budgets.incomeActual / data.budgets.incomeBudgeted) * 100 : 0, type: 'income' }),
      buildBudgetTrace({ totalBudgeted: data.budgets.expenseBudgeted, totalActual: data.budgets.expenseActual, remaining: data.budgets.expenseBudgeted - data.budgets.expenseActual, percentUsed: data.budgets.expenseBudgeted > 0 ? (data.budgets.expenseActual / data.budgets.expenseBudgeted) * 100 : 0, type: 'expense' }),
      buildGoalsTrace(data.goals),
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Financial Logic Explorer" icon={Calculator} />
      <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-8 max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <p className="text-sm text-muted-foreground">
          See exactly how every financial metric is calculated — which accounts are included, what types
          are classified as assets or liabilities, and the step-by-step math behind each number.
        </p>

        <GroupedTraceTree traces={traces} />
        <AccountClassificationTable accounts={data?.accounts ?? []} />
        <TypeReference />
      </div>
    </div>
  );
}

function ClassificationBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    Asset: 'bg-chart-1/10 text-chart-1',
    Liability: 'bg-destructive/10 text-destructive',
    Uncategorized: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[label] || colors.Uncategorized}`}>
      {label}
    </span>
  );
}

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(2)}`;
}
