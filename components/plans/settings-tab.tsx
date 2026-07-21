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

interface SettingsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

export function SettingsTab({ plan, onUpdatePlan }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<
    'milestones' | 'social_security' | 'rates_estate' | 'engine_rules'
  >('milestones');

  const [retirementAge, setRetirementAge] = useState(plan?.retirementAge || 60);
  const [lifeExpectancy, setLifeExpectancy] = useState(plan?.lifeExpectancyAge || 100);
  const [birthYear, setBirthYear] = useState(plan?.primaryBirthYear || 1985);
  const [filingStatus, setFilingStatus] = useState(plan?.filingStatus || 'single');

  // Spouse / Partner State
  const [spouseName, setSpouseName] = useState(plan?.spouseName || 'Spouse / Partner');
  const [spouseBirthYear, setSpouseBirthYear] = useState(plan?.spouseBirthYear || 1987);
  const [spouseRetirementAge, setSpouseRetirementAge] = useState(plan?.spouseRetirementAge || 60);
  const [spouseLifeExpectancy, setSpouseLifeExpectancy] = useState(plan?.spouseLifeExpectancyAge || 100);

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
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Flag className="w-4 h-4 text-primary" />
                Primary Profile
              </h3>
              <span className="text-[10px] uppercase font-bold text-muted-foreground px-2 py-0.5 bg-muted rounded">Primary</span>
            </div>

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
            </div>
          </div>

          {/* Partner / Spouse Profile (Visible if MFJ) */}
          {isMfj ? (
            <div className="bg-card border border-primary/30 rounded-xl p-5 shadow-sm space-y-4 bg-primary/[0.02]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-500" />
                  Partner / Spouse Profile
                </h3>
                <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">MFJ Active</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Partner Name / Label</label>
                  <input
                    type="text"
                    value={spouseName}
                    onChange={(e) => {
                      setSpouseName(e.target.value);
                      onUpdatePlan({ spouseName: e.target.value });
                    }}
                    placeholder="Spouse / Partner"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Partner Birth Year</label>
                  <input
                    type="number"
                    value={spouseBirthYear}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSpouseBirthYear(val);
                      onUpdatePlan({ spouseBirthYear: val });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Partner Retirement Age Target</label>
                  <input
                    type="number"
                    value={spouseRetirementAge}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSpouseRetirementAge(val);
                      onUpdatePlan({ spouseRetirementAge: val });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Partner Life Expectancy Target</label>
                  <input
                    type="number"
                    value={spouseLifeExpectancy}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSpouseLifeExpectancy(val);
                      onUpdatePlan({ spouseLifeExpectancyAge: val });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
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
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-primary/10 via-emerald-500/10 to-blue-500/10 border border-primary/20 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">FIRE Engine Data & Statutory Rules</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  DB Encrypted (AES-GCM)
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Full transparency into statutory tax brackets, standard deductions, 401(k)/IRA/HSA contribution limits, Medicare IRMAA tiers, ACA subsidy scales, and SECURE Act rules used in calculation models. None of these parameters are hidden.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetRules}
                disabled={savingRules}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted/50 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
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
                Save Rules
              </button>
            </div>
          </div>

          {rulesSuccessMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{rulesSuccessMsg}</span>
            </div>
          )}

          {loadingRules ? (
            <div className="py-12 flex justify-center items-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Loading statutory engine rules...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Federal Ordinary Tax Brackets & Standard Deduction */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
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
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                    Tax Year {rules?.taxYear || 2026}
                  </span>
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
                    <p className="text-[11px] text-muted-foreground">Doubled automatically for Married Filing Jointly (MFJ).</p>
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
                                value={b.rate * 100}
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
                                value={b.rate * 100}
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

              {/* Section 2: Account Contribution Limits */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
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

              {/* Section 3: Medicare IRMAA Surcharges & ACA Health Subsidy Tables */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
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

              {/* Section 4: Social Security Taxation & SECURE Act RMD Rules */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="border-b border-border pb-3">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-500" />
                    Social Security Taxation & SECURE Act Rules
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provisional income brackets governing Social Security taxability, SECURE Act RMD start ages, and IRS life expectancy tables.
                  </p>
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
                            <div key={age} className="bg-background border border-border rounded p-1 text-center">
                              <span className="text-muted-foreground block text-[9px]">Age {age}</span>
                              <span className="font-bold text-foreground">{divisor}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Gift & Estate Tax Exemptions */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
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

              {/* Section 6: Historical Asset Returns & CPI Benchmarks */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
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
          )}
        </div>
      )}
    </div>
  );
}
