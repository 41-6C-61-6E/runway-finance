'use client';

import { useState } from 'react';
import { formatAmount, formatBalance, formatPlainPercent } from '@/lib/utils/format';
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
} from '@/lib/constants/retirement-defaults';
import { SectionHeading } from '@/components/ui/section-heading';
import { ScenarioExplorer } from './engine-rules/scenario-explorer';
import { RmdTablePreview } from './engine-rules/rmd-table-preview';
import { HistoricalMarketData } from './engine-rules/historical-market-data';
import { EnginePipelineDiagram } from './engine-rules/pipeline-diagram';

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

  // Active accordion section for deep-dive rules
  const [expandedRuleTopic, setExpandedRuleTopic] = useState<string | null>('penalties');

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

  return (
    <div className="@container space-y-6 animate-in fade-in duration-300">
      {/* ── HEADER BANNER ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col @md:flex-row @md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Database className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground tracking-tight">
              FIRE Calculation Engine: Rules & Parameters
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-constructive bg-constructive/10 px-2.5 py-0.5 rounded-full border border-constructive/30">
              Active Ruleset
            </span>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
            Statutory tax brackets, contribution limits, early withdrawal penalties, Medicare IRMAA tiers, ACA subsidies, SECURE Act RMD rules, and multi-asset drawdown logic.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleResetRules}
            disabled={savingRules}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 border border-border hover:bg-muted/50 rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={() => handleSaveRules()}
            disabled={savingRules}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {savingRules ? (
              <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Rules
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
      <ScenarioExplorer rules={rules} isMfj={isMfj} />

      {/* ── SECTION 2: ANNUAL ENGINE EXECUTION PIPELINE DIAGRAM ──────────────── */}
      <EnginePipelineDiagram />

      {/* ── SECTION 3: RULE LOGIC DEEP DIVES (DEEP EXPLANATION CARDS) ───────── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="border-b border-border pb-3">
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-500" />
            Detailed Engine Rules & Logic Reference
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Statutory constraints, penalty formulas, tax stacking, and drawdown algorithms embedded in the engine.
          </p>
        </div>

        {/* Accordions for Topics */}
        <div className="space-y-3">
          {/* Topic 1: Early Penalties */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedRuleTopic(expandedRuleTopic === 'penalties' ? null : 'penalties')}
              className="w-full bg-muted/20 hover:bg-muted/40 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer transition-colors"
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
              className="w-full bg-muted/20 hover:bg-muted/40 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer transition-colors"
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
              className="w-full bg-muted/20 hover:bg-muted/40 p-4 text-left flex items-center justify-between text-xs font-bold text-foreground cursor-pointer transition-colors"
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
            <Database className="w-4 h-4 text-primary" />
            Editable Statutory Data & Tax Parameters
          </h4>
          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg">
            Tax Year {rules?.taxYear || 2026}
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
                    <th className="p-2.5">Tier</th>
                    <th className="p-2.5">Single MAGI ($)</th>
                    <th className="p-2.5">Joint MAGI ($)</th>
                    <th className="p-2.5">Part B Surcharge/mo ($)</th>
                    <th className="p-2.5">Part D Surcharge/mo ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {(rules?.irmaaThresholds || []).map((t: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2.5 font-sans font-bold">{idx === 0 ? 'Standard' : `Tier ${idx}`}</td>
                      <td className="p-2.5 font-bold">{t.magiSingle === 0 ? '≤ $103,000' : `> ${formatBalance(t.magiSingle)}`}</td>
                      <td className="p-2.5 font-bold">{t.magiJoint === 0 ? '≤ $206,000' : `> ${formatBalance(t.magiJoint)}`}</td>
                      <td className="p-2.5 text-emerald-500 font-bold">{t.partBMonthly > 0 ? `+${formatAmount(t.partBMonthly)}` : '$0.00'}</td>
                      <td className="p-2.5 text-blue-500 font-bold">{t.partDMonthly > 0 ? `+${formatAmount(t.partDMonthly)}` : '$0.00'}</td>
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
                      <td className="p-2.5 text-primary font-bold">{formatPlainPercent(t.premiumCapPercent * 100)}</td>
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
              <p className="text-[11px] text-muted-foreground">Statutory mandatory withdrawal age — a fallback for plans without a birth year. The engine uses per-birth-year bands (1951–1959→73, 1960→75, 1961→76, ... 1965+→80).</p>
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
          <RmdTablePreview />
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
        <HistoricalMarketData />
      </div>
    </div>
  );
}
