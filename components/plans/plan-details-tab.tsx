'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Landmark,
  Trash2, X, PiggyBank, CheckSquare, Square, EyeOff,
  Pencil, Save, Sparkles,
} from 'lucide-react';
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
  const [modalType, setModalType] = useState<'income' | 'expense' | 'flow' | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: 'income' | 'expense' | 'flow'; data: any } | null>(null);

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

  // Flow Form State
  const [flowName, setFlowName] = useState('');
  const [flowTargetAccId, setFlowTargetAccId] = useState('');
  const [flowRuleType, setFlowRuleType] = useState('percentage');
  const [flowRuleValue, setFlowRuleValue] = useState('10.0');
  const [flowRank, setFlowRank] = useState('1');
  const [flowSalarySource, setFlowSalarySource] = useState<'primary' | 'spouse' | 'combined'>('combined');

  // Section collapsed states
  const [isAccountsCollapsed, setIsAccountsCollapsed] = useCardCollapsed('plan_details_accounts');
  const [isIncomesCollapsed, setIsIncomesCollapsed] = useCardCollapsed('plan_details_incomes');
  const [isExpensesCollapsed, setIsExpensesCollapsed] = useCardCollapsed('plan_details_expenses');
  const [isFlowsCollapsed, setIsFlowsCollapsed] = useCardCollapsed('plan_details_flows');

  if (!plan) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">No active plan selected.</p>
      </div>
    );
  }

  const planAccounts = Array.isArray(plan.accounts) ? plan.accounts : [];
  const events = Array.isArray(plan.events) ? plan.events : [];
  const flows = Array.isArray(plan.flows) ? plan.flows : [];
  const incomes = events.filter((e: any) => safeString(e.category) === 'income');
  const expenses = events.filter((e: any) => safeString(e.category) === 'expense');

  // Filter only included accounts for totals
  const includedAccounts = planAccounts.filter((a: any) => a.isIncluded !== false);
  const totalPortfolio = includedAccounts.reduce((sum: number, a: any) => sum + (parseFloat(a.balance) || 0), 0);
  const totalAnnualIncome = incomes.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
  const totalAnnualExpenses = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
  const savingsRate = totalAnnualIncome > 0 ? ((totalAnnualIncome - totalAnnualExpenses) / totalAnnualIncome * 100) : 0;

  const handleToggleAccount = async (accId: string, currentIncluded: boolean) => {
    await onUpdatePlan({
      toggleAccountId: accId,
      isIncluded: !currentIncluded,
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
    setModalType('expense');
  };

  const openEditExpenseModal = (exp: any) => {
    setEditingItem({ type: 'expense', data: exp });
    setExpName(safeString(exp.name));
    setExpType(safeString(exp.type, 'living_expense'));
    setExpOwner(safeString(exp.owner, 'primary'));
    setExpAmount(String(exp.amount || '30000'));
    setExpGrowth(String(exp.growthRate || '2.5'));
    setModalType('expense');
  };

  const openAddFlowModal = () => {
    setEditingItem(null);
    setFlowName('');
    setFlowTargetAccId(planAccounts[0]?.id || '');
    setFlowRuleType('percentage');
    setFlowRuleValue('10.0');
    setFlowRank(String(flows.length + 1));
    setFlowSalarySource('combined');
    setModalType('flow');
  };

  const openEditFlowModal = (fl: any) => {
    setEditingItem({ type: 'flow', data: fl });
    setFlowName(safeString(fl.name));
    setFlowTargetAccId(safeString(fl.targetAccountId, planAccounts[0]?.id || ''));
    setFlowRuleType(safeString(fl.ruleType, 'percentage'));
    setFlowRuleValue(fl.ruleValue !== undefined ? String(fl.ruleValue) : '10.0');
    setFlowRank(String(fl.rank || flows.length + 1));
    setFlowSalarySource(fl.salarySource || 'combined');
    setModalType('flow');
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
        },
      });
    }
    setModalType(null);
    setEditingItem(null);
  };

  const handleSaveFlow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetAcc = planAccounts.find((a: any) => a.id === flowTargetAccId);
    const accName = targetAcc ? safeString(targetAcc.name) : '';
    const defaultName = flowRuleType === 'maximize'
      ? `Max out ${accName || 'Account'}`
      : flowRuleType === 'percentage'
      ? `${flowRuleValue}% Salary to ${accName || 'Account'}`
      : `Save Surplus to ${accName || 'Account'}`;

    const finalName = flowName.trim() || defaultName;

    if (editingItem) {
      await onUpdatePlan({
        updateFlow: {
          id: editingItem.data.id,
          name: finalName,
          targetAccountId: flowTargetAccId,
          ruleType: flowRuleType,
          ruleValue: flowRuleType === 'percentage' ? parseFloat(flowRuleValue) || 0 : undefined,
          salarySource: flowRuleType === 'percentage' ? flowSalarySource : undefined,
          rank: parseInt(flowRank, 10) || 1,
        },
      });
    } else {
      await onUpdatePlan({
        newFlow: {
          name: finalName,
          type: 'invest',
          rank: parseInt(flowRank, 10) || flows.length + 1,
          targetAccountId: flowTargetAccId,
          ruleType: flowRuleType,
          ruleValue: flowRuleType === 'percentage' ? parseFloat(flowRuleValue) || 0 : undefined,
          salarySource: flowRuleType === 'percentage' ? flowSalarySource : undefined,
        },
      });
    }
    setModalType(null);
    setEditingItem(null);
  };

  const handleDeleteEvent = async (id: string) => {
    await onUpdatePlan({ deleteEventId: id });
  };

  const handleDeleteFlow = async (id: string) => {
    await onUpdatePlan({ deleteFlowId: id });
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
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Annual Income Streams</span>
          <p className="text-xl font-extrabold text-emerald-500 font-mono">{formatCurrency(totalAnnualIncome)}</p>
          <p className="text-[10px] text-muted-foreground">{incomes.length} active streams</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Annual Expenses</span>
          <p className="text-xl font-extrabold text-rose-500 font-mono">{formatCurrency(totalAnnualExpenses)}</p>
          <p className="text-[10px] text-muted-foreground">{expenses.length} defined outflows</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Baseline Savings Rate</span>
          <p className={`text-lg font-extrabold font-mono ${savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-amber-500' : 'text-rose-500'}`}>
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(totalAnnualIncome - totalAnnualExpenses)}/yr saved</p>
        </div>
      </div>

      {/* Accounts Section with Inclusion Checkboxes */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isAccountsCollapsed}
          onToggle={setIsAccountsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Plan Accounts</h3>
              <span className="text-xs text-muted-foreground">
                ({includedAccounts.length}/{planAccounts.length} selected)
              </span>
            </div>
          }
        />

        {!isAccountsCollapsed && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {planAccounts.map((acc: any, i: number) => {
                const accName = safeString(acc.name, 'Account');
                const accId = safeString(acc.id, `acc_${i}`);
                const isIncluded = acc.isIncluded !== false;

                return (
                  <div
                    key={accId}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                      isIncluded
                        ? 'bg-muted/30 border-border hover:border-primary/40'
                        : 'bg-muted/10 border-border/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAccount(accId, isIncluded)}
                        className="text-primary hover:scale-110 transition-transform shrink-0 cursor-pointer"
                        title={isIncluded ? 'Uncheck to exclude from plan' : 'Check to include in plan'}
                      >
                        {isIncluded ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <span className={`font-bold block truncate ${isIncluded ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                          {accName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[11px] font-medium ${getAccountTypeColor(acc.type)}`}>
                            {getAccountTypeLabel(acc.type)}
                          </p>
                          {!isIncluded && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500">
                              <EyeOff className="w-2.5 h-2.5" /> Excluded
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className={`font-mono font-bold ml-2 shrink-0 ${isIncluded ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
                      {formatCurrency(parseFloat(acc.balance) || 0)}
                    </span>
                  </div>
                );
              })}

              {planAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground italic col-span-full py-3 text-center border border-dashed border-border rounded-lg">
                  No accounts. Create a new plan to auto-populate from your linked accounts.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Incomes Section */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isIncomesCollapsed}
          onToggle={setIsIncomesCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Income Streams</h3>
              <span className="text-xs text-muted-foreground">({incomes.length} active)</span>
            </div>
          }
          actions={
            <button
              onClick={openAddIncomeModal}
              className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Income
            </button>
          }
        />

        {!isIncomesCollapsed && (
          <div className="p-5 space-y-2">
            {incomes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                No income streams defined yet.
              </p>
            ) : (
              incomes.map((inc: any, i: number) => {
                const incName = safeString(inc.name, 'Income Stream');
                const incId = safeString(inc.id, `inc_${i}`);
                const incTypeStr = safeString(inc.type);
                const startType = safeString(inc.startTriggerType);
                const startVal = safeString(inc.startTriggerValue);
                const endType = safeString(inc.endTriggerType);
                const endVal = safeString(inc.endTriggerValue);

                return (
                  <div key={incId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-emerald-500/40 transition-all">
                    <div>
                      <span className="font-bold text-foreground">{incName}</span>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {incTypeStr.replace(/_/g, ' ')}
                        {inc.growthRate ? ` • ${inc.growthRate}% annual growth` : ''}
                        {startType === 'age' && startVal ? ` • Starts Age ${startVal}` : ''}
                        {endType === 'retirement' ? ' • Until Retirement' : ''}
                        {endType === 'age' && endVal ? ` • Until Age ${endVal}` : ''}
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
              <h3 className="text-sm font-bold text-foreground">Expenses</h3>
              <span className="text-xs text-muted-foreground">({expenses.length} active)</span>
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
          <div className="p-5 space-y-2">
            {expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                No expenses defined yet.
              </p>
            ) : (
              expenses.map((exp: any, i: number) => {
                const expName = safeString(exp.name, 'Expense');
                const expId = safeString(exp.id, `exp_${i}`);
                const expTypeStr = safeString(exp.type);

                return (
                  <div key={expId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-rose-500/40 transition-all">
                    <div>
                      <span className="font-bold text-foreground">{expName}</span>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {expTypeStr.replace(/_/g, ' ')}
                        {exp.growthRate ? ` • ${exp.growthRate}% annual inflation` : ''}
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
        )}
      </div>

      {/* Prioritized Flows Section */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isFlowsCollapsed}
          onToggle={setIsFlowsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Savings Priority Waterfall</h3>
                <p className="text-[11px] text-muted-foreground">Designate percentage of salary or rules to fund plan accounts during accumulation phase.</p>
              </div>
            </div>
          }
          actions={
            <button
              onClick={openAddFlowModal}
              className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          }
        />

        {!isFlowsCollapsed && (
          <div className="p-5 space-y-2">
            {flows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                No savings rules configured yet. Click "+ Add Rule" above to set salary contribution percentages or rules for your accounts during accumulation.
              </p>
            ) : (
              flows.map((fl: any, i: number) => {
                const flName = safeString(fl.name, 'Savings Rule');
                const flId = safeString(fl.id, `fl_${i}`);
                const ruleType = safeString(fl.ruleType);
                const targetAcc = planAccounts.find((a: any) => a.id === fl.targetAccountId);
                const targetAccName = targetAcc ? safeString(targetAcc.name) : 'Unassigned Account';
                const targetAccType = targetAcc ? safeString(targetAcc.type) : '';

                const isPreTax = targetAccType === 'traditional_401k' || targetAccType === 'traditional_ira' || targetAccType === 'hsa';

                let detailText = `Rule: ${ruleType.replace(/_/g, ' ')}`;
                let estAmtText = '';

                if (ruleType === 'percentage' && fl.ruleValue) {
                  const pct = parseFloat(fl.ruleValue) || 0;
                  detailText = `${pct}% of Salary`;
                  if (totalAnnualIncome > 0) {
                    estAmtText = `${formatCurrency((totalAnnualIncome * pct) / 100)}/yr`;
                  }
                } else if (ruleType === 'maximize') {
                  detailText = 'Maximize IRS Statutory Limit';
                } else if (ruleType === 'save_leftover') {
                  detailText = 'Save Surplus Unallocated Cash';
                }

                return (
                  <div key={flId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-primary/40 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-xs shrink-0">
                        #{fl.rank || i + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{flName}</span>
                          {isPreTax ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 uppercase tracking-wider">Pre-Tax</span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 uppercase tracking-wider">Post-Tax</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Target: <span className="font-medium text-foreground">{targetAccName}</span> • {detailText}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {estAmtText && (
                        <span className="font-mono font-bold text-primary text-xs">
                          {estAmtText}
                        </span>
                      )}
                      <button
                        onClick={() => openEditFlowModal(fl)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 cursor-pointer"
                        title="Edit Rule"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFlow(flId)}
                        className="text-muted-foreground hover:text-rose-500 transition-colors p-1 cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
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
                      <option value="salary">Salary / Wages</option>
                      <option value="passive">Passive / Business</option>
                      <option value="pension">Pension</option>
                      <option value="social_security">Social Security</option>
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
                      <option value="age">At Specific Age</option>
                    </select>
                    {incStart === 'age' && (
                      <input
                        type="number"
                        placeholder="e.g. 67"
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
                      <option value="retirement">Until Retirement</option>
                      <option value="end_of_plan">End of Plan (Lifetime)</option>
                      <option value="age">At Specific Age</option>
                    </select>
                    {incEnd === 'age' && (
                      <input
                        type="number"
                        placeholder="e.g. 65"
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

            {modalType === 'flow' && (
              <form onSubmit={handleSaveFlow} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Rule Name</label>
                  <input
                    type="text"
                    placeholder="e.g. 15% Salary to 401(k), Max Out Roth IRA"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Target Plan Account</label>
                  <select
                    value={flowTargetAccId}
                    onChange={(e) => setFlowTargetAccId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  >
                    {planAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {safeString(acc.name)} ({getAccountTypeLabel(acc.type)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Rule Strategy</label>
                    <select
                      value={flowRuleType}
                      onChange={(e) => setFlowRuleType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                    >
                      <option value="percentage">Percentage of Salary</option>
                      <option value="maximize">Maximize Annual Limit</option>
                      <option value="save_leftover">Save Leftover Surplus</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Priority Waterfall Rank</label>
                    <input
                      type="number"
                      min="1"
                      value={flowRank}
                      onChange={(e) => setFlowRank(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                    />
                  </div>
                </div>
                {flowRuleType === 'percentage' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Salary Percentage (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="e.g. 15.0"
                        value={flowRuleValue}
                        onChange={(e) => setFlowRuleValue(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1 font-mono"
                      />
                    </div>
                    {Boolean(plan.hasSpouse) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Salary Base</label>
                        <select
                          value={flowSalarySource}
                          onChange={(e: any) => setFlowSalarySource(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                        >
                          <option value="combined">Combined Household Salary</option>
                          <option value="primary">Primary Salary Only</option>
                          <option value="spouse">{plan.spouseName || 'Spouse'} Salary Only</option>
                        </select>
                      </div>
                    )}
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
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editingItem ? 'Save Changes' : 'Add Rule'}</span>
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
