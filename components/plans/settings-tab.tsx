'use client';

import { useState, useEffect } from 'react';
import {
  Flag,
  TrendingUp,
  ShieldCheck,
  HeartHandshake,
  Users,
  Database,
  RotateCcw,
  Check,
  Sparkles,
  Save,
  Scale,
  BookOpen,
  Layers,
  Info,
  Plus,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  DEFAULT_2026_RULES,
  IRS_UNIFORM_LIFETIME_TABLE,
  HISTORICAL_RETURNS_DATA,
} from '@/lib/constants/retirement-defaults';
import { getYearSalary } from '@/lib/services/retirement-engine';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { EngineRulesView } from './engine-rules-view';

interface SettingsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

export function SettingsTab({ plan, onUpdatePlan }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<
    'milestones' | 'social_security' | 'rates_estate' | 'engine_rules'
  >('milestones');

  // Collapsible card states
  const [isPrimaryProfileCollapsed, setIsPrimaryProfileCollapsed] = useCardCollapsed('settings_primary_profile');
  const [isSpouseProfileCollapsed, setIsSpouseProfileCollapsed] = useCardCollapsed('settings_spouse_profile');

  const [retirementAge, setRetirementAge] = useState(plan?.retirementAge || 60);
  const [lifeExpectancy, setLifeExpectancy] = useState(plan?.lifeExpectancyAge || 100);
  const [birthYear, setBirthYear] = useState(plan?.primaryBirthYear || 1985);
  const [filingStatus, setFilingStatus] = useState(plan?.filingStatus || 'single');

  // Spouse / Partner State
  const [spouseName, setSpouseName] = useState(plan?.spouseName || 'Spouse / Partner');
  const [spouseBirthYear, setSpouseBirthYear] = useState(plan?.spouseBirthYear || 1987);
  const [spouseRetirementAge, setSpouseRetirementAge] = useState(plan?.spouseRetirementAge || 60);
  const [spouseLifeExpectancy, setSpouseLifeExpectancy] = useState(plan?.spouseLifeExpectancyAge || 100);

  // Salary State (for contribution calculations)
  const [primarySalary, setPrimarySalary] = useState(plan?.primarySalary || '0');
  const [spouseSalary, setSpouseSalary] = useState(plan?.spouseSalary || '0');
  const [primarySalaryYear, setPrimarySalaryYear] = useState(plan?.primarySalaryYear || new Date().getFullYear());
  const [primarySalaryRaisePct, setPrimarySalaryRaisePct] = useState(plan?.primarySalaryRaisePct || '0');
  const [primarySalaryOverrides, setPrimarySalaryOverrides] = useState<Record<number, number>>(plan?.primarySalaryOverrides || {});
  const [spouseSalaryYear, setSpouseSalaryYear] = useState(plan?.spouseSalaryYear || new Date().getFullYear());
  const [spouseSalaryRaisePct, setSpouseSalaryRaisePct] = useState(plan?.spouseSalaryRaisePct || '0');
  const [spouseSalaryOverrides, setSpouseSalaryOverrides] = useState<Record<number, number>>(plan?.spouseSalaryOverrides || {});
  const [showPrimarySchedule, setShowPrimarySchedule] = useState(false);
  const [showSpouseSchedule, setShowSpouseSchedule] = useState(false);
  const [editingScheduleYear, setEditingScheduleYear] = useState<number | null>(null);
  const [scheduleYearValue, setScheduleYearValue] = useState('');

  // Social Security State
  const [primarySsMonthly, setPrimarySsMonthly] = useState(plan?.primarySsMonthlyAmount || '2500');
  const [primarySsStartAge, setPrimarySsStartAge] = useState(plan?.primarySsStartAge || 67);
  const [spouseSsMonthly, setSpouseSsMonthly] = useState(plan?.spouseSsMonthlyAmount || '2000');
  const [spouseSsStartAge, setSpouseSsStartAge] = useState(plan?.spouseSsStartAge || 67);
  const [enableSpousalSsBenefit, setEnableSpousalSsBenefit] = useState(plan?.enableSpousalSsBenefit !== false);

  const [inflationRate, setInflationRate] = useState(plan?.settings?.fixedInflationRate || '3.0');
  const [heirTaxRate, setHeirTaxRate] = useState(plan?.settings?.heirFlatIncomeTaxRate || '25.0');
  const [liquidationRate, setLiquidationRate] = useState(plan?.settings?.realEstateLiquidationRate || '6.0');
  const [adminRate, setAdminRate] = useState(plan?.settings?.administrativeCostRate || '1.0');

  // Withdrawal Strategy & Roth Conversion State
  const [withdrawalMethod, setWithdrawalMethod] = useState(plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook');
  const [enableRothConversions, setEnableRothConversions] = useState(Boolean(plan?.settings?.enableRothConversions));
  const [rothConversionTargetCeiling, setRothConversionTargetCeiling] = useState(plan?.settings?.rothConversionTargetCeiling || 'top_of_12');
  const [avoidIrmaaCliffs, setAvoidIrmaaCliffs] = useState(Boolean(plan?.settings?.avoidIrmaaCliffs));

  // Engine Rules State
  const [rules, setRules] = useState<any>(DEFAULT_2026_RULES);
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSuccessMsg, setRulesSuccessMsg] = useState('');
  const [showRmdTable, setShowRmdTable] = useState(false);
  const [showHistoricalData, setShowHistoricalData] = useState(false);

  useEffect(() => {
    if (plan) {
      setRetirementAge(plan.retirementAge || 60);
      setLifeExpectancy(plan.lifeExpectancyAge || 100);
      setBirthYear(plan.primaryBirthYear || 1985);
      setFilingStatus(plan.filingStatus || 'single');
      setSpouseName(plan.spouseName || 'Spouse / Partner');
      setSpouseBirthYear(plan.spouseBirthYear || 1987);
      setSpouseRetirementAge(plan.spouseRetirementAge || 60);
      setSpouseLifeExpectancy(plan.spouseLifeExpectancyAge || 100);
      setPrimarySalary(plan.primarySalary || '0');
      setSpouseSalary(plan.spouseSalary || '0');
      setPrimarySalaryYear(plan.primarySalaryYear || new Date().getFullYear());
      setPrimarySalaryRaisePct(plan.primarySalaryRaisePct || '0');
      setPrimarySalaryOverrides(plan.primarySalaryOverrides || {});
      setSpouseSalaryYear(plan.spouseSalaryYear || new Date().getFullYear());
      setSpouseSalaryRaisePct(plan.spouseSalaryRaisePct || '0');
      setSpouseSalaryOverrides(plan.spouseSalaryOverrides || {});
      setPrimarySsMonthly(plan.primarySsMonthlyAmount || '2500');
      setPrimarySsStartAge(plan.primarySsStartAge || 67);
      setSpouseSsMonthly(plan.spouseSsMonthlyAmount || '2000');
      setSpouseSsStartAge(plan.spouseSsStartAge || 67);
      setEnableSpousalSsBenefit(plan.enableSpousalSsBenefit !== false);
    }
  }, [plan]);

  // Fetch engine rules on load
  useEffect(() => {
    async function fetchRules() {
      setLoadingRules(true);
      try {
        const res = await fetch('/api/retirement/rules');
        if (res.ok) {
          const data = await res.json();
          setRules(data);
        }
      } catch (err) {
        console.error('Failed to fetch retirement rules', err);
      } finally {
        setLoadingRules(false);
      }
    }
    fetchRules();
  }, []);

  const handleSaveRules = async (customPayload?: any) => {
    setSavingRules(true);
    setRulesSuccessMsg('');
    try {
      const payload = customPayload || rules;
      const res = await fetch('/api/retirement/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        setRules(saved);
        setRulesSuccessMsg('Engine rules saved & encrypted in database!');
        setTimeout(() => setRulesSuccessMsg(''), 4000);
        if (onUpdatePlan) {
          onUpdatePlan({});
        }
      }
    } catch (err) {
      console.error('Failed to save rules', err);
    } finally {
      setSavingRules(false);
    }
  };

  const handleResetRules = async () => {
    if (!confirm('Are you sure you want to reset all engine rules and tax parameters to 2026 IRS defaults?')) {
      return;
    }
    setSavingRules(true);
    try {
      const res = await fetch('/api/retirement/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      if (res.ok) {
        const saved = await res.json();
        setRules(saved);
        setRulesSuccessMsg('Reset to 2026 IRS default rules successfully!');
        setTimeout(() => setRulesSuccessMsg(''), 4000);
        if (onUpdatePlan) {
          onUpdatePlan({});
        }
      }
    } catch (err) {
      console.error('Failed to reset rules', err);
    } finally {
      setSavingRules(false);
    }
  };

  if (!plan) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">No active plan selected for settings.</p>
      </div>
    );
  }

  const isMfj = filingStatus === 'married_joint';

  const getSsMultiplier = (age: number) => {
    if (age <= 62) return 0.70;
    if (age === 63) return 0.75;
    if (age === 64) return 0.80;
    if (age === 65) return 0.8667;
    if (age === 66) return 0.9333;
    if (age === 67) return 1.00;
    if (age === 68) return 1.08;
    if (age === 69) return 1.16;
    return 1.24;
  };

  const primaryAnnualSsEst = (parseFloat(primarySsMonthly) || 0) * 12 * getSsMultiplier(primarySsStartAge);
  const spouseAnnualSsEst = (parseFloat(spouseSsMonthly) || 0) * 12 * getSsMultiplier(spouseSsStartAge);
  const totalCombinedSsEst = isMfj ? primaryAnnualSsEst + spouseAnnualSsEst : primaryAnnualSsEst;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Sub-Tab Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        {[
          { id: 'milestones' as const, label: 'Milestones & Profile', icon: Flag },
          { id: 'social_security' as const, label: 'Social Security Planning', icon: HeartHandshake },
          { id: 'rates_estate' as const, label: 'Rates, Inflation & Estate', icon: TrendingUp },
          { id: 'engine_rules' as const, label: 'Engine Data & Tax Rules', icon: Database },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                subTab === t.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab: Milestones & Profile */}
      {subTab === 'milestones' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Primary Profile */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isPrimaryProfileCollapsed}
              onToggle={setIsPrimaryProfileCollapsed}
              title={
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Flag className="w-4 h-4 text-primary" />
                  Primary Profile
                </h3>
              }
              actions={
                <span className="text-[10px] uppercase font-bold text-muted-foreground px-2 py-0.5 bg-muted rounded">Primary</span>
              }
            />

            {!isPrimaryProfileCollapsed && (
              <div className="p-5 space-y-4">
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-muted-foreground">Tax Filing Status</label>
                    <select
                      value={filingStatus}
                      onChange={(e) => {
                        const status = e.target.value;
                        setFilingStatus(status);
                        const hasSpouseUpdate = status === 'married_joint';
                        onUpdatePlan({ filingStatus: status, hasSpouse: hasSpouseUpdate });
                      }}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary font-medium"
                    >
                      <option value="single">Single</option>
                      <option value="married_joint">Married Filing Jointly (MFJ)</option>
                      <option value="married_separate">Married Filing Separately</option>
                      <option value="head_of_household">Head of Household</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-muted-foreground">Primary Birth Year</label>
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
                    <label className="font-semibold text-muted-foreground font-mono font-normal">Retirement Age Target</label>
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
                    <label className="font-semibold text-muted-foreground font-mono font-normal">Life Expectancy Target</label>
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
                    <label className="font-semibold text-muted-foreground">Gross Annual Salary</label>
                    <p className="text-[10px] text-muted-foreground/70 -mt-0.5">Used to calculate account contribution amounts (% of salary)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                      <input
                        type="number"
                        value={primarySalary}
                        onChange={(e) => {
                          setPrimarySalary(e.target.value);
                          onUpdatePlan({ primarySalary: e.target.value });
                        }}
                        placeholder="e.g. 120000"
                        className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">Base Year</label>
                        <input
                          type="number"
                          value={primarySalaryYear}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setPrimarySalaryYear(val);
                            onUpdatePlan({ primarySalaryYear: val });
                          }}
                          className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">Yearly Raise (%)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            value={primarySalaryRaisePct}
                            onChange={(e) => {
                              setPrimarySalaryRaisePct(e.target.value);
                              onUpdatePlan({ primarySalaryRaisePct: e.target.value });
                            }}
                            placeholder="e.g. 3.0"
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">%</span>
                        </div>
                      </div>
                    </div>
                    {(parseFloat(primarySalaryRaisePct) > 0 || Object.keys(primarySalaryOverrides).length > 0) && (
                      <div className="mt-2 border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setShowPrimarySchedule(!showPrimarySchedule)}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          <span>Salary Schedule Preview</span>
                          <span className="text-[10px]">{showPrimarySchedule ? '▲' : '▼'}</span>
                        </button>
                        {showPrimarySchedule && (
                          <div className="border-t border-border max-h-48 overflow-y-auto">
                            <table className="w-full text-[10px]">
                              <thead className="sticky top-0 bg-muted/80">
                                <tr>
                                  <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Year</th>
                                  <th className="px-2 py-1 text-right font-semibold text-muted-foreground">Projected Salary</th>
                                  <th className="px-2 py-1 text-right font-semibold text-muted-foreground w-16"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from({ length: 10 }, (_, i) => {
                                  const yr = primarySalaryYear + i;
                                  const projected = getYearSalary(
                                    parseFloat(primarySalary) || 0,
                                    primarySalaryYear,
                                    parseFloat(primarySalaryRaisePct) || 0,
                                    Object.keys(primarySalaryOverrides).length > 0 ? primarySalaryOverrides : undefined,
                                    yr
                                  );
                                  const isOverridden = yr in primarySalaryOverrides;
                                  const isCurrentYear = yr === new Date().getFullYear();
                                  return (
                                    <tr key={yr} className={`border-t border-border/50 ${isCurrentYear ? 'bg-primary/5' : ''}`}>
                                      <td className="px-2 py-1 font-mono font-bold">
                                        {yr}
                                        {isCurrentYear && <span className="ml-1 text-primary">(now)</span>}
                                      </td>
                                      <td className={`px-2 py-1 text-right font-mono ${isOverridden ? 'text-amber-500 font-bold' : ''}`}>
                                        {editingScheduleYear === yr ? (
                                          <div className="flex items-center gap-1 justify-end">
                                            <span className="text-muted-foreground">$</span>
                                            <input
                                              type="number"
                                              value={scheduleYearValue}
                                              onChange={(e) => setScheduleYearValue(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  const val = parseFloat(scheduleYearValue) || 0;
                                                  const newOverrides = { ...primarySalaryOverrides, [yr]: val };
                                                  setPrimarySalaryOverrides(newOverrides);
                                                  onUpdatePlan({ primarySalaryOverrides: newOverrides });
                                                  setEditingScheduleYear(null);
                                                } else if (e.key === 'Escape') {
                                                  setEditingScheduleYear(null);
                                                }
                                              }}
                                              className="w-24 bg-background border border-primary rounded px-1 py-0.5 font-mono text-foreground text-[10px] text-right focus:outline-none"
                                              autoFocus
                                            />
                                          </div>
                                        ) : (
                                          formatCurrency(projected)
                                        )}
                                      </td>
                                      <td className="px-2 py-1 text-right">
                                        {editingScheduleYear !== yr && (
                                          <button
                                            onClick={() => {
                                              setEditingScheduleYear(yr);
                                              setScheduleYearValue(String(Math.round(projected)));
                                            }}
                                            className="text-muted-foreground hover:text-primary transition-colors"
                                            title={isOverridden ? 'Edit override' : 'Override this year'}
                                          >
                                            <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                          </button>
                                        )}
                                        {isOverridden && editingScheduleYear !== yr && (
                                          <button
                                            onClick={() => {
                                              const newOverrides = { ...primarySalaryOverrides };
                                              delete newOverrides[yr];
                                              setPrimarySalaryOverrides(Object.keys(newOverrides).length > 0 ? newOverrides : {});
                                              onUpdatePlan({ primarySalaryOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : null });
                                            }}
                                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                                            title="Remove override"
                                          >
                                            <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Partner / Spouse Profile (Visible if MFJ) */}
          {isMfj ? (
            <div className="bg-card border border-primary/30 rounded-xl shadow-sm overflow-hidden space-y-0 bg-primary/[0.02]">
              <CollapsibleCardHeader
                isCollapsed={isSpouseProfileCollapsed}
                onToggle={setIsSpouseProfileCollapsed}
                title={
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    Partner / Spouse Profile
                  </h3>
                }
                actions={
                  <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">MFJ Active</span>
                }
              />

              {!isSpouseProfileCollapsed && (
                <div className="p-5 space-y-4">
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Tax Filing Status</label>
                      <select
                        value={filingStatus}
                        onChange={(e) => {
                          const status = e.target.value;
                          setFilingStatus(status);
                          const hasSpouseUpdate = status === 'married_joint';
                          onUpdatePlan({ filingStatus: status, hasSpouse: hasSpouseUpdate });
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary font-medium"
                      >
                        <option value="single">Single</option>
                        <option value="married_joint">Married Filing Jointly (MFJ)</option>
                        <option value="married_separate">Married Filing Separately</option>
                        <option value="head_of_household">Head of Household</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Primary Birth Year</label>
                      <input
                        type="number"
                        value={birthYear || ''}
                        onChange={(e) => setBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(birthYear), 10) || 1985;
                          setBirthYear(val);
                          onUpdatePlan({ primaryBirthYear: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(birthYear), 10) || 1985;
                            onUpdatePlan({ primaryBirthYear: val });
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground font-mono font-normal">Retirement Age Target</label>
                      <input
                        type="number"
                        value={retirementAge || ''}
                        onChange={(e) => setRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(retirementAge), 10) || 60;
                          setRetirementAge(val);
                          onUpdatePlan({ retirementAge: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(retirementAge), 10) || 60;
                            onUpdatePlan({ retirementAge: val });
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground font-mono font-normal">Life Expectancy Target</label>
                      <input
                        type="number"
                        value={lifeExpectancy || ''}
                        onChange={(e) => setLifeExpectancy(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(lifeExpectancy), 10) || 100;
                          setLifeExpectancy(val);
                          onUpdatePlan({ lifeExpectancyAge: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(lifeExpectancy), 10) || 100;
                            onUpdatePlan({ lifeExpectancyAge: val });
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Gross Annual Salary</label>
                      <p className="text-[10px] text-muted-foreground/70 -mt-0.5">Used to calculate account contribution amounts (% of salary)</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                        <input
                          type="text"
                          value={primarySalary}
                          onChange={(e) => setPrimarySalary(e.target.value)}
                          onBlur={() => onUpdatePlan({ primarySalary: primarySalary })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onUpdatePlan({ primarySalary: primarySalary });
                          }}
                          placeholder="e.g. 120000"
                          className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Base Year</label>
                          <input
                            type="number"
                            value={primarySalaryYear || ''}
                            onChange={(e) => setPrimarySalaryYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                            onBlur={() => {
                              const val = parseInt(String(primarySalaryYear), 10) || new Date().getFullYear();
                              setPrimarySalaryYear(val);
                              onUpdatePlan({ primarySalaryYear: val });
                            }}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Yearly Raise (%)</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={primarySalaryRaisePct}
                              onChange={(e) => setPrimarySalaryRaisePct(e.target.value)}
                              onBlur={() => onUpdatePlan({ primarySalaryRaisePct: primarySalaryRaisePct })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onUpdatePlan({ primarySalaryRaisePct: primarySalaryRaisePct });
                              }}
                              placeholder="e.g. 3.0"
                              className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">%</span>
                          </div>
                        </div>
                      </div>
                      {(parseFloat(primarySalaryRaisePct) > 0 || Object.keys(primarySalaryOverrides).length > 0) && (
                        <div className="mt-2 border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowPrimarySchedule(!showPrimarySchedule)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
                          >
                            <span>Salary Schedule Preview</span>
                            <span className="text-[10px]">{showSpouseSchedule ? '▲' : '▼'}</span>
                          </button>
                          {showSpouseSchedule && (
                            <div className="border-t border-border max-h-48 overflow-y-auto">
                              <table className="w-full text-[10px]">
                                <thead className="sticky top-0 bg-muted/80">
                                  <tr>
                                    <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Year</th>
                                    <th className="px-2 py-1 text-right font-semibold text-muted-foreground">Projected Salary</th>
                                    <th className="px-2 py-1 text-right font-semibold text-muted-foreground w-16"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Array.from({ length: 10 }, (_, i) => {
                                    const yr = spouseSalaryYear + i;
                                    const projected = getYearSalary(
                                      parseFloat(spouseSalary) || 0,
                                      spouseSalaryYear,
                                      parseFloat(spouseSalaryRaisePct) || 0,
                                      Object.keys(spouseSalaryOverrides).length > 0 ? spouseSalaryOverrides : undefined,
                                      yr
                                    );
                                    const isOverridden = yr in spouseSalaryOverrides;
                                    const isCurrentYear = yr === new Date().getFullYear();
                                    return (
                                      <tr key={yr} className={`border-t border-border/50 ${isCurrentYear ? 'bg-primary/5' : ''}`}>
                                        <td className="px-2 py-1 font-mono font-bold">
                                          {yr}
                                          {isCurrentYear && <span className="ml-1 text-primary">(now)</span>}
                                        </td>
                                        <td className={`px-2 py-1 text-right font-mono ${isOverridden ? 'text-amber-500 font-bold' : ''}`}>
                                          {editingScheduleYear === yr ? (
                                            <div className="flex items-center gap-1 justify-end">
                                              <span className="text-muted-foreground">$</span>
                                              <input
                                                type="number"
                                                value={scheduleYearValue}
                                                onChange={(e) => setScheduleYearValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    const val = parseFloat(scheduleYearValue) || 0;
                                                    const newOverrides = { ...spouseSalaryOverrides, [yr]: val };
                                                    setSpouseSalaryOverrides(newOverrides);
                                                    onUpdatePlan({ spouseSalaryOverrides: newOverrides });
                                                    setEditingScheduleYear(null);
                                                  } else if (e.key === 'Escape') {
                                                    setEditingScheduleYear(null);
                                                  }
                                                }}
                                                className="w-24 bg-background border border-primary rounded px-1 py-0.5 font-mono text-foreground text-[10px] text-right focus:outline-none"
                                                autoFocus
                                              />
                                            </div>
                                          ) : (
                                            formatCurrency(projected)
                                          )}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                          {editingScheduleYear !== yr && (
                                            <button
                                              onClick={() => {
                                                setEditingScheduleYear(yr);
                                                setScheduleYearValue(String(Math.round(projected)));
                                              }}
                                              className="text-muted-foreground hover:text-primary transition-colors"
                                              title={isOverridden ? 'Edit override' : 'Override this year'}
                                            >
                                              <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                          )}
                                          {isOverridden && editingScheduleYear !== yr && (
                                            <button
                                              onClick={() => {
                                                const newOverrides = { ...spouseSalaryOverrides };
                                                delete newOverrides[yr];
                                                setSpouseSalaryOverrides(Object.keys(newOverrides).length > 0 ? newOverrides : {});
                                                onUpdatePlan({ spouseSalaryOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : null });
                                              }}
                                              className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                                              title="Remove override"
                                            >
                                              <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
              <Users className="w-8 h-8 opacity-40" />
              <p className="text-xs font-semibold">Single Tax Status Active</p>
              <p className="text-[11px] text-muted-foreground/80 max-w-xs">
                Select <strong>Married Filing Jointly (MFJ)</strong> above to enable full couple planning, partner parameters, and dual Social Security modeling.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab: Social Security Planning */}
      {subTab === 'social_security' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-emerald-500/10 via-primary/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-emerald-500" />
                Projected Social Security Income
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimated combined annual SS benefits at claiming ages (indexed for inflation).
              </p>
            </div>
            <div className="text-right flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-extrabold text-emerald-500 font-mono">
                  {formatCurrency(totalCombinedSsEst)}/yr
                </p>
                <p className="text-[11px] text-muted-foreground font-medium">
                  {isMfj ? `Primary (${primarySsStartAge}) + Partner (${spouseSsStartAge})` : `Primary claiming at age ${primarySsStartAge}`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Social Security */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">Primary Social Security</h3>
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Estimated Monthly Benefit at FRA (Age 67)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                    <input
                      type="text"
                      value={primarySsMonthly}
                      onChange={(e) => {
                        setPrimarySsMonthly(e.target.value);
                        onUpdatePlan({ primarySsMonthlyAmount: e.target.value });
                      }}
                      className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Target Claiming Age (62–70)</label>
                  <input
                    type="number"
                    min="62"
                    max="70"
                    value={primarySsStartAge}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPrimarySsStartAge(val);
                      onUpdatePlan({ primarySsStartAge: val });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Claiming adjustment: <span className="font-mono text-primary font-bold">{(getSsMultiplier(primarySsStartAge) * 100).toFixed(1)}%</span> of FRA benefit ({formatCurrency(primaryAnnualSsEst)}/yr)
                  </p>
                </div>
              </div>
            </div>

            {/* Partner Social Security (Visible if MFJ) */}
            {isMfj ? (
              <div className="bg-card border border-primary/30 rounded-xl p-5 shadow-sm space-y-4 bg-primary/[0.02]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Partner Social Security ({spouseName})</h3>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">Partner</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-muted-foreground">Partner Monthly Benefit at FRA (Age 67)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                      <input
                        type="text"
                        value={spouseSsMonthly}
                        onChange={(e) => {
                          setSpouseSsMonthly(e.target.value);
                          onUpdatePlan({ spouseSsMonthlyAmount: e.target.value });
                        }}
                        className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-muted-foreground">Partner Target Claiming Age (62–70)</label>
                    <input
                      type="number"
                      min="62"
                      max="70"
                      value={spouseSsStartAge}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSpouseSsStartAge(val);
                        onUpdatePlan({ spouseSsStartAge: val });
                      }}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Claiming adjustment: <span className="font-mono text-primary font-bold">{(getSsMultiplier(spouseSsStartAge) * 100).toFixed(1)}%</span> of FRA benefit ({formatCurrency(spouseAnnualSsEst)}/yr)
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">Spousal Benefit Optimization (50% Rule)</p>
                      <p className="text-[11px] text-muted-foreground">Ensure partner receives at least 50% of primary PIA if higher.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableSpousalSsBenefit}
                      onChange={(e) => {
                        setEnableSpousalSsBenefit(e.target.checked);
                        onUpdatePlan({ enableSpousalSsBenefit: e.target.checked });
                      }}
                      className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
                <HeartHandshake className="w-8 h-8 opacity-40" />
                <p className="text-xs font-semibold">Single Tax Status Active</p>
                <p className="text-[11px] text-muted-foreground/80 max-w-xs">
                  Switch to Married Filing Jointly in Milestones to configure partner Social Security, spousal benefits, and survivor protections.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab: Rates, Inflation & Estate */}
      {subTab === 'rates_estate' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rates & Inflation Card */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Growth Rates & Inflation
              </h3>
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
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                  />
                  <p className="text-[11px] text-muted-foreground">Applies to expense growth and tax bracket inflation adjustments.</p>
                </div>
              </div>
            </div>

            {/* Estate & Tax Settlement Assumptions Card */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 text-xs">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Estate & Tax Settlement Assumptions
              </h3>
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
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
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
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
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
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Withdrawal Sequencing & Roth Conversions */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 text-xs">
            <div className="border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Retirement Withdrawal Sequencing & Roth Conversion Strategy
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure how the engine draws down accounts during retirement deficit years and executes Roth conversion ladders.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Withdrawal Strategy Selector */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="font-bold text-foreground">Withdrawal Sequencing Strategy</label>
                  <select
                    value={withdrawalMethod}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWithdrawalMethod(val);
                      onUpdatePlan({ withdrawalMethod: val, settings: { withdrawalMethod: val } });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-medium text-foreground focus:ring-1 focus:ring-primary"
                  >
                    <option value="textbook">Textbook Waterfall (Cash → Taxable → Traditional → Roth → HSA)</option>
                    <option value="tax_optimized">Tax-Bracket Shielding (Fill 12% Bracket with Traditional, remainder from Taxable/Roth)</option>
                    <option value="proportional">Proportional Drawdown (Spread across accounts proportional to balance)</option>
                    <option value="custom_order">Custom Priority Order</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Tax-Bracket Shielding</strong> utilizes lower 10%/12% ordinary tax brackets with Pre-Tax Traditional IRA/401(k) withdrawals up to the bracket ceiling, drawing any remaining deficit from Taxable Brokerage or Roth accounts so you avoid jumping into higher tax brackets.
                </p>
              </div>

              {/* Roth Conversion Controls */}
              <div className="space-y-3 bg-muted/30 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground block">Roth Conversion Ladder Simulation</span>
                    <span className="text-[11px] text-muted-foreground">Convert Pre-Tax Traditional → Roth during early retirement</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableRothConversions}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEnableRothConversions(checked);
                      onUpdatePlan({ settings: { enableRothConversions: checked } });
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary rounded accent-primary"
                  />
                </div>

                {enableRothConversions && (
                  <div className="space-y-3 pt-2 border-t border-border animate-in fade-in">
                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Target Conversion Bracket Ceiling</label>
                      <select
                        value={rothConversionTargetCeiling}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRothConversionTargetCeiling(val);
                          onUpdatePlan({ settings: { rothConversionTargetCeiling: val } });
                        }}
                        className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-medium text-foreground focus:ring-1 focus:ring-primary"
                      >
                        <option value="top_of_10">Top of 10% Ordinary Bracket</option>
                        <option value="top_of_12">Top of 12% Ordinary Bracket (Recommended)</option>
                        <option value="top_of_22">Top of 22% Ordinary Bracket</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="font-semibold text-foreground block">IRMAA Cliff Guard</span>
                        <span className="text-[11px] text-muted-foreground">Prevent conversions from triggering Medicare Part B/D surcharges</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={avoidIrmaaCliffs}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAvoidIrmaaCliffs(checked);
                          onUpdatePlan({ settings: { avoidIrmaaCliffs: checked } });
                        }}
                        className="w-4 h-4 text-primary focus:ring-primary rounded accent-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Engine Data & Tax Rules */}
      {subTab === 'engine_rules' && (
        <EngineRulesView
          rules={rules}
          setRules={setRules}
          loadingRules={loadingRules}
          savingRules={savingRules}
          rulesSuccessMsg={rulesSuccessMsg}
          handleSaveRules={handleSaveRules}
          handleResetRules={handleResetRules}
          filingStatus={filingStatus}
        />
      )}
    </div>
  );
}
