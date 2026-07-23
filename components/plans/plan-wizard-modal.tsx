'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Users,
  Wallet,
  ShieldCheck,
  Building2,
  DollarSign,
  Sliders,
  Flame,
  ShieldAlert,
  HelpCircle,
  HeartHandshake,
  TrendingUp,
} from 'lucide-react';
import { isFireEligibleAccount } from '@/lib/utils/account-scope';
import {
  calculateSocialSecurityPIA,
  getSsClaimingMultiplier,
  calculateAdjustedSsBenefit,
} from '@/lib/utils/social-security';
import { formatCurrency } from '@/lib/utils/format';

export interface PlanWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (planData: any) => Promise<void>;
  mode: 'create' | 'edit';
  initialPlan?: any;
  defaultPlan?: any;
  availableAccounts?: any[];
}

export function PlanWizardModal({
  isOpen,
  onClose,
  onSave,
  mode,
  initialPlan,
  defaultPlan,
  availableAccounts = [],
}: PlanWizardModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State - Core Profile
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [filingStatus, setFilingStatus] = useState<'single' | 'married_joint' | 'married_separate' | 'head_of_household'>('single');
  const [hasSpouse, setHasSpouse] = useState(false);
  const [primaryBirthYear, setPrimaryBirthYear] = useState<number | ''>(1985);
  const [primaryBirthMonth, setPrimaryBirthMonth] = useState(1);
  const [retirementAge, setRetirementAge] = useState<number | ''>(60);
  const [lifeExpectancyAge, setLifeExpectancyAge] = useState<number | ''>(100);

  // Form State - Partner Details
  const [spouseName, setSpouseName] = useState('Spouse / Partner');
  const [spouseBirthYear, setSpouseBirthYear] = useState<number | ''>(1987);
  const [spouseBirthMonth, setSpouseBirthMonth] = useState(1);
  const [spouseRetirementAge, setSpouseRetirementAge] = useState<number | ''>(60);
  const [spouseLifeExpectancyAge, setSpouseLifeExpectancyAge] = useState<number | ''>(100);
  const [spouseSsMonthlyAmount, setSpouseSsMonthlyAmount] = useState<number | ''>(2000);
  const [spouseSsStartAge, setSpouseSsStartAge] = useState<number | ''>(67);
  const [enableSpousalSsBenefit, setEnableSpousalSsBenefit] = useState(true);

  // Form State - Salaries
  const [primarySalary, setPrimarySalary] = useState<number | ''>(0);
  const [spouseSalary, setSpouseSalary] = useState<number | ''>(0);
  const [primarySalaryRaisePct, setPrimarySalaryRaisePct] = useState('3.0');
  const [spouseSalaryRaisePct, setSpouseSalaryRaisePct] = useState('3.0');

  // Form State - SS & FI Target
  const [primarySsMonthlyAmount, setPrimarySsMonthlyAmount] = useState<number | ''>(2500);
  const [primarySsStartAge, setPrimarySsStartAge] = useState<number | ''>(67);
  const [fiTargetMultiplier, setFiTargetMultiplier] = useState<number | ''>(25);

  // Form State - Retirement Income & Expenses
  const [livingExpenseAmount, setLivingExpenseAmount] = useState<number | ''>(60000);
  const [livingExpenseAdjustForInflation, setLivingExpenseAdjustForInflation] = useState(true);
  const [healthcareExpenseAmount, setHealthcareExpenseAmount] = useState<number | ''>(8400);
  const [pensionIncomeAmount, setPensionIncomeAmount] = useState<number | ''>(0);
  const [pensionStartAge, setPensionStartAge] = useState<number | ''>(60);

  // Form State - Strategy & Tax Optimization Engine
  const [withdrawalMethod, setWithdrawalMethod] = useState<'textbook' | 'tax_optimized' | 'proportional'>('textbook');
  const [allowPenaltyWithdrawals, setAllowPenaltyWithdrawals] = useState(true);
  const [fixedInflationRate, setFixedInflationRate] = useState<number | ''>(3.0);
  const [enableRothConversions, setEnableRothConversions] = useState(false);
  const [rothConversionTargetCeiling, setRothConversionTargetCeiling] = useState<'top_of_10' | 'top_of_12' | 'top_of_22'>('top_of_12');
  const [avoidIrmaaCliffs, setAvoidIrmaaCliffs] = useState(true);

  // Accounts Inclusion Map
  const [accountInclusions, setAccountInclusions] = useState<Record<string, boolean>>({});

  // Dynamic step configuration based on partner presence
  const steps = useMemo(() => [
    { key: 'profile', title: 'Profile & Tax', icon: Building2 },
    ...(hasSpouse ? [{ key: 'partner', title: 'Partner Details', icon: Users }] : []),
    { key: 'accounts', title: 'Accounts & Assets', icon: Wallet },
    { key: 'expenses', title: 'Expenses & Income', icon: DollarSign },
    { key: 'strategy', title: 'Strategy & Engine', icon: Sliders },
    { key: 'social_security', title: 'Social Security & FI', icon: ShieldCheck },
  ], [hasSpouse]);

  // Ensure currentStep does not exceed steps length when steps array shrinks
  useEffect(() => {
    if (currentStep > steps.length) {
      setCurrentStep(steps.length);
    }
  }, [steps.length, currentStep]);

  const activeStep = steps[Math.min(currentStep - 1, steps.length - 1)] || steps[0];
  const activeKey = activeStep.key;
  const isLastStep = currentStep === steps.length;

  const fireAvailableAccounts = useMemo(() => {
    return (availableAccounts || []).filter(isFireEligibleAccount);
  }, [availableAccounts]);

  const accountsToDisplay = useMemo(() => {
    const rawList = (initialPlan?.accounts && initialPlan.accounts.length > 0)
      ? initialPlan.accounts
      : (defaultPlan?.accounts && defaultPlan.accounts.length > 0)
      ? defaultPlan.accounts
      : fireAvailableAccounts;
    return (rawList || []).filter(isFireEligibleAccount);
  }, [initialPlan, defaultPlan, fireAvailableAccounts]);

  const prevIsOpenRef = React.useRef(false);

  // Initialize form state ONLY when modal transitions from closed to open
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!justOpened) return;

    setErrorMsg(null);
    setCurrentStep(1);

    const sourcePlan = mode === 'edit' ? initialPlan : (initialPlan || defaultPlan);

    if (sourcePlan) {
      setName(mode === 'edit' ? (sourcePlan.name || 'Retirement Plan') : `${sourcePlan.name || 'Default Plan'} Scenario`);
      setIsDefault(mode === 'edit' ? Boolean(sourcePlan.isDefault) : !defaultPlan);
      setFilingStatus(sourcePlan.filingStatus || 'single');
      setHasSpouse(Boolean(sourcePlan.hasSpouse || sourcePlan.filingStatus === 'married_joint'));
      setPrimaryBirthYear(Number(sourcePlan.primaryBirthYear) || 1985);
      setPrimaryBirthMonth(Number(sourcePlan.primaryBirthMonth) || 1);
      setRetirementAge(Number(sourcePlan.retirementAge) || 60);
      setLifeExpectancyAge(Number(sourcePlan.lifeExpectancyAge) || 100);

      setSpouseName(sourcePlan.spouseName || 'Spouse / Partner');
      setSpouseBirthYear(Number(sourcePlan.spouseBirthYear) || 1987);
      setSpouseBirthMonth(Number(sourcePlan.spouseBirthMonth) || 1);
      setSpouseRetirementAge(Number(sourcePlan.spouseRetirementAge) || 60);
      setSpouseLifeExpectancyAge(Number(sourcePlan.spouseLifeExpectancyAge) || 100);
      setEnableSpousalSsBenefit(sourcePlan.enableSpousalSsBenefit !== false);

      const pSal = parseFloat(sourcePlan.primarySalary) || 0;
      const sSal = parseFloat(sourcePlan.spouseSalary) || 0;
      setPrimarySalary(pSal);
      setSpouseSalary(sSal);
      setPrimarySalaryRaisePct(sourcePlan.primarySalaryRaisePct || '3.0');
      setSpouseSalaryRaisePct(sourcePlan.spouseSalaryRaisePct || '3.0');

      const pSs = parseFloat(sourcePlan.primarySsMonthlyAmount) || calculateSocialSecurityPIA(pSal) || 2500;
      const sSs = parseFloat(sourcePlan.spouseSsMonthlyAmount) || calculateSocialSecurityPIA(sSal) || 2000;
      setPrimarySsMonthlyAmount(pSs);
      setSpouseSsMonthlyAmount(sSs);
      setPrimarySsStartAge(Number(sourcePlan.primarySsStartAge) || 67);
      setSpouseSsStartAge(Number(sourcePlan.spouseSsStartAge) || 67);
      setFiTargetMultiplier(Number(sourcePlan.fiTargetMultiplier) || 25);

      if (Array.isArray(sourcePlan.events)) {
        const livingEv = sourcePlan.events.find((e: any) => e.type === 'living_expense' || e.category === 'expense');
        if (livingEv) {
          setLivingExpenseAmount(parseFloat(livingEv.amount) || 60000);
          setLivingExpenseAdjustForInflation(livingEv.adjustForInflation !== false);
        } else {
          setLivingExpenseAmount(60000);
        }

        const healthEv = sourcePlan.events.find((e: any) => e.type === 'healthcare');
        if (healthEv) {
          setHealthcareExpenseAmount(parseFloat(healthEv.amount) || 8400);
        } else {
          setHealthcareExpenseAmount(8400);
        }

        const pensionEv = sourcePlan.events.find((e: any) => e.type === 'pension' || e.type === 'passive');
        if (pensionEv) {
          setPensionIncomeAmount(parseFloat(pensionEv.amount) || 0);
          setPensionStartAge(Number(pensionEv.startTriggerValue) || 60);
        } else {
          setPensionIncomeAmount(0);
          setPensionStartAge(Number(sourcePlan.retirementAge) || 60);
        }
      } else {
        setLivingExpenseAmount(60000);
        setHealthcareExpenseAmount(8400);
        setPensionIncomeAmount(0);
      }

      setWithdrawalMethod(sourcePlan.settings?.withdrawalMethod || sourcePlan.withdrawalMethod || 'textbook');
      setAllowPenaltyWithdrawals(sourcePlan.settings?.allowPenaltyWithdrawals !== false);
      setFixedInflationRate(parseFloat(sourcePlan.settings?.fixedInflationRate) || 3.0);
      setEnableRothConversions(Boolean(sourcePlan.settings?.enableRothConversions));
      setRothConversionTargetCeiling(sourcePlan.settings?.rothConversionTargetCeiling || 'top_of_12');
      setAvoidIrmaaCliffs(sourcePlan.settings?.avoidIrmaaCliffs !== false);

      const incMap: Record<string, boolean> = {};
      accountsToDisplay.forEach((acc: any) => {
        incMap[acc.id] = acc.isIncluded !== false;
      });
      setAccountInclusions(incMap);
    } else {
      setName('Default Plan');
      setIsDefault(true);
      setFilingStatus('single');
      setHasSpouse(false);
      setPrimaryBirthYear(1985);
      setPrimaryBirthMonth(1);
      setRetirementAge(60);
      setLifeExpectancyAge(100);

      setSpouseName('Spouse / Partner');
      setSpouseBirthYear(1987);
      setSpouseBirthMonth(1);
      setSpouseRetirementAge(60);
      setSpouseLifeExpectancyAge(100);
      setSpouseSsMonthlyAmount(2000);
      setSpouseSsStartAge(67);
      setEnableSpousalSsBenefit(true);

      setPrimarySalary(0);
      setSpouseSalary(0);
      setPrimarySalaryRaisePct('3.0');
      setSpouseSalaryRaisePct('3.0');
      setPrimarySsMonthlyAmount(2500);
      setPrimarySsStartAge(67);
      setFiTargetMultiplier(25);

      setLivingExpenseAmount(60000);
      setLivingExpenseAdjustForInflation(true);
      setHealthcareExpenseAmount(8400);
      setPensionIncomeAmount(0);
      setPensionStartAge(60);

      setWithdrawalMethod('textbook');
      setAllowPenaltyWithdrawals(true);
      setFixedInflationRate(3.0);
      setEnableRothConversions(false);
      setRothConversionTargetCeiling('top_of_12');
      setAvoidIrmaaCliffs(true);

      const incMap: Record<string, boolean> = {};
      accountsToDisplay.forEach((acc: any) => {
        incMap[acc.id] = true;
      });
      setAccountInclusions(incMap);
    }
  }, [isOpen, mode, initialPlan, defaultPlan]);

  // Sync accountInclusions when accountsToDisplay arrives
  useEffect(() => {
    if (!isOpen) return;
    setAccountInclusions((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const incMap: Record<string, boolean> = {};
      accountsToDisplay.forEach((acc: any) => {
        incMap[acc.id] = acc.isIncluded !== false;
      });
      return incMap;
    });
  }, [isOpen, accountsToDisplay]);

  // Auto-update Primary Social Security estimate when primary salary changes
  const handlePrimarySalaryChange = (val: number | '') => {
    setPrimarySalary(val);
    if (typeof val === 'number' && val > 0) {
      const estimatedPia = calculateSocialSecurityPIA(val);
      if (estimatedPia > 0) {
        setPrimarySsMonthlyAmount(estimatedPia);
      }
    }
  };

  // Auto-update Spouse Social Security estimate when spouse salary changes
  const handleSpouseSalaryChange = (val: number | '') => {
    setSpouseSalary(val);
    if (typeof val === 'number' && val > 0) {
      const estimatedPia = calculateSocialSecurityPIA(val);
      if (estimatedPia > 0) {
        setSpouseSsMonthlyAmount(estimatedPia);
      }
    }
  };

  const handleFilingStatusChange = (status: 'single' | 'married_joint' | 'married_separate' | 'head_of_household') => {
    setFilingStatus(status);
    if (status === 'married_joint') {
      setHasSpouse(true);
    }
  };

  const toggleAccountInclusion = (accId: string) => {
    setAccountInclusions((prev) => ({
      ...prev,
      [accId]: prev[accId] === false ? true : false,
    }));
  };

  const handleSelectAllAccounts = (include: boolean) => {
    const nextMap: Record<string, boolean> = {};
    accountsToDisplay.forEach((acc: any) => {
      nextMap[acc.id] = include;
    });
    setAccountInclusions(nextMap);
  };

  const handleNextStep = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentStep((prev) => Math.min(prev + 1, steps.length));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // If Enter key was pressed on an input before reaching final step, advance step without submitting
    if (currentStep < steps.length) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length));
      return;
    }

    if (!name.trim() || saving) return;
    const sourcePlan = defaultPlan || initialPlan;

    const pSalNum = parseFloat(String(primarySalary)) || 0;
    const sSalNum = parseFloat(String(spouseSalary)) || 0;
    const computedPrimarySs = calculateSocialSecurityPIA(pSalNum) || parseFloat(String(primarySsMonthlyAmount)) || 2500;
    const computedSpouseSs = calculateSocialSecurityPIA(sSalNum) || parseFloat(String(spouseSsMonthlyAmount)) || 2000;

    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave({
        name: name.trim(),
        isDefault,
        filingStatus,
        hasSpouse,
        primaryBirthYear: parseInt(String(primaryBirthYear), 10) || 1985,
        primaryBirthMonth,
        retirementAge: parseInt(String(retirementAge), 10) || 60,
        lifeExpectancyAge: parseInt(String(lifeExpectancyAge), 10) || 100,
        spouseName,
        spouseBirthYear: parseInt(String(spouseBirthYear), 10) || 1987,
        spouseBirthMonth,
        spouseRetirementAge: parseInt(String(spouseRetirementAge), 10) || 60,
        spouseLifeExpectancyAge: parseInt(String(spouseLifeExpectancyAge), 10) || 100,
        spouseSsMonthlyAmount: computedSpouseSs,
        spouseSsStartAge: parseInt(String(spouseSsStartAge), 10) || 67,
        enableSpousalSsBenefit,
        primarySalary: pSalNum,
        spouseSalary: sSalNum,
        primarySalaryRaisePct,
        spouseSalaryRaisePct,
        primarySalaryYear: new Date().getFullYear(),
        spouseSalaryYear: new Date().getFullYear(),
        primarySsMonthlyAmount: computedPrimarySs,
        primarySsStartAge: parseInt(String(primarySsStartAge), 10) || 67,
        fiTargetMultiplier: parseInt(String(fiTargetMultiplier), 10) || 25,
        withdrawalMethod,
        livingExpenseAmount: parseFloat(String(livingExpenseAmount)) || 0,
        livingExpenseAdjustForInflation,
        healthcareExpenseAmount: parseFloat(String(healthcareExpenseAmount)) || 0,
        pensionIncomeAmount: parseFloat(String(pensionIncomeAmount)) || 0,
        pensionStartAge: parseInt(String(pensionStartAge), 10) || Number(retirementAge) || 60,
        settings: {
          withdrawalMethod,
          allowPenaltyWithdrawals,
          fixedInflationRate: parseFloat(String(fixedInflationRate)) || 3.0,
          enableRothConversions,
          rothConversionTargetCeiling,
          avoidIrmaaCliffs,
        },
        accountInclusions,
        sourcePlanId: sourcePlan?.id,
      });
      onClose();
    } catch (err: any) {
      console.error('Wizard save failed', err);
      setErrorMsg(err?.message || 'Failed to save plan. Please check inputs and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-card z-50 border border-border rounded-2xl p-6 shadow-2xl max-w-2xl w-full my-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Wizard Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {mode === 'edit' ? `Configure "${name}"` : 'Retirement Plan Setup Wizard'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mode === 'edit'
                  ? 'Update your retirement parameters, expenses, strategy & tax engine settings'
                  : 'Pre-populated with default plan values. Customize settings for this scenario.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-muted-foreground hover:text-foreground font-bold">
              &times;
            </button>
          </div>
        )}

        {/* Step Indicator Pills */}
        <div className={`grid gap-1.5 ${steps.length === 6 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-5'}`}>
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const stepNum = idx + 1;
            const isActive = currentStep === stepNum;
            const isDone = currentStep > stepNum;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setCurrentStep(stepNum)}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : isDone
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/60'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <Icon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Step Content Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* STEP 1: Core Profile & Tax Status */}
          {activeKey === 'profile' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Plan Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Default Baseline Plan, Early FIRE at 50, Conservative"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Tax Filing Status</label>
                  <select
                    value={filingStatus}
                    onChange={(e: any) => handleFilingStatusChange(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="single">Single</option>
                    <option value="married_joint">Married Filing Jointly (MFJ)</option>
                    <option value="married_separate">Married Filing Separately</option>
                    <option value="head_of_household">Head of Household</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-4 py-2 mt-auto">
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Partner / Spouse Plan</span>
                    <span className="text-[11px] text-muted-foreground">Include partner timelines & benefits</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasSpouse}
                    onChange={(e) => setHasSpouse(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Primary Birth Year</label>
                  <input
                    type="number"
                    required
                    min={1940}
                    max={2010}
                    value={primaryBirthYear}
                    onChange={(e) => setPrimaryBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Target Retirement Age</label>
                  <input
                    type="number"
                    required
                    min={30}
                    max={80}
                    value={retirementAge}
                    onChange={(e) => setRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Life Expectancy Age</label>
                  <input
                    type="number"
                    required
                    min={65}
                    max={110}
                    value={lifeExpectancyAge}
                    onChange={(e) => setLifeExpectancyAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Gross Annual Salary ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="e.g. 120000"
                    value={primarySalary === 0 ? '' : primarySalary}
                    onChange={(e) => handlePrimarySalaryChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Yearly Salary Raise (%)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    placeholder="e.g. 3.0"
                    value={primarySalaryRaisePct || ''}
                    onChange={(e) => setPrimarySalaryRaisePct(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  id="isDefaultCheck"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                />
                <label htmlFor="isDefaultCheck" className="cursor-pointer font-medium text-foreground">
                  Set as Default Baseline Plan (Primary plan used to pre-populate future scenarios)
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Partner Profile & Benefits (Conditional) */}
          {activeKey === 'partner' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                <span>Configure partner details for dual-retiree household projections.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Partner Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex, Spouse"
                    value={spouseName}
                    onChange={(e) => setSpouseName(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Partner Birth Year</label>
                  <input
                    type="number"
                    min={1940}
                    max={2010}
                    value={spouseBirthYear}
                    onChange={(e) => setSpouseBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Partner Target Retirement Age</label>
                  <input
                    type="number"
                    min={30}
                    max={80}
                    value={spouseRetirementAge}
                    onChange={(e) => setSpouseRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Partner Gross Annual Salary ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="e.g. 85000"
                    value={spouseSalary === 0 ? '' : spouseSalary}
                    onChange={(e) => handleSpouseSalaryChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Partner Yearly Raise (%)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    placeholder="e.g. 3.0"
                    value={spouseSalaryRaisePct || ''}
                    onChange={(e) => setSpouseSalaryRaisePct(e.target.value)}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Accounts & Assets Selection */}
          {activeKey === 'accounts' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Select Portfolio Accounts to Include</h4>
                  <p className="text-[11px] text-muted-foreground">Checked accounts are included in accumulation savings and drawdown calculations</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectAllAccounts(true)}
                    className="text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAllAccounts(false)}
                    className="text-muted-foreground hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {accountsToDisplay.length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                    No accounts found. Default starter accounts will be created for this plan.
                  </div>
                ) : (
                  accountsToDisplay.map((acc: any) => {
                    const isInc = accountInclusions[acc.id] !== false;
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccountInclusion(acc.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          isInc
                            ? 'bg-muted/30 border-primary/40 shadow-xs'
                            : 'bg-muted/10 border-border opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isInc}
                            onChange={() => toggleAccountInclusion(acc.id)}
                            className="w-4 h-4 accent-primary rounded cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold text-foreground block">{acc.name || 'Account'}</span>
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                              {(acc.type || 'account').replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-foreground">
                          ${(parseFloat(acc.balance) || 0).toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Expenses & Passive Income */}
          {activeKey === 'expenses' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Annual Living Expenses ($/year)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={livingExpenseAmount}
                    onChange={(e) => setLivingExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold"
                  />
                  <p className="text-[11px] text-muted-foreground">Base annual outflow required in retirement (excluding taxes & healthcare)</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Healthcare Expenses ($/year)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={healthcareExpenseAmount}
                    onChange={(e) => setHealthcareExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Pension / Passive Income ($/year)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={pensionIncomeAmount}
                    onChange={(e) => setPensionIncomeAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Strategy & Tax Optimization Engine */}
          {activeKey === 'strategy' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground">Drawdown Sequence Strategy</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'textbook', title: 'Textbook Waterfall', desc: 'Cash → Taxable → Traditional → Roth → HSA' },
                    { id: 'tax_optimized', title: 'Tax-Optimized', desc: 'Fill lower tax brackets with Traditional first' },
                    { id: 'proportional', title: 'Proportional', desc: 'Draw evenly across portfolio' },
                  ].map((strat) => (
                    <button
                      key={strat.id}
                      type="button"
                      onClick={() => setWithdrawalMethod(strat.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        withdrawalMethod === strat.id
                          ? 'bg-primary/10 border-primary shadow-xs'
                          : 'bg-muted/20 border-border hover:bg-muted/40'
                      }`}
                    >
                      <span className="text-xs font-bold text-foreground block">{strat.title}</span>
                      <span className="text-[10px] text-muted-foreground block mt-1">{strat.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2.5">
                  <div>
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      Allow Penalty Withdrawals
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Draw penalized accounts if safe funds run out
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowPenaltyWithdrawals}
                    onChange={(e) => setAllowPenaltyWithdrawals(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Fixed Inflation Rate (%)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={15}
                    value={fixedInflationRate}
                    onChange={(e) => setFixedInflationRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2.5 sm:col-span-2">
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Enable Early Roth Conversion Ladder</span>
                    <span className="text-[10px] text-muted-foreground block">Convert Pre-Tax Traditional balance to Roth tax-free growth in early retirement</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableRothConversions}
                    onChange={(e) => setEnableRothConversions(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                  />
                </div>

                {enableRothConversions && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Roth Conversion Target Ceiling</label>
                      <select
                        value={rothConversionTargetCeiling}
                        onChange={(e: any) => setRothConversionTargetCeiling(e.target.value)}
                        className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="top_of_10">Top of 10% Bracket</option>
                        <option value="top_of_12">Top of 12% Bracket (Recommended)</option>
                        <option value="top_of_22">Top of 22% Bracket</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2">
                      <div>
                        <span className="text-xs font-semibold text-foreground block">Avoid Medicare IRMAA Cliffs</span>
                        <span className="text-[10px] text-muted-foreground">Cap conversions to avoid Medicare surcharges</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={avoidIrmaaCliffs}
                        onChange={(e) => setAvoidIrmaaCliffs(e.target.checked)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 6: Social Security, FI Target & Summary Review */}
          {activeKey === 'social_security' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Primary Social Security Planning Card */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <HeartHandshake className="w-4 h-4 text-emerald-500" />
                      Primary Person Social Security Planning
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      PIA at Full Retirement Age (67): <span className="font-mono font-bold text-foreground">{formatCurrency(calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500))}/mo</span> (from {formatCurrency(Number(primarySalary || 0))}/yr salary)
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">Claiming Strategy</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { age: 62, label: 'Early (Age 62)', sub: '70% FRA' },
                        { age: 67, label: 'Full (Age 67)', sub: '100% FRA' },
                        { age: 70, label: 'Late (Age 70)', sub: '124% FRA' },
                      ].map((opt) => (
                        <button
                          key={opt.age}
                          type="button"
                          onClick={() => setPrimarySsStartAge(opt.age)}
                          className={`py-2 px-2 rounded-xl text-center transition-all cursor-pointer border ${
                            Number(primarySsStartAge) === opt.age
                              ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                              : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-xs block font-semibold">{opt.label}</span>
                          <span className="text-[10px] opacity-80 block">{opt.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Estimated Monthly Benefit at Age {primarySsStartAge || 67}:</span>
                    <span className="font-mono font-bold text-emerald-500">
                      {formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500), Number(primarySsStartAge || 67)))}/mo
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">
                        ({formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500), Number(primarySsStartAge || 67)) * 12)}/yr)
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Partner / Spouse Social Security Planning Card (Conditional) */}
              {hasSpouse && (
                <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/[0.02]">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-primary" />
                        Partner Social Security Planning ({spouseName || 'Spouse'})
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        PIA at Full Retirement Age (67): <span className="font-mono font-bold text-foreground">{formatCurrency(calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000))}/mo</span> (from {formatCurrency(Number(spouseSalary || 0))}/yr salary)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">Partner Claiming Strategy</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { age: 62, label: 'Early (Age 62)', sub: '70% FRA' },
                          { age: 67, label: 'Full (Age 67)', sub: '100% FRA' },
                          { age: 70, label: 'Late (Age 70)', sub: '124% FRA' },
                        ].map((opt) => (
                          <button
                            key={opt.age}
                            type="button"
                            onClick={() => setSpouseSsStartAge(opt.age)}
                            className={`py-2 px-2 rounded-xl text-center transition-all cursor-pointer border ${
                              Number(spouseSsStartAge) === opt.age
                                ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                                : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <span className="text-xs block font-semibold">{opt.label}</span>
                            <span className="text-[10px] opacity-80 block">{opt.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Partner Estimated Monthly Benefit at Age {spouseSsStartAge || 67}:</span>
                      <span className="font-mono font-bold text-primary">
                        {formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000), Number(spouseSsStartAge || 67)))}/mo
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">
                          ({formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000), Number(spouseSsStartAge || 67)) * 12)}/yr)
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3 py-2">
                      <div>
                        <span className="text-xs font-semibold text-foreground block">Spousal SS Benefit Optimization</span>
                        <span className="text-[10px] text-muted-foreground">Ensure partner receives at least 50% of primary benefit</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={enableSpousalSsBenefit}
                        onChange={(e) => setEnableSpousalSsBenefit(e.target.checked)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* FI Target Multiplier Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">FI Target Multiplier</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={15}
                    max={40}
                    value={fiTargetMultiplier}
                    onChange={(e) => setFiTargetMultiplier(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">x Expenses</span>
                </div>
              </div>

              {/* Summary Configuration Card */}
              <div className="bg-muted/20 border border-border rounded-xl p-3.5 space-y-2.5">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Plan Configuration Summary
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">Retirement Age:</span>
                    <span className="font-bold text-foreground">{retirementAge || 60} years</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Living Expenses:</span>
                    <span className="font-bold text-foreground">${Number(livingExpenseAmount || 0).toLocaleString()}/yr</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Drawdown Strategy:</span>
                    <span className="font-bold text-foreground capitalize">{(withdrawalMethod || 'textbook').replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Primary SS Benefit:</span>
                    <span className="font-bold text-emerald-500">{formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500), Number(primarySsStartAge || 67)))}/mo (Age {primarySsStartAge})</span>
                  </div>
                  {hasSpouse && (
                    <div>
                      <span className="text-muted-foreground block">Partner SS Benefit:</span>
                      <span className="font-bold text-primary">{formatCurrency(calculateAdjustedSsBenefit(calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000), Number(spouseSsStartAge || 67)))}/mo (Age {spouseSsStartAge})</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground block">FI Target ({fiTargetMultiplier || 25}x):</span>
                    <span className="font-bold text-foreground">${(Number(livingExpenseAmount || 60000) * Number(fiTargetMultiplier || 25)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="border-t border-border pt-4 flex items-center justify-between">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
                className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      <span>Saving Plan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{mode === 'edit' ? 'Save Changes' : 'Create & Run Plan'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
