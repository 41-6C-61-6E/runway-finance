'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, Landmark, Target, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ChecklistState = {
  accounts: number;
  budgets: number;
  goals: number;
};

const initialState: ChecklistState = {
  accounts: 0,
  budgets: 0,
  goals: 0,
};

export function OnboardingChecklist() {
  const [state, setState] = useState<ChecklistState>(initialState);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem('onboarding-checklist-dismissed') === 'true');
    }
  }, []);

  function dismiss() {
    localStorage.setItem('onboarding-checklist-dismissed', 'true');
    setDismissed(true);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [accountsRes, budgetsRes, goalsRes] = await Promise.all([
          fetch('/api/accounts', { credentials: 'include' }),
          fetch('/api/budgets', { credentials: 'include' }),
          fetch('/api/financial-goals', { credentials: 'include' }),
        ]);

        const [accounts, budgets, goals] = await Promise.all([
          accountsRes.ok ? accountsRes.json() : [],
          budgetsRes.ok ? budgetsRes.json() : { budgets: [] },
          goalsRes.ok ? goalsRes.json() : [],
        ]);

        if (!cancelled) {
          setState({
            accounts: Array.isArray(accounts) ? accounts.length : 0,
            budgets: Array.isArray(budgets?.budgets) ? budgets.budgets.length : 0,
            goals: Array.isArray(goals) ? goals.length : 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => [
    {
      done: state.accounts > 0,
      icon: Landmark,
      title: 'Add accounts',
      text: 'Connect SimpleFIN or create manual accounts.',
      href: '/settings?tab=accounts',
    },
    {
      done: state.budgets > 0,
      icon: Wallet,
      title: 'Create budgets',
      text: 'Set targets for recurring income and spending.',
      href: '/budgets',
    },
    {
      done: state.goals > 0,
      icon: Target,
      title: 'Set goals',
      text: 'Track savings, debt payoff, or investment goals.',
      href: '/goals',
    },
  ], [state]);

  const completed = items.filter((item) => item.done).length;
  if (dismissed || loading || completed === items.length) return null;

  return (
    <div className="mb-5 bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Setup Checklist</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completed} of {items.length} complete
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(completed / items.length) * 100}%` }} />
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const Status = item.done ? CheckCircle2 : Circle;
          return (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  <Status className={`w-3.5 h-3.5 shrink-0 ${item.done ? 'text-chart-1' : 'text-muted-foreground'}`} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.text}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
