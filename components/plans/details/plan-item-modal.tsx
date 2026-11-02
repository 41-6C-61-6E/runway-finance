'use client';

import React from 'react';
import { X, Save } from 'lucide-react';
import { ModalBackdrop } from '@/components/ui/modal-overlay';
import { Select } from '@/components/ui/select';

export interface PlanItemModalProps {
  modalType: 'income' | 'expense' | 'liability' | null;
  onClose: () => void;
  editingItem: { type: 'income' | 'expense' | 'liability'; data?: unknown } | null;
  plan: { spouseName?: string; hasPartner?: boolean };
  incomeForm: {
    incName: string;
    setIncName: (v: string) => void;
    incType: string;
    setIncType: (v: string) => void;
    incOwner: string;
    setIncOwner: (v: string) => void;
    incAmount: string;
    setIncAmount: (v: string) => void;
    incFrequency: 'yearly' | 'monthly';
    setIncFrequency: (v: 'yearly' | 'monthly') => void;
    incGrowth: string;
    setIncGrowth: (v: string) => void;
    incStart: string;
    setIncStart: (v: string) => void;
    incStartVal: string;
    setIncStartVal: (v: string) => void;
    incEnd: string;
    setIncEnd: (v: string) => void;
    incEndVal: string;
    setIncEndVal: (v: string) => void;
    handleSaveIncome: (e: React.FormEvent) => void;
  };
  expenseForm: {
    expName: string;
    setExpName: (v: string) => void;
    expType: string;
    setExpType: (v: string) => void;
    expOwner: string;
    setExpOwner: (v: string) => void;
    expAmount: string;
    setExpAmount: (v: string) => void;
    expFrequency: 'yearly' | 'monthly';
    setExpFrequency: (v: 'yearly' | 'monthly') => void;
    expGrowth: string;
    setExpGrowth: (v: string) => void;
    expStart: string;
    setExpStart: (v: string) => void;
    expStartVal: string;
    setExpStartVal: (v: string) => void;
    expEnd: string;
    setExpEnd: (v: string) => void;
    expEndVal: string;
    setExpEndVal: (v: string) => void;
    handleSaveExpense: (e: React.FormEvent) => void;
  };
  liabilityForm: {
    liabName: string;
    setLiabName: (v: string) => void;
    liabOwner: string;
    setLiabOwner: (v: string) => void;
    liabBalance: string;
    setLiabBalance: (v: string) => void;
    liabInterestRate: string;
    setLiabInterestRate: (v: string) => void;
    liabMonthlyPayment: string;
    setLiabMonthlyPayment: (v: string) => void;
    liabYearsRemaining: string;
    setLiabYearsRemaining: (v: string) => void;
    handleSaveLiability: (e: React.FormEvent) => void;
  };
}

