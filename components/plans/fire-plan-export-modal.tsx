'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils/format';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import {
  Flame,
  Printer,
  Copy,
  Check,
  Download,
  FileText,
  Sparkles,
  Code2,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  Landmark,
  Percent,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Zap,
} from 'lucide-react';

export interface FirePlanExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: any;
  accounts: any[];
}

export function FirePlanExportModal({
  open,
  onOpenChange,
  plan,
  accounts,
}: FirePlanExportModalProps) {
  const [activeFormat, setActiveFormat] = useState<'pdf' | 'llm' | 'json'>('pdf');
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Compute engine plan and simulation results
  const enginePlan = useMemo(() => {
    if (!plan) return null;
    return buildEnginePlan(plan);
  }, [plan]);

  const simResults = useMemo(() => {
    if (!enginePlan) return null;
    try {
      return runRetirementSimulation(enginePlan);
    } catch (err) {
      console.error('Failed to run simulation for export', err);
      return null;
    }
  }, [enginePlan]);

  const mcResults = useMemo(() => {
    if (!enginePlan) return null;
    try {
      return runMonteCarloSimulation(enginePlan, { numberOfTrials: 250 });
    } catch {
      return null;
    }
  }, [enginePlan]);

  // Key stats
  const currentYear = new Date().getFullYear();
  const currentAge = plan?.primaryBirthYear ? currentYear - Number(plan.primaryBirthYear) : 40;
  const retirementAge = Number(plan?.retirementAge) || 60;
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  const retirementYear = currentYear + yearsToRetire;

  const initialNetWorth = simResults?.yearlyResults?.[0]?.netWorth ?? 0;
  const retirementExpenses = Number(plan?.annualRetirementExpenses) || 80000;
  const swr = Number(plan?.safeWithdrawalRate) || 4.0;
  const targetFireNumber = swr > 0 ? (retirementExpenses / (swr / 100)) : 0;
  const projectedAtRetirement = simResults?.yearlyResults?.find((y) => y.primaryAge === retirementAge)?.netWorth ?? 0;
  const crossoverAge = simResults?.yearlyResults?.find((y) => y.netWorth >= targetFireNumber)?.primaryAge ?? null;
  const mcSuccessRate = mcResults ? Math.round(mcResults.successRate) : null;

  // Format withdrawal method label
  const formatWithdrawalMethod = (method: string | undefined) => {
    if (!method) return 'Taxable First (Textbook)';
    if (method.toLowerCase().includes('textbook') || method.toLowerCase() === 'taxable') return 'Taxable First (Textbook)';
    if (method.toLowerCase().includes('prorata') || method.toLowerCase() === 'pro-rata') return 'Pro-Rata Strategy';
    if (method.toLowerCase().includes('roth')) return 'Roth First Strategy';
    return method.charAt(0).toUpperCase() + method.slice(1);
  };

  // Format filing status
  const formatFilingStatus = (status: string | undefined, hasSpouse: boolean) => {
    if (status) {
      if (status.toLowerCase() === 'single') return 'Single Filer';
      if (status.toLowerCase().includes('joint')) return 'Married Filing Jointly';
      if (status.toLowerCase().includes('separate')) return 'Married Filing Separately';
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
    return hasSpouse ? 'Married Filing Jointly' : 'Single Filer';
  };

  // Total portfolio balance across plan accounts
  const planAccounts = Array.isArray(plan?.accounts) ? plan.accounts : [];
  const totalAccountBalance = planAccounts.reduce((acc: number, a: any) => acc + (Number(a.balance) || 0), 0);

  // Generate LLM Prompt Markdown
  const markdownContent = useMemo(() => {
    if (!plan || !simResults) return '';

    const flowsList = Array.isArray(plan?.flows) ? plan.flows : [];
    const eventsList = Array.isArray(plan?.events) ? plan.events : [];

    const acctBreakdown = planAccounts.map((a: any) => 
      `- **${a.name || 'Account'}** (${a.type || 'standard'}, ${a.taxCategory || 'taxable'}): Current Balance ${formatCurrency(Number(a.balance) || 0)}, Annual Contribution ${formatCurrency(Number(a.annualContribution) || 0)}`
    ).join('\n');

    const flowsBreakdown = flowsList.length > 0
      ? flowsList.map((f: any) => `- **${f.name || 'Flow'}**: ${formatCurrency(Number(f.amount) || 0)}/yr (${f.type}), Ages ${f.startAge ?? currentAge} to ${f.endAge ?? 100}`).join('\n')
      : '- No supplemental recurring flows configured.';

    const eventsBreakdown = eventsList.length > 0
      ? eventsList.map((e: any) => `- **${e.name || 'Event'}**: ${formatCurrency(Number(e.amount) || 0)} at Age ${e.targetAge}`).join('\n')
      : '- No one-time milestone events configured.';

    // Milestone trajectory sample
    const yearlyTrajectory = (simResults.yearlyResults || [])
      .filter((y: any, i: number, arr: any[]) => 
        i === 0 || 
        y.primaryAge === retirementAge || 
        y.primaryAge === crossoverAge || 
        y.primaryAge % 5 === 0 || 
        i === arr.length - 1
      )
      .map((y: any) => `| Age ${y.primaryAge} (${y.year}) | ${formatCurrency(y.netWorth)} | ${formatCurrency(y.grossIncome)} | ${formatCurrency(y.totalExpenses)} | ${formatCurrency(y.deficitWithdrawn || 0)} | ${formatCurrency(y.liquidNetWorth)} |`)
      .join('\n');

    return `# Financial Independence & Early Retirement (FIRE) Plan Audit Prompt

You are an expert CFP (Certified Financial Planner) and quantitative wealth advisor specializing in FIRE (Financial Independence, Retire Early) architectures, sequence of returns risk management, and tax-efficient decumulation strategies.

Please thoroughly analyze and evaluate the following comprehensive FIRE plan from Runway Finance.

---

## 1. Household & Demographic Profile
- **Plan Name**: ${plan.name || 'Primary FIRE Plan'}
- **Filing Status**: ${formatFilingStatus(plan.filingStatus, Boolean(plan.hasSpouse))}
- **Primary Individual**: Age ${currentAge} (Born ${plan.primaryBirthYear || 'N/A'})
- **Target Retirement Age**: Age ${retirementAge} (${yearsToRetire} years from present, Target Year ${retirementYear})
- **Life Expectancy / Planning Horizon**: Age ${plan.lifeExpectancyAge || 100}
${plan.hasSpouse ? `- **Spouse / Partner**: Age ${plan.spouseBirthYear ? currentYear - Number(plan.spouseBirthYear) : 'N/A'}, Target Retirement Age ${plan.spouseRetirementAge || 60}` : ''}

---

## 2. Core Financial Targets & Assumptions
- **Current Investable Net Worth**: ${formatCurrency(initialNetWorth)}
- **Target Annual Retirement Expenses**: ${formatCurrency(retirementExpenses)} / year (in today's real dollars)
- **Safe Withdrawal Rate (SWR)**: ${swr.toFixed(2)}%
- **Target FIRE Number**: ${formatCurrency(targetFireNumber)}
- **Expected Portfolio Growth Rate (Nominal)**: ${plan.expectedGrowthRate || 7.0}%
- **Inflation Assumption**: ${plan.fixedInflationRate || 3.0}%
- **Withdrawal Strategy**: ${formatWithdrawalMethod(plan.withdrawalMethod)}
- **Roth Conversion Optimization**: ${plan.enableRothConversions ? `Enabled (Target Ceiling: ${plan.rothConversionTargetCeiling || '12% bracket'})` : 'Disabled'}

---

## 3. Account Breakdown & Current Assets
${acctBreakdown || '- No linked portfolio accounts listed.'}

---

## 4. Cash Flows, Supplemental Income & Milestones
### Supplemental Inflows / Outflows
${flowsBreakdown}

### Milestone Events
${eventsBreakdown}

### Social Security
- **Primary Social Security**: Starting at Age ${plan.primarySsStartAge || 67}, Estimated ${formatCurrency(Number(plan.primarySsMonthlyAmount || 2500))}/month
${plan.hasSpouse ? `- **Spouse Social Security**: Starting at Age ${plan.spouseSsStartAge || 67}, Estimated ${formatCurrency(Number(plan.spouseSsMonthlyAmount || 1800))}/month` : ''}

---

## 5. Model Projections & Quantitative Outcomes
- **Projected Net Worth at Retirement (Age ${retirementAge})**: ${formatCurrency(projectedAtRetirement)}
- **Projected FI Crossover Age**: ${crossoverAge ? `Age ${crossoverAge} (${crossoverAge <= retirementAge ? 'Achieved BEFORE planned retirement' : 'Projected AFTER planned retirement'})` : 'Not reached'}
- **Monte Carlo Success Probability (1,000 runs)**: ${mcSuccessRate !== null ? `${mcSuccessRate}%` : 'N/A'}
- **Terminal Net Worth at Age ${plan.lifeExpectancyAge || 100}**: ${formatCurrency(simResults.endingNetWorth ?? 0)}

### Key Milestone Trajectory Table
| Milestone | Starting Portfolio | Contribution | Expenses | Withdrawal | Ending Portfolio |
| :--- | :--- | :--- | :--- | :--- | :--- |
${yearlyTrajectory}

---

## Instructions for the LLM Evaluator:
Please perform a detailed, multi-dimensional review of this plan:
1. **Feasibility & Probability of Success**: Critique whether the savings rate, SWR (${swr}%), and expected growth assumptions are realistic or overly optimistic.
2. **Sequence of Returns Risk (SRR)**: Analyze the portfolio resilience during the vulnerable 5-year window around retirement (Ages ${Math.max(currentAge, retirementAge - 5)}–${retirementAge + 5}).
3. **Tax & Drawdown Optimization**: Evaluate the order of account drawdowns (Taxable vs 401k/IRA vs Roth) and identify Roth conversion ladder opportunities to minimize lifetime taxes and RMDs.
4. **Pre-Medicare Healthcare & Bridges**: Identify potential coverage gaps, ACA subsidy cliff risks, or IRMAA surcharge thresholds.
5. **Stress Test Scenarios**: Model how this portfolio survives severe historical crises (e.g., 1970s stagflation, 2000–2002 dot-com bust, 2008 GFC).
6. **Prioritized Recommendations**: Provide the top 3-5 high-impact tactical improvements the user should implement today.
`;
  }, [plan, simResults, mcResults, currentAge, retirementAge, yearsToRetire, retirementYear, initialNetWorth, retirementExpenses, swr, targetFireNumber, projectedAtRetirement, crossoverAge, mcSuccessRate, planAccounts]);

  // Handle Print / Save as PDF
  const handlePrint = () => {
    window.print();
  };

  // Handle Copy Markdown
  const handleCopy = async () => {
    if (!markdownContent) return;
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Handle Copy JSON
  const handleCopyJson = async () => {
    const payload = {
      plan,
      simulation: simResults,
      monteCarlo: mcResults,
      exportedAt: new Date().toISOString(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Handle Download Markdown
  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan?.name || 'fire-plan').toLowerCase().replace(/\s+/g, '-')}-prompt.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle Download JSON
  const handleDownloadJson = () => {
    const payload = {
      plan,
      simulation: simResults,
      monteCarlo: mcResults,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan?.name || 'fire-plan').toLowerCase().replace(/\s+/g, '-')}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Milestone trajectory rows for table
  const milestoneRows = useMemo(() => {
    if (!simResults?.yearlyResults) return [];
    return simResults.yearlyResults.filter((y: any, i: number, arr: any[]) => 
      i === 0 || 
      y.primaryAge === retirementAge || 
      y.primaryAge === crossoverAge || 
      y.primaryAge % 5 === 0 || 
      i === arr.length - 1
    );
  }, [simResults, retirementAge, crossoverAge]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full md:max-w-3xl lg:max-w-4xl max-h-[92dvh] md:max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-t-2xl md:rounded-2xl">
        {/* ── Top Header Bar ── */}
        <DialogHeader className="p-4 sm:px-6 sm:py-5 border-b border-border/70 bg-muted/20 shrink-0 text-left">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 shadow-xs shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                    Export FIRE Plan
                  </DialogTitle>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/10 text-orange-500 border border-orange-500/25 truncate max-w-[180px]">
                    {plan?.name || 'Primary Plan'}
                  </span>
                  {plan?.isDefault && (
                    <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                      Baseline
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  Executive PDF summary, AI advisor prompt audit, and quantitative data.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Format Selector Segmented Tab Strip ── */}
        <div className="px-4 sm:px-6 py-2.5 bg-muted/30 border-b border-border/70 shrink-0">
          <div className="grid grid-cols-3 gap-1 bg-background/80 p-1 rounded-xl border border-border/60 shadow-xs w-full max-w-md">
            <button
              type="button"
              onClick={() => setActiveFormat('pdf')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                activeFormat === 'pdf'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">PDF / Print</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat('llm')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                activeFormat === 'llm'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">AI Prompt (.md)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat('json')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                activeFormat === 'json'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">JSON Data</span>
            </button>
          </div>
        </div>

        {/* ── Main Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 print:p-0 print:overflow-visible">
          {/* ══════════════════════════════════════════════
              FORMAT 1: PDF / Print Executive Report
             ══════════════════════════════════════════════ */}
          {activeFormat === 'pdf' && (
            <div ref={printRef} className="space-y-5 text-foreground print:space-y-4 print:text-black">
              {/* Executive Summary Card */}
              <div className="p-4 sm:p-5 bg-gradient-to-b from-card to-muted/20 border border-border/80 rounded-2xl shadow-xs space-y-4 print:border-gray-300 print:bg-white print:p-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border/70 gap-2 print:border-gray-300">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold tracking-wider text-primary uppercase print:text-black">Executive FIRE Brief</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{formatFilingStatus(plan?.filingStatus, Boolean(plan?.hasSpouse))}</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-foreground mt-0.5 tracking-tight print:text-black">
                      {plan?.name || 'Retirement & FIRE Strategy'}
                    </h2>
                  </div>
                  <div className="text-left sm:text-right text-xs text-muted-foreground print:text-gray-600">
                    <span className="block font-medium">As of {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="text-[11px]">Planning horizon: Age {plan?.lifeExpectancyAge || 100}</span>
                  </div>
                </div>

                {/* Harmonious 4-Card Scorecard Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                  {/* Metric 1: Current Portfolio */}
                  <div className="p-3 sm:p-3.5 bg-sky-500/[0.04] rounded-xl border border-sky-500/20 hover:border-sky-500/40 transition-all flex flex-col justify-between print:border-gray-300 print:bg-gray-50">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block truncate">
                        Current Portfolio
                      </span>
                      <Landmark className="w-3.5 h-3.5 text-sky-400 shrink-0 opacity-80" />
                    </div>
                    <div className="text-base sm:text-xl font-extrabold text-foreground tracking-tight tabular-nums mt-0.5 print:text-black">
                      {formatCurrency(initialNetWorth)}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 font-medium truncate print:text-gray-600">
                      Age {currentAge} • Baseline Assets
                    </div>
                  </div>

                  {/* Metric 2: Target FIRE # */}
                  <div className="p-3 sm:p-3.5 bg-amber-500/[0.06] rounded-xl border border-amber-500/25 hover:border-amber-500/45 transition-all flex flex-col justify-between print:border-gray-300 print:bg-gray-50">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block truncate">
                        Target FIRE #
                      </span>
                      <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 opacity-80" />
                    </div>
                    <div className="text-base sm:text-xl font-extrabold text-amber-500 tracking-tight tabular-nums mt-0.5">
                      {formatCurrency(targetFireNumber)}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 font-medium truncate print:text-gray-600">
                      {swr}% SWR ({formatCurrency(retirementExpenses)}/yr)
                    </div>
                  </div>

                  {/* Metric 3: Target Retirement */}
                  <div className="p-3 sm:p-3.5 bg-violet-500/[0.05] rounded-xl border border-violet-500/20 hover:border-violet-500/40 transition-all flex flex-col justify-between print:border-gray-300 print:bg-gray-50">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider block truncate">
                        Retirement Target
                      </span>
                      <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0 opacity-80" />
                    </div>
                    <div className="text-base sm:text-xl font-extrabold text-foreground tracking-tight mt-0.5 print:text-black">
                      Age {retirementAge}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 font-medium truncate print:text-gray-600">
                      In {yearsToRetire} years ({retirementYear})
                    </div>
                  </div>

                  {/* Metric 4: Monte Carlo Success */}
                  <div className="p-3 sm:p-3.5 bg-emerald-500/[0.05] rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all flex flex-col justify-between print:border-gray-300 print:bg-gray-50">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block truncate">
                        Monte Carlo
                      </span>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 opacity-80" />
                    </div>
                    <div className="text-base sm:text-xl font-extrabold text-emerald-400 tracking-tight mt-0.5">
                      {mcSuccessRate !== null ? `${mcSuccessRate}%` : '—'}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 font-medium truncate print:text-gray-600">
                      {mcResults ? `${mcResults.totalTrials || 250} trial simulations` : 'Stochastic model'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Assumptions & Methodology Grid */}
              <div className="p-4 sm:p-5 bg-card border border-border/80 rounded-2xl shadow-xs space-y-3.5 print:border-gray-300 print:bg-white print:p-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-2 print:border-gray-300">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground tracking-tight print:text-black">
                    Plan Assumptions & Engine Methodology
                  </h3>
                  <span className="text-[11px] text-muted-foreground print:text-gray-600">Inflation-adjusted real basis</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Expected Growth
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block print:text-black">
                      {plan?.expectedGrowthRate || 7.0}% / yr
                    </span>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Assumed Inflation
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block print:text-black">
                      {plan?.fixedInflationRate || 3.0}% / yr
                    </span>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Planning Horizon
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block print:text-black">
                      Age {plan?.lifeExpectancyAge || 100}
                    </span>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Drawdown Strategy
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block truncate print:text-black">
                      {formatWithdrawalMethod(plan?.withdrawalMethod)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Roth Conversions
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block print:text-black">
                      {plan?.enableRothConversions ? `Active (${plan.rothConversionTargetCeiling || '12%'})` : 'Disabled'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-xl border border-border/60 print:bg-gray-50 print:border-gray-200">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block print:text-gray-500">
                      Social Security
                    </span>
                    <span className="font-bold text-foreground text-sm mt-0.5 block truncate print:text-black">
                      Age {plan?.primarySsStartAge || 67} ({formatCurrency(Number(plan?.primarySsMonthlyAmount || 2500))}/mo)
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Trajectory Milestones Roadmap */}
              {milestoneRows.length > 0 && (
                <div className="p-4 sm:p-5 bg-card border border-border/80 rounded-2xl shadow-xs space-y-3 print:border-gray-300 print:bg-white print:p-3">
                  <div className="flex items-center justify-between border-b border-border/70 pb-2 print:border-gray-300">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-foreground tracking-tight print:text-black">
                        Deterministic Trajectory Milestones
                      </h3>
                      <span className="text-[11px] text-muted-foreground sm:hidden">Swipe table to view full columns</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground hidden sm:inline print:text-gray-600">Sample checkpoints</span>
                  </div>
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full text-left text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground text-[11px] print:border-gray-300 print:text-gray-600">
                          <th className="py-2 px-2 font-semibold">Milestone / Year</th>
                          <th className="py-2 px-2 font-semibold text-right">Net Worth</th>
                          <th className="py-2 px-2 font-semibold text-right">Gross Inflow</th>
                          <th className="py-2 px-2 font-semibold text-right">Living Expenses</th>
                          <th className="py-2 px-2 font-semibold text-right">Liquid Assets</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono text-[11px] print:divide-gray-200">
                        {milestoneRows.map((y: any) => {
                          const isRetire = y.primaryAge === retirementAge;
                          const isCrossover = crossoverAge && y.primaryAge === crossoverAge;
                          return (
                            <tr
                              key={y.primaryAge}
                              className={`transition-colors ${
                                isRetire ? 'bg-violet-500/10 font-bold print:bg-violet-50' : isCrossover ? 'bg-orange-500/10 font-bold print:bg-orange-50' : 'hover:bg-muted/20'
                              }`}
                            >
                              <td className="py-2.5 px-2 text-foreground font-sans font-medium print:text-black">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>Age {y.primaryAge} ({y.year})</span>
                                  {isRetire && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30 print:text-violet-700">
                                      RETIRE
                                    </span>
                                  )}
                                  {isCrossover && !isRetire && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-500 border border-orange-500/30 print:text-orange-700">
                                      FIRE CROSSOVER
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-foreground print:text-black">
                                {formatCurrency(y.netWorth)}
                              </td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground print:text-gray-600">
                                {formatCurrency(y.grossIncome)}
                              </td>
                              <td className="py-2.5 px-2 text-right text-rose-400/90 print:text-rose-700">
                                {formatCurrency(y.totalExpenses)}
                              </td>
                              <td className="py-2.5 px-2 text-right font-medium text-emerald-400 print:text-emerald-700">
                                {formatCurrency(y.liquidNetWorth)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Portfolio Asset Allocation Table */}
              <div className="p-4 sm:p-5 bg-card border border-border/80 rounded-2xl shadow-xs space-y-3 print:border-gray-300 print:bg-white print:p-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-2 print:border-gray-300">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground tracking-tight print:text-black">
                    Portfolio Asset Allocation & Balances
                  </h3>
                  <span className="text-[11px] text-muted-foreground print:text-gray-600">
                    {planAccounts.length} Linked Account{planAccounts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-left text-xs min-w-[460px]">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground text-[11px] print:border-gray-300 print:text-gray-600">
                        <th className="py-2 px-2 font-semibold">Account Name</th>
                        <th className="py-2 px-2 font-semibold">Tax Category</th>
                        <th className="py-2 px-2 font-semibold text-right">Current Balance</th>
                        <th className="py-2 px-2 font-semibold text-right">Annual Contribution</th>
                        <th className="py-2 px-2 font-semibold text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-[11px] print:divide-gray-200">
                      {planAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-muted-foreground">
                            No individual accounts configured in this plan.
                          </td>
                        </tr>
                      ) : (
                        planAccounts.map((acc: any, i: number) => {
                          const bal = Number(acc.balance) || 0;
                          const share = totalAccountBalance > 0 ? ((bal / totalAccountBalance) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={acc.id || i} className="hover:bg-muted/20 transition-colors">
                              <td className="py-2.5 px-2 font-medium text-foreground print:text-black">
                                {acc.name || 'Account'}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground capitalize print:text-gray-600">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted border border-border/60">
                                  {acc.taxCategory || 'Taxable'}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-semibold text-foreground print:text-black">
                                {formatCurrency(bal)}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-medium text-emerald-400 print:text-emerald-700">
                                {formatCurrency(Number(acc.annualContribution) || 0)}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono text-muted-foreground print:text-gray-600">
                                {share}%
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              FORMAT 2: AI / LLM Prompt (.md) View
             ══════════════════════════════════════════════ */}
          {activeFormat === 'llm' && (
            <div className="space-y-4">
              {/* AI Prompt Hero Card */}
              <div className="p-4 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border border-primary/25 rounded-2xl text-xs space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary text-primary-foreground">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm tracking-tight">
                      Institutional AI Financial Advisor Prompt
                    </h4>
                    <p className="text-muted-foreground text-[11px]">
                      Optimized for Claude 3.7 Sonnet, GPT-4o, and Gemini 1.5 Pro deep financial audits.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/20 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 bg-background/60 px-2 py-0.5 rounded-md border border-border/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Sequence of Returns Risk Audit
                  </span>
                  <span className="inline-flex items-center gap-1 bg-background/60 px-2 py-0.5 rounded-md border border-border/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Roth Conversion Ladder Evaluation
                  </span>
                  <span className="inline-flex items-center gap-1 bg-background/60 px-2 py-0.5 rounded-md border border-border/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> ACA Subsidy & Healthcare Bridge
                  </span>
                </div>
              </div>

              {/* Code / Markdown Card */}
              <div className="relative rounded-2xl border border-border/80 bg-background/90 overflow-hidden shadow-inner">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
                    <FileText className="w-3.5 h-3.5" />
                    <span>fire-plan-audit.md</span>
                    <span className="text-border">•</span>
                    <span>~{Math.round(markdownContent.length / 4)} tokens</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadMarkdown}
                      className="flex items-center gap-1 px-2.5 py-1 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-semibold transition-all cursor-pointer border border-border"
                    >
                      <Download className="w-3 h-3" />
                      <span>.md</span>
                    </button>
                  </div>
                </div>
                <pre className="p-4 text-xs font-mono text-foreground/90 overflow-x-auto max-h-[380px] leading-relaxed whitespace-pre-wrap select-all font-light">
                  {markdownContent}
                </pre>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              FORMAT 3: JSON Raw Quantitative View
             ══════════════════════════════════════════════ */}
          {activeFormat === 'json' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-muted/30 border border-border/70 rounded-2xl text-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground">Complete Plan & Simulation JSON Schema</p>
                  <p className="text-muted-foreground text-[11px]">
                    Includes engine rules, deterministic yearly series, and Monte Carlo stochastic runs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>
              </div>

              <div className="relative rounded-2xl border border-border/80 bg-background/90 overflow-hidden shadow-inner">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
                    <Code2 className="w-3.5 h-3.5" />
                    <span>fire-plan-data.json</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 px-2.5 py-1 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-semibold transition-all cursor-pointer border border-border"
                  >
                    {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedJson ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-foreground/90 overflow-x-auto max-h-[380px] leading-relaxed whitespace-pre-wrap select-all">
                  {JSON.stringify({ plan, simulation: simResults, monteCarlo: mcResults }, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky Action Footer ── */}
        <div className="p-3.5 sm:px-6 sm:py-4 border-t border-border/80 bg-card/90 backdrop-blur-md flex flex-row items-center justify-between gap-3 shrink-0 print:hidden">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {activeFormat === 'pdf' && (
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save as PDF</span>
              </button>
            )}

            {activeFormat === 'llm' && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .md</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Markdown Prompt'}</span>
                </button>
              </>
            )}

            {activeFormat === 'json' && (
              <>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JSON Payload</span>
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
