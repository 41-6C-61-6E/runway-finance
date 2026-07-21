'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  Plus, ArrowUpCircle, ArrowDownCircle, Landmark,
  Trash2, X, PiggyBank,
} from 'lucide-react';

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

  // New Income Form
  const [incName, setIncName] = useState('');
  const [incType, setIncType] = useState('salary');
  const [incAmount, setIncAmount] = useState('50000');
  const [incStart, setIncStart] = useState('now');
  const [incEnd, setIncEnd] = useState('retirement');

  // New Expense Form
  const [expName, setExpName] = useState('');
  const [expType, setExpType] = useState('living_expense');
  const [expAmount, setExpAmount] = useState('30000');

  // New Flow Form
  const [flowName, setFlowName] = useState('');
  const [flowRuleType, setFlowRuleType] = useState('save_leftover');

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

  // Summary metrics
  const totalPortfolio = planAccounts.reduce((sum: number, a: any) => sum + (parseFloat(a.balance) || 0), 0);
  const totalAnnualIncome = incomes.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
  const totalAnnualExpenses = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
  const savingsRate = totalAnnualIncome > 0 ? ((totalAnnualIncome - totalAnnualExpenses) / totalAnnualIncome * 100) : 0;

  const handleAddIncome = async () => {
    if (!incName.trim()) return;
    await onUpdatePlan({
      newEvent: {
        name: incName,
        category: 'income',
        type: incType,
        owner: 'primary',
        amount: parseFloat(incAmount) || 0,
        frequency: 'yearly',
        growthRate: 3.0,
        adjustForInflation: true,
        startTriggerType: incStart,
        endTriggerType: incEnd,
      },
    });
    setIncName('');
    setIncAmount('50000');
    setModalType(null);
  };

  const handleAddExpense = async () => {
    if (!expName.trim()) return;
    await onUpdatePlan({
      newEvent: {
        name: expName,
        category: 'expense',
        type: expType,
        owner: 'primary',
        amount: parseFloat(expAmount) || 0,
        frequency: 'yearly',
        growthRate: 2.5,
        adjustForInflation: true,
        startTriggerType: 'now',
        endTriggerType: 'end_of_plan',
      },
    });
    setExpName('');
    setExpAmount('30000');
    setModalType(null);
  };

  const handleAddFlow = async () => {
    if (!flowName.trim()) return;
    await onUpdatePlan({
      newFlow: {
        name: flowName,
        type: 'invest',
        rank: flows.length + 1,
        ruleType: flowRuleType,
      },
    });
    setFlowName('');
    setModalType(null);
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
      crypto: 'Crypto',
    };
    return labels[type] || type || 'Account';
  };

  const getAccountTypeColor = (typeVal: any) => {
    const type = safeString(typeVal);
    if (type.includes('roth')) return 'text-emerald-500';
    if (type.includes('traditional') || type.includes('401k')) return 'text-blue-500';
    if (type === 'hsa') return 'text-purple-500';
    if (type === 'cash') return 'text-amber-500';
    return 'text-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Portfolio</span>
          <p className="text-lg font-extrabold text-foreground font-mono">{formatCurrency(totalPortfolio)}</p>
          <p className="text-[10px] text-muted-foreground">{planAccounts.length} accounts</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Annual Income</span>
          <p className="text-lg font-extrabold text-emerald-500 font-mono">{formatCurrency(totalAnnualIncome)}</p>
          <p className="text-[10px] text-muted-foreground">{incomes.length} streams</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Annual Expenses</span>
          <p className="text-lg font-extrabold text-rose-500 font-mono">{formatCurrency(totalAnnualExpenses)}</p>
          <p className="text-[10px] text-muted-foreground">{expenses.length} categories</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Savings Rate</span>
          <p className={`text-lg font-extrabold font-mono ${savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-amber-500' : 'text-rose-500'}`}>
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(totalAnnualIncome - totalAnnualExpenses)}/yr saved</p>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Plan Accounts</h3>
          <span className="text-xs text-muted-foreground">({planAccounts.length} mirrored from your accounts)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {planAccounts.map((acc: any, i: number) => {
            const accName = safeString(acc.name, 'Account');
            const accId = safeString(acc.id, `acc_${i}`);
            return (
              <div key={accId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-primary/40 transition-all">
                <div className="min-w-0">
                  <span className="font-bold text-foreground block truncate">{accName}</span>
                  <p className={`text-[11px] font-medium ${getAccountTypeColor(acc.type)}`}>
                    {getAccountTypeLabel(acc.type)}
                  </p>
                </div>
                <span className="font-mono font-bold text-foreground ml-3 shrink-0">
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

      {/* Incomes Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-bold text-foreground">Income Streams</h3>
            <span className="text-xs text-muted-foreground">({incomes.length} active)</span>
          </div>
          <button
            onClick={() => setModalType('income')}
            className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Income
          </button>
        </div>

        <div className="space-y-2">
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
                      {startType === 'age' && startVal ? ` • Starts Age ${startVal}` : ''}
                      {endType === 'retirement' ? ' • Until Retirement' : ''}
                      {endType === 'age' && endVal ? ` • Until Age ${endVal}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-emerald-500">
                      {formatCurrency(parseFloat(inc.amount) || 0)}/yr
                    </span>
                    <button onClick={() => handleDeleteEvent(incId)} className="text-muted-foreground hover:text-rose-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Expenses Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-foreground">Expenses</h3>
            <span className="text-xs text-muted-foreground">({expenses.length} active)</span>
          </div>
          <button
            onClick={() => setModalType('expense')}
            className="flex items-center gap-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Expense
          </button>
        </div>

        <div className="space-y-2">
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
                    <p className="text-[11px] text-muted-foreground capitalize">{expTypeStr.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-rose-500">
                      {formatCurrency(parseFloat(exp.amount) || 0)}/yr
                    </span>
                    <button onClick={() => handleDeleteEvent(expId)} className="text-muted-foreground hover:text-rose-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Flows Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Savings Priorities</h3>
            <span className="text-xs text-muted-foreground">({flows.length} rules)</span>
          </div>
          <button
            onClick={() => setModalType('flow')}
            className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Flow Rule
          </button>
        </div>

        <div className="space-y-2">
          {flows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
              No savings priorities set.
            </p>
          ) : (
            flows.map((flow: any, index: number) => {
              const flowName = safeString(flow.name, 'Flow Rule');
              const flowId = safeString(flow.id, `flow_${index}`);
              const ruleTypeStr = safeString(flow.ruleType);

              return (
                <div key={flowId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                      #{index + 1}
                    </span>
                    <div>
                      <span className="font-bold text-foreground">{flowName}</span>
                      <p className="text-[11px] text-muted-foreground capitalize">{ruleTypeStr.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteFlow(flowId)} className="text-muted-foreground hover:text-rose-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Income Modal */}
      {modalType === 'income' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Add Income Stream</h3>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Name</label>
                <input type="text" value={incName} onChange={(e) => setIncName(e.target.value)} placeholder="e.g. Primary Salary" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Type</label>
                <select value={incType} onChange={(e) => setIncType(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                  <option value="salary">Salary / Wages</option>
                  <option value="pension">Pension</option>
                  <option value="social_security">Social Security</option>
                  <option value="rental">Rental Income</option>
                  <option value="other">Other Income</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Annual Amount ($)</label>
                <input type="number" value={incAmount} onChange={(e) => setIncAmount(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground font-mono focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Starts</label>
                  <select value={incStart} onChange={(e) => setIncStart(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                    <option value="now">Now</option>
                    <option value="retirement">At Retirement</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Ends</label>
                  <select value={incEnd} onChange={(e) => setIncEnd(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                    <option value="retirement">At Retirement</option>
                    <option value="end_of_plan">End of Plan</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setModalType(null)} className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddIncome} className="px-5 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 transition-colors">Save Income</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {modalType === 'expense' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Add Expense Category</h3>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Name</label>
                <input type="text" value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="e.g. Healthcare" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Type</label>
                <select value={expType} onChange={(e) => setExpType(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                  <option value="living_expense">Living Expenses</option>
                  <option value="healthcare">Healthcare / Medical</option>
                  <option value="travel">Travel & Discretionary</option>
                  <option value="debt">Debt Payment</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Annual Amount ($)</label>
                <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground font-mono focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setModalType(null)} className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddExpense} className="px-5 py-2 bg-rose-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-rose-600 transition-colors">Save Expense</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Flow Modal */}
      {modalType === 'flow' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Add Savings Flow Rule</h3>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Name</label>
                <input type="text" value={flowName} onChange={(e) => setFlowName(e.target.value)} placeholder="e.g. Max Roth IRA" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Strategy</label>
                <select value={flowRuleType} onChange={(e) => setFlowRuleType(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                  <option value="save_leftover">Save Leftover Cash</option>
                  <option value="maximize">Maximize Account Contribution</option>
                  <option value="percentage">Percentage of Income</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setModalType(null)} className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddFlow} className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow-sm hover:bg-primary/90 transition-colors">Save Flow Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