export function PlanItemModal({
  modalType,
  onClose,
  editingItem,
  plan,
  incomeForm,
  expenseForm,
  liabilityForm,
}: PlanItemModalProps) {
  if (!modalType) return null;

  return (
    <ModalBackdrop className="bg-black/70" onClose={onClose}>
      <div className="!bg-slate-900 !text-slate-100 border-2 border-slate-700/80 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200 z-50">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100 capitalize">
            {editingItem ? `Edit ${modalType}` : `Add New ${modalType}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {modalType === 'income' && (
          <form onSubmit={incomeForm.handleSaveIncome} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Stream Name</label>
              <input
                type="text"
                placeholder="e.g. Primary Salary, Side Business, Pension"
                value={incomeForm.incName}
                onChange={(e) => incomeForm.setIncName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Type</label>
                <Select
                  value={incomeForm.incType}
                  onChange={(e) => incomeForm.setIncType(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="salary">Salary / Wages</option>
                  <option value="side_business">Business / 1099</option>
                  <option value="pension">Pension</option>
                  <option value="annuity">Annuity</option>
                  <option value="rental">Rental Income</option>
                  <option value="inheritance">Inheritance / Windfall</option>
                  <option value="other">Other Income</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Owner</label>
                <Select
                  value={incomeForm.incOwner}
                  onChange={(e) => incomeForm.setIncOwner(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="primary">Primary</option>
                  <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                  <option value="joint">Joint / Shared</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Amount ($)</label>
                <input
                  type="number"
                  placeholder="50000"
                  value={incomeForm.incAmount}
                  onChange={(e) => incomeForm.setIncAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Frequency</label>
                <Select
                  value={incomeForm.incFrequency}
                  onChange={(e) => incomeForm.setIncFrequency(e.target.value as 'yearly' | 'monthly')}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="yearly">Per Year</option>
                  <option value="monthly">Per Month</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300">Annual Growth / Escalation (%)</label>
              <input
                type="number"
                step="0.1"
                placeholder="3.0"
                value={incomeForm.incGrowth}
                onChange={(e) => incomeForm.setIncGrowth(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
              />
              <span className="text-[10px] text-slate-400">Rate at which this income stream grows each year</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300">Starts When?</label>
                <Select
                  value={incomeForm.incStart}
                  onChange={(e) => incomeForm.setIncStart(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="now">Immediately</option>
                  <option value="retirement">At Retirement</option>
                  <option value="age">At Age...</option>
                  <option value="year">In Year...</option>
                </Select>
                {(incomeForm.incStart === 'age' || incomeForm.incStart === 'year') && (
                  <input
                    type="number"
                    placeholder={incomeForm.incStart === 'age' ? 'e.g. 62' : 'e.g. 2030'}
                    value={incomeForm.incStartVal}
                    onChange={(e) => incomeForm.setIncStartVal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1.5"
                    required
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Ends When?</label>
                <Select
                  value={incomeForm.incEnd}
                  onChange={(e) => incomeForm.setIncEnd(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="retirement">At Retirement</option>
                  <option value="end_of_plan">End of Plan (Lifetime)</option>
                  <option value="after_n_years">Duration (# of Years)</option>
                  <option value="age">At Age...</option>
                  <option value="year">In Year...</option>
                </Select>
                {(incomeForm.incEnd === 'age' || incomeForm.incEnd === 'year' || incomeForm.incEnd === 'after_n_years') && (
                  <input
                    type="number"
                    placeholder={incomeForm.incEnd === 'after_n_years' ? 'e.g. 5' : incomeForm.incEnd === 'age' ? 'e.g. 65' : 'e.g. 2035'}
                    value={incomeForm.incEndVal}
                    onChange={(e) => incomeForm.setIncEndVal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1.5"
                    required
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editingItem ? 'Save Changes' : 'Add Stream'}</span>
              </button>
            </div>
          </form>
        )}

        {modalType === 'expense' && (
          <form onSubmit={expenseForm.handleSaveExpense} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Expense Name</label>
              <input
                type="text"
                placeholder="e.g. Housing, Travel, Healthcare, College Tuition"
                value={expenseForm.expName}
                onChange={(e) => expenseForm.setExpName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Type</label>
                <Select
                  value={expenseForm.expType}
                  onChange={(e) => expenseForm.setExpType(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="living_expense">General Living Expense</option>
                  <option value="healthcare">Healthcare / Medical</option>
                  <option value="travel">Travel &amp; Leisure</option>
                  <option value="education">Education / College</option>
                  <option value="housing">Housing / Rent</option>
                  <option value="one_time">One-Time / Lump Sum</option>
                  <option value="other">Other Expense</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Owner</label>
                <Select
                  value={expenseForm.expOwner}
                  onChange={(e) => expenseForm.setExpOwner(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="primary">Primary</option>
                  <option value="spouse">{plan.spouseName || 'Spouse / Partner'}</option>
                  <option value="joint">Joint / Shared</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Amount ($)</label>
                <input
                  type="number"
                  placeholder="30000"
                  value={expenseForm.expAmount}
                  onChange={(e) => expenseForm.setExpAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Frequency</label>
                <Select
                  value={expenseForm.expFrequency}
                  onChange={(e) => expenseForm.setExpFrequency(e.target.value as 'yearly' | 'monthly')}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="yearly">Per Year</option>
                  <option value="monthly">Per Month</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300">Annual Growth / Inflation (%)</label>
              <input
                type="number"
                step="0.1"
                placeholder="2.5"
                value={expenseForm.expGrowth}
                onChange={(e) => expenseForm.setExpGrowth(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
              />
              <span className="text-[10px] text-slate-400">Rate at which this expense increases each year</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300">Starts When?</label>
                <Select
                  value={expenseForm.expStart}
                  onChange={(e) => expenseForm.setExpStart(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="now">Immediately</option>
                  <option value="retirement">At Retirement</option>
                  <option value="age">At Age...</option>
                  <option value="year">In Year...</option>
                </Select>
                {(expenseForm.expStart === 'age' || expenseForm.expStart === 'year') && (
                  <input
                    type="number"
                    placeholder={expenseForm.expStart === 'age' ? 'e.g. 60' : 'e.g. 2028'}
                    value={expenseForm.expStartVal}
                    onChange={(e) => expenseForm.setExpStartVal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1.5"
                    required
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Ends When?</label>
                <Select
                  value={expenseForm.expEnd}
                  onChange={(e) => expenseForm.setExpEnd(e.target.value)}
                  className="rounded-xl border-slate-700 bg-slate-800 px-3 text-xs"
                >
                  <option value="end_of_plan">End of Plan (Lifetime)</option>
                  <option value="retirement">At Retirement</option>
                  <option value="after_n_years">Duration (# of Years)</option>
                  <option value="age">At Age...</option>
                  <option value="year">In Year...</option>
                </Select>
                {(expenseForm.expEnd === 'age' || expenseForm.expEnd === 'year' || expenseForm.expEnd === 'after_n_years') && (
                  <input
                    type="number"
                    placeholder={expenseForm.expEnd === 'after_n_years' ? 'e.g. 4' : expenseForm.expEnd === 'age' ? 'e.g. 75' : 'e.g. 2040'}
                    value={expenseForm.expEndVal}
                    onChange={(e) => expenseForm.setExpEndVal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1.5"
                    required
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-rose-500 hover:bg-rose-600 text-slate-950 px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editingItem ? 'Save Changes' : 'Add Expense'}</span>
              </button>
            </div>
          </form>
        )}

        {modalType === 'liability' && (
          <form onSubmit={liabilityForm.handleSaveLiability} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Liability Name</label>
              <input
                type="text"
                placeholder="e.g. Primary Mortgage, Car Loan, Student Debt"
                value={liabilityForm.liabName}
                onChange={(e) => liabilityForm.setLiabName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Current Balance ($)</label>
                <input
                  type="number"
                  placeholder="250000"
                  value={liabilityForm.liabBalance}
                  onChange={(e) => liabilityForm.setLiabBalance(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="4.5"
                  value={liabilityForm.liabInterestRate}
                  onChange={(e) => liabilityForm.setLiabInterestRate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Monthly Payment ($)</label>
                <input
                  type="number"
                  placeholder="1500"
                  value={liabilityForm.liabMonthlyPayment}
                  onChange={(e) => liabilityForm.setLiabMonthlyPayment(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Years Remaining</label>
                <input
                  type="number"
                  placeholder="25"
                  value={liabilityForm.liabYearsRemaining}
                  onChange={(e) => liabilityForm.setLiabYearsRemaining(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
                  required
                />
              </div>
            </div>
            {plan.hasPartner && (
              <div>
                <label className="text-xs font-semibold text-slate-300">Owner</label>
                <Select
                  value={liabilityForm.liabOwner}
                  onChange={(e) => liabilityForm.setLiabOwner(e.target.value)}
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
                onClick={onClose}
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
    </ModalBackdrop>
  );
}
