'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

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

  // Form State - Retirement Income & Expenses (NEW)
  const [livingExpenseAmount, setLivingExpenseAmount] = useState<number | ''>(60000);
  const [livingExpenseAdjustForInflation, setLivingExpenseAdjustForInflation] = useState(true);
  const [healthcareExpenseAmount, setHealthcareExpenseAmount] = useState<number | ''>(8400);
  const [pensionIncomeAmount, setPensionIncomeAmount] = useState<number | ''>(0);
  const [pensionStartAge, setPensionStartAge] = useState<number | ''>(65);

  // Form State - Strategy & Tax Optimization Engine (NEW)
  const [withdrawalMethod, setWithdrawalMethod] = useState<'textbook' | 'tax_optimized' | 'proportional'>('textbook');
  const [allowPenaltyWithdrawals, setAllowPenaltyWithdrawals] = useState(true);
  const [fixedInflationRate, setFixedInflationRate] = useState<number | ''>(3.0);
  const [enableRothConversions, setEnableRothConversions] = useState(false);
  const [rothConversionTargetCeiling, setRothConversionTargetCeiling] = useState<'top_of_10' | 'top_of_12' | 'top_of_22'>('top_of_12');
  const [avoidIrmaaCliffs, setAvoidIrmaaCliffs] = useState(true);

  // Accounts Inclusion Map
  const [accountInclusions, setAccountInclusions] = useState<Record<string, boolean>>({});

  // Initialize or reset form state when modal opens or plan props change
  useEffect(() => {
    if (!isOpen) return;

    // Source plan: initialPlan (for edit mode) or defaultPlan (for create scenario pre-population)
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
      setSpouseSsMonthlyAmount(parseFloat(sourcePlan.spouseSsMonthlyAmount) || 2000);
      setSpouseSsStartAge(Number(sourcePlan.spouseSsStartAge) || 67);
      setEnableSpousalSsBenefit(sourcePlan.enableSpousalSsBenefit !== false);

      setPrimarySalary(parseFloat(sourcePlan.primarySalary) || 0);
      setSpouseSalary(parseFloat(sourcePlan.spouseSalary) || 0);
      setPrimarySalaryRaisePct(sourcePlan.primarySalaryRaisePct || '3.0');
      setSpouseSalaryRaisePct(sourcePlan.spouseSalaryRaisePct || '3.0');
      setPrimarySsMonthlyAmount(parseFloat(sourcePlan.primarySsMonthlyAmount) || 2500);
      setPrimarySsStartAge(Number(sourcePlan.primarySsStartAge) || 67);
      setFiTargetMultiplier(Number(sourcePlan.fiTargetMultiplier) || 25);

      // Pre-populate expenses & income events from sourcePlan
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

      // Pre-populate withdrawal strategy & engine settings
      setWithdrawalMethod(sourcePlan.settings?.withdrawalMethod || sourcePlan.withdrawalMethod || 'textbook');
      setAllowPenaltyWithdrawals(sourcePlan.settings?.allowPenaltyWithdrawals !== false);
      setFixedInflationRate(parseFloat(sourcePlan.settings?.fixedInflationRate) || 3.0);
      setEnableRothConversions(Boolean(sourcePlan.settings?.enableRothConversions));
      setRothConversionTargetCeiling(sourcePlan.settings?.rothConversionTargetCeiling || 'top_of_12');
      setAvoidIrmaaCliffs(sourcePlan.settings?.avoidIrmaaCliffs !== false);

      // Pre-populate account inclusions
      const incMap: Record<string, boolean> = {};
      if (Array.isArray(sourcePlan.accounts)) {
        sourcePlan.accounts.forEach((acc: any) => {
          incMap[acc.id] = acc.isIncluded !== false;
        });
      } else if (availableAccounts.length > 0) {
        availableAccounts.forEach((acc: any) => {
          incMap[acc.id] = true;
        });
      }
      setAccountInclusions(incMap);
    } else {
      // Clean slate default initialization
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
      availableAccounts.forEach((acc: any) => {
        incMap[acc.id] = true;
      });
      setAccountInclusions(incMap);
    }
    setCurrentStep(1);
  }, [isOpen, mode, initialPlan, defaultPlan, availableAccounts]);

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

  const accountsToDisplay = (initialPlan?.accounts && initialPlan.accounts.length > 0)
    ? initialPlan.accounts
    : (defaultPlan?.accounts && defaultPlan.accounts.length > 0)
    ? defaultPlan.accounts
    : availableAccounts;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || saving) return;

    const sourcePlan = defaultPlan || initialPlan;

    setSaving(true);
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
        spouseSsMonthlyAmount: parseFloat(String(spouseSsMonthlyAmount)) || 0,
        spouseSsStartAge: parseInt(String(spouseSsStartAge), 10) || 67,
        enableSpousalSsBenefit,
        primarySalary: parseFloat(String(primarySalary)) || 0,
        spouseSalary: parseFloat(String(spouseSalary)) || 0,
        primarySalaryRaisePct,
        spouseSalaryRaisePct,
        primarySalaryYear: new Date().getFullYear(),
        spouseSalaryYear: new Date().getFullYear(),
        primarySsMonthlyAmount: parseFloat(String(primarySsMonthlyAmount)) || 0,
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
    } catch (err) {
      console.error('Wizard save failed', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const steps = [
    { id: 1, title: 'Profile & Tax', icon: Building2 },
    ...(hasSpouse ? [{ id: 2, title: 'Partner Details', icon: Users }] : []),
    { id: 3, title: 'Accounts & Assets', icon: Wallet },
    { id: 4, title: 'Expenses & Income', icon: DollarSign },
    { id: 5, title: 'Strategy & Engine', icon: Sliders },
    { id: 6, title: 'Social Security & FI', icon: ShieldCheck },
  ];

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
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Pills */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.id;
            const isDone = currentStep > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(s.id)}
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
          {currentStep === 1 && (
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
                    onChange={(e) => setPrimarySalary(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
          {currentStep === 2 && hasSpouse && (
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
                    onChange={(e) => setSpouseSalary(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
          {currentStep === 3 && (
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
                    className="text-muted-foreground hover:text-foreground font-semibold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {accountsToDisplay.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                  No accounts found. Default starter accounts will be created for this plan.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-border rounded-xl p-3 bg-muted/10">
                  {accountsToDisplay.map((acc: any) => {
                    const isInc = accountInclusions[acc.id] !== false;
                    const bal = parseFloat(acc.balance) || 0;
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccountInclusion(acc.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isInc
                            ? 'bg-card border-primary/40 shadow-2xs'
                            : 'bg-muted/20 border-transparent opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isInc}
                            onChange={() => {}} // handled by parent container onClick
                            className="w-4 h-4 accent-primary rounded cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold text-foreground block">{acc.name}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {(acc.type || 'account').replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-foreground">
                          ${bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Retirement Expenses & Income Setup (NEW) */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary flex items-center gap-2">
                <DollarSign className="w-4 h-4 shrink-0" />
                <span>Configure baseline living expenses and guaranteed retirement income streams.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Annual Baseline Living Expenses ($/year)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    placeholder="e.g. 60000"
                    value={livingExpenseAmount}
                    onChange={(e) => setLivingExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Estimated annual expenses in retirement (housing, food, travel, lifestyle). Monthly equivalent: ${livingExpenseAmount ? Math.round(Number(livingExpenseAmount) / 12).toLocaleString() : '0'}/mo.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Annual Healthcare Costs ($/year)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    placeholder="e.g. 8400"
                    value={healthcareExpenseAmount}
                    onChange={(e) => setHealthcareExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2 mt-auto">
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Adjust Expenses for Inflation</span>
                    <span className="text-[10px] text-muted-foreground">Compound living expenses by inflation rate</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={livingExpenseAdjustForInflation}
                    onChange={(e) => setLivingExpenseAdjustForInflation(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Pension / Passive Income ($/year)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="e.g. 18000"
                    value={pensionIncomeAmount}
                    onChange={(e) => setPensionIncomeAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Pension Start Age</label>
                  <input
                    type="number"
                    min={40}
                    max={80}
                    value={pensionStartAge}
                    onChange={(e) => setPensionStartAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Strategy & Tax Optimization Engine (NEW) */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary flex items-center gap-2">
                <Sliders className="w-4 h-4 shrink-0" />
                <span>Select drawdown order strategy and configure tax optimization parameters.</span>
              </div>

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
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Primary Monthly SS Benefit ($/month)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={primarySsMonthlyAmount}
                    onChange={(e) => setPrimarySsMonthlyAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Primary SS Claim Age</label>
                  <input
                    type="number"
                    min={62}
                    max={70}
                    value={primarySsStartAge}
                    onChange={(e) => setPrimarySsStartAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

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

                {hasSpouse && (
                  <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3.5 py-2 mt-auto">
                    <div>
                      <span className="text-xs font-semibold text-foreground block">Spousal SS Optimization</span>
                      <span className="text-[10px] text-muted-foreground">Enable spousal benefit rules</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableSpousalSsBenefit}
                      onChange={(e) => setEnableSpousalSsBenefit(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded cursor-pointer"
                    />
                  </div>
                )}
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
                    <span className="text-muted-foreground block">Penalty Withdrawals:</span>
                    <span className="font-bold text-foreground">{allowPenaltyWithdrawals ? 'Allowed' : 'Disabled'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Roth Conversions:</span>
                    <span className="font-bold text-foreground">{enableRothConversions ? `Active (${rothConversionTargetCeiling})` : 'Disabled'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">FI Target (25x):</span>
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
                onClick={() => setCurrentStep((prev) => prev - 1)}
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

              {currentStep < steps.length ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((prev) => prev + 1)}
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
