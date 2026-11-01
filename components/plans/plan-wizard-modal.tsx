'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ModalBackdrop } from '@/components/ui/modal-overlay';
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
import { Select } from '@/components/ui/select';
import { StepProfile } from './wizard/step-profile';
import { StepPartner } from './wizard/step-partner';
import { StepAccounts } from './wizard/step-accounts';
import { StepExpenses } from './wizard/step-expenses';
import { StepStrategy } from './wizard/step-strategy';
import { StepSocialSecurity } from './wizard/step-social-security';

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
  const [spouseSsMonthlyAmount, setSpouseSsMonthlyAmount] = useState<number | ''>(0);
  const [spouseSsStartAge, setSpouseSsStartAge] = useState<number | ''>(67);
  const [enableSpousalSsBenefit, setEnableSpousalSsBenefit] = useState(true);

  // Form State - Salaries
  const [primarySalary, setPrimarySalary] = useState<number | ''>(0);
  const [spouseSalary, setSpouseSalary] = useState<number | ''>(0);
  const [primarySalaryRaisePct, setPrimarySalaryRaisePct] = useState('3.0');
  const [spouseSalaryRaisePct, setSpouseSalaryRaisePct] = useState('3.0');

  // Form State - SS & FI Target
  const [primarySsMonthlyAmount, setPrimarySsMonthlyAmount] = useState<number | ''>(0);
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
      setSpouseSsMonthlyAmount(0);
      setSpouseSsStartAge(67);
      setEnableSpousalSsBenefit(true);

      setPrimarySalary(0);
      setSpouseSalary(0);
      setPrimarySalaryRaisePct('3.0');
      setSpouseSalaryRaisePct('3.0');
      setPrimarySsMonthlyAmount(0);
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
    const pSsNum = parseFloat(String(primarySsMonthlyAmount));
    const sSsNum = parseFloat(String(spouseSsMonthlyAmount));
    const computedPrimarySs = Number.isFinite(pSsNum) && pSsNum > 0 ? pSsNum : (pSalNum > 0 ? calculateSocialSecurityPIA(pSalNum) : 2500);
    const computedSpouseSs = Number.isFinite(sSsNum) && sSsNum > 0 ? sSsNum : (sSalNum > 0 ? calculateSocialSecurityPIA(sSalNum) : 2000);

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
    <ModalBackdrop className="overflow-y-auto" onClose={onClose}>
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
            <StepProfile
              name={name}
              setName={setName}
              filingStatus={filingStatus}
              handleFilingStatusChange={handleFilingStatusChange}
              hasSpouse={hasSpouse}
              setHasSpouse={setHasSpouse}
              primaryBirthYear={primaryBirthYear}
              setPrimaryBirthYear={setPrimaryBirthYear}
              retirementAge={retirementAge}
              setRetirementAge={setRetirementAge}
              lifeExpectancyAge={lifeExpectancyAge}
              setLifeExpectancyAge={setLifeExpectancyAge}
              primarySalary={primarySalary}
              handlePrimarySalaryChange={handlePrimarySalaryChange}
              primarySalaryRaisePct={primarySalaryRaisePct}
              setPrimarySalaryRaisePct={setPrimarySalaryRaisePct}
              isDefault={isDefault}
              setIsDefault={setIsDefault}
            />
          )}

          {/* STEP 2: Partner Profile & Benefits (Conditional) */}
          {activeKey === 'partner' && (
            <StepPartner
              spouseName={spouseName}
              setSpouseName={setSpouseName}
              spouseBirthYear={spouseBirthYear}
              setSpouseBirthYear={setSpouseBirthYear}
              spouseRetirementAge={spouseRetirementAge}
              setSpouseRetirementAge={setSpouseRetirementAge}
              spouseSalary={spouseSalary}
              handleSpouseSalaryChange={handleSpouseSalaryChange}
              spouseSalaryRaisePct={spouseSalaryRaisePct}
              setSpouseSalaryRaisePct={setSpouseSalaryRaisePct}
            />
          )}

          {/* STEP 3: Accounts & Assets Selection */}
          {activeKey === 'accounts' && (
            <StepAccounts
              accountsToDisplay={accountsToDisplay}
              accountInclusions={accountInclusions}
              toggleAccountInclusion={toggleAccountInclusion}
              handleSelectAllAccounts={handleSelectAllAccounts}
            />
          )}

          {/* STEP 4: Expenses & Passive Income */}
          {activeKey === 'expenses' && (
            <StepExpenses
              livingExpenseAmount={livingExpenseAmount}
              setLivingExpenseAmount={setLivingExpenseAmount}
              healthcareExpenseAmount={healthcareExpenseAmount}
              setHealthcareExpenseAmount={setHealthcareExpenseAmount}
              pensionIncomeAmount={pensionIncomeAmount}
              setPensionIncomeAmount={setPensionIncomeAmount}
            />
          )}

          {/* STEP 5: Strategy & Tax Optimization Engine */}
          {activeKey === 'strategy' && (
            <StepStrategy
              withdrawalMethod={withdrawalMethod}
              setWithdrawalMethod={setWithdrawalMethod}
              allowPenaltyWithdrawals={allowPenaltyWithdrawals}
              setAllowPenaltyWithdrawals={setAllowPenaltyWithdrawals}
              fixedInflationRate={fixedInflationRate}
              setFixedInflationRate={setFixedInflationRate}
              enableRothConversions={enableRothConversions}
              setEnableRothConversions={setEnableRothConversions}
              rothConversionTargetCeiling={rothConversionTargetCeiling}
              setRothConversionTargetCeiling={setRothConversionTargetCeiling}
              avoidIrmaaCliffs={avoidIrmaaCliffs}
              setAvoidIrmaaCliffs={setAvoidIrmaaCliffs}
            />
          )}

          {/* STEP 6: Social Security, FI Target & Summary Review */}
          {activeKey === 'social_security' && (
            <StepSocialSecurity
              primarySalary={primarySalary}
              primarySsMonthlyAmount={primarySsMonthlyAmount}
              setPrimarySsMonthlyAmount={setPrimarySsMonthlyAmount}
              primarySsStartAge={primarySsStartAge}
              setPrimarySsStartAge={setPrimarySsStartAge}
              hasSpouse={hasSpouse}
              spouseName={spouseName}
              spouseSalary={spouseSalary}
              spouseSsMonthlyAmount={spouseSsMonthlyAmount}
              setSpouseSsMonthlyAmount={setSpouseSsMonthlyAmount}
              spouseSsStartAge={spouseSsStartAge}
              setSpouseSsStartAge={setSpouseSsStartAge}
              enableSpousalSsBenefit={enableSpousalSsBenefit}
              setEnableSpousalSsBenefit={setEnableSpousalSsBenefit}
              fiTargetMultiplier={fiTargetMultiplier}
              setFiTargetMultiplier={setFiTargetMultiplier}
              retirementAge={retirementAge}
              livingExpenseAmount={livingExpenseAmount}
              withdrawalMethod={withdrawalMethod}
            />
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
    </ModalBackdrop>
  );
}
