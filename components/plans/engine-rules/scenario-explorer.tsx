'use client';

import React, { useState } from 'react';
import {
  Play,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  HeartHandshake,
  BookOpen,
} from 'lucide-react';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

interface ScenarioExplorerProps {
  rules?: Partial<typeof DEFAULT_2026_RULES> | null;
  isMfj: boolean;
}

export function ScenarioExplorer({ rules, isMfj }: ScenarioExplorerProps) {
  const [activeScenario, setActiveScenario] = useState<
    'accumulation' | 'early_retirement' | 'roth_ladder' | 'medicare_irmaa' | 'rmd_phase'
  >('early_retirement');

  const [showMathDetails] = useState(true);

  const scenarios = [
    {
      id: 'accumulation' as const,
      title: '1. Pre-Retirement Accumulation',
      ageSpan: 'Age 20 – 55',
      badgeColor: 'bg-constructive/10 text-constructive border-constructive/30',
      description: 'Active earned income phase where savings are routed through pre-tax & post-tax investment waterfalls.',
    },
    {
      id: 'early_retirement' as const,
      title: '2. Early Retirement & Penalty Guard',
      ageSpan: 'Age 45 – 59.5',
      badgeColor: 'bg-status-warning/10 text-status-warning border-status-warning/30',
      description: 'Living off portfolio drawdowns before age 59.5 with strict 10% & 20% early withdrawal penalty checks & Rule of 55 exceptions.',
    },
    {
      id: 'roth_ladder' as const,
      title: '3. Roth Conversion Ladder',
      ageSpan: 'Age 55 – 65',
      badgeColor: 'bg-chart-5/10 text-chart-5 border-chart-5/30',
      description: 'Optimized pre-tax to Roth conversions filling lower tax brackets before RMDs begin, with optional IRMAA cliff avoidance.',
    },
    {
      id: 'medicare_irmaa' as const,
      title: '4. Medicare & ACA Healthcare Transition',
      ageSpan: 'Age 60 – 65+',
      badgeColor: 'bg-chart-1/10 text-chart-1 border-chart-1/30',
      description: 'ACA subsidies bridge early retirement up to age 65; Medicare IRMAA Part B & D surcharges trigger based on MAGI from 2 years prior.',
    },
    {
      id: 'rmd_phase' as const,
      title: '5. Mandatory RMD & Estate Phase',
      ageSpan: 'Age 73 – 100+',
      badgeColor: 'bg-chart-2/10 text-chart-2 border-chart-2/30',
      description: 'SECURE Act 2.0 mandatory distributions using IRS Table III divisors, plus Social Security taxation (up to 85%) and 10-year inherited IRA rules.',
    },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <Play className="w-4 h-4 text-primary fill-primary/20" />
            Interactive Scenario Rules Explorer
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select a financial life stage to inspect rules, tax evaluations, and drawdown execution.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted/40 px-3 py-1 rounded-lg border border-border">
          Filing Status: <strong className="text-foreground">{isMfj ? 'Married Filing Jointly (MFJ)' : 'Single'}</strong>
        </span>
      </div>

      {/* Scenario Tabs (Container-Responsive Grid) */}
      <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 @lg:grid-cols-5 gap-2.5">
        {scenarios.map((sc) => {
          const isSelected = activeScenario === sc.id;
          return (
            <button
              type="button"
              key={sc.id}
              onClick={() => setActiveScenario(sc.id)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                isSelected
                  ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                  : 'bg-muted/20 border-border hover:bg-muted/40'
              }`}
            >
              <div className="space-y-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${sc.badgeColor}`}>
                  {sc.ageSpan}
                </span>
                <p className="text-xs font-bold text-foreground leading-tight">{sc.title}</p>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{sc.description}</p>
            </button>
          );
        })}
      </div>

      {/* Scenario Deep Dive Card */}
      <div className="bg-muted/20 border border-border rounded-xl p-5 space-y-5">
        {activeScenario === 'accumulation' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <h5 className="font-bold text-sm text-foreground">Scenario 1: Pre-Retirement Accumulation Phase</h5>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              During the working phase, earned salary income pays payroll FICA tax (6.2% Social Security up to cap + 1.45% Medicare). Pre-tax contributions (401k/HSA) reduce taxable income dollar-for-dollar. Net surplus cash flow is routed through the savings waterfall.
            </p>

            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 pt-1">
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-foreground block">1. Tax Deduction Priority</span>
                <p className="text-muted-foreground text-[11px]">
                  Pre-tax 401(k) (max ${rules?.contributionLimits?.k401 || 23000}) & HSA (max ${rules?.contributionLimits?.hsaSingle || 4150}) deduct directly from Gross Salary before Ordinary Income Tax.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-foreground block">2. FICA Payroll Tax</span>
                <p className="text-muted-foreground text-[11px]">
                  7.65% fixed payroll deduction applies to gross wages (Social Security portion capped at IRS wage limit, Medicare uncapped).
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-foreground block">3. Defined Plan Contributions</span>
                <p className="text-muted-foreground text-[11px]">
                  Only defined per-account contributions (% or fixed $) and employer matches fund accounts. Unallocated cash is not swept.
                </p>
              </div>
            </div>

            {showMathDetails && (
              <div className="bg-card border border-border rounded-lg p-3.5 space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between text-muted-foreground border-b border-border pb-1 font-sans font-bold">
                  <span>Example Math Walkthrough (Single Filer, $150,000 Salary)</span>
                  <span className="text-emerald-500 font-mono">Accumulation Year</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                  <div>Gross Salary: <span className="text-foreground font-bold">$150,000</span></div>
                  <div>Pre-Tax 401(k) Contribution: <span className="text-emerald-500 font-bold">-${rules?.contributionLimits?.k401 || 23000}</span></div>
                  <div>HSA Pre-Tax Contribution: <span className="text-emerald-500 font-bold">-${rules?.contributionLimits?.hsaSingle || 4150}</span></div>
                  <div>FICA Payroll Tax (7.65%): <span className="text-amber-500 font-bold">-$11,475</span></div>
                  <div>Standard Deduction: <span className="text-foreground font-bold">-${rules?.standardDeduction || 15000}</span></div>
                  <div>Taxable Ordinary Income: <span className="text-foreground font-bold">$107,850</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeScenario === 'early_retirement' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <h5 className="font-bold text-sm text-foreground">Scenario 2: Early Retirement & Early Withdrawal Penalty Guard</h5>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              When retiring before age 59.5 (or age 65 for HSA non-medical usage), accessing tax-deferred accounts triggers IRS penalties unless specific statutory exceptions are met. The engine monitors withdrawal sequence and tags early penalty warnings.
            </p>

            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 pt-1">
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  10% IRA / 401(k) Penalty
                </span>
                <p className="text-muted-foreground text-[11px]">
                  Traditional IRA & 401(k) withdrawals before age 59.5 incur a 10% IRS penalty on top of ordinary income tax.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Rule of 55 Exception
                </span>
                <p className="text-muted-foreground text-[11px]">
                  If leaving an employer in or after the year turning age 55, 401(k) withdrawals from that plan are 100% penalty-free.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  20% HSA Penalty (Age &lt; 65)
                </span>
                <p className="text-muted-foreground text-[11px]">
                  Non-medical HSA withdrawals before age 65 incur a 20% penalty. After age 65, HSA acts like a Traditional IRA (ordinary tax only).
                </p>
              </div>
            </div>

            {showMathDetails && (
              <div className="bg-card border border-border rounded-lg p-3.5 space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between text-muted-foreground border-b border-border pb-1 font-sans font-bold">
                  <span>Engine Drawdown Hierarchy to Avoid Early Penalties</span>
                  <span className="text-amber-500 font-mono">Penalty-Aware Order</span>
                </div>
                <p className="text-muted-foreground font-sans text-[11px]">
                  The engine drains <strong className="text-foreground">Cash</strong> first, followed by <strong className="text-foreground">Taxable Brokerage Basis</strong>, then <strong className="text-foreground">Roth Contributions</strong>, avoiding early traditional withdrawals until age 59.5 (or Rule of 55).
                </p>
              </div>
            )}
          </div>
        )}

        {activeScenario === 'roth_ladder' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <h5 className="font-bold text-sm text-foreground">Scenario 3: Roth Conversion Ladder & Tax Bracket Filling</h5>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              In early retirement years before Social Security & RMDs begin, ordinary income is low. The engine can systematically convert Traditional IRA funds into Roth IRAs, locking in today’s lower tax brackets (e.g., 10% or 12%) to eliminate future RMD tax torpedoes.
            </p>

            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 pt-1">
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-foreground block">1. Target Bracket Filling</span>
                <p className="text-muted-foreground text-[11px]">
                  Engine computes headroom up to the top of the selected target bracket (e.g. top of 12% at ${isMfj ? '96,950' : '48,475'}) and converts up to that threshold.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-purple-600 block">2. 5-Year Conversion Rule</span>
                <p className="text-muted-foreground text-[11px]">
                  Each Roth conversion principal amount must age 5 tax years before penalty-free withdrawal prior to age 59.5.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-blue-600 block">3. IRMAA Guardrail</span>
                <p className="text-muted-foreground text-[11px]">
                  When `avoidIrmaaCliffs` is enabled, conversion headroom is automatically capped $1,000 below Medicare IRMAA Tier 1 limits starting at age 63.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeScenario === 'medicare_irmaa' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-blue-500" />
              <h5 className="font-bold text-sm text-foreground">Scenario 4: ACA Subsidies & Medicare IRMAA Surcharges</h5>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Between retirement and age 65, early retirees qualify for ACA Health Premium Tax Credits based on MAGI relative to Federal Poverty Line (FPL). At age 65, Medicare begins, and MAGI from 2 years prior (age 63+) determines Part B & D IRMAA monthly surcharges.
            </p>

            <div className="grid grid-cols-1 @md:grid-cols-2 gap-3 pt-1">
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-blue-600 block">ACA Premium Assistance (&lt; Age 65)</span>
                <p className="text-muted-foreground text-[11px]">
                  Subsidy caps health premium cost to a percentage of MAGI (0% at 100-150% FPL, scaling up to 8.5% of MAGI at 400%+ FPL). Benchmark cost = ${(isMfj ? 16800 : 8400).toLocaleString()}/yr adjusted for inflation.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-indigo-600 block">Medicare IRMAA 2-Year Lag (&ge; Age 65)</span>
                <p className="text-muted-foreground text-[11px]">
                  MAGI at Age 63 determines Medicare Part B & D surcharges at Age 65. If MAGI exceeds ${isMfj ? '206,000' : '103,000'}, Part B premium rises from $174.70/mo up to $594.00/mo per person.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeScenario === 'rmd_phase' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <h5 className="font-bold text-sm text-foreground">Scenario 5: SECURE Act 2.0 RMDs & Estate Distribution Rules</h5>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Under SECURE Act 2.0, mandatory RMDs start at age 73 (born 1951–1959) and step up by one year per birth cohort for later years (e.g. 1960→75, 1963→78). The engine calculates required minimum distributions using IRS Uniform Lifetime Table III. Additionally, Social Security taxation rules apply up to 85% of benefits.
            </p>

            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 pt-1">
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-foreground block">1. IRS Divisor Calculation</span>
                <p className="text-muted-foreground text-[11px]">
                  Annual RMD = Prior Dec 31 Traditional Balance &divide; IRS Divisor (e.g. Age 73 divisor = 26.5 &rarr; 3.77% forced withdrawal).
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-indigo-600 block">2. Social Security Taxability</span>
                <p className="text-muted-foreground text-[11px]">
                  Provisional Income = AGI + Tax-Exempt Interest + 50% Social Security. Over ${isMfj ? '44,000' : '34,000'}, up to 85% of SS is taxable.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                <span className="font-bold text-purple-600 block">3. 10-Year Inherited IRA Rule</span>
                <p className="text-muted-foreground text-[11px]">
                  Non-spouse heirs must fully drain inherited traditional IRAs within 10 years, taxed at their individual marginal income rate.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
