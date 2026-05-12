'use client';

import type { RetirementPlan } from '@/lib/services/retirement';

export function RetirementInputs({
  plan,
  onUpdate,
}: {
  plan: RetirementPlan;
  onUpdate: (updates: Partial<RetirementPlan>) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Retirement Assumptions</h3>

      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Key Assumptions</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Retirement Age</label>
              <input type="number" value={plan.retirementAge}
                onChange={(e) => onUpdate({ retirementAge: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={120} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Life Expectancy</label>
              <input type="number" value={plan.lifeExpectancy}
                onChange={(e) => onUpdate({ lifeExpectancy: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={120} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Portfolio at Retirement</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.portfolioAtRetirement}
                  onChange={(e) => onUpdate({ portfolioAtRetirement: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Retirement Spending</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Annual Withdrawal</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.annualWithdrawal}
                  onChange={(e) => onUpdate({ annualWithdrawal: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Annual Healthcare</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.healthcareAnnual}
                  onChange={(e) => onUpdate({ healthcareAnnual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Legacy Goal</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.legacyGoal}
                  onChange={(e) => onUpdate({ legacyGoal: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Income Sources</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Social Security Start Age</label>
              <input type="number" value={plan.ssStartAge}
                onChange={(e) => onUpdate({ ssStartAge: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={62} max={70} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Social Security Annual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.ssAnnual}
                  onChange={(e) => onUpdate({ ssAnnual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pension Start Age</label>
              <input type="number" value={plan.pensionStartAge}
                onChange={(e) => onUpdate({ pensionStartAge: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={120} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pension Annual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.pensionAnnual}
                  onChange={(e) => onUpdate({ pensionAnnual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Part-Time Income</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.partTimeIncome}
                  onChange={(e) => onUpdate({ partTimeIncome: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Part-Time Until Age</label>
              <input type="number" value={plan.partTimeEndAge}
                onChange={(e) => onUpdate({ partTimeEndAge: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} max={120} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rental Income Annual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={plan.rentalIncomeAnnual}
                  onChange={(e) => onUpdate({ rentalIncomeAnnual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" min={0} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Economic Assumptions</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Expected Return Rate ({(plan.expectedReturnRate * 100).toFixed(0)}%)</label>
              <input type="range" value={plan.expectedReturnRate * 100}
                onChange={(e) => onUpdate({ expectedReturnRate: parseFloat(e.target.value) / 100 })}
                className="w-full accent-primary" min={1} max={10} step={0.5} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>1%</span>
                <span>10%</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inflation Rate ({(plan.inflationRate * 100).toFixed(0)}%)</label>
              <input type="range" value={plan.inflationRate * 100}
                onChange={(e) => onUpdate({ inflationRate: parseFloat(e.target.value) / 100 })}
                className="w-full accent-primary" min={0} max={10} step={0.5} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>0%</span>
                <span>10%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
