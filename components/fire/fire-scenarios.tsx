'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';

interface FireScenario {
  id?: string;
  name: string;
  isDefault: boolean;
  currentAge: number;
  targetAge: number;
  targetAnnualExpenses: number;
  currentInvestableAssets: number;
  annualContributions: number;
  expectedReturnRate: number;
  inflationRate: number;
  safeWithdrawalRate: number;
}

export function FireScenarios({ onLoad }: { onLoad: (s: FireScenario) => void }) {
  const [scenarios, setScenarios] = useState<FireScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/fire/scenarios');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setScenarios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/fire/scenarios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert('Failed to delete scenario');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/fire/scenarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchScenarios();
    } catch {
      alert('Failed to set default');
    }
  };

  const handleNew = async () => {
    try {
      const res = await fetch('/api/fire/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Create failed');
      const created = await res.json();
      setScenarios((prev) => [created, ...prev]);
      onLoad(created);
    } catch {
      alert('Failed to create scenario');
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Saved Scenarios</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Saved Scenarios</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Saved Scenarios</h3>
        <button
          onClick={handleNew}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
        >
          New Scenario
        </button>
      </div>
      {scenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No scenarios saved. Create your first FIRE scenario above.
        </p>
      ) : (
        <div className="space-y-3">
          {scenarios.map((s) => {
            const fireNumber = s.safeWithdrawalRate > 0
              ? s.targetAnnualExpenses / s.safeWithdrawalRate
              : 0;
            const pct = fireNumber > 0
              ? Math.min((s.currentInvestableAssets / fireNumber) * 100, 9999).toFixed(1)
              : '0.0';
            return (
              <div
                key={s.id}
                className="flex items-center justify-between py-3 px-4 bg-background border border-border rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    {s.isDefault && (
                      <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pct}% to FIRE &middot; Target {formatCurrency(s.targetAnnualExpenses)}/yr &middot; Age {s.currentAge} &rarr; {s.targetAge}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLoad(s)}
                    className="px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                  >
                    Load
                  </button>
                  {!s.isDefault && (
                    <button
                      onClick={() => s.id && handleSetDefault(s.id)}
                      className="px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => s.id && handleDelete(s.id)}
                    className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
