'use client';

import { useState } from 'react';
import {
  Database,
  RotateCcw,
  Check,
  Save,
  Scale,
  BookOpen,
  Layers,
  Info,
  ShieldAlert,
  ShieldCheck,
  HeartHandshake,
  Play,
  ArrowRight,
  Calculator,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingUp,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import {
  DEFAULT_2026_RULES,
  IRS_UNIFORM_LIFETIME_TABLE,
  HISTORICAL_RETURNS_DATA,
} from '@/lib/constants/retirement-defaults';

interface EngineRulesViewProps {
  rules: any;
  setRules: React.Dispatch<React.SetStateAction<any>>;
  loadingRules: boolean;
  savingRules: boolean;
  rulesSuccessMsg: string;
  handleSaveRules: (customPayload?: any) => Promise<void>;
  handleResetRules: () => Promise<void>;
  filingStatus: string;
}

export function EngineRulesView({
  rules,
  setRules,
  loadingRules,
  savingRules,
  rulesSuccessMsg,
  handleSaveRules,
  handleResetRules,
  filingStatus,
}: EngineRulesViewProps) {
  const isMfj = filingStatus === 'married_joint';

  // State for active scenario in interactive scenario explorer
  const [activeScenario, setActiveScenario] = useState<
    'accumulation' | 'early_retirement' | 'roth_ladder' | 'medicare_irmaa' | 'rmd_phase'
  >('early_retirement');

  // Active accordion section for deep-dive rules
  const [expandedRuleTopic, setExpandedRuleTopic] = useState<string | null>('penalties');

  // Toggle for IRS Uniform Lifetime Table III
  const [showRmdTable, setShowRmdTable] = useState(false);

  // Toggle for Historical Market Data
  const [showHistoricalData, setShowHistoricalData] = useState(false);

  // Toggle scenario math breakdown detail
  const [showMathDetails, setShowMathDetails] = useState(true);

  if (loadingRules) {
    return (
      <div className="py-16 flex justify-center items-center">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Loading statutory engine rules & parameters...</span>
        </div>
      </div>
    );
  }

  // Scenarios metadata for interactive explorer
  const scenarios = [
    {
      id: 'accumulation' as const,
      title: '1. Pre-Retirement Accumulation',
      ageSpan: 'Age 20 – 55',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      description: 'Active earned income phase where savings are routed through pre-tax & post-tax investment waterfalls.',
    },
    {
      id: 'early_retirement' as const,
      title: '2. Early Retirement & Penalty Guard',
      ageSpan: 'Age 45 – 59.5',
      badgeColor: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      description: 'Living off portfolio drawdowns before age 59.5 with strict 10% & 20% early withdrawal penalty checks & Rule of 55 exceptions.',
    },
    {
      id: 'roth_ladder' as const,
      title: '3. Roth Conversion Ladder',
      ageSpan: 'Age 55 – 65',
      badgeColor: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      description: 'Optimized pre-tax to Roth conversions filling lower tax brackets before RMDs begin, with optional IRMAA cliff avoidance.',
    },
    {
      id: 'medicare_irmaa' as const,
      title: '4. Medicare & ACA Healthcare Transition',
      ageSpan: 'Age 60 – 65+',
      badgeColor: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      description: 'ACA subsidies bridge early retirement up to age 65; Medicare IRMAA Part B & D surcharges trigger based on MAGI from 2 years prior.',
    },
    {
      id: 'rmd_phase' as const,
      title: '5. Mandatory RMD & Estate Phase',
      ageSpan: 'Age 73 – 100+',
      badgeColor: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
      description: 'SECURE Act 2.0 mandatory distributions using IRS Table III divisors, plus Social Security taxation (up to 85%) and 10-year inherited IRA rules.',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── HEADER BANNER ────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-primary/10 via-emerald-500/10 to-blue-500/10 border border-primary/20 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Database className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-extrabold text-foreground tracking-tight">
              FIRE Calculation Engine: Data, Rules & Logic Architecture
            </h3>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              AES-GCM Encrypted DB Sync
            </span>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
            Full operational transparency into statutory tax brackets, contribution limits, early withdrawal penalties, Medicare IRMAA tiers, ACA subsidies, SECURE Act RMD rules, and multi-asset drawdown logic. All engine parameters are customizable and reflected dynamically in plan projections.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleResetRules}
            disabled={savingRules}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted/50 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={() => handleSaveRules()}
            disabled={savingRules}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            {savingRules ? (
              <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Statutory Rules
          </button>
        </div>
      </div>

      {rulesSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded-xl p-4 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{rulesSuccessMsg}</span>
        </div>
      )}

      {/* ── SECTION 1: INTERACTIVE SCENARIO RULES EXPLORER ───────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
              <Play className="w-5 h-5 text-primary fill-primary/20" />
              Interactive Scenario Rules Explorer
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a financial life stage to inspect how the engine evaluates rules, computes taxes, enforces penalties, and executes drawdowns.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground bg-muted/50 px-3 py-1 rounded-lg border border-border">
            Filing Status: <strong className="text-foreground">{isMfj ? 'Married Filing Jointly (MFJ)' : 'Single'}</strong>
          </span>
        </div>

        {/* Scenario Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {scenarios.map((sc) => {
            const isSelected = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScenario(sc.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary'
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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
                  <span className="font-bold text-foreground block">3. Surplus Routing Waterfall</span>
                  <p className="text-muted-foreground text-[11px]">
                    401(k) Match &rarr; Max HSA &rarr; Max Roth IRA &rarr; Max 401(k) &rarr; Taxable Brokerage Account.
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
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
                Under SECURE Act 2.0, mandatory RMDs start at age 73 (or 75 for born 1960+). The engine calculates required minimum distributions using IRS Uniform Lifetime Table III. Additionally, Social Security taxation rules apply up to 85% of benefits.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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

      {/* ── SECTION 2: ANNUAL ENGINE EXECUTION PIPELINE DIAGRAM ──────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div className="border-b border-border pb-3">
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500" />
            Annual Engine Execution Pipeline (9-Phase Projection Loop)
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every simulated year, the retirement projection engine runs the following sequential calculation pipeline in exact order:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            {
              step: 'Phase 1',
              title: 'Gross Income & Payroll FICA',
              desc: 'Sum salary, passive income, pension, & SS. Deduct FICA (7.65%) payroll taxes.',
              color: 'border-l-4 border-l-blue-500 bg-blue-500/5',
            },
            {
              step: 'Phase 2',
              title: 'Pre-Tax Savings Waterfall',
              desc: 'Route employer match, HSA, & 401(k) pre-tax contributions before income tax.',
              color: 'border-l-4 border-l-emerald-500 bg-emerald-500/5',
            },
            {
              step: 'Phase 3',
              title: 'Tax Base & Provisional SS',
              desc: 'Subtract standard deduction; compute SS provisional income (50%/85% tax tiers).',
              color: 'border-l-4 border-l-purple-500 bg-purple-500/5',
            },
            {
              step: 'Phase 4',
              title: 'Deficit Drawdown / Surplus Savings',
              desc: 'Execute withdrawal strategy (Textbook, Tax-Optimized, Proportional, Custom) or save surplus.',
              color: 'border-l-4 border-l-amber-500 bg-amber-500/5',
            },
            {
              step: 'Phase 5',
              title: 'SECURE Act RMD Mandatory Draw',
              desc: 'Enforce IRS Table III mandatory RMDs for age 73+ from Traditional balances.',
              color: 'border-l-4 border-l-indigo-500 bg-indigo-500/5',
            },
            {
              step: 'Phase 6',
              title: 'Roth Conversion Ladder Engine',
              desc: 'Convert pre-tax to Roth up to target tax bracket, capping at IRMAA cliff if enabled.',
              color: 'border-l-4 border-l-pink-500 bg-pink-500/5',
            },
            {
              step: 'Phase 7',
              title: 'Tax Stack & 3.8% NIIT Calculation',
              desc: 'Reconcile Ordinary Tax, CapGains, State Tax, NIIT surcharge, & early penalties.',
              color: 'border-l-4 border-l-red-500 bg-red-500/5',
            },
            {
              step: 'Phase 8',
              title: 'IRMAA 2-Yr Lag & ACA Subsidy',
              desc: 'Compute MAGI; queue Year Y+2 Medicare IRMAA surcharge and calculate ACA subsidy.',
              color: 'border-l-4 border-l-cyan-500 bg-cyan-500/5',
            },
            {
              step: 'Phase 9',
              title: 'Asset Growth & Dividend Reinvestment',
              desc: 'Accrue stock/bond asset growth & dividend yield, update balances & cost basis for Year Y+1.',
              color: 'border-l-4 border-l-teal-500 bg-teal-500/5',
            },
          ].map((item, idx) => (
            <div key={idx} className={`p-3.5 rounded-xl border border-border ${item.color} space-y-1`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                  {item.step}
                </span>
                <span className="text-[10px] font-bold text-foreground bg-background px-1.5 py-0.5 rounded border">
                  Step {idx + 1}
                </span>
              </div>
              <h5 className="font-bold text-foreground text-xs">{item.title}</h5>
              <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: RULE LOGIC DEEP DIVES (DEEP EXPLANATION CARDS) ───────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="border-b border-border pb-3">
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-500" />
            Detailed Engine Rules & Logic Reference
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comprehensive breakdown of the statutory constraints, penalty formulas, tax stacking, and drawdown algorithms embedded in the engine.
          </p>
        </div>

        {/* Accordions for Topics */}
        <div className="space-y-3">
          {/* Topic 1: Early Penalties */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedRuleTopic(expandedRuleTopic === 'penalties' ? null : 'penalties')}
              className="w-full bg-muted/30 hover:bg-muted/50 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>1. Early Withdrawal Penalties & Statutory Exceptions</span>
              </div>
              {expandedRuleTopic === 'penalties' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expandedRuleTopic === 'penalties' && (
              <div className="p-4 bg-card border-t border-border space-y-3 text-xs text-muted-foreground leading-relaxed">
                <p>
                  The engine evaluates account owner age against statutory thresholds on every withdrawal:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  <li>
                    <strong className="text-foreground">10% Early Withdrawal Penalty (IRC Sec 72(t)):</strong> Triggered on Traditional IRA and 401(k) distributions when owner age &lt; 59.5.
                  </li>
                  <li>
                    <strong className="text-foreground">Rule of 55 Exception:</strong> Penalty is waived for 401(k) withdrawals if retirement age &ge; 55 and separation from employer occurred in or after the year turning 55.
                  </li>
                  <li>
                    <strong className="text-foreground">20% Non-Qualified HSA Penalty:</strong> Non-medical withdrawals before age 65 incur a 20% tax penalty + ordinary income tax. After age 65, penalty drops to 0%.
                  </li>
                  <li>
                    <strong className="text-foreground">Roth IRA Conversion 5-Year Aging:</strong> Conversion principal must sit in Roth for 5 full tax years or until age 59.5 to avoid the 10% penalty upon withdrawal.
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Topic 2: Tax Stack & NIIT */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedRuleTopic(expandedRuleTopic === 'taxes' ? null : 'taxes')}
              className="w-full bg-muted/30 hover:bg-muted/50 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <span>2. Tax Calculation Stack & 3.8% NIIT Surcharge</span>
              </div>
              {expandedRuleTopic === 'taxes' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expandedRuleTopic === 'taxes' && (
              <div className="p-4 bg-card border-t border-border space-y-3 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Taxes are computed using a stacked progressive bracket hierarchy:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div className="bg-muted/20 border border-border p-3 rounded-lg space-y-1">
                    <span className="font-bold text-foreground block">Ordinary Tax Stack</span>
                    <p>
                      Salary + Pension + Taxable Traditional Withdrawals + Taxable Social Security - Standard Deduction = Taxable Ordinary Income. Evaluated against 7 progressive rate tiers (10% to 37%).
                    </p>
                  </div>
                  <div className="bg-muted/20 border border-border p-3 rounded-lg space-y-1">
                    <span className="font-bold text-foreground block">Capital Gains & 3.8% NIIT Stack</span>
                    <p>
                      Long-Term Capital Gains stack on top of Ordinary Income. If MAGI exceeds ${rules?.niitThreshold || '200,000'} (${isMfj ? '250,000' : '200,000'}), a 3.8% Net Investment Income Tax (NIIT) applies to investment gains.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Topic 3: Drawdown Strategies */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedRuleTopic(expandedRuleTopic === 'drawdown' ? null : 'drawdown')}
              className="w-full bg-muted/30 hover:bg-muted/50 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-500" />
                <span>3. Drawdown Strategy Algorithms (Textbook, Tax-Optimized, Proportional)</span>
              </div>
              {expandedRuleTopic === 'drawdown' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expandedRuleTopic === 'drawdown' && (
              <div className="p-4 bg-card border-t border-border space-y-3 text-xs text-muted-foreground leading-relaxed">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div className="bg-muted/20 border border-border p-3 rounded-lg space-y-1">
                    <span className="font-bold text-foreground block">Textbook Order</span>
                    <p>Drains Cash &rarr; Taxable Brokerage &rarr; Traditional IRA/401(k) &rarr; Roth IRA/401(k) &rarr; HSA.</p>
                  </div>
                  <div className="bg-muted/20 border border-border p-3 rounded-lg space-y-1">
                    <span className="font-bold text-foreground block">Tax-Optimized Order</span>
                    <p>Fills lower 10%/12% ordinary tax brackets using Traditional withdrawals, then satisfies remaining deficit from Taxable & Roth.</p>
                  </div>
                  <div className="bg-muted/20 border border-border p-3 rounded-lg space-y-1">
                    <span className="font-bold text-foreground block">Proportional Order</span>
                    <p>Withdraws from all positive-balance accounts simultaneously based on their relative percentage of total net worth.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: EDITABLE STATUTORY PARAMETERS & DATA TABLES ──────────── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Editable Statutory Data & Tax Parameters
          </h4>
          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">
            Tax Year {rules?.taxYear || 2026} Parameters
          </span>
        </div>

        {/* 1. Federal Ordinary Tax Brackets & Standard Deduction */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                Federal Tax Brackets & Standard Deduction
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inflation-indexed thresholds used to calculate ordinary and capital gains taxes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Standard Deduction (Single Base $)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                <input
                  type="number"
                  value={rules?.standardDeduction || '15000'}
                  onChange={(e) => setRules((prev: any) => ({ ...prev, standardDeduction: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Doubled automatically for Married Filing Jointly (MFJ) (${(parseInt(rules?.standardDeduction || 15000, 10) * 2).toLocaleString()}).</p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Net Investment Income Tax (NIIT) Threshold ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                <input
                  type="number"
                  value={rules?.niitThreshold || '200000'}
                  onChange={(e) => setRules((prev: any) => ({ ...prev, niitThreshold: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Applies 3.8% surcharge on investment income above MAGI limit.</p>
            </div>
          </div>

          {/* Ordinary Brackets Table */}
          <div className="space-y-2 pt-2">
            <h5 className="text-xs font-bold text-foreground">Ordinary Tax Brackets</h5>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-2.5">Bracket Rate (%)</th>
                    <th className="p-2.5">Single Lower Threshold ($)</th>
                    <th className="p-2.5">MFJ Effective Threshold ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {(rules?.ordinaryTaxBrackets || []).map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          value={(b.rate * 100).toFixed(2)}
                          onChange={(e) => {
                            const newBrackets = [...rules.ordinaryTaxBrackets];
                            newBrackets[idx] = { ...b, rate: (parseFloat(e.target.value) || 0) / 100 };
                            setRules((prev: any) => ({ ...prev, ordinaryTaxBrackets: newBrackets }));
                          }}
                          className="w-20 bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                        />
                        <span className="ml-1 text-muted-foreground">%</span>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          value={b.threshold}
                          onChange={(e) => {
                            const newBrackets = [...rules.ordinaryTaxBrackets];
                            newBrackets[idx] = { ...b, threshold: parseInt(e.target.value, 10) || 0 };
                            setRules((prev: any) => ({ ...prev, ordinaryTaxBrackets: newBrackets }));
                          }}
                          className="w-32 bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                        />
                      </td>
                      <td className="p-2.5 text-muted-foreground font-semibold">
                        ${(b.threshold * 2).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Capital Gains Brackets Table */}
          <div className="space-y-2 pt-2">
            <h5 className="text-xs font-bold text-foreground">Long-Term Capital Gains Brackets</h5>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-2.5">Cap Gains Rate (%)</th>
                    <th className="p-2.5">Single Lower Threshold ($)</th>
                    <th className="p-2.5">MFJ Effective Threshold ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {(rules?.capitalGainsBrackets || []).map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          value={(b.rate * 100).toFixed(2)}
                          onChange={(e) => {
                            const newBrackets = [...rules.capitalGainsBrackets];
                            newBrackets[idx] = { ...b, rate: (parseFloat(e.target.value) || 0) / 100 };
                            setRules((prev: any) => ({ ...prev, capitalGainsBrackets: newBrackets }));
                          }}
                          className="w-20 bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                        />
                        <span className="ml-1 text-muted-foreground">%</span>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          value={b.threshold}
                          onChange={(e) => {
                            const newBrackets = [...rules.capitalGainsBrackets];
                            newBrackets[idx] = { ...b, threshold: parseInt(e.target.value, 10) || 0 };
                            setRules((prev: any) => ({ ...prev, capitalGainsBrackets: newBrackets }));
                          }}
                          className="w-32 bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                        />
                      </td>
                      <td className="p-2.5 text-muted-foreground font-semibold">
                        ${(b.threshold * 2).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. Account Contribution Limits */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-border pb-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              401(k), IRA & HSA Contribution Limits
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statutory annual contribution caps and age-based catch-up limits enforced by savings waterfall rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* 401k */}
            <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-foreground text-xs block">401(k) / 403(b) / 457</span>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Annual Limit ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.k401 || 23000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        k401: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Catch-Up Limit (Age 50+) ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.k401CatchUp || 7500}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        k401CatchUp: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
            </div>

            {/* IRA */}
            <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-foreground text-xs block">Traditional & Roth IRA</span>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Annual Limit ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.ira || 7000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        ira: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Catch-Up Limit (Age 50+) ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.iraCatchUp || 1000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        iraCatchUp: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
            </div>

            {/* HSA */}
            <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-foreground text-xs block">Health Savings Account (HSA)</span>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Single Coverage ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.hsaSingle || 4150}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        hsaSingle: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Family Coverage ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.hsaFamily || 8300}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        hsaFamily: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Catch-Up Limit (Age 55+) ($)</label>
                <input
                  type="number"
                  value={rules?.contributionLimits?.hsaCatchUp || 1000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      contributionLimits: {
                        ...prev.contributionLimits,
                        hsaCatchUp: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Medicare IRMAA Surcharges & ACA Health Subsidy Tables */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-border pb-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-blue-500" />
              Medicare IRMAA Brackets & ACA Subsidy Tables
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Income-Related Monthly Adjustment Amount (IRMAA) surcharges (age 65+) and Affordable Care Act (ACA) premium assistance caps.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-foreground">Medicare Part B & Part D IRMAA Surcharges</span>
              <span className="text-[11px] text-muted-foreground">Based on MAGI from 2 years prior</span>
            </div>

            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-2.5">Single MAGI ($)</th>
                    <th className="p-2.5">Joint MAGI ($)</th>
                    <th className="p-2.5">Part B Monthly ($)</th>
                    <th className="p-2.5">Part D Surcharge ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {(rules?.irmaaThresholds || []).map((t: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5 font-bold">${t.magiSingle.toLocaleString()}</td>
                      <td className="p-2.5 font-bold">${t.magiJoint.toLocaleString()}</td>
                      <td className="p-2.5 text-emerald-500 font-bold">${t.partBMonthly.toFixed(2)}</td>
                      <td className="p-2.5 text-blue-500 font-bold">${t.partDMonthly.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ACA Subsidy Table */}
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Federal Poverty Line (FPL) Base Amount ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                  <input
                    type="number"
                    value={rules?.fplAmount || '15060'}
                    onChange={(e) => setRules((prev: any) => ({ ...prev, fplAmount: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-2.5">Household FPL %</th>
                    <th className="p-2.5">Max Health Premium Cap (% Income)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {(rules?.acaSubsidyTable || []).map((t: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5 font-bold">{t.fplPercent}% FPL</td>
                      <td className="p-2.5 text-primary font-bold">{(t.premiumCapPercent * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 4. Social Security Taxation & SECURE Act Rules */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-border pb-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-500" />
              Social Security Taxation & SECURE Act Rules
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provisional income brackets governing Social Security taxability, SECURE Act RMD start ages, and IRS life expectancy tables.
            </p>
          </div>

          {/* Real 2026 Social Security Estimation Parameters */}
          <div className="bg-gradient-to-r from-purple-500/5 via-primary/5 to-emerald-500/5 border border-purple-500/20 rounded-xl p-4 space-y-3">
            <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-500" />
              2026 SSA Benefit Estimation Parameters (PIA Bend Points & Claiming Factors)
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
              <div className="bg-card border border-border rounded-lg p-2.5 space-y-1">
                <span className="text-muted-foreground block font-medium">1. Max Wage Base Cap</span>
                <span className="font-mono font-bold text-foreground">$176,100 / year</span>
                <span className="text-[10px] text-muted-foreground block">($14,675 / month max AIME)</span>
              </div>
              <div className="bg-card border border-border rounded-lg p-2.5 space-y-1">
                <span className="text-muted-foreground block font-medium">2. Bend Point 1 (90%)</span>
                <span className="font-mono font-bold text-emerald-500">$1,226 / month AIME</span>
                <span className="text-[10px] text-muted-foreground block">Max $1,103.40 / mo from Tier 1</span>
              </div>
              <div className="bg-card border border-border rounded-lg p-2.5 space-y-1">
                <span className="text-muted-foreground block font-medium">3. Bend Point 2 (32%)</span>
                <span className="font-mono font-bold text-blue-500">$7,391 / month AIME</span>
                <span className="text-[10px] text-muted-foreground block">Add 32% for AIME $1,226–$7,391</span>
              </div>
              <div className="bg-card border border-border rounded-lg p-2.5 space-y-1">
                <span className="text-muted-foreground block font-medium">4. Tier 3 Replacement (15%)</span>
                <span className="font-mono font-bold text-purple-500">Above $7,391 AIME</span>
                <span className="text-[10px] text-muted-foreground block">Add 15% for AIME up to Cap</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-3 text-[11px] space-y-2">
              <span className="font-bold text-foreground block">Claiming Age Multiplier Schedule (Relative to FRA Age 67 = 100%)</span>
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-1 text-center font-mono">
                <div className="bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 62</span>
                  <span className="font-bold text-rose-500">70.0%</span>
                </div>
                <div className="bg-rose-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 63</span>
                  <span className="font-bold text-foreground">75.0%</span>
                </div>
                <div className="bg-amber-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 64</span>
                  <span className="font-bold text-foreground">80.0%</span>
                </div>
                <div className="bg-amber-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 65</span>
                  <span className="font-bold text-foreground">86.7%</span>
                </div>
                <div className="bg-amber-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 66</span>
                  <span className="font-bold text-foreground">93.3%</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-1.5 rounded-md">
                  <span className="block text-[10px] text-emerald-600 font-bold">Age 67 (FRA)</span>
                  <span className="font-bold text-emerald-500">100.0%</span>
                </div>
                <div className="bg-blue-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 68</span>
                  <span className="font-bold text-foreground">108.0%</span>
                </div>
                <div className="bg-blue-500/5 border border-border p-1.5 rounded-md">
                  <span className="block text-[10px] text-muted-foreground">Age 69</span>
                  <span className="font-bold text-foreground">116.0%</span>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/30 p-1.5 rounded-md">
                  <span className="block text-[10px] text-purple-600 font-bold">Age 70</span>
                  <span className="font-bold text-purple-500">124.0%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Single SS Tiers */}
            <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-foreground text-xs block">Single SS Provisional Income Tiers</span>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Tier 1 (50% Taxable Limit) ($)</label>
                <input
                  type="number"
                  value={rules?.ssTaxationThresholds?.single?.tier1 || 25000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      ssTaxationThresholds: {
                        ...prev.ssTaxationThresholds,
                        single: {
                          ...prev.ssTaxationThresholds?.single,
                          tier1: parseInt(e.target.value, 10) || 0,
                        },
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Tier 2 (85% Taxable Limit) ($)</label>
                <input
                  type="number"
                  value={rules?.ssTaxationThresholds?.single?.tier2 || 34000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      ssTaxationThresholds: {
                        ...prev.ssTaxationThresholds,
                        single: {
                          ...prev.ssTaxationThresholds?.single,
                          tier2: parseInt(e.target.value, 10) || 0,
                        },
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
            </div>

            {/* MFJ SS Tiers */}
            <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-foreground text-xs block font-mono">MFJ SS Provisional Income Tiers</span>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold font-mono">Tier 1 (50% Taxable Limit) ($)</label>
                <input
                  type="number"
                  value={rules?.ssTaxationThresholds?.married_joint?.tier1 || 32000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      ssTaxationThresholds: {
                        ...prev.ssTaxationThresholds,
                        married_joint: {
                          ...prev.ssTaxationThresholds?.married_joint,
                          tier1: parseInt(e.target.value, 10) || 0,
                        },
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold font-mono">Tier 2 (85% Taxable Limit) ($)</label>
                <input
                  type="number"
                  value={rules?.ssTaxationThresholds?.married_joint?.tier2 || 44000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      ssTaxationThresholds: {
                        ...prev.ssTaxationThresholds,
                        married_joint: {
                          ...prev.ssTaxationThresholds?.married_joint,
                          tier2: parseInt(e.target.value, 10) || 0,
                        },
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground font-bold"
                />
              </div>
            </div>
          </div>

          {/* SECURE Act & RMD Ages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">SECURE 2.0 Act RMD Start Age</label>
              <input
                type="number"
                value={rules?.secureActRules?.rmdAge || 73}
                onChange={(e) =>
                  setRules((prev: any) => ({
                    ...prev,
                    secureActRules: {
                      ...prev.secureActRules,
                      rmdAge: parseInt(e.target.value, 10) || 73,
                    },
                  }))
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground font-bold"
              />
              <p className="text-[11px] text-muted-foreground">Statutory mandatory withdrawal age (73 for birth 1951–1959, 75 for 1960+).</p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Inherited IRA Drain Period (Years)</label>
              <input
                type="number"
                value={rules?.secureActRules?.inheritedIraYears || 10}
                onChange={(e) =>
                  setRules((prev: any) => ({
                    ...prev,
                    secureActRules: {
                      ...prev.secureActRules,
                      inheritedIraYears: parseInt(e.target.value, 10) || 10,
                    },
                  }))
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground font-bold"
              />
              <p className="text-[11px] text-muted-foreground">SECURE Act 10-year mandatory distribution rule for non-spouse heirs.</p>
            </div>
          </div>

          {/* Collapsible IRS Uniform Lifetime Table Preview */}
          <div className="pt-2">
            <button
              onClick={() => setShowRmdTable(!showRmdTable)}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              {showRmdTable ? 'Hide IRS Uniform Lifetime RMD Table III' : 'View IRS Uniform Lifetime RMD Table III Divisors'}
            </button>

            {showRmdTable && (
              <div className="mt-3 p-3 bg-muted/20 border border-border rounded-xl space-y-2 animate-in fade-in">
                <p className="text-[11px] text-muted-foreground">
                  IRS Publication 590-B Uniform Lifetime Table III divisors used by the engine to compute mandatory annual distributions:
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-[11px] font-mono">
                  {Object.entries(IRS_UNIFORM_LIFETIME_TABLE)
                    .slice(0, 24)
                    .map(([age, divisor]) => (
                      <div key={age} className="bg-background border border-border rounded p-1.5 text-center">
                        <span className="text-muted-foreground text-[10px] block">Age {age}</span>
                        <span className="font-bold text-foreground">{divisor}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. Gift & Estate Tax Exemptions */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-border pb-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              Gift & Estate Tax Exemptions
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statutory annual gift exclusion and lifetime Unified Credit estate tax exemptions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Annual Gift Tax Exclusion ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                <input
                  type="number"
                  value={rules?.giftEstateExemptions?.annualGiftLimit || 18000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      giftEstateExemptions: {
                        ...prev.giftEstateExemptions,
                        annualGiftLimit: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground font-bold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Maximum non-reportable gift per recipient per year.</p>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Lifetime Estate Tax Exemption ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                <input
                  type="number"
                  value={rules?.giftEstateExemptions?.lifetimeEstateLimit || 13610000}
                  onChange={(e) =>
                    setRules((prev: any) => ({
                      ...prev,
                      giftEstateExemptions: {
                        ...prev.giftEstateExemptions,
                        lifetimeEstateLimit: parseInt(e.target.value, 10) || 0,
                      },
                    }))
                  }
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground font-bold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Unified credit lifetime exemption limit (TCJA baseline).</p>
            </div>
          </div>
        </div>

        {/* 6. Historical Asset Returns & CPI Benchmarks */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Historical Market & CPI Inflation Benchmarks
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Empirical historical asset class returns and CPI inflation data (1928–2025) used for historical sequence-of-returns stress testing.
              </p>
            </div>
            <button
              onClick={() => setShowHistoricalData(!showHistoricalData)}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showHistoricalData ? 'Hide Data Table' : 'View Historical Table'}
            </button>
          </div>

          {showHistoricalData && (
            <div className="overflow-x-auto border border-border rounded-xl max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="p-2.5">Year</th>
                    <th className="p-2.5">S&P 500 Price Growth</th>
                    <th className="p-2.5">S&P 500 Dividend Yield</th>
                    <th className="p-2.5">US Bond Growth</th>
                    <th className="p-2.5">US Bond Yield</th>
                    <th className="p-2.5">CPI Inflation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {HISTORICAL_RETURNS_DATA.map((row) => (
                    <tr key={row.year} className="hover:bg-muted/20">
                      <td className="p-2 font-bold">{row.year}</td>
                      <td className={`p-2 font-bold ${row.stocksGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {(row.stocksGrowth * 100).toFixed(2)}%
                      </td>
                      <td className="p-2 text-muted-foreground">{(row.stocksYield * 100).toFixed(2)}%</td>
                      <td className={`p-2 font-bold ${row.bondsGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {(row.bondsGrowth * 100).toFixed(2)}%
                      </td>
                      <td className="p-2 text-muted-foreground">{(row.bondsYield * 100).toFixed(2)}%</td>
                      <td className="p-2 text-amber-500 font-bold">{(row.inflationRate * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
