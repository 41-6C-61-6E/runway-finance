'use client';

import { useState, useEffect } from 'react';
import {
  ListChecks,
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
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { CURRENT_TAX_YEAR } from '@/lib/constants/tax';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  calculateSocialSecurityPIA,
  calculateAdjustedSsBenefit,
  getSsClaimingMultiplier,
} from '@/lib/utils/social-security';
import {
  DEFAULT_2026_RULES,
  IRS_UNIFORM_LIFETIME_TABLE,
  HISTORICAL_RETURNS_DATA,
} from '@/lib/constants/retirement-defaults';
import { getYearSalary } from '@/lib/services/retirement-engine';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { isFireEligibleAccount } from '@/lib/utils/account-scope';
import { AppTabs } from '@/components/ui/app-tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { EngineRulesView } from './engine-rules-view';
import { RatesEstateSubtab } from './settings/rates-estate-subtab';
import { PlanDetailsTab } from './plan-details-tab';

interface SettingsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
  desktopHeader?: React.ReactNode;
  subHeader?: React.ReactNode;
}

export function SettingsTab({ plan, onUpdatePlan, desktopHeader, subHeader }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<
    'milestones' | 'details' | 'rates_estate' | 'engine_rules'
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

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const executeResetRules = async () => {
    const yearDisplay = rules?.taxYear || CURRENT_TAX_YEAR;
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
        setRulesSuccessMsg(`Reset to ${saved?.taxYear || yearDisplay} IRS default rules successfully!`);
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

  const handleResetRules = async () => {
    setConfirmResetOpen(true);
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

  const settingsSubTabs = [
    { id: 'milestones', label: 'Profile', icon: Flag },
    { id: 'details', label: 'Details', icon: ListChecks },
    { id: 'rates_estate', label: 'Assumptions', icon: TrendingUp },
    { id: 'engine_rules', label: 'Engine', icon: Database },
  ];

  return (
    <div className="w-full space-y-5">
      {desktopHeader && <div className="hidden md:block mb-3 sm:mb-3.5">{desktopHeader}</div>}
      {subHeader && <div className="lg:hidden">{subHeader}</div>}

      {/* Settings Sub-Tab Bar */}
      <div className="mb-4">
        <AppTabs
          tabs={settingsSubTabs}
          activeTab={subTab}
          onChange={(tabId) => setSubTab(tabId as any)}
          variant="pills"
          size="sm"
          fullWidth
        />
      </div>

      {/* Sub-Tab: Plan Details */}
      {subTab === 'details' && (
        <PlanDetailsTab plan={plan} onUpdatePlan={onUpdatePlan} />
      )}

      {/* Sub-Tab: Milestones & Profile */}
      {subTab === 'milestones' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Primary Profile */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isPrimaryProfileCollapsed}
              onToggle={setIsPrimaryProfileCollapsed}
              title={
                    <SectionHeading size="sm" icon={<Flag className="w-4 h-4 text-primary" />}>Primary Profile</SectionHeading>
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
                    <Select
                      value={filingStatus}
                      onChange={(e) => {
                        const status = e.target.value;
                        setFilingStatus(status);
                        const hasSpouseUpdate = status === 'married_joint';
                        onUpdatePlan({ filingStatus: status, hasSpouse: hasSpouseUpdate });
                      }}
                      className="font-medium"
                    >
                      <option value="single">Single</option>
                      <option value="married_joint">Married Filing Jointly (MFJ)</option>
                      <option value="married_separate">Married Filing Separately</option>
                      <option value="head_of_household">Head of Household</option>
                    </Select>
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
                    <SectionHeading size="sm" icon={<Users className="w-4 h-4 text-emerald-500" />}>Partner / Spouse Profile</SectionHeading>
                }
                actions={
                  <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">MFJ Active</span>
                }
              />

              {!isSpouseProfileCollapsed && (
                <div className="p-5 space-y-4">
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Partner / Spouse Name</label>
                      <input
                        type="text"
                        value={spouseName}
                        onChange={(e) => {
                          setSpouseName(e.target.value);
                          onUpdatePlan({ spouseName: e.target.value });
                        }}
                        placeholder="e.g. Spouse / Partner"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground">Partner Birth Year</label>
                      <input
                        type="number"
                        value={spouseBirthYear || ''}
                        onChange={(e) => setSpouseBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(spouseBirthYear), 10) || 1987;
                          setSpouseBirthYear(val);
                          onUpdatePlan({ spouseBirthYear: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(spouseBirthYear), 10) || 1987;
                            onUpdatePlan({ spouseBirthYear: val });
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground font-mono font-normal">Retirement Age Target</label>
                      <input
                        type="number"
                        value={spouseRetirementAge || ''}
                        onChange={(e) => setSpouseRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(spouseRetirementAge), 10) || 60;
                          setSpouseRetirementAge(val);
                          onUpdatePlan({ spouseRetirementAge: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(spouseRetirementAge), 10) || 60;
                            onUpdatePlan({ spouseRetirementAge: val });
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-muted-foreground font-mono font-normal">Life Expectancy Target</label>
                      <input
                        type="number"
                        value={spouseLifeExpectancy || ''}
                        onChange={(e) => setSpouseLifeExpectancy(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        onBlur={() => {
                          const val = parseInt(String(spouseLifeExpectancy), 10) || 100;
                          setSpouseLifeExpectancy(val);
                          onUpdatePlan({ spouseLifeExpectancyAge: val });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(String(spouseLifeExpectancy), 10) || 100;
                            onUpdatePlan({ spouseLifeExpectancyAge: val });
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
                          value={spouseSalary}
                          onChange={(e) => setSpouseSalary(e.target.value)}
                          onBlur={() => onUpdatePlan({ spouseSalary: spouseSalary })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onUpdatePlan({ spouseSalary: spouseSalary });
                          }}
                          placeholder="e.g. 85000"
                          className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Base Year</label>
                          <input
                            type="number"
                            value={spouseSalaryYear || ''}
                            onChange={(e) => setSpouseSalaryYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                            onBlur={() => {
                              const val = parseInt(String(spouseSalaryYear), 10) || new Date().getFullYear();
                              setSpouseSalaryYear(val);
                              onUpdatePlan({ spouseSalaryYear: val });
                            }}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-muted-foreground">Yearly Raise (%)</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={spouseSalaryRaisePct}
                              onChange={(e) => setSpouseSalaryRaisePct(e.target.value)}
                              onBlur={() => onUpdatePlan({ spouseSalaryRaisePct: spouseSalaryRaisePct })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onUpdatePlan({ spouseSalaryRaisePct: spouseSalaryRaisePct });
                              }}
                              placeholder="e.g. 3.0"
                              className="w-full bg-background border border-border rounded-lg px-2 py-1 font-mono text-foreground text-xs focus:ring-1 focus:ring-primary"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">%</span>
                          </div>
                        </div>
                      </div>
                      {(parseFloat(spouseSalaryRaisePct) > 0 || Object.keys(spouseSalaryOverrides).length > 0) && (
                        <div className="mt-2 border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowSpouseSchedule(!showSpouseSchedule)}
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



      {/* Sub-Tab: Strategy and Rates */}
      {subTab === 'rates_estate' && (
        <RatesEstateSubtab plan={plan} onUpdatePlan={onUpdatePlan} />
      )}
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

      <ConfirmDeleteDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="Reset Engine Rules"
        description={`Are you sure you want to reset all engine rules and tax parameters to ${rules?.taxYear || CURRENT_TAX_YEAR} IRS defaults?`}
        confirmText="Reset Rules"
        onConfirm={executeResetRules}
      />
    </div>
  );
}
