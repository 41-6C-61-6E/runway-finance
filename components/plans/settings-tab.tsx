'use client';

import { useState } from 'react';
import { Settings, Flag, TrendingUp, Percent, ShieldCheck, Sliders } from 'lucide-react';

interface SettingsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

export function SettingsTab({ plan, onUpdatePlan }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<'milestones' | 'rates' | 'dividends' | 'bonds' | 'tax' | 'metrics' | 'other'>('milestones');

  const [retirementAge, setRetirementAge] = useState(plan.retirementAge || 60);
  const [lifeExpectancy, setLifeExpectancy] = useState(plan.lifeExpectancyAge || 100);
  const [inflationRate, setInflationRate] = useState(plan.settings?.fixedInflationRate || '3.0');

  return (
    <div className="space-y-6">
      {/* Sub-Tab Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        {[
          { id: 'milestones', label: 'Milestones', icon: Flag },
          { id: 'rates', label: 'Rates & Returns', icon: TrendingUp },
          { id: 'dividends', label: 'Dividends', icon: Percent },
          { id: 'bonds', label: 'Bonds', icon: Sliders },
          { id: 'tax', label: 'Tax Defaults', icon: ShieldCheck },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                subTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab: Milestones */}
      {subTab === 'milestones' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 max-w-lg">
          <h3 className="text-sm font-bold text-foreground">Target Milestones</h3>
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Retirement Age</label>
              <input
                type="number"
                value={retirementAge}
                onChange={(e) => {
                  setRetirementAge(parseInt(e.target.value, 10));
                  onUpdatePlan({ retirementAge: parseInt(e.target.value, 10) });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Life Expectancy Age</label>
              <input
                type="number"
                value={lifeExpectancy}
                onChange={(e) => {
                  setLifeExpectancy(parseInt(e.target.value, 10));
                  onUpdatePlan({ lifeExpectancyAge: parseInt(e.target.value, 10) });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Rates */}
      {subTab === 'rates' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 max-w-lg">
          <h3 className="text-sm font-bold text-foreground">Growth Rates & Inflation</h3>
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Fixed Annual Inflation Rate (%)</label>
              <input
                type="text"
                value={inflationRate}
                onChange={(e) => setInflationRate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Dividends */}
      {subTab === 'dividends' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 max-w-lg text-xs">
          <h3 className="text-sm font-bold text-foreground">Dividend Treatment</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
            <span>Reinvest Stock Dividends Automatically</span>
          </label>
          <div className="flex justify-between border-t border-border pt-2">
            <span>Qualified Dividends Ratio:</span>
            <span className="font-mono font-bold">100%</span>
          </div>
        </div>
      )}

      {/* Sub-Tab: Tax Defaults */}
      {subTab === 'tax' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 max-w-lg text-xs">
          <h3 className="text-sm font-bold text-foreground">Tax Withholding Defaults</h3>
          <div className="flex justify-between">
            <span>Traditional 401(k)/IRA Withholding:</span>
            <span className="font-mono font-bold">20%</span>
          </div>
          <div className="flex justify-between">
            <span>Taxable Brokerage Withholding:</span>
            <span className="font-mono font-bold">10%</span>
          </div>
        </div>
      )}
    </div>
  );
}
