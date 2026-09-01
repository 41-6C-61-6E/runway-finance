'use client';

import { useState } from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Landmark,
  Trash2, X, CheckSquare, Square, Eye, EyeOff,
  Pencil, Save, ChevronDown, ChevronRight, Building2, Zap, HelpCircle, Receipt,
} from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Slider } from '@/components/ui/slider';
import { Select } from '@/components/ui/select';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

import { isFireEligibleAccount } from '@/lib/utils/account-scope';

interface PlanDetailsTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

function safeString(val: any, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val && typeof val === 'object' && val !== null) {
    if (typeof val.decrypted === 'string') return val.decrypted;
    if (typeof val.value === 'string') return val.value;
  }
  return fallback;
}

export function PlanDetailsTab({ plan, onUpdatePlan }: PlanDetailsTabProps) {
  const [modalType, setModalType] = useState<'income' | 'expense' | 'liability' | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: 'income' | 'expense' | 'liability'; data: any } | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'accounts' | 'liabilities' | 'incomes' | 'expenses'>('all');
  const [showExcludedAccounts, setShowExcludedAccounts] = useState(false);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [showTaxNotice, setShowTaxNotice] = useState(false);
  const [showIncomeNotice, setShowIncomeNotice] = useState(false);

  // Income Form State
  const [incName, setIncName] = useState('');
  const [incType, setIncType] = useState('salary');
  const [incOwner, setIncOwner] = useState('primary');
  const [incAmount, setIncAmount] = useState('50000');
  const [incFrequency, setIncFrequency] = useState<'yearly' | 'monthly'>('yearly');
  const [incGrowth, setIncGrowth] = useState('3.0');
  const [incStart, setIncStart] = useState('now');
  const [incStartVal, setIncStartVal] = useState('');
  const [incEnd, setIncEnd] = useState('retirement');
  const [incEndVal, setIncEndVal] = useState('');

  // Expense Form State
  const [expName, setExpName] = useState('');
  const [expType, setExpType] = useState('living_expense');
  const [expOwner, setExpOwner] = useState('primary');
  const [expAmount, setExpAmount] = useState('30000');
  const [expFrequency, setExpFrequency] = useState<'yearly' | 'monthly'>('yearly');
  const [expGrowth, setExpGrowth] = useState('2.5');
  const [expStart, setExpStart] = useState('now');
  const [expStartVal, setExpStartVal] = useState('');
  const [expEnd, setExpEnd] = useState('end_of_plan');
  const [expEndVal, setExpEndVal] = useState('');

  // Liability Form State
  const [liabName, setLiabName] = useState('');
  const [liabOwner, setLiabOwner] = useState('primary');
  const [liabBalance, setLiabBalance] = useState('250000');
  const [liabInterestRate, setLiabInterestRate] = useState('4.5');
  const [liabMonthlyPayment, setLiabMonthlyPayment] = useState('1500');
  const [liabYearsRemaining, setLiabYearsRemaining] = useState('25');

  // Section collapsed states
  const [isAccountsCollapsed, setIsAccountsCollapsed] = useCardCollapsed('plan_details_accounts');
  const [isLiabilitiesCollapsed, setIsLiabilitiesCollapsed] = useCardCollapsed('plan_details_liabilities');
  const [isIncomesCollapsed, setIsIncomesCollapsed] = useCardCollapsed('plan_details_incomes');
  const [isExpensesCollapsed, setIsExpensesCollapsed] = useCardCollapsed('plan_details_expenses');

  if (!plan) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">No active plan selected.</p>
      </div>
    );
  }

  const planAccounts = (Array.isArray(plan.accounts) ? plan.accounts : []).filter(isFireEligibleAccount);
  const events = Array.isArray(plan.events) ? plan.events : [];
  const liabilities = Array.isArray(plan.liabilities) ? plan.liabilities : [];
  const incomes = events.filter((e: any) => safeString(e.category) === 'income');
  const expenses = events.filter((e: any) => safeString(e.category) === 'expense');

  // Filter only included accounts for totals
  const includedAccounts = planAccounts.filter((a: any) => a.isIncluded !== false);
  const totalPortfolio = includedAccounts.reduce((sum: number, a: any) => sum + (parseFloat(a.balance) || 0), 0);
  const totalAnnualIncome = incomes.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
  const totalAnnualExpenses = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);

  // Compute contribution totals from account-level contribution fields
  const primarySalary = parseFloat(plan.primarySalary) || 0;
  const spouseSalary = parseFloat(plan.spouseSalary) || 0;
  const combinedSalary = primarySalary + spouseSalary;

  const getAccountSalary = (acc: any) => {
    const source = acc.contributionSalarySource || (safeString(acc.owner) === 'spouse' ? 'spouse' : 'primary');
    if (source === 'spouse') return spouseSalary > 0 ? spouseSalary : primarySalary;
    return primarySalary > 0 ? primarySalary : combinedSalary;
  };

  const getContributionAmount = (acc: any) => {
    const mode = safeString(acc.contributionMode, 'none');
    if (mode === 'none') return 0;
    const salary = getAccountSalary(acc);
    const val = parseFloat(acc.contributionValue) || 0;
    if (mode === 'percentage') return salary * (val / 100);
    if (mode === 'fixed_amount') return val;
    if (mode === 'maximize') {
      const type = safeString(acc.type);
      if (type.includes('401k')) return 23000;
      if (type === 'hsa') return plan.hasSpouse ? 8300 : 4150;
      return 7000; // IRA default
    }
    return 0;
  };

  const getMatchAmount = (acc: any) => {
    const matchRate = parseFloat(acc.companyMatchRate) || 0;
    const matchLimit = parseFloat(acc.companyMatchLimit) || 0;
    if (matchRate <= 0 || matchLimit <= 0) return 0;
    const salary = getAccountSalary(acc);
    const contrib = getContributionAmount(acc);
    const matchable = Math.min(contrib, salary * (matchLimit / 100));
    return matchable * matchRate;
  };

  const totalContributions = includedAccounts.reduce((sum: number, a: any) => sum + getContributionAmount(a) + getMatchAmount(a), 0);
  const effectiveSalary = combinedSalary > 0 ? combinedSalary : totalAnnualIncome;
  const savingsRate = effectiveSalary > 0 ? (totalContributions / effectiveSalary * 100) : 0;

  const handleToggleAccount = async (accId: string, currentIncluded: boolean) => {
    await onUpdatePlan({
      toggleAccountId: accId,
      isIncluded: !currentIncluded,
    });
  };

  const handleUpdateContribution = async (accId: string, updates: any) => {
    await onUpdatePlan({
      updateAccountContribution: {
        accountId: accId,
        ...updates,
      },
    });
  };

  const openAddIncomeModal = () => {
    setEditingItem(null);
    setIncName('');
    setIncType('salary');
    setIncOwner('primary');
    setIncAmount('50000');
    setIncFrequency('yearly');
    setIncGrowth('3.0');
    setIncStart('now');
    setIncStartVal('');
    setIncEnd('retirement');
    setIncEndVal('');
    setModalType('income');
  };

  const openEditIncomeModal = (inc: any) => {
    setEditingItem({ type: 'income', data: inc });
    setIncName(safeString(inc.name));
    setIncType(safeString(inc.type, 'salary'));
    setIncOwner(safeString(inc.owner, 'primary'));
    setIncAmount(String(inc.amount || '50000'));
    setIncFrequency((inc.frequency as any) || 'yearly');
    setIncGrowth(String(inc.growthRate || '3.0'));
    setIncStart(safeString(inc.startTriggerType, 'now'));
    setIncStartVal(String(inc.startTriggerValue || ''));
    setIncEnd(safeString(inc.endTriggerType, 'retirement'));
    setIncEndVal(String(inc.endTriggerValue || ''));
    setModalType('income');
  };

  const openAddExpenseModal = () => {
    setEditingItem(null);
    setExpName('');
    setExpType('living_expense');
    setExpOwner('primary');
    setExpAmount('30000');
    setExpFrequency('yearly');
    setExpGrowth('2.5');
    setExpStart('now');
    setExpStartVal('');
    setExpEnd('end_of_plan');
    setExpEndVal('');
    setModalType('expense');
  };

  const openEditExpenseModal = (exp: any) => {
    setEditingItem({ type: 'expense', data: exp });
    setExpName(safeString(exp.name));
    setExpType(safeString(exp.type, 'living_expense'));
    setExpOwner(safeString(exp.owner, 'primary'));
    setExpAmount(String(exp.amount || '30000'));
    setExpFrequency((exp.frequency as any) || 'yearly');
    setExpGrowth(String(exp.growthRate || '2.5'));
    setExpStart(safeString(exp.startTriggerType, 'now'));
    setExpStartVal(String(exp.startTriggerValue || ''));
    setExpEnd(safeString(exp.endTriggerType, 'end_of_plan'));
    setExpEndVal(String(exp.endTriggerValue || ''));
    setModalType('expense');
  };

  const openAddLiabilityModal = () => {
    setEditingItem(null);
    setLiabName('');
    setLiabOwner('primary');
    setLiabBalance('250000');
    setLiabInterestRate('4.5');
    setLiabMonthlyPayment('1500');
    setLiabYearsRemaining('25');
    setModalType('liability');
  };

  const openEditLiabilityModal = (liab: any) => {
    setEditingItem({ type: 'liability', data: liab });
    setLiabName(safeString(liab.name));
    setLiabOwner(safeString(liab.owner, 'primary'));
    setLiabBalance(String(liab.balance || '0'));
    setLiabInterestRate(String(liab.interestRate || '4.5'));
    setLiabMonthlyPayment(String(liab.monthlyPayment || '0'));
    setLiabYearsRemaining(String(liab.yearsRemaining || '30'));
    setModalType('liability');
  };

  const handleSaveIncome = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = incName.trim() || (incType === 'salary' ? 'Salary Income' : incType === 'pension' ? 'Pension' : incType === 'social_security' ? 'Social Security Benefit' : 'Additional Income');
    
    if (editingItem) {
      await onUpdatePlan({
        updateEvent: {
          id: editingItem.data.id,
          name: finalName,
          category: 'income',
          type: incType,
          owner: incOwner,
          amount: parseFloat(incAmount) || 0,
          frequency: incFrequency,
          growthRate: parseFloat(incGrowth) || 0,
          startTriggerType: incStart,
          startTriggerValue: incStartVal,
          endTriggerType: incEnd,
          endTriggerValue: incEndVal,
        },
      });
    } else {
      await onUpdatePlan({
        newEvent: {
          name: finalName,
          category: 'income',
          type: incType,
          owner: incOwner,
          amount: parseFloat(incAmount) || 0,
          frequency: incFrequency,
          growthRate: parseFloat(incGrowth) || 0,
          adjustForInflation: true,
          startTriggerType: incStart,
          startTriggerValue: incStartVal,
          endTriggerType: incEnd,
          endTriggerValue: incEndVal,
        },
      });
    }
    setModalType(null);
    setEditingItem(null);
  };

  const handleSaveExpense = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = expName.trim() || 'Annual Expense';

    if (editingItem) {
      await onUpdatePlan({
        updateEvent: {
          id: editingItem.data.id,
          name: finalName,
          category: 'expense',
          type: expType,
          owner: expOwner,
          amount: parseFloat(expAmount) || 0,
          frequency: expFrequency,
          growthRate: parseFloat(expGrowth) || 0,
          startTriggerType: expStart,
          startTriggerValue: expStartVal,
          endTriggerType: expEnd,
          endTriggerValue: expEndVal,
        },
      });
    } else {
      await onUpdatePlan({
        newEvent: {
          name: finalName,
          category: 'expense',
          type: expType,
          owner: expOwner,
          amount: parseFloat(expAmount) || 0,
          frequency: expFrequency,
          growthRate: parseFloat(expGrowth) || 0,
          adjustForInflation: true,
          startTriggerType: expStart,
          startTriggerValue: expStartVal,
          endTriggerType: expEnd,
          endTriggerValue: expEndVal,
        },
      });
    }
    setModalType(null);
    setEditingItem(null);
  };

  const handleSaveLiability = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = liabName.trim() || 'Loan / Mortgage';

    if (editingItem) {
      await onUpdatePlan({
        updateLiability: {
          id: editingItem.data.id,
          name: finalName,
          owner: liabOwner,
          balance: parseFloat(liabBalance) || 0,
          interestRate: parseFloat(liabInterestRate) || 0,
          monthlyPayment: parseFloat(liabMonthlyPayment) || 0,
          yearsRemaining: parseFloat(liabYearsRemaining) || 30,
        },
      });
    } else {
      await onUpdatePlan({
        newLiability: {
          name: finalName,
          owner: liabOwner,
          balance: parseFloat(liabBalance) || 0,
          interestRate: parseFloat(liabInterestRate) || 0,
          monthlyPayment: parseFloat(liabMonthlyPayment) || 0,
          yearsRemaining: parseFloat(liabYearsRemaining) || 30,
        },
      });
    }
    setModalType(null);
    setEditingItem(null);
  };

  const handleDeleteEvent = async (id: string) => {
    await onUpdatePlan({ deleteEventId: id });
  };

  const handleDeleteLiability = async (id: string) => {
    await onUpdatePlan({ deleteLiabilityId: id });
  };

  const getAccountTypeLabel = (typeVal: any) => {
    const type = safeString(typeVal);
    const labels: Record<string, string> = {
      cash: 'Cash / Savings',
      taxable: 'Taxable Brokerage',
      traditional_ira: 'Traditional IRA',
      traditional_401k: 'Traditional 401(k)',
      roth_ira: 'Roth IRA',
      roth_401k: 'Roth 401(k)',
      hsa: 'HSA',
      529: '529 Plan',
      crypto: 'Crypto Assets',
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  const getAccountTypeColor = (typeVal: any) => {
    const type = safeString(typeVal);
    if (type.includes('roth')) return 'text-pink-500';
    if (type.includes('traditional')) return 'text-purple-500';
    if (type.includes('taxable')) return 'text-amber-500';
    if (type.includes('hsa')) return 'text-teal-500';
    return 'text-muted-foreground';
  };

  const isPreTaxType = (type: string) => {
    return type === 'traditional_401k' || type === 'traditional_ira' || type === 'hsa';
  };

  const hasEmployerPlan = (type: string) => {
    return type.includes('401k') || type.includes('403b');
  };

  return (
    <div className="space-y-6">
      {/* Top Details Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Portfolio</span>
            <Landmark className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-xl font-extrabold text-foreground font-mono">{formatCurrency(totalPortfolio)}</p>
          <p className="text-[10px] text-muted-foreground">{includedAccounts.length} of {planAccounts.length} accounts enabled</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Annual Contributions</span>
            <ArrowUpCircle className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xl font-extrabold text-primary font-mono">{formatCurrency(totalContributions)}</p>
          <p className="text-[10px] text-muted-foreground">
            {includedAccounts.filter((a: any) => safeString(a.contributionMode, 'none') !== 'none').length} accounts receiving contributions
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Annual Expenses</span>
            <ArrowDownCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl font-extrabold text-rose-500 font-mono">{formatCurrency(totalAnnualExpenses)}</p>
          <p className="text-[10px] text-muted-foreground">{expenses.length} defined outflows</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Contribution Rate</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <p className={`text-xl font-extrabold font-mono ${savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-amber-500' : 'text-rose-500'}`}>
            {formatPlainPercent(savingsRate)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {combinedSalary > 0 ? `of ${formatCurrency(combinedSalary)} salary` : 'Set salary in Profile'}
          </p>
        </div>
      </div>

      {/* Quick Section Filter Anchor Bar */}
      <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-card border border-border shadow-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Sections
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('accounts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'accounts'
                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Landmark className="w-3.5 h-3.5 text-violet-500" />
            <span>Accounts ({includedAccounts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('liabilities')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'liabilities'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-amber-500" />
            <span>Liabilities ({liabilities.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('incomes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'incomes'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>Incomes ({incomes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('expenses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'expenses'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>Expenses ({expenses.length})</span>
          </button>
        </div>
      </div>

      {/* 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Accounts & Liabilities */}
        <div className="space-y-6">
          {(activeFilter === 'all' || activeFilter === 'accounts') && (() => {
            const excludedAccountsCount = planAccounts.length - includedAccounts.length;
            const visibleAccounts = showExcludedAccounts ? planAccounts : includedAccounts;

            return (
              <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
            <CollapsibleCardHeader
              isCollapsed={isAccountsCollapsed}
              onToggle={setIsAccountsCollapsed}
              title="Plan Accounts & Contributions"
              description="Configure accumulation phase savings into each asset pool"
              icon={Landmark}
              className="px-0 py-0"
              actions={
                excludedAccountsCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowExcludedAccounts(!showExcludedAccounts)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-border bg-background/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  >
                    {showExcludedAccounts ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                        <span>Hide Excluded ({excludedAccountsCount})</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-primary" />
                        <span>Show Excluded ({excludedAccountsCount})</span>
                      </>
                    )}
                  </button>
                ) : null
              }
            />

            {!isAccountsCollapsed && (
              <div className="space-y-3 pt-1">
                {/* Salary Reminder Banner */}
                {combinedSalary <= 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Set your salary</strong> in Profile to enable percentage-based contributions.
                    </span>
                  </div>
                )}

                {visibleAccounts.map((acc: any, i: number) => {
                  const accName = safeString(acc.name, 'Account');
                  const accId = safeString(acc.id, `acc_${i}`);
                  const isIncluded = acc.isIncluded !== false;
                  const isExpanded = expandedAccountId === accId && isIncluded;
                  const accType = safeString(acc.type);
                  const contribMode = safeString(acc.contributionMode, 'none');
                  const contribAmt = getContributionAmount(acc);
                  const matchAmt = getMatchAmount(acc);
                  const totalInflow = contribAmt + matchAmt;
                  const isSurplus = Boolean(acc.isSurplusDestination);

                  return (
                    <div
                      key={accId}
                      className={`@container relative rounded-xl border transition-all duration-200 p-4 sm:p-4.5 shadow-2xs ${
                        isIncluded
                          ? isExpanded
                            ? 'bg-card border-primary/50 shadow-xs ring-1 ring-primary/20'
                            : 'bg-card border-border hover:border-primary/40 hover:bg-card/90'
                          : 'bg-card/40 border-border/40 opacity-60'
                      }`}
                    >
                      {/* Account Card Header & Body */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Checkbox toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleAccount(accId, isIncluded)}
                            className="mt-1 text-primary hover:scale-110 transition-transform shrink-0 cursor-pointer"
                            title={isIncluded ? 'Exclude from plan' : 'Include in plan'}
                          >
                            {isIncluded ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>

                          {/* Account Icon Badge */}
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            accType === 'cash'
                              ? 'bg-cyan-500/10 text-cyan-500'
                              : accType === 'roth_ira' || accType === 'roth_401k'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : isPreTaxType(accType)
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {accType === 'cash' ? (
                              <Building2 className="w-5 h-5" />
                            ) : (
                              <Landmark className="w-5 h-5" />
                            )}
                          </div>

                          {/* Account Info & Badges */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold text-sm truncate ${isIncluded ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                {accName}
                              </span>
                              {!isIncluded && (
                                <span className="inline-flex items-center gap-0.5 text-micro font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider">
                                  <EyeOff className="w-2.5 h-2.5" /> Excluded
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                accType === 'cash'
                                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                                  : accType === 'roth_ira' || accType === 'roth_401k'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : isPreTaxType(accType)
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              }`}>
                                {getAccountTypeLabel(accType)}
                              </span>

                              {safeString(acc.owner) === 'spouse' && plan.hasSpouse && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  {plan.spouseName || 'Spouse'}
                                </span>
                              )}

                              {isPreTaxType(accType) && (!acc.rothPercentage || acc.rothPercentage === 0) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                                  Pre-Tax
                                </span>
                              )}

                              {acc.rothPercentage !== undefined && acc.rothPercentage > 0 && acc.rothPercentage < 100 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
                                  <span>{100 - acc.rothPercentage}% Pre-Tax</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-pink-600 dark:text-pink-400 font-bold">{acc.rothPercentage}% Roth</span>
                                </span>
                              )}

                              {isSurplus && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                                  RMD Sweep
                                </span>
                              )}
                            </div>

                            {/* Sub-metrics strip */}
                            {isIncluded && contribMode !== 'none' && (
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5 flex-wrap">
                                <span className="font-semibold text-primary">
                                  Inflow: +{formatCurrency(totalInflow)}/yr
                                </span>
                                {contribMode === 'percentage' && (
                                  <span>({acc.contributionValue || 0}% of salary)</span>
                                )}
                                {matchAmt > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    • incl. {formatCurrency(matchAmt)} match
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Balance & Configure Action */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground block font-medium">Balance</span>
                            <span className={`font-mono text-sm font-bold block ${isIncluded ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
                              {formatCurrency(parseFloat(acc.balance) || 0)}
                            </span>
                          </div>

                          {isIncluded && (
                            <button
                              type="button"
                              onClick={() => setExpandedAccountId(isExpanded ? null : accId)}
                              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                isExpanded
                                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                  : 'bg-background/50 border-border text-muted-foreground hover:text-foreground hover:bg-background'
                              }`}
                              title={isExpanded ? 'Collapse contribution' : 'Configure contribution'}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Contribution Configuration Drawer */}
                      {isExpanded && (
                        <div className="mt-3.5 pt-3.5 border-t border-border/80 p-4 rounded-xl bg-muted/20 space-y-4">
                          {/* Contribution Mode */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Contribution Mode</label>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      Choose how much money you save into this account each year during your working years before retirement.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <Select
                                value={contribMode}
                                onChange={(e) => handleUpdateContribution(accId, { contributionMode: e.target.value })}
                                className="h-[38px] text-xs font-medium"
                              >
                                <option value="none">No Contribution</option>
                                <option value="percentage">% of Salary</option>
                                <option value="fixed_amount">Fixed $ Amount / Year</option>
                                <option value="maximize">Maximize IRS Limit</option>
                              </Select>
                            </div>

                            {(contribMode === 'percentage' || contribMode === 'fixed_amount') && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {contribMode === 'percentage' ? 'Salary %' : 'Annual Amount ($)'}
                                  </label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        {contribMode === 'percentage'
                                          ? 'Percentage of your annual base salary to deposit into this account each year.'
                                          : 'Fixed dollar amount to contribute each year (compounds with inflation).'
                                        }
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className="relative">
                                  {contribMode === 'fixed_amount' && (
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                                  )}
                                  <input
                                    type="number"
                                    step={contribMode === 'percentage' ? '0.5' : '100'}
                                    value={acc.contributionValue || ''}
                                    onChange={(e) => handleUpdateContribution(accId, { contributionValue: parseFloat(e.target.value) || 0 })}
                                    placeholder={contribMode === 'percentage' ? 'e.g. 15' : 'e.g. 23000'}
                                    className={`w-full bg-background border border-border rounded-lg ${contribMode === 'fixed_amount' ? 'pl-7' : 'pl-3'} pr-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold`}
                                  />
                                  {contribMode === 'percentage' && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {contribMode === 'maximize' && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">IRS Annual Limit</label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Automatically contributes up to the maximum IRS limit ($23,000 for 401k/403b, $7,000 for IRA, $4,150/$8,300 for HSA, plus catch-up if age 50+).
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className="flex items-center h-[38px] px-3 rounded-lg bg-background border border-border">
                                  <span className="text-xs font-mono font-bold text-primary">{formatCurrency(getContributionAmount(acc))}/yr</span>
                                </div>
                              </div>
                            )}

                            {contribMode !== 'none' && plan.hasSpouse && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Salary Source</label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Which salary to use for calculating this contribution. Useful when you and your partner contribute to separate retirement accounts.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <Select
                                  value={acc.contributionSalarySource || (safeString(acc.owner) === 'spouse' ? 'spouse' : 'primary')}
                                  onChange={(e) => handleUpdateContribution(accId, { contributionSalarySource: e.target.value })}
                                  className="h-[38px] text-xs font-medium"
                                >
                                  <option value="primary">Primary Salary ({formatCurrency(primarySalary)})</option>
                                  <option value="spouse">{plan.spouseName || 'Spouse'} Salary ({formatCurrency(spouseSalary)})</option>
                                </Select>
                              </div>
                            )}
                          </div>

                          {/* Employer Match Section (for 401k / employer plans) */}
                          {hasEmployerPlan(accType) && (
                            <div className="pt-2 border-t border-border/40">
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                                Employer Match Settings
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[11px] text-muted-foreground">Match Rate (% of contribution matched)</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="5"
                                      min="0"
                                      max="200"
                                      value={acc.companyMatchRate != null ? acc.companyMatchRate * 100 : ''}
                                      onChange={(e) => handleUpdateContribution(accId, { companyMatchRate: (parseFloat(e.target.value) || 0) / 100 })}
                                      placeholder="e.g. 50 (for 50% match)"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] text-muted-foreground">Match Limit (% of salary)</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="50"
                                      value={acc.companyMatchLimit || ''}
                                      onChange={(e) => handleUpdateContribution(accId, { companyMatchLimit: parseFloat(e.target.value) || 0 })}
                                      placeholder="e.g. 6 (matched up to 6% salary)"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* RMD Sweep Destination Toggle */}
                          <div className="pt-2 border-t border-border/40 space-y-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSurplus}
                                  onChange={(e) => handleUpdateContribution(accId, { isSurplusDestination: e.target.checked })}
                                  className="w-4 h-4 text-primary focus:ring-primary rounded accent-primary cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                  Set as RMD Sweep Destination
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                        <strong>RMD Excess Sweep:</strong> In retirement, mandatory RMD distributions in excess of living expenses and taxes are automatically swept into this account. (During accumulation, only defined contributions are made; unallocated surplus is not swept.)
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </span>
                              </label>

                              {contribMode !== 'none' && (
                                <div className="text-right">
                                  <span className="text-xs font-bold text-foreground">Total Inflow: </span>
                                  <span className="text-xs font-mono font-bold text-primary">{formatCurrency(totalInflow)}/yr</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {visibleAccounts.length === 0 && planAccounts.length > 0 && (
                  <div className="col-span-full py-6 text-center border border-dashed border-border rounded-xl space-y-2">
                    <p className="text-xs text-muted-foreground">
                      All {planAccounts.length} accounts are currently excluded from this plan.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowExcludedAccounts(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Show Excluded Accounts ({planAccounts.length})
                    </button>
                  </div>
                )}

                {planAccounts.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                    No accounts. Create a new plan to auto-populate from your linked accounts.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Debts & Liabilities Section */}
      {(activeFilter === 'all' || activeFilter === 'liabilities') && (
        <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
          <CollapsibleCardHeader
            isCollapsed={isLiabilitiesCollapsed}
            onToggle={setIsLiabilitiesCollapsed}
            title="Debts & Liabilities"
            description="Mortgages, student loans, car loans, and credit card balances"
            icon={Receipt}
            className="px-0 py-0"
            actions={
              <button
                onClick={openAddLiabilityModal}
                className="flex items-center gap-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Liability
              </button>
            }
          />

          {!isLiabilitiesCollapsed && (
            <div className="space-y-3 pt-1">
              <div className="space-y-3">
                {liabilities.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                    <p className="text-xs text-muted-foreground italic">No debts or liabilities defined yet.</p>
                    <p className="text-[11px] text-muted-foreground/70">Add Mortgages, Auto Loans, or Personal Debt to model obligations.</p>
                  </div>
                ) : (
                  liabilities.map((liab: any, i: number) => {
                    const liabNameStr = safeString(liab.name, 'Debt / Liability');
                    const liabId = safeString(liab.id, `liab_${i}`);
                    const balance = parseFloat(liab.balance) || 0;
                    const interest = parseFloat(liab.interestRate) || 0;
                    const monthlyPmt = parseFloat(liab.monthlyPayment) || 0;
                    const yearsRem = parseFloat(liab.yearsRemaining) || 0;

                    return (
                      <div
                        key={liabId}
                        className="@container relative rounded-xl border border-border bg-card hover:border-amber-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* Icon badge */}
                            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                              <Receipt className="w-5 h-5" />
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-foreground truncate">{liabNameStr}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                                  {interest}% APR
                                </span>
                                {yearsRem > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-muted/40 text-muted-foreground border-border">
                                    {yearsRem} yrs remaining
                                  </span>
                                )}
                                {safeString(liab.owner) === 'spouse' && plan.hasSpouse && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                    {plan.spouseName || 'Spouse'}
                                  </span>
                                )}
                              </div>

                              <p className="text-[11px] text-muted-foreground">
                                Monthly Payment: <strong className="text-foreground font-mono">{formatCurrency(monthlyPmt)}/mo</strong> ({formatCurrency(monthlyPmt * 12)}/yr)
                              </p>
                            </div>
                          </div>

                          {/* Right side: Balance and actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block font-medium">Principal</span>
                              <span className="font-mono text-sm font-bold text-amber-500 block">
                                {formatCurrency(balance)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditLiabilityModal(liab)}
                                className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                title="Edit Liability"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLiability(liabId)}
                                className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                                title="Delete Liability"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
        </div>

        {/* Right Column: Incomes & Expenses */}
        <div className="space-y-6">
          {(activeFilter === 'all' || activeFilter === 'incomes') && (
            <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
        <CollapsibleCardHeader
          isCollapsed={isIncomesCollapsed}
          onToggle={setIsIncomesCollapsed}
          title="Additional Retirement Income Streams"
          description="Pensions, Annuities, Rental Income, and Pass-through Cash Flow"
          icon={ArrowUpCircle}
          className="px-0 py-0"
          actions={
            <button
              onClick={openAddIncomeModal}
              className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Income Stream
            </button>
          }
        />

        {!isIncomesCollapsed && (
          <div className="space-y-3 pt-1">
            {/* Income Guidance Collapsible Banner */}
            {showIncomeNotice ? (
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-foreground">Income Stream Guidelines:</p>
                    <ul className="list-disc list-inside space-y-0.5 mt-1 text-[11px]">
                      <li><strong>Include:</strong> Pensions, guaranteed annuities, passive rental income, royalties, or side-job wages.</li>
                      <li><strong>Do NOT include:</strong> Core salary, Social Security (computed automatically in Profile), or portfolio withdrawals.</li>
                    </ul>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncomeNotice(false)}
                  className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 p-0.5 rounded cursor-pointer shrink-0"
                  title="Hide income guide"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowIncomeNotice(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-emerald-500" />
                  <span>What income should be included here?</span>
                </button>
              </div>
            )}

            <div className="space-y-3">
              {incomes.length === 0 ? (
                <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                  <p className="text-xs text-muted-foreground italic">No additional income streams defined yet.</p>
                  <p className="text-[11px] text-muted-foreground/70">Add Pensions, Annuities, or passive income streams.</p>
                </div>
              ) : (
              incomes.map((inc: any, i: number) => {
                const incNameStr = safeString(inc.name, 'Income Stream');
                const incId = safeString(inc.id, `inc_${i}`);
                const incTypeStr = safeString(inc.type);
                const startType = safeString(inc.startTriggerType);
                const startVal = safeString(inc.startTriggerValue);
                const endType = safeString(inc.endTriggerType);
                const endVal = safeString(inc.endTriggerValue);

                // Phase badge logic
                let phaseBadge = { label: 'Lifetime', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                if (endType === 'retirement') {
                  phaseBadge = { label: 'Pre-Retirement Only', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
                } else if (endType === 'after_n_years' || endType === 'duration') {
                  if (startType === 'retirement') {
                    phaseBadge = { label: `Retirement (${endVal || 'N'} Yrs)`, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  } else if (startType === 'now') {
                    phaseBadge = { label: `Next ${endVal || 'N'} Yrs`, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                  } else if (startType === 'age' && startVal) {
                    const endAge = parseInt(startVal, 10) + (parseInt(endVal, 10) || 0);
                    phaseBadge = { label: `Ages ${startVal}–${endAge}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                  } else {
                    phaseBadge = { label: `${endVal || 'N'} Yrs Duration`, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                  }
                } else if (startType === 'retirement' || (startType === 'age' && parseInt(startVal, 10) >= (plan.retirementAge || 60))) {
                  phaseBadge = { label: 'Retirement Phase', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                } else if (startType === 'age' && startVal) {
                  phaseBadge = { label: `Starts Age ${startVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                } else if (startType === 'year' && startVal) {
                  phaseBadge = { label: `Starts ${startVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                }

                return (
                  <div
                    key={incId}
                    className="@container relative rounded-xl border border-border bg-card hover:border-emerald-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Icon badge */}
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                          <ArrowUpCircle className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">{incNameStr}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${phaseBadge.color}`}>
                              {phaseBadge.label}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-muted/40 text-muted-foreground border-border capitalize">
                              {incTypeStr === 'salary' ? 'Side Job' : incTypeStr.replace(/_/g, ' ')}
                            </span>
                            {safeString(inc.owner) === 'spouse' && plan.hasSpouse && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                {plan.spouseName || 'Spouse'}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            {inc.growthRate ? `${inc.growthRate}% annual growth` : 'Fixed amount'}
                            {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                            {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} yrs` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right side: Amount and actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block font-medium">Annual Inflow</span>
                          <span className="font-mono text-sm font-bold text-emerald-500 block">
                            +{formatCurrency(parseFloat(inc.amount) || 0)}/yr
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditIncomeModal(inc)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                            title="Edit Income Stream"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(incId)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete Income Stream"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
        )}
      </div>
    )}

    {/* Expenses Section */}
    {(activeFilter === 'all' || activeFilter === 'expenses') && (
      <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
        <CollapsibleCardHeader
          isCollapsed={isExpensesCollapsed}
          onToggle={setIsExpensesCollapsed}
          title="Retirement Expenses & Outflows"
          description="Living expenses, healthcare, housing, and discretionary goals"
          icon={ArrowDownCircle}
          className="px-0 py-0"
          actions={
            <button
              onClick={openAddExpenseModal}
              className="flex items-center gap-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          }
        />

        {!isExpensesCollapsed && (
          <div className="space-y-3 pt-1">
            {/* Tax Handling Explanatory Banner (Collapsible) */}
            {showTaxNotice ? (
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Taxes are automatically modeled:</strong> Income tax, FICA, capital gains, and IRMAA surcharges are computed by the engine based on IRS tax brackets. Do <em>not</em> include income taxes as manual expenses here.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTaxNotice(false)}
                  className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 p-0.5 rounded cursor-pointer shrink-0"
                  title="Hide tax note"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTaxNotice(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-emerald-500/20 border border-blue-500/20 transition-all cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-blue-500" />
                  <span>How are taxes handled?</span>
                </button>
              </div>
            )}

            <div className="space-y-3">
              {expenses.length === 0 ? (
                <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                  <p className="text-xs text-muted-foreground italic">No expenses defined yet.</p>
                  <p className="text-[11px] text-muted-foreground/70">Add Living Expenses, Healthcare, or Goal Outflows to model retirement spending.</p>
                </div>
              ) : (
                expenses.map((exp: any, i: number) => {
                  const expNameStr = safeString(exp.name, 'Expense');
                  const expId = safeString(exp.id, `exp_${i}`);
                  const expTypeStr = safeString(exp.type);
                  const startType = safeString(exp.startTriggerType, 'now');
                  const startVal = safeString(exp.startTriggerValue);
                  const endType = safeString(exp.endTriggerType, 'end_of_plan');
                  const endVal = safeString(exp.endTriggerValue);

                  // Phase badge logic for expenses
                  let phaseBadge = { label: 'Lifetime Expense', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
                  if (endType === 'retirement') {
                    phaseBadge = { label: 'Pre-Retirement Only', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
                  } else if ((endType === 'after_n_years' || endType === 'duration') && endVal) {
                    if (startType === 'retirement') {
                      const endAge = (plan.retirementAge || 60) + (parseInt(endVal, 10) || 0);
                      phaseBadge = { label: `Early Retirement (${plan.retirementAge || 60}–${endAge})`, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                    } else if (startType === 'now') {
                      phaseBadge = { label: `Next ${endVal} Yrs`, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
                    } else if (startType === 'age' && startVal) {
                      const endAge = parseInt(startVal, 10) + (parseInt(endVal, 10) || 0);
                      phaseBadge = { label: `Ages ${startVal}–${endAge}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                    } else {
                      phaseBadge = { label: `${endVal} Yrs Duration`, color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
                    }
                  } else if (startType === 'retirement' && endType === 'age' && endVal) {
                    phaseBadge = { label: `Early Retirement (${plan.retirementAge || 60}–${endVal})`, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  } else if (startType === 'retirement') {
                    phaseBadge = { label: 'Retirement Phase', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  } else if (startType === 'age' && endType === 'age' && startVal && endVal) {
                    phaseBadge = { label: `Ages ${startVal}–${endVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                  } else if (startType === 'age' && startVal) {
                    const isPostRetirement = parseInt(startVal, 10) >= (plan.retirementAge || 60);
                    phaseBadge = {
                      label: isPostRetirement ? `Retirement (Starts Age ${startVal})` : `Starts Age ${startVal}`,
                      color: isPostRetirement ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-violet-500/10 text-violet-500 border-violet-500/20'
                    };
                  } else if (startType === 'year' && startVal) {
                    phaseBadge = { label: `Starts Year ${startVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                  }

                  return (
                    <div
                      key={expId}
                      className="@container relative rounded-xl border border-border bg-card hover:border-rose-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Icon badge */}
                          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                            <ArrowDownCircle className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground truncate">{expNameStr}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${phaseBadge.color}`}>
                                {phaseBadge.label}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-muted/40 text-muted-foreground border-border capitalize">
                                {expTypeStr.replace(/_/g, ' ')}
                              </span>
                              {safeString(exp.owner) === 'spouse' && plan.hasSpouse && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  {plan.spouseName || 'Spouse'}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                              {exp.growthRate ? `${exp.growthRate}% annual inflation` : 'Fixed amount'}
                              {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                              {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} yrs` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Right side: Amount and actions */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground block font-medium">Annual Outflow</span>
                            <span className="font-mono text-sm font-bold text-rose-500 block">
                              {formatCurrency(parseFloat(exp.amount) || 0)}/yr
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditExpenseModal(exp)}
                              className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-primary hover:bg-muted/60 transition-all cursor-pointer"
                              title="Edit Expense"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(expId)}
                              className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    )}
        </div>
      </div>

      {/* Fully Opaque Add / Edit Modals */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="!bg-slate-900 !text-slate-100 border-2 border-slate-700/80 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200 z-50">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 capitalize">
                {editingItem ? `Edit ${modalType}` : `Add New ${modalType}`}
              </h3>
              <button
                onClick={() => {
                  setModalType(null);
                  setEditingItem(null);
                }}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalType === 'income' && (
              <form onSubmit={handleSaveIncome} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Stream Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Primary Salary, Side Business, Pension"
                    value={incName}
                    onChange={(e) => setIncName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Annual Amount ($)</label>
                    <input
                      type="number"
                      value={incAmount}
                      onChange={(e) => setIncAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Growth Rate (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={incGrowth}
                      onChange={(e) => setIncGrowth(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Category Type</label>
                    <Select
                      value={incType}
                      onChange={(e) => setIncType(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="pension">Pension / Guaranteed Annuity</option>
                      <option value="passive">Passive / Rental / Business Income</option>
                      <option value="salary">Side Job / Other Pre-Retirement Wages</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Owner</label>
                    <Select
                      value={incOwner}
                      onChange={(e) => setIncOwner(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="primary">Primary</option>
                      <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                      <option value="joint">Joint</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Start Condition</label>
                    <Select
                      value={incStart}
                      onChange={(e) => setIncStart(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="now">Immediately (Now)</option>
                      <option value="retirement">At Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </Select>
                    {(incStart === 'age' || incStart === 'year') && (
                      <input
                        type="number"
                        placeholder={incStart === 'year' ? 'e.g. 2030' : 'e.g. 67'}
                        value={incStartVal}
                        onChange={(e) => setIncStartVal(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">End Condition</label>
                    <Select
                      value={incEnd}
                      onChange={(e) => setIncEnd(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="end_of_plan">End of Plan (Lifetime)</option>
                      <option value="after_n_years">After N Years (Duration)</option>
                      <option value="retirement">Until Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </Select>
                    {(incEnd === 'age' || incEnd === 'year' || incEnd === 'after_n_years') && (
                      <input
                        type="number"
                        placeholder={incEnd === 'year' ? 'e.g. 2040' : incEnd === 'after_n_years' ? 'e.g. 10 (years)' : 'e.g. 65'}
                        value={incEndVal}
                        onChange={(e) => setIncEndVal(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalType(null);
                      setEditingItem(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editingItem ? 'Save Changes' : 'Add Stream'}</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'expense' && (
              <form onSubmit={handleSaveExpense} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Expense Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Living Expenses, Healthcare, Housing"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Annual Amount ($)</label>
                    <input
                      type="number"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Inflation Rate (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={expGrowth}
                      onChange={(e) => setExpGrowth(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Category</label>
                    <Select
                      value={expType}
                      onChange={(e) => setExpType(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="living_expense">General Living Expense</option>
                      <option value="healthcare">Healthcare & Insurance</option>
                      <option value="child_related">Education & Childcare</option>
                      <option value="lump_sum">Lump Sum Discretionary</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Owner</label>
                    <Select
                      value={expOwner}
                      onChange={(e) => setExpOwner(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="primary">Primary</option>
                      <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                      <option value="joint">Joint / Shared</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Start Condition</label>
                    <Select
                      value={expStart}
                      onChange={(e) => setExpStart(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="now">Immediately (Now)</option>
                      <option value="retirement">At Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </Select>
                    {(expStart === 'age' || expStart === 'year') && (
                      <input
                        type="number"
                        placeholder={expStart === 'year' ? 'e.g. 2030' : `e.g. ${plan.retirementAge || 60}`}
                        value={expStartVal}
                        onChange={(e) => setExpStartVal(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">End Condition</label>
                    <Select
                      value={expEnd}
                      onChange={(e) => setExpEnd(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="end_of_plan">End of Plan (Lifetime)</option>
                      <option value="after_n_years">After N Years (Duration)</option>
                      <option value="retirement">Until Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </Select>
                    {(expEnd === 'age' || expEnd === 'year' || expEnd === 'after_n_years') && (
                      <input
                        type="number"
                        placeholder={expEnd === 'year' ? 'e.g. 2040' : expEnd === 'after_n_years' ? 'e.g. 10 (years)' : `e.g. ${(plan.retirementAge || 60) + 10}`}
                        value={expEndVal}
                        onChange={(e) => setExpEndVal(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalType(null);
                      setEditingItem(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editingItem ? 'Save Changes' : 'Add Expense'}</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'liability' && (
              <form onSubmit={handleSaveLiability} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Liability / Debt Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Primary Mortgage, Auto Loan, Student Debt"
                    value={liabName}
                    onChange={(e) => setLiabName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Current Balance ($)</label>
                    <input
                      type="number"
                      value={liabBalance}
                      onChange={(e) => setLiabBalance(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Interest Rate (% APR)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={liabInterestRate}
                      onChange={(e) => setLiabInterestRate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Monthly Payment ($)</label>
                    <input
                      type="number"
                      value={liabMonthlyPayment}
                      onChange={(e) => setLiabMonthlyPayment(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Years Remaining</label>
                    <input
                      type="number"
                      step="1"
                      value={liabYearsRemaining}
                      onChange={(e) => setLiabYearsRemaining(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                </div>
                {plan.hasSpouse && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Owner</label>
                    <Select
                      value={liabOwner}
                      onChange={(e) => setLiabOwner(e.target.value)}
                      className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                    >
                      <option value="primary">Primary</option>
                      <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                      <option value="joint">Joint / Shared</option>
                    </Select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalType(null);
                      setEditingItem(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editingItem ? 'Save Changes' : 'Add Liability'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
