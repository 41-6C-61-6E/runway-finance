'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Landmark,
  Trash2, X, CheckSquare, Square, Eye, EyeOff,
  Pencil, Save, ChevronDown, ChevronRight, Building2, Zap, HelpCircle,
} from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

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
  const [modalType, setModalType] = useState<'income' | 'expense' | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: 'income' | 'expense'; data: any } | null>(null);
  const [showExcludedAccounts, setShowExcludedAccounts] = useState(false);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [showTaxNotice, setShowTaxNotice] = useState(false);
  const [showIncomeNotice, setShowIncomeNotice] = useState(false);

  // Income Form State
  const [incName, setIncName] = useState('');
  const [incType, setIncType] = useState('salary');
  const [incOwner, setIncOwner] = useState('primary');
  const [incAmount, setIncAmount] = useState('50000');
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
  const [expGrowth, setExpGrowth] = useState('2.5');
  const [expStart, setExpStart] = useState('now');
  const [expStartVal, setExpStartVal] = useState('');
  const [expEnd, setExpEnd] = useState('end_of_plan');
  const [expEndVal, setExpEndVal] = useState('');

  // Section collapsed states
  const [isAccountsCollapsed, setIsAccountsCollapsed] = useCardCollapsed('plan_details_accounts');
  const [isIncomesCollapsed, setIsIncomesCollapsed] = useCardCollapsed('plan_details_incomes');
  const [isExpensesCollapsed, setIsExpensesCollapsed] = useCardCollapsed('plan_details_expenses');

  if (!plan) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">No active plan selected.</p>
      </div>
    );
  }

  const planAccounts = Array.isArray(plan.accounts) ? plan.accounts : [];
  const events = Array.isArray(plan.events) ? plan.events : [];
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
    setExpGrowth(String(exp.growthRate || '2.5'));
    setExpStart(safeString(exp.startTriggerType, 'now'));
    setExpStartVal(String(exp.startTriggerValue || ''));
    setExpEnd(safeString(exp.endTriggerType, 'end_of_plan'));
    setExpEndVal(String(exp.endTriggerValue || ''));
    setModalType('expense');
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
          frequency: 'yearly',
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
          frequency: 'yearly',
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

  const handleDeleteEvent = async (id: string) => {
    await onUpdatePlan({ deleteEventId: id });
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
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Included Portfolio</span>
          <p className="text-xl font-extrabold text-foreground font-mono">{formatCurrency(totalPortfolio)}</p>
          <p className="text-[10px] text-muted-foreground">{includedAccounts.length} of {planAccounts.length} accounts enabled</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Annual Contributions</span>
          <p className="text-xl font-extrabold text-primary font-mono">{formatCurrency(totalContributions)}</p>
          <p className="text-[10px] text-muted-foreground">
            {includedAccounts.filter((a: any) => safeString(a.contributionMode, 'none') !== 'none').length} accounts receiving contributions
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Annual Expenses</span>
          <p className="text-xl font-extrabold text-rose-500 font-mono">{formatCurrency(totalAnnualExpenses)}</p>
          <p className="text-[10px] text-muted-foreground">{expenses.length} defined outflows</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contribution Rate</span>
          <p className={`text-lg font-extrabold font-mono ${savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-amber-500' : 'text-rose-500'}`}>
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">
            {combinedSalary > 0 ? `of ${formatCurrency(combinedSalary)} salary` : 'Set salary in Settings'}
          </p>
        </div>
      </div>

      {/* Accounts Section with Contribution Configuration */}
      {(() => {
        const excludedAccountsCount = planAccounts.length - includedAccounts.length;
        const visibleAccounts = showExcludedAccounts ? planAccounts : includedAccounts;

        return (
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
            <CollapsibleCardHeader
              isCollapsed={isAccountsCollapsed}
              onToggle={setIsAccountsCollapsed}
              title={
                <div className="flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Plan Accounts & Contributions</h3>
                    <p className="text-[11px] text-muted-foreground">Configure how much goes into each account during the accumulation phase.</p>
                  </div>
                </div>
              }
              actions={
                excludedAccountsCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowExcludedAccounts(!showExcludedAccounts)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
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
              <div className="p-5 space-y-3">
                {/* Salary Reminder Banner */}
                {combinedSalary <= 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Set your salary</strong> in Settings → Milestones & Profile to enable percentage-based contributions.
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
                      className={`rounded-xl border transition-all ${
                        isIncluded
                          ? isExpanded
                            ? 'bg-muted/20 border-primary/40 shadow-sm'
                            : 'bg-muted/10 border-border hover:border-primary/30'
                          : 'bg-muted/5 border-border/40 opacity-60'
                      }`}
                    >
                      {/* Account Header Row */}
                      <div className="flex items-center justify-between p-3.5 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleAccount(accId, isIncluded)}
                            className="text-primary hover:scale-110 transition-transform shrink-0 cursor-pointer"
                            title={isIncluded ? 'Exclude from plan' : 'Include in plan'}
                          >
                            {isIncluded ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold block truncate ${isIncluded ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                {accName}
                              </span>
                              {!isIncluded && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500">
                                  <EyeOff className="w-2.5 h-2.5" /> Excluded
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className={`text-[11px] font-medium ${getAccountTypeColor(accType)}`}>
                                {getAccountTypeLabel(accType)}
                              </p>
                              {safeString(acc.owner) === 'spouse' && plan.hasSpouse && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">{plan.spouseName || 'Spouse'}</span>
                              )}
                              {isPreTaxType(accType) && (!acc.rothPercentage || acc.rothPercentage === 0) && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 uppercase tracking-wider">Pre-Tax</span>
                              )}
                              {acc.rothPercentage !== undefined && acc.rothPercentage > 0 && acc.rothPercentage < 100 && (
                                <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
                                  <span>{100 - acc.rothPercentage}% Pre-Tax ({formatCurrency((parseFloat(acc.balance) || 0) * (1 - acc.rothPercentage / 100))})</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-pink-600 dark:text-pink-400 font-bold">{acc.rothPercentage}% Roth ({formatCurrency((parseFloat(acc.balance) || 0) * (acc.rothPercentage / 100))})</span>
                                </span>
                              )}
                              {isSurplus && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 uppercase tracking-wider">Surplus Sweep</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Contribution summary inline */}
                          {isIncluded && contribMode !== 'none' && (
                            <div className="text-right hidden sm:block">
                              <span className="font-mono font-bold text-primary text-xs">
                                +{formatCurrency(totalInflow)}/yr
                              </span>
                              {matchAmt > 0 && (
                                <p className="text-[9px] text-emerald-500 font-medium">incl. {formatCurrency(matchAmt)} match</p>
                              )}
                            </div>
                          )}

                          <span className={`font-mono font-bold ml-1 ${isIncluded ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
                            {formatCurrency(parseFloat(acc.balance) || 0)}
                          </span>

                          {isIncluded && (
                            <button
                              type="button"
                              onClick={() => setExpandedAccountId(isExpanded ? null : accId)}
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all cursor-pointer"
                              title="Configure contribution"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Contribution Configuration */}
                      {isExpanded && (
                        <div className="border-t border-border/60 p-4 space-y-3 bg-muted/5">
                          {/* Contribution Mode */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                              <select
                                value={contribMode}
                                onChange={(e) => handleUpdateContribution(accId, { contributionMode: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary font-medium"
                              >
                                <option value="none">No Contribution</option>
                                <option value="percentage">% of Salary</option>
                                <option value="fixed_amount">Fixed $ Amount / Year</option>
                                <option value="maximize">Maximize IRS Limit</option>
                              </select>
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
                                    className={`w-full bg-background border border-border rounded-lg ${contribMode === 'fixed_amount' ? 'pl-7' : 'pl-3'} pr-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary`}
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
                                <div className="flex items-center h-[34px] px-3 rounded-lg bg-muted/40 border border-border">
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
                                        Select which spouse&apos;s salary is used as the base for percentage contributions and employer matches.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <select
                                  value={acc.contributionSalarySource || (safeString(acc.owner) === 'spouse' ? 'spouse' : 'primary')}
                                  onChange={(e) => handleUpdateContribution(accId, { contributionSalarySource: e.target.value })}
                                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary font-medium"
                                >
                                  <option value="primary">Primary Salary ({primarySalary > 0 ? formatCurrency(primarySalary) : 'not set'})</option>
                                  <option value="spouse">{plan.spouseName || 'Spouse'} Salary ({spouseSalary > 0 ? formatCurrency(spouseSalary) : 'not set'})</option>
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Company Match (for employer-sponsored accounts) */}
                          {hasEmployerPlan(accType) && contribMode !== 'none' && (
                            <div className="pt-2 border-t border-border/40">
                              <div className="flex items-center gap-2 mb-2">
                                <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Employer Match</span>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      Pre-tax employer matching contributions deposited into your account (e.g. 100% match up to 6% of salary).
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground">Match Rate</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={acc.companyMatchRate != null ? (parseFloat(acc.companyMatchRate) * 100).toString() : ''}
                                      onChange={(e) => {
                                        const pct = parseFloat(e.target.value) || 0;
                                        handleUpdateContribution(accId, { companyMatchRate: pct / 100 });
                                      }}
                                      placeholder="e.g. 100"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-mono">%</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground">Up to % of Salary</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={acc.companyMatchLimit || ''}
                                      onChange={(e) => handleUpdateContribution(accId, { companyMatchLimit: parseFloat(e.target.value) || 0 })}
                                      placeholder="e.g. 6"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-mono">%</span>
                                  </div>
                                </div>
                                {matchAmt > 0 && (
                                  <div className="space-y-1">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Annual Match</label>
                                    <div className="flex items-center h-[34px] px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                      <span className="text-xs font-mono font-bold text-emerald-500">+{formatCurrency(matchAmt)}/yr</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Roth vs Pre-Tax Split Configuration */}
                          {(accType.includes('401k') || accType.includes('403b') || accType.includes('457') || accType.includes('ira') || accType.includes('retirement')) && (
                            <div className="pt-2 border-t border-border/40 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <label className="text-[11px] font-bold text-foreground uppercase tracking-wider">Roth vs Pre-Tax Split</label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        For mixed retirement accounts (e.g. 401k with both Roth and Traditional balances), set the percentage that is Tax-Free Roth vs Pre-Tax Traditional.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <span className="text-xs font-mono font-bold text-foreground">
                                  <span className="text-purple-600 dark:text-purple-400">{100 - (acc.rothPercentage ?? 0)}% Pre-Tax</span>
                                  <span className="mx-1.5 text-muted-foreground">•</span>
                                  <span className="text-pink-600 dark:text-pink-400">{acc.rothPercentage ?? 0}% Roth</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={acc.rothPercentage ?? 0}
                                  onChange={(e) => handleUpdateContribution(accId, { rothPercentage: parseInt(e.target.value, 10) })}
                                  className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                                />
                                <div className="relative w-24 shrink-0">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={acc.rothPercentage ?? 0}
                                    onChange={(e) => handleUpdateContribution(accId, { rothPercentage: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                                    className="w-full bg-background border border-border rounded-lg pl-2 pr-6 py-1 text-xs font-mono text-foreground text-center"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-mono">%</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Surplus Destination Toggle & Contribution Summary */}
                          <div className="pt-2 border-t border-border/40 space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer text-xs">
                                <input
                                  type="checkbox"
                                  checked={isSurplus}
                                  onChange={(e) => handleUpdateContribution(accId, { isSurplusDestination: e.target.checked })}
                                  className="rounded border-border accent-violet-500"
                                />
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                  Sweep leftover savings here
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3.5 h-3.5 text-violet-400 hover:text-violet-300 transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                        <strong>Surplus Cash Sweep:</strong> During your working years, 100% of any remaining unallocated cash surplus (salary minus taxes, expenses, and set contributions) is automatically saved into this account.
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
                            <p className="text-[10px] text-muted-foreground/70 pl-5">
                              Unallocated net cash flow (after expenses and set contributions) is automatically swept into this account each year during your accumulation phase.
                            </p>
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

      {/* Income Streams Section */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isIncomesCollapsed}
          onToggle={setIsIncomesCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Additional Retirement Income Streams</h3>
                <p className="text-[11px] text-muted-foreground">Pensions, Social Security, Annuities, and Rental/Side Income (Core salary is set in Settings).</p>
              </div>
            </div>
          }
          actions={
            <button
              onClick={openAddIncomeModal}
              className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Income Stream
            </button>
          }
        />

        {!isIncomesCollapsed && (
          <div className="p-5 space-y-3">
            {/* Income Guidance Collapsible Banner */}
            {showIncomeNotice ? (
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-foreground">Income Stream Guidelines:</p>
                    <ul className="list-disc list-inside space-y-0.5 mt-1 text-[11px]">
                      <li><strong>Include:</strong> Pensions, Social Security estimates, annuities, passive rental income, royalties, or side-job wages.</li>
                      <li><strong>Do NOT include:</strong> Primary salary (set in <em>Settings → Profile</em>) or investment account returns/withdrawals (calculated automatically).</li>
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

            <div className="space-y-2">
              {incomes.length === 0 ? (
                <div className="py-4 text-center border border-dashed border-border rounded-lg space-y-1">
                  <p className="text-xs text-muted-foreground italic">No additional or retirement income streams defined yet.</p>
                  <p className="text-[11px] text-muted-foreground/70">Add Pensions, Social Security, or passive income streams for pre/post retirement.</p>
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
                    phaseBadge = { label: `Retirement (${endVal || 'N'} Years)`, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                  } else if (startType === 'now') {
                    phaseBadge = { label: `Next ${endVal || 'N'} Years`, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                  } else if (startType === 'age' && startVal) {
                    const endAge = parseInt(startVal, 10) + (parseInt(endVal, 10) || 0);
                    phaseBadge = { label: `Ages ${startVal}–${endAge}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                  } else {
                    phaseBadge = { label: `${endVal || 'N'} Years Duration`, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
                  }
                } else if (startType === 'retirement' || (startType === 'age' && parseInt(startVal, 10) >= (plan.retirementAge || 60))) {
                  phaseBadge = { label: 'Retirement Phase', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
                } else if (startType === 'age' && startVal) {
                  phaseBadge = { label: `Starts Age ${startVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                } else if (startType === 'year' && startVal) {
                  phaseBadge = { label: `Starts ${startVal}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                }

                return (
                  <div key={incId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-emerald-500/40 transition-all">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{incNameStr}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${phaseBadge.color}`}>
                          {phaseBadge.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                        {incTypeStr === 'salary' ? 'Side Job / Pre-Retirement Wages' : incTypeStr.replace(/_/g, ' ')}
                        {inc.growthRate ? ` • ${inc.growthRate}% annual growth` : ''}
                        {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                        {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} years` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-emerald-500">
                        {formatCurrency(parseFloat(inc.amount) || 0)}/yr
                      </span>
                      <button
                        onClick={() => openEditIncomeModal(inc)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 cursor-pointer"
                        title="Edit Income Stream"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(incId)}
                        className="text-muted-foreground hover:text-rose-500 transition-colors p-1 cursor-pointer"
                        title="Delete Income Stream"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        )}
      </div>

      {/* Expenses Section */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isExpensesCollapsed}
          onToggle={setIsExpensesCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-rose-500" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Retirement Expenses and Outflows</h3>
                <p className="text-[11px] text-muted-foreground">Living expenses, healthcare, housing, and discretionary spending goals.</p>
              </div>
            </div>
          }
          actions={
            <button
              onClick={openAddExpenseModal}
              className="flex items-center gap-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          }
        />

        {!isExpensesCollapsed && (
          <div className="p-5 space-y-3">
            {/* Tax Handling Explanatory Banner (Collapsible) */}
            {showTaxNotice ? (
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-blue-500" />
                  <span>How are taxes handled?</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              {expenses.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                  No expenses defined yet.
                </p>
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
                      phaseBadge = { label: `Next ${endVal} Years`, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
                    } else if (startType === 'age' && startVal) {
                      const endAge = parseInt(startVal, 10) + (parseInt(endVal, 10) || 0);
                      phaseBadge = { label: `Ages ${startVal}–${endAge}`, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
                    } else {
                      phaseBadge = { label: `${endVal} Years Duration`, color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
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
                    <div key={expId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-rose-500/40 transition-all">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{expNameStr}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${phaseBadge.color}`}>
                            {phaseBadge.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                          {expTypeStr.replace(/_/g, ' ')}
                          {exp.growthRate ? ` • ${exp.growthRate}% annual inflation` : ''}
                          {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                          {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} years` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-rose-500">
                          {formatCurrency(parseFloat(exp.amount) || 0)}/yr
                        </span>
                        <button
                          onClick={() => openEditExpenseModal(exp)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1 cursor-pointer"
                          title="Edit Expense"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(expId)}
                          className="text-muted-foreground hover:text-rose-500 transition-colors p-1 cursor-pointer"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
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
                    <select
                      value={incType}
                      onChange={(e) => setIncType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="pension">Pension / Guaranteed Annuity</option>
                      <option value="social_security">Social Security Benefit</option>
                      <option value="passive">Passive / Rental / Business Income</option>
                      <option value="salary">Side Job / Other Pre-Retirement Wages</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Owner</label>
                    <select
                      value={incOwner}
                      onChange={(e) => setIncOwner(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="primary">Primary</option>
                      <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                      <option value="joint">Joint</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Start Condition</label>
                    <select
                      value={incStart}
                      onChange={(e) => setIncStart(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="now">Immediately (Now)</option>
                      <option value="retirement">At Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </select>
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
                    <select
                      value={incEnd}
                      onChange={(e) => setIncEnd(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="end_of_plan">End of Plan (Lifetime)</option>
                      <option value="after_n_years">After N Years (Duration)</option>
                      <option value="retirement">Until Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </select>
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
                    <select
                      value={expType}
                      onChange={(e) => setExpType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="living_expense">General Living Expense</option>
                      <option value="healthcare">Healthcare & Insurance</option>
                      <option value="child_related">Education & Childcare</option>
                      <option value="lump_sum">Lump Sum Discretionary</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Owner</label>
                    <select
                      value={expOwner}
                      onChange={(e) => setExpOwner(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="primary">Primary</option>
                      <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                      <option value="joint">Joint / Shared</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Start Condition</label>
                    <select
                      value={expStart}
                      onChange={(e) => setExpStart(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="now">Immediately (Now)</option>
                      <option value="retirement">At Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </select>
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
                    <select
                      value={expEnd}
                      onChange={(e) => setExpEnd(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="end_of_plan">End of Plan (Lifetime)</option>
                      <option value="after_n_years">After N Years (Duration)</option>
                      <option value="retirement">Until Retirement</option>
                      <option value="age">At Specific Age</option>
                      <option value="year">At Specific Year</option>
                    </select>
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
          </div>
        </div>
      )}
    </div>
  );
}
