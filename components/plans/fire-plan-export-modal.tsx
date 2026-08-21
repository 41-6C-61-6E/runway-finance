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

  const initialNetWorth = simResults?.yearlyResults?.[0]?.netWorth ?? 0;
  const retirementExpenses = Number(plan?.annualRetirementExpenses) || 80000;
  const swr = Number(plan?.safeWithdrawalRate) || 4.0;
  const targetFireNumber = swr > 0 ? (retirementExpenses / (swr / 100)) : 0;
  const projectedAtRetirement = simResults?.yearlyResults?.find((y) => y.primaryAge === retirementAge)?.netWorth ?? 0;
  const crossoverAge = simResults?.yearlyResults?.find((y) => y.netWorth >= targetFireNumber)?.primaryAge ?? null;
  const mcSuccessRate = mcResults ? Math.round(mcResults.successRate) : null;

  // Generate LLM Prompt Markdown
  const markdownContent = useMemo(() => {
    if (!plan || !simResults) return '';

    const accountsList = Array.isArray(plan?.accounts) ? plan.accounts : [];
    const flowsList = Array.isArray(plan?.flows) ? plan.flows : [];
    const eventsList = Array.isArray(plan?.events) ? plan.events : [];

    const acctBreakdown = accountsList.map((a: any) => 
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
- **Filing Status**: ${plan.filingStatus || (plan.hasSpouse ? 'Married Filing Jointly' : 'Single')}
- **Primary Individual**: Age ${currentAge} (Born ${plan.primaryBirthYear || 'N/A'})
- **Target Retirement Age**: Age ${retirementAge} (${yearsToRetire} years from present)
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
- **Withdrawal Strategy**: ${plan.withdrawalMethod || 'Taxable First (Textbook Drawdown)'}
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
  }, [plan, simResults, mcResults, currentAge, retirementAge, yearsToRetire, initialNetWorth, retirementExpenses, swr, targetFireNumber, projectedAtRetirement, crossoverAge, mcSuccessRate]);

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

  // Handle Download Markdown
  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan?.name || 'fire-plan').toLowerCase().replace(/\s+/g, '-')}-export.md`;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 border-b border-border bg-muted/20 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">
                    Export FIRE Plan
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Generate an executive PDF print report or an AI/LLM-optimized prompt audit for <span className="font-semibold text-foreground">{plan?.name || 'Primary Plan'}</span>.
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Format Selector Pills */}
            <div className="flex bg-muted/70 border border-border p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveFormat('pdf')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeFormat === 'pdf'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF / Print</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFormat('llm')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeFormat === 'llm'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>LLM Prompt (.md)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFormat('json')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeFormat === 'json'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* ── 1. PDF / Print Report View ── */}
          {activeFormat === 'pdf' && (
            <div ref={printRef} className="space-y-6 text-foreground print:p-0 print:m-0">
              {/* Executive Summary Card */}
              <div className="p-5 bg-card border border-border rounded-2xl shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border gap-2">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-primary uppercase">Executive Summary</span>
                    <h2 className="text-xl font-bold text-foreground">{plan?.name || 'Retirement & FIRE Strategy'}</h2>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span>Generated: {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Scorecard 4-grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Current Portfolio</span>
                    <div className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(initialNetWorth)}</div>
                    <span className="text-[10px] text-muted-foreground">Age {currentAge}</span>
                  </div>

                  <div className="p-3.5 bg-orange-500/5 rounded-xl border border-orange-500/20">
                    <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider block">Target FIRE #</span>
                    <div className="text-lg font-bold text-orange-500 mt-0.5">{formatCurrency(targetFireNumber)}</div>
                    <span className="text-[10px] text-muted-foreground">{swr}% SWR ({formatCurrency(retirementExpenses)}/yr)</span>
                  </div>

                  <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Target Retirement</span>
                    <div className="text-lg font-bold text-foreground mt-0.5">Age {retirementAge}</div>
                    <span className="text-[10px] text-muted-foreground">in {yearsToRetire} years</span>
                  </div>

                  <div className="p-3.5 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                    <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider block">Monte Carlo Success</span>
                    <div className="text-lg font-bold text-emerald-500 mt-0.5">
                      {mcSuccessRate !== null ? `${mcSuccessRate}%` : '—'}
                    </div>
                    <span className="text-[10px] text-muted-foreground">1,000 iterations</span>
                  </div>
                </div>
              </div>

              {/* Core Assumptions & Strategy */}
              <div className="p-5 bg-card border border-border rounded-2xl shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Plan Assumptions & Methodology</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Expected Growth Rate:</span>
                    <span className="font-semibold text-foreground">{plan?.expectedGrowthRate || 7.0}% / yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Inflation Rate:</span>
                    <span className="font-semibold text-foreground">{plan?.fixedInflationRate || 3.0}% / yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Planning Horizon:</span>
                    <span className="font-semibold text-foreground">Age {plan?.lifeExpectancyAge || 100}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Withdrawal Method:</span>
                    <span className="font-semibold text-foreground">{plan?.withdrawalMethod || 'Taxable First'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Roth Conversions:</span>
                    <span className="font-semibold text-foreground">{plan?.enableRothConversions ? `Active (${plan.rothConversionTargetCeiling || '12%'})` : 'Disabled'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Social Security:</span>
                    <span className="font-semibold text-foreground">Age {plan?.primarySsStartAge || 67} ({formatCurrency(Number(plan?.primarySsMonthlyAmount || 2500))}/mo)</span>
                  </div>
                </div>
              </div>

              {/* Account Balances Table */}
              <div className="p-5 bg-card border border-border rounded-2xl shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Portfolio Asset Allocation</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 font-semibold">Account</th>
                        <th className="py-2 font-semibold">Tax Treatment</th>
                        <th className="py-2 font-semibold text-right">Current Balance</th>
                        <th className="py-2 font-semibold text-right">Annual Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(plan?.accounts || []).map((acc: any, i: number) => (
                        <tr key={acc.id || i}>
                          <td className="py-2.5 font-medium text-foreground">{acc.name || 'Account'}</td>
                          <td className="py-2.5 text-muted-foreground capitalize">{acc.taxCategory || 'Taxable'}</td>
                          <td className="py-2.5 text-right font-semibold text-foreground">{formatCurrency(Number(acc.balance) || 0)}</td>
                          <td className="py-2.5 text-right font-medium text-emerald-500">{formatCurrency(Number(acc.annualContribution) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. LLM Prompt View ── */}
          {activeFormat === 'llm' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-primary">Formatted specifically for evaluation by Large Language Models (LLMs)</p>
                  <p className="text-muted-foreground">
                    Copy and paste this markdown directly into Claude 3.5, GPT-4o, or Gemini to receive an instant, comprehensive financial review and stress test of your retirement model.
                  </p>
                </div>
              </div>

              <div className="relative">
                <pre className="p-4 bg-muted/60 border border-border rounded-xl text-xs font-mono text-foreground overflow-x-auto max-h-[420px] whitespace-pre-wrap select-all">
                  {markdownContent}
                </pre>
              </div>
            </div>
          )}

          {/* ── 3. JSON Raw View ── */}
          {activeFormat === 'json' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Raw structured JSON export including simulation parameters, account configurations, and stochastic outcomes.
              </p>
              <pre className="p-4 bg-muted/60 border border-border rounded-xl text-xs font-mono text-foreground overflow-x-auto max-h-[420px] whitespace-pre-wrap select-all">
                {JSON.stringify({ plan, simulation: simResults, monteCarlo: mcResults }, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {activeFormat === 'pdf' && (
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save as PDF</span>
              </button>
            )}

            {activeFormat === 'llm' && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .md</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-primary-foreground" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Markdown Prompt'}</span>
                </button>
              </>
            )}

            {activeFormat === 'json' && (
              <button
                type="button"
                onClick={handleDownloadJson}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JSON Payload</span>
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
