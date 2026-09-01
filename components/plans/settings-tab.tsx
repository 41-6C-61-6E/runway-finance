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
import { PlanDetailsTab } from './plan-details-tab';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

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

  const [inflationRate, setInflationRate] = useState(plan?.settings?.fixedInflationRate || '3.0');
  const [incomeTaxModifier, setIncomeTaxModifier] = useState(plan?.settings?.incomeTaxModifier || '0.0');
  // T-5: opt-in alternative minimum tax estimate (default off → engine
  // output is bit-identical to the legacy regular-tax-only path).
  const [enableAmt, setEnableAmt] = useState<boolean>(plan?.settings?.enableAmt === true);
  // T-2: per-year statutory rule rows when published (2024/2025), then fall
  // back to inflation-escalated base values. 'inflationEscalated' (default)
  // is the legacy behavior, bit-identical for existing plans.
  const [projectionMode, setProjectionMode] = useState<'statutory' | 'inflationEscalated'>(
    plan?.settings?.projectionMode === 'statutory' ? 'statutory' : 'inflationEscalated'
  );
  // ── L-1: optional graduated state income-tax table (absent → the flat
  // incomeTaxModifier keeps its legacy behavior; engine sees empty/missing
  // brackets as "use the flat rate").
  const [stateCode, setStateCode] = useState<string>(plan?.settings?.stateCode || '');
  const [stateStdDed, setStateStdDed] = useState<string>(
    plan?.settings?.stateTaxStandardDeduction != null ? String(plan.settings.stateTaxStandardDeduction) : '0'
  );
  const [stateFloorRate, setStateFloorRate] = useState<string>(
    plan?.settings?.stateGrossFloorRate != null ? String(plan.settings.stateGrossFloorRate) : '0'
  );
  const [stateBrackets, setStateBrackets] = useState<Array<{ threshold: string; rate: string }>>(
    Array.isArray(plan?.settings?.stateTaxBrackets)
      ? (plan.settings.stateTaxBrackets as any[]).map((b: any) => ({
          threshold: b?.threshold != null ? String(b.threshold) : '',
          // Engine/JSON convention: rate is a decimal (0.01 = 1%).
          // The UI edits in percent, so invert on the way out.
          rate: (Number(b?.rate) || 0) !== 0 ? String(Math.round((Number(b?.rate) || 0) * 10000) / 100) : '0',
        }))
      : []
  );
  // ── L-1: persist the optional state table into plan settings. The JSON
  // stores decimal rates (engine convention); empty brackets → the flat
  // incomeTaxModifier keeps applying (legacy behavior).
  const persistStateTable = (
    code?: string,
    stdDed?: string,
    floorRate?: string,
    brackets?: Array<{ threshold: string; rate: string }>
  ) => {
    const table: Record<string, any> = {};
    const c = code ?? stateCode;
    const sd = stdDed ?? stateStdDed;
    const fr = floorRate ?? stateFloorRate;
    const bl = brackets ?? stateBrackets;
    if (c) table.stateCode = c;
    if (sd !== '' && Number.isFinite(Number(sd))) table.stateTaxStandardDeduction = Number(sd);
    if (fr !== '' && Number.isFinite(Number(fr))) table.stateGrossFloorRate = Number(fr);
    const parsed = bl
      .map((row) => ({
        threshold: Number(row.threshold),
        rate: Number(row.rate) / 100,
      }))
      .filter((row) => Number.isFinite(row.threshold) && Number.isFinite(row.rate));
    if (parsed.length > 0) table.stateTaxBrackets = parsed;
    onUpdatePlan({ settings: { stateTaxTable: Object.keys(table).length > 0 ? table : null } });
  };
  const [heirTaxRate, setHeirTaxRate] = useState(plan?.settings?.heirFlatIncomeTaxRate || '25.0');
  const [liquidationRate, setLiquidationRate] = useState(plan?.settings?.realEstateLiquidationRate || '6.0');
  const [adminRate, setAdminRate] = useState(plan?.settings?.administrativeCostRate || '1.0');

  // Withdrawal Strategy & Roth Conversion State
  const [withdrawalMethod, setWithdrawalMethod] = useState(plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook');
  const [enableRothConversions, setEnableRothConversions] = useState(Boolean(plan?.settings?.enableRothConversions));
  const [rothConversionTargetCeiling, setRothConversionTargetCeiling] = useState(plan?.settings?.rothConversionTargetCeiling || 'top_of_12');
  const [avoidIrmaaCliffs, setAvoidIrmaaCliffs] = useState(Boolean(plan?.settings?.avoidIrmaaCliffs));
  const [allowPenaltyWithdrawals, setAllowPenaltyWithdrawals] = useState(plan?.settings?.allowPenaltyWithdrawals !== false);

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

      setInflationRate(plan.settings?.fixedInflationRate || '3.0');
      setIncomeTaxModifier(plan.settings?.incomeTaxModifier || '0.0');

      // Synchronize withdrawal strategy and penalty engine settings
      setWithdrawalMethod(plan.settings?.withdrawalMethod || plan.withdrawalMethod || 'textbook');
      setEnableRothConversions(Boolean(plan.settings?.enableRothConversions));
      setRothConversionTargetCeiling(plan.settings?.rothConversionTargetCeiling || 'top_of_12');
      setAvoidIrmaaCliffs(plan.settings?.avoidIrmaaCliffs !== false);
      setAllowPenaltyWithdrawals(plan.settings?.allowPenaltyWithdrawals !== false);
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

  const settingsSubTabs = [
    { id: 'milestones', label: 'Profile', icon: Flag },
    { id: 'details', label: 'Details', icon: ListChecks },
    { id: 'rates_estate', label: 'Assumptions', icon: TrendingUp },
    { id: 'engine_rules', label: 'Engine', icon: Database },
  ];

  return (
    <MobileTabSwipeContainer
      desktopHeader={desktopHeader}
      tabs={settingsSubTabs}
      activeTabId={subTab}
      onTabChange={(tabId) => setSubTab(tabId as any)}
      priority={1}
    >
      {subHeader && <div className="lg:hidden">{subHeader}</div>}

      {/* Desktop Sub-Tab Bar */}
      <div className="hidden lg:block">
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
      {subTab === 'rates_estate' && (() => {
        // Calculate active plan accounts & build real waterfall sequence
        const eligibleAccounts = (plan?.accounts || []).filter(
          (a: any) => a.isIncluded !== false && isFireEligibleAccount(a)
        );

        // Group accounts into split portions (Pre-Tax / Traditional vs Roth vs Taxable vs Cash vs HSA)
        const expandedPortions: Array<{
          id: string;
          accountName: string;
          owner: string;
          portionType: 'cash' | 'taxable' | 'traditional' | 'roth' | 'hsa';
          portionLabel: string;
          balance: number;
          totalAccountBalance: number;
          isSplit: boolean;
          rothPercentage: number;
        }> = [];

        eligibleAccounts.forEach((acc: any) => {
          const totalBal = parseFloat(acc.balance) || 0;
          const rawType = (acc.type || '').toLowerCase();
          const rawSubtype = (acc.subtype || '').toLowerCase();
          const rawName = (acc.name || '').toLowerCase();

          let rothPct = 0;
          if (typeof acc.rothPercentage === 'number') {
            rothPct = acc.rothPercentage;
          } else if (acc.rothPercentage !== undefined && acc.rothPercentage !== null) {
            rothPct = parseFloat(acc.rothPercentage) || 0;
          } else if (rawType.includes('roth') || rawSubtype.includes('roth') || rawName.includes('roth')) {
            rothPct = 100;
          }

          const rothBal = totalBal * (rothPct / 100);
          const tradBal = totalBal - rothBal;
          const isSplit = rothPct > 0 && rothPct < 100;

          if (tradBal > 0) {
            let portionType: 'cash' | 'taxable' | 'traditional' | 'hsa' = 'traditional';
            if (rawType.includes('cash') || rawType.includes('savings') || rawType.includes('money_market') || rawSubtype.includes('savings')) {
              portionType = 'cash';
            } else if (rawType.includes('taxable') || rawType.includes('brokerage') || rawType.includes('investment') || rawType.includes('crypto')) {
              portionType = 'taxable';
            } else if (rawType.includes('hsa') || rawType.includes('health')) {
              portionType = 'hsa';
            }

            expandedPortions.push({
              id: `${acc.id}_trad`,
              accountName: acc.name || 'Account',
              owner: acc.owner || 'primary',
              portionType,
              portionLabel: isSplit ? 'Pre-Tax (Non-Roth) Portion' : (portionType === 'cash' ? 'Cash Account' : portionType === 'taxable' ? 'Taxable Brokerage' : portionType === 'hsa' ? 'HSA Account' : 'Pre-Tax Traditional'),
              balance: tradBal,
              totalAccountBalance: totalBal,
              isSplit,
              rothPercentage: rothPct,
            });
          }

          if (rothBal > 0) {
            expandedPortions.push({
              id: `${acc.id}_roth`,
              accountName: acc.name || 'Account',
              owner: acc.owner || 'primary',
              portionType: 'roth',
              portionLabel: isSplit ? 'Roth Portion' : 'Roth Account',
              balance: rothBal,
              totalAccountBalance: totalBal,
              isSplit,
              rothPercentage: rothPct,
            });
          }
        });

        const totalPortfolioBal = expandedPortions.reduce((sum, p) => sum + p.balance, 0);

        let waterfallTiers: Array<{
          stepNumber: number;
          title: string;
          subtitle: string;
          badgeStyle: string;
          items: typeof expandedPortions;
        }> = [];

        if (withdrawalMethod === 'tax_optimized') {
          waterfallTiers = [
            {
              stepNumber: 1,
              title: 'Liquid Cash & Savings',
              subtitle: 'Drawn first to satisfy short-term cash deficits',
              badgeStyle: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'cash'),
            },
            {
              stepNumber: 2,
              title: 'Pre-Tax Traditional Retirement (Shielding Lower Brackets)',
              subtitle: 'Drawn up to lower 10%/12% ordinary income bracket ceilings to optimize tax rates',
              badgeStyle: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'traditional'),
            },
            {
              stepNumber: 3,
              title: 'Taxable Brokerage Assets',
              subtitle: 'Drawn for remaining deficit to access 0%/15% preferential capital gains rates',
              badgeStyle: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'taxable'),
            },
            {
              stepNumber: 4,
              title: 'Tax-Free Roth Accounts & Portions',
              subtitle: 'Drawn to cover remaining deficit 100% tax-free without increasing taxable income',
              badgeStyle: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'roth'),
            },
            {
              stepNumber: 5,
              title: 'Health Savings Accounts (HSA)',
              subtitle: 'Drawn last or preserved for qualified medical expenses tax-free',
              badgeStyle: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'hsa'),
            },
          ];
        } else if (withdrawalMethod === 'proportional') {
          waterfallTiers = [
            {
              stepNumber: 1,
              title: 'Parallel Proportional Drawdown',
              subtitle: 'Deficits are drawn evenly across all active accounts proportional to current balance',
              badgeStyle: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
              items: expandedPortions,
            },
          ];
        } else {
          // Textbook Waterfall (default)
          waterfallTiers = [
            {
              stepNumber: 1,
              title: 'Liquid Cash & Savings',
              subtitle: 'Drawn first to satisfy immediate cash deficit',
              badgeStyle: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'cash'),
            },
            {
              stepNumber: 2,
              title: 'Taxable Brokerage Assets',
              subtitle: 'Drawn next from taxable brokerage accounts',
              badgeStyle: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'taxable'),
            },
            {
              stepNumber: 3,
              title: 'Pre-Tax Traditional Retirement Accounts',
              subtitle: 'Drawn after taxable assets (taxable at ordinary income rates)',
              badgeStyle: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'traditional'),
            },
            {
              stepNumber: 4,
              title: 'Tax-Free Roth Accounts & Portions',
              subtitle: 'Drawn fourth for tax-free growth preservation',
              badgeStyle: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'roth'),
            },
            {
              stepNumber: 5,
              title: 'Health Savings Accounts (HSA)',
              subtitle: 'Drawn last for medical expense shielding',
              badgeStyle: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
              items: expandedPortions.filter((p) => p.portionType === 'hsa'),
            },
          ];
        }

        return (
          <div className="space-y-6">
            {/* Macroeconomic & Tax Assumptions + Estate & Settlement in 2-Column Shaded Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Macroeconomic & Tax Rates */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <div>
                    <SectionHeading size="sm">Macroeconomic & Tax Rates</SectionHeading>
                    <p className="text-[11px] text-muted-foreground">General inflation rate and state/local income tax overlay</p>
                  </div>
                  </div>

                <div className="space-y-3.5 text-xs">
                  <div className="space-y-1.5 bg-muted/20 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-foreground flex items-center gap-1.5">
                        Fixed Annual Inflation Rate (%)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Applies annual compounding to living expenses and adjusts federal tax brackets/limits.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <span className="font-mono text-xs font-bold text-primary">{inflationRate}%</span>
                    </div>
                    <input
                      type="text"
                      value={inflationRate}
                      onChange={(e) => {
                        setInflationRate(e.target.value);
                        onUpdatePlan({ settings: { fixedInflationRate: e.target.value } });
                      }}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                    />
                  </div>

                  {/* ── T-2: per-year statutory tax-rule sourcing ── */}
                  <div className="space-y-1.5 bg-muted/20 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <label className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                        Tax Year Sourcing
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            "Statutory" reads the published federal tax tables year-by-year (2024 &amp; 2025 ship built-in); simulated years after the last published table inherit the most recent one. "Inflation-escalated" compounds the current base-year brackets/limits by your fixed inflation rate every year — the legacy behavior.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <Select
                        value={projectionMode}
                        onChange={(e) => {
                          const v = e.target.value as 'statutory' | 'inflationEscalated';
                          setProjectionMode(v);
                          onUpdatePlan({ settings: { projectionMode: v } });
                        }}
                        className="h-8 text-[11px] font-mono font-bold"
                      >
                        <option value="inflationEscalated">Inflation-escalated</option>
                        <option value="statutory">Statutory (per-year)</option>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-muted/20 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-foreground flex items-center gap-1.5">
                        Estimate Alternative Minimum Tax (AMT)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            When enabled, the tax engine estimates the alternative minimum tax (IRC §55): tax base = MAGI + HSA income + state/local add-back, 26% on (base − statutory exemption, exemption reduced 25% above the phaseout threshold — 2025 values escalated at your inflation rate). The engine pays the higher of AMT and regular federal income tax. Off by default, so disabling it restores bit-identical legacy output.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enableAmt}
                        onClick={() => {
                          const next = !enableAmt;
                          setEnableAmt(next);
                          onUpdatePlan({ settings: { enableAmt: next } });
                        }}
                        className="inline-flex items-center shrink-0 rounded-full transition-colors h-6 w-11"
                        style={{ backgroundColor: enableAmt ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
                      >
                        <span className="inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform" style={{ transform: enableAmt ? 'translateX(22px)' : 'translateX(3px)' }} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-muted/20 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-foreground flex items-center gap-1.5">
                        State / Local Income Tax Rate (flat %)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Applied as a flat tax on taxable ordinary income. Set to 0% for tax-free states (TX, FL, NV, WA, etc.). Only used when no graduated bracket table is configured below.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <span className="font-mono text-xs font-bold text-primary">{incomeTaxModifier}%</span>
                    </div>
                    <input
                      type="text"
                      value={incomeTaxModifier}
                      onChange={(e) => {
                        setIncomeTaxModifier(e.target.value);
                        onUpdatePlan({ settings: { incomeTaxModifier: e.target.value } });
                      }}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                    />
                  </div>

                  {/* ── L-1: optional graduated state income-tax table ── */}
                  <div className="space-y-2 bg-muted/20 border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-foreground flex items-center gap-1.5">
                        State Bracket Table (optional)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Optional graduated state income-tax schedule (single filer, base-year dollars; auto-inflated and doubled for married-filing-joint). Leave empty to keep the flat-rate behavior above.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <span className="font-mono text-[10px] text-muted-foreground">{stateBrackets.length} brackets</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">State (label)</span>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="e.g. CA"
                          value={stateCode}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            setStateCode(v);
                            persistStateTable(v);
                          }}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Std Deduction ($)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={stateStdDed}
                          onChange={(e) => {
                            setStateStdDed(e.target.value);
                            persistStateTable(stateCode, e.target.value);
                          }}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Floor Rate on Gross (%)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={stateFloorRate}
                        onChange={(e) => {
                          setStateFloorRate(e.target.value);
                          persistStateTable(stateCode, stateStdDed, e.target.value);
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Brackets (income up to → rate %)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...stateBrackets, { threshold: String((stateBrackets[stateBrackets.length - 1]?.threshold || '0') === '' ? '0' : String(Math.round((parseFloat(stateBrackets[stateBrackets.length - 1]?.threshold) || 0) + 10000))), rate: '0' }];
                            setStateBrackets(next);
                            persistStateTable(stateCode, stateStdDed, stateFloorRate, next);
                          }}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          + Add bracket
                        </button>
                      </div>
                      {stateBrackets.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">
                          Empty → the flat rate above is used for state tax (unchanged behavior).
                        </p>
                      )}
                      {stateBrackets.map((b, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground w-4">{i}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="threshold $"
                            value={b.threshold}
                            onChange={(e) => {
                              const next = stateBrackets.map((row, j) => (j === i ? { ...row, threshold: e.target.value } : row));
                              setStateBrackets(next);
                              persistStateTable(stateCode, stateStdDed, stateFloorRate, next);
                            }}
                            className="w-28 bg-background border border-border rounded-lg px-2 py-1.5 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">→</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="rate %"
                            value={b.rate}
                            onChange={(e) => {
                              const next = stateBrackets.map((row, j) => (j === i ? { ...row, rate: e.target.value } : row));
                              setStateBrackets(next);
                              persistStateTable(stateCode, stateStdDed, stateFloorRate, next);
                            }}
                            className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                          />
                          <button
                            type="button"
                            aria-label="Remove bracket"
                            onClick={() => {
                              const next = stateBrackets.filter((_, j) => j !== i);
                              setStateBrackets(next);
                              persistStateTable(stateCode, stateStdDed, stateFloorRate, next);
                            }}
                            className="text-[10px] font-bold text-muted-foreground hover:text-destructive"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estate & Legacy Settlement Assumptions */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  <div>
                    <SectionHeading size="sm">Estate & Legacy Settlement</SectionHeading>
                    <p className="text-[11px] text-muted-foreground">Heir tax drag and estate liquidation friction upon plan end</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5 bg-muted/20 border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-foreground flex items-center gap-1.5">
                        Heir Flat Income Tax Rate (%)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Effective tax rate paid by heirs when liquidating inherited pre-tax Traditional IRAs under the 10-year SECURE Act rule.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <span className="font-mono text-xs font-bold text-foreground">{heirTaxRate}%</span>
                    </div>
                    <input
                      type="text"
                      value={heirTaxRate}
                      onChange={(e) => {
                        setHeirTaxRate(e.target.value);
                        onUpdatePlan({ settings: { heirFlatIncomeTaxRate: e.target.value } });
                      }}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 bg-muted/20 border border-border rounded-xl p-3">
                      <label className="font-bold text-foreground text-[11px] block">Real Estate Fee (%)</label>
                      <input
                        type="text"
                        value={liquidationRate}
                        onChange={(e) => {
                          setLiquidationRate(e.target.value);
                          onUpdatePlan({ settings: { realEstateLiquidationRate: e.target.value } });
                        }}
                        className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                      />
                    </div>
                    <div className="space-y-1 bg-muted/20 border border-border rounded-xl p-3">
                      <label className="font-bold text-foreground text-[11px] block">Probate & Drag (%)</label>
                      <input
                        type="text"
                        value={adminRate}
                        onChange={(e) => {
                          setAdminRate(e.target.value);
                          onUpdatePlan({ settings: { administrativeCostRate: e.target.value } });
                        }}
                        className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground focus:ring-1 focus:ring-primary font-bold text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE WATERFALL & ACCOUNT DRAWDOWN SEQUENCE */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden p-5 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Active Account Drawdown Waterfall & Sequence
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Strategy: <span className="font-semibold text-foreground capitalize">{(withdrawalMethod || 'textbook').replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {/* Allow Penalty Withdrawals Toggle inline */}
                  <div className="flex items-center gap-2 bg-muted/30 border border-border px-3 py-1.5 rounded-xl">
                    <input
                      type="checkbox"
                      id="allowPenaltyCheck"
                      checked={allowPenaltyWithdrawals}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAllowPenaltyWithdrawals(checked);
                        onUpdatePlan({ settings: { allowPenaltyWithdrawals: checked } });
                      }}
                      className="w-4 h-4 accent-primary rounded cursor-pointer"
                    />
                    <label htmlFor="allowPenaltyCheck" className="text-xs font-semibold text-foreground flex items-center gap-1 cursor-pointer">
                      Early Penalty Draw
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          When enabled, the engine may draw from penalized tax-deferred accounts (with 10%/20% early withdrawal penalty) if liquid non-penalized funds are fully exhausted.
                        </TooltipContent>
                      </Tooltip>
                    </label>
                  </div>

                  {totalPortfolioBal > 0 && (
                    <div className="text-right pl-2 border-l border-border">
                      <span className="text-[10px] text-muted-foreground block font-medium">Included Assets</span>
                      <span className="font-mono text-xs font-bold text-foreground">{formatCurrency(totalPortfolioBal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {expandedPortions.length === 0 ? (
                <div className="p-6 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground">
                  No active FIRE eligible accounts found for this plan. Accounts added to your plan portfolio will automatically map to this drawdown sequence.
                </div>
              ) : (
                <div className="space-y-3">
                  {waterfallTiers.map((tier) => {
                    if (tier.items.length === 0) return null;
                    return (
                      <div key={tier.stepNumber} className="bg-muted/20 border border-border rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${tier.badgeStyle}`}>
                              Step {tier.stepNumber}
                            </span>
                            <span className="text-xs font-bold text-foreground">{tier.title}</span>
                          </div>
                          <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                            {tier.items.length} {tier.items.length === 1 ? 'holding' : 'holdings'} ({formatCurrency(tier.items.reduce((s, i) => s + i.balance, 0))})
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{tier.subtitle}</p>

                        <div className="space-y-1.5 pt-1">
                          {tier.items.map((item) => {
                            const sharePct = totalPortfolioBal > 0 ? (item.balance / totalPortfolioBal) * 100 : 0;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between bg-card border border-border/80 rounded-lg p-2.5 text-xs transition-all hover:border-primary/30"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-foreground">{item.accountName}</span>
                                      <span className={`text-micro font-semibold px-1.5 py-0.5 rounded ${
                                        item.portionType === 'roth'
                                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                          : item.portionType === 'traditional'
                                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                          : item.portionType === 'taxable'
                                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                          : item.portionType === 'cash'
                                          ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                                      }`}>
                                        {item.portionLabel}
                                      </span>
                                      {item.isSplit && (
                                        <span className="text-micro font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                          Split: {100 - item.rothPercentage}% Pre-Tax / {item.rothPercentage}% Roth
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground capitalize">
                                      Owner: {item.owner}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right font-mono">
                                  <span className="font-bold text-foreground block">{formatCurrency(item.balance)}</span>
                                  {withdrawalMethod === 'proportional' && (
                                    <span className="text-[10px] text-muted-foreground block">{formatPlainPercent(sharePct)}% of drawdown</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
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
    </MobileTabSwipeContainer>
  );
}
