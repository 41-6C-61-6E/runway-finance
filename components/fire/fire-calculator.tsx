'use client';

import { useState } from 'react';
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

export function FireCalculator({
  scenario,
  onUpdate,
}: {
  scenario: FireScenario;
  onUpdate: (updates: Partial<FireScenario>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      const url = scenario.id
        ? `/api/fire/scenarios/${scenario.id}`
        : '/api/fire/scenarios';
      const method = scenario.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenario.name,
          currentAge: scenario.currentAge,
          targetAge: scenario.targetAge,
          targetAnnualExpenses: scenario.targetAnnualExpenses,
          currentInvestableAssets: scenario.currentInvestableAssets,
          annualContributions: scenario.annualContributions,
          expectedReturnRate: scenario.expectedReturnRate,
          inflationRate: scenario.inflationRate,
          safeWithdrawalRate: scenario.safeWithdrawalRate,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const saved = await res.json();
      if (!scenario.id) {
        onUpdate({ id: saved.id, isDefault: saved.isDefault });
      }
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Scenario Calculator</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Age</label>
          <input
            type="number"
            value={scenario.currentAge}
            onChange={(e) => onUpdate({ currentAge: parseInt(e.target.value) || 0 })}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            min={0}
            max={120}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Age</label>
          <input
            type="number"
            value={scenario.targetAge}
            onChange={(e) => onUpdate({ targetAge: parseInt(e.target.value) || 0 })}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            min={0}
            max={120}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Annual Expenses</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={scenario.targetAnnualExpenses}
              onChange={(e) => onUpdate({ targetAnnualExpenses: parseFloat(e.target.value) || 0 })}
              className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Investable Assets</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={scenario.currentInvestableAssets}
              onChange={(e) => onUpdate({ currentInvestableAssets: parseFloat(e.target.value) || 0 })}
              className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Annual Contributions</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={scenario.annualContributions}
              onChange={(e) => onUpdate({ annualContributions: parseFloat(e.target.value) || 0 })}
              className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Expected Return Rate ({scenario.expectedReturnRate * 100}%)</label>
          <input
            type="range"
            value={scenario.expectedReturnRate * 100}
            onChange={(e) => onUpdate({ expectedReturnRate: parseFloat(e.target.value) / 100 })}
            className="w-full accent-primary"
            min={1}
            max={15}
            step={0.5}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>1%</span>
            <span>15%</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Inflation Rate ({scenario.inflationRate * 100}%)</label>
          <input
            type="range"
            value={scenario.inflationRate * 100}
            onChange={(e) => onUpdate({ inflationRate: parseFloat(e.target.value) / 100 })}
            className="w-full accent-primary"
            min={0}
            max={10}
            step={0.5}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>0%</span>
            <span>10%</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Safe Withdrawal Rate ({scenario.safeWithdrawalRate * 100}%)</label>
          <input
            type="range"
            value={scenario.safeWithdrawalRate * 100}
            onChange={(e) => onUpdate({ safeWithdrawalRate: parseFloat(e.target.value) / 100 })}
            className="w-full accent-primary"
            min={2}
            max={6}
            step={0.25}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>2%</span>
            <span>6%</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Saving...' : 'Save Scenario'}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-chart-1' : 'text-destructive'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
