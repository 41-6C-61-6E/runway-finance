'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Plus, ChevronDown, DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle, Flag, SlidersHorizontal, Trash2 } from 'lucide-react';

interface PlanTabProps {
  plan: any;
  onUpdatePlan: (updates: any) => void;
}

export function PlanTab({ plan, onUpdatePlan }: PlanTabProps) {
  const [withdrawalMethod, setWithdrawalMethod] = useState(plan.withdrawalMethod || 'textbook');

  // Events & Flows
  const events = plan.events || [];
  const flows = plan.flows || [];

  const incomes = events.filter((e: any) => e.category === 'income');
  const expenses = events.filter((e: any) => e.category === 'expense');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Settings Accordion Panel (~320px / 4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Plan Configuration</h3>
          </div>

          {/* Textbook Withdrawals */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Withdrawal Method</label>
            <select
              value={withdrawalMethod}
              onChange={(e) => {
                setWithdrawalMethod(e.target.value);
                onUpdatePlan({ withdrawalMethod: e.target.value });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary"
            >
              <option value="textbook">Textbook (Cash → Taxable → Deferred → Roth → HSA)</option>
              <option value="proportional">Proportional Drawdown</option>
              <option value="custom_order">Custom Priorities Order</option>
            </select>
          </div>

          {/* Effective Tax Rate Overrides */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <span className="text-xs font-semibold text-muted-foreground">Effective Tax Rate Overrides</span>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
                <span>Include Local Income Tax</span>
              </label>
              <label className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
                <span>Include Property Taxes</span>
              </label>
            </div>
          </div>

          {/* Spending Definitions */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <span className="text-xs font-semibold text-muted-foreground">Spending Definitions</span>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
                <span>Count Mortgage Principal as Spending</span>
              </label>
              <label className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
                <span>Count Debt Paydowns as Spending</span>
              </label>
            </div>
          </div>

          {/* Estate Settlement Assumptions */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <span className="text-xs font-semibold text-muted-foreground">Estate Assumptions</span>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Heir Flat Tax Rate:</span>
                <span className="font-mono font-bold text-foreground">25%</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Real Estate Liquidation:</span>
                <span className="font-mono font-bold text-foreground">6%</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Probate Drag:</span>
                <span className="font-mono font-bold text-foreground">1%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Content Panel (~8 cols) */}
      <div className="lg:col-span-8 space-y-6">
        {/* Incomes Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Incomes</h3>
              <span className="text-xs text-muted-foreground">({incomes.length} active streams)</span>
            </div>
            <button className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
              <Plus className="w-3.5 h-3.5" />
              Add Income
            </button>
          </div>

          <div className="space-y-2">
            {incomes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">No income streams added yet.</p>
            ) : (
              incomes.map((inc: any) => (
                <div key={inc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-primary/40 transition-all">
                  <div>
                    <span className="font-bold text-foreground">{inc.name}</span>
                    <p className="text-[11px] text-muted-foreground capitalize">{inc.type.replace('_', ' ')} • {inc.owner}</p>
                  </div>
                  <span className="font-mono font-bold text-emerald-500">{formatCurrency(parseFloat(inc.amount) || 0)}/yr</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Expenses Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-rose-500" />
              <h3 className="text-sm font-bold text-foreground">Expenses</h3>
              <span className="text-xs text-muted-foreground">({expenses.length} active categories)</span>
            </div>
            <button className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          </div>

          <div className="space-y-2">
            {expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">No expenses added yet.</p>
            ) : (
              expenses.map((exp: any) => (
                <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs hover:border-primary/40 transition-all">
                  <div>
                    <span className="font-bold text-foreground">{exp.name}</span>
                    <p className="text-[11px] text-muted-foreground capitalize">{exp.type.replace('_', ' ')}</p>
                  </div>
                  <span className="font-mono font-bold text-rose-500">{formatCurrency(parseFloat(exp.amount) || 0)}/yr</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Flows (Cash-Flow Priorities) Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Flows (Savings Priorities)</h3>
              <span className="text-xs text-muted-foreground">({flows.length} rules)</span>
            </div>
            <button className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
              <Plus className="w-3.5 h-3.5" />
              Add Flow Rule
            </button>
          </div>

          <div className="space-y-2">
            {flows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">No savings priorities set.</p>
            ) : (
              flows.map((flow: any, index: number) => (
                <div key={flow.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center">
                      #{index + 1}
                    </span>
                    <div>
                      <span className="font-bold text-foreground">{flow.name}</span>
                      <p className="text-[11px] text-muted-foreground capitalize">{flow.ruleType.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
