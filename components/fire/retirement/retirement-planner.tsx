'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  calculateDecumulation,
  runMonteCarlo,
  getDefaultRetirementPlan,
  type RetirementPlan,
} from '@/lib/services/retirement';
import { RetirementInputs } from './retirement-inputs';
import { RetirementMetrics } from './retirement-metrics';
import { RetirementRunwayChart } from './retirement-runway-chart';
import { RetirementMonteCarlo } from './retirement-monte-carlo';
import { RetirementYearlyTable } from './retirement-yearly-table';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

export function RetirementPlanner() {
  const [plan, setPlan] = useState<RetirementPlan>(getDefaultRetirementPlan());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const { isVisible } = useChartVisibility();

  const handleUpdate = useCallback((updates: Partial<RetirementPlan>) => {
    setPlan((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      const url = plan.id
        ? `/api/fire/retirement/${plan.id}`
        : '/api/fire/retirement';
      const method = plan.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      if (!res.ok) throw new Error('Failed to save');
      const saved = await res.json();
      if (!plan.id) {
        setPlan((prev) => ({ ...prev, id: saved.id }));
      }
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFromForecaster = () => {
    setSaveMsg('Import from Forecaster...');
    setTimeout(() => setSaveMsg(null), 1500);
  };

  const projection = useMemo(() => calculateDecumulation(plan), [plan]);
  const monteCarlo = useMemo(() => runMonteCarlo(plan, 1000), [plan]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">Retirement Planner</h2>
          <button
            onClick={handleImportFromForecaster}
            className="px-2.5 py-1 text-[10px] font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            Import from Forecaster
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-chart-1' : 'text-muted-foreground'}`}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>

      {isVisible('retirementInputs') && (
        <RetirementInputs plan={plan} onUpdate={handleUpdate} />
      )}

      {isVisible('retirementMetrics') && (
        <RetirementMetrics projection={projection} successRate={monteCarlo.successRate} />
      )}

      {isVisible('retirementRunwayChart') && (
        <RetirementRunwayChart projection={projection} monteCarlo={monteCarlo} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {isVisible('retirementMonteCarlo') && (
          <RetirementMonteCarlo monteCarlo={monteCarlo} />
        )}
        <RetirementYearlyTable projection={projection} />
      </div>
    </div>
  );
}
