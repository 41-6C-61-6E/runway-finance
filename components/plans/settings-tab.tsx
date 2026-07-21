'use client';

import { useState } from 'react';
import { Flag, TrendingUp, ShieldCheck } from 'lucide-react';

interface SettingsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

export function SettingsTab({ plan, onUpdatePlan }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<'milestones' | 'rates' | 'estate'>('milestones');

  const [retirementAge, setRetirementAge] = useState(plan?.retirementAge || 60);
  const [lifeExpectancy, setLifeExpectancy] = useState(plan?.lifeExpectancyAge || 100);
  const [birthYear, setBirthYear] = useState(plan?.primaryBirthYear || 1985);
  const [filingStatus, setFilingStatus] = useState(plan?.filingStatus || 'single');

  const [inflationRate, setInflationRate] = useState(plan?.settings?.fixedInflationRate || '3.0');
  const [heirTaxRate, setHeirTaxRate] = useState(plan?.settings?.heirFlatIncomeTaxRate || '25.0');
  const [liquidationRate, setLiquidationRate] = useState(plan?.settings?.realEstateLiquidationRate || '6.0');
  const [adminRate, setAdminRate] = useState(plan?.settings?.administrativeCostRate || '1.0');

  if (!plan) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">No active plan selected for settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-Tab Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {[
          { id: 'milestones' as const, label: 'Milestones & Profile', icon: Flag },
          { id: 'rates' as const, label: 'Rates & Inflation', icon: TrendingUp },
          { id: 'estate' as const, label: 'Estate & Tax Assumptions', icon: ShieldCheck },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
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
          <h3 className="text-sm font-bold text-foreground">Target Milestones & Profile</h3>
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Birth Year</label>
              <input
                type="number"
                value={birthYear}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setBirthYear(val);
                  onUpdatePlan({ primaryBirthYear: val });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Retirement Age Target</label>
              <input
                type="number"
                value={retirementAge}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setRetirementAge(val);
                  onUpdatePlan({ retirementAge: val });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Life Expectancy Target</label>
              <input
                type="number"
                value={lifeExpectancy}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setLifeExpectancy(val);
                  onUpdatePlan({ lifeExpectancyAge: val });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Tax Filing Status</label>
              <select
                value={filingStatus}
                onChange={(e) => {
                  setFilingStatus(e.target.value);
                  onUpdatePlan({ filingStatus: e.target.value });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary"
              >
                <option value="single">Single</option>
                <option value="married_joint">Married Filing Jointly</option>
                <option value="married_separate">Married Filing Separately</option>
                <option value="head_of_household">Head of Household</option>
              </select>
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
                onChange={(e) => {
                  setInflationRate(e.target.value);
                  onUpdatePlan({ settings: { fixedInflationRate: e.target.value } });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Estate & Tax Assumptions */}
      {subTab === 'estate' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 max-w-lg text-xs">
          <h3 className="text-sm font-bold text-foreground">Estate & Tax Settlement Assumptions</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Heir Flat Income Tax Rate (%)</label>
              <input
                type="text"
                value={heirTaxRate}
                onChange={(e) => {
                  setHeirTaxRate(e.target.value);
                  onUpdatePlan({ settings: { heirFlatIncomeTaxRate: e.target.value } });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Real Estate Liquidation Fee (%)</label>
              <input
                type="text"
                value={liquidationRate}
                onChange={(e) => {
                  setLiquidationRate(e.target.value);
                  onUpdatePlan({ settings: { realEstateLiquidationRate: e.target.value } });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Probate & Admin Drag (%)</label>
              <input
                type="text"
                value={adminRate}
                onChange={(e) => {
                  setAdminRate(e.target.value);
                  onUpdatePlan({ settings: { administrativeCostRate: e.target.value } });
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
