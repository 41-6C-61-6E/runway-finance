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
import { ModalBackdrop } from '@/components/ui/modal-overlay';
import {
  PlanItemModal,
  PlanLiabilitiesSection,
  PlanIncomesSection,
  PlanExpensesSection,
  PlanAccountsSection,
} from './details';

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
          {(activeFilter === 'all' || activeFilter === 'accounts') && (
            <PlanAccountsSection
              planAccounts={planAccounts}
              includedAccounts={includedAccounts}
              showExcludedAccounts={showExcludedAccounts}
              setShowExcludedAccounts={setShowExcludedAccounts}
              isAccountsCollapsed={isAccountsCollapsed}
              setIsAccountsCollapsed={setIsAccountsCollapsed}
              expandedAccountId={expandedAccountId}
              setExpandedAccountId={setExpandedAccountId}
              showTaxNotice={showTaxNotice}
              setShowTaxNotice={setShowTaxNotice}
              plan={plan}
              handleToggleAccount={handleToggleAccount}
              handleUpdateContribution={handleUpdateContribution}
            />
          )}

      {/* Debts & Liabilities Section */}
      {(activeFilter === 'all' || activeFilter === 'liabilities') && (
        <PlanLiabilitiesSection
          liabilities={liabilities}
          plan={plan}
          isLiabilitiesCollapsed={isLiabilitiesCollapsed}
          setIsLiabilitiesCollapsed={setIsLiabilitiesCollapsed}
          openAddLiabilityModal={openAddLiabilityModal}
          openEditLiabilityModal={openEditLiabilityModal}
          handleDeleteLiability={handleDeleteLiability}
        />
      )}
        </div>

        {/* Right Column: Incomes & Expenses */}
        <div className="space-y-6">
          {(activeFilter === 'all' || activeFilter === 'incomes') && (
            <PlanIncomesSection
              incomes={incomes}
              plan={plan}
              isIncomesCollapsed={isIncomesCollapsed}
              setIsIncomesCollapsed={setIsIncomesCollapsed}
              showIncomeNotice={showIncomeNotice}
              setShowIncomeNotice={setShowIncomeNotice}
              openAddIncomeModal={openAddIncomeModal}
              openEditIncomeModal={openEditIncomeModal}
              handleDeleteEvent={handleDeleteEvent}
            />
          )}

          {/* Expenses Section */}
          {(activeFilter === 'all' || activeFilter === 'expenses') && (
            <PlanExpensesSection
              expenses={expenses}
              plan={plan}
              isExpensesCollapsed={isExpensesCollapsed}
              setIsExpensesCollapsed={setIsExpensesCollapsed}
              openAddExpenseModal={openAddExpenseModal}
              openEditExpenseModal={openEditExpenseModal}
              handleDeleteEvent={handleDeleteEvent}
            />
          )}
        </div>
      </div>

      <PlanItemModal
        modalType={modalType}
        onClose={() => {
          setModalType(null);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        plan={plan}
        incomeForm={{
          incName,
          setIncName,
          incType,
          setIncType,
          incOwner,
          setIncOwner,
          incAmount,
          setIncAmount,
          incFrequency,
          setIncFrequency,
          incGrowth,
          setIncGrowth,
          incStart,
          setIncStart,
          incStartVal,
          setIncStartVal,
          incEnd,
          setIncEnd,
          incEndVal,
          setIncEndVal,
          handleSaveIncome,
        }}
        expenseForm={{
          expName,
          setExpName,
          expType,
          setExpType,
          expOwner,
          setExpOwner,
          expAmount,
          setExpAmount,
          expFrequency,
          setExpFrequency,
          expGrowth,
          setExpGrowth,
          expStart,
          setExpStart,
          expStartVal,
          setExpStartVal,
          expEnd,
          setExpEnd,
          expEndVal,
          setExpEndVal,
          handleSaveExpense,
        }}
        liabilityForm={{
          liabName,
          setLiabName,
          liabOwner,
          setLiabOwner,
          liabBalance,
          setLiabBalance,
          liabInterestRate,
          setLiabInterestRate,
          liabMonthlyPayment,
          setLiabMonthlyPayment,
          liabYearsRemaining,
          setLiabYearsRemaining,
          handleSaveLiability,
        }}
      />
    </div>
  );
}
