'use client';

import React, { useState } from 'react';
import {
  Plus,
  SlidersHorizontal,
  Star,
  RotateCcw,
  Trash2,
  MoreVertical,
  Check,
  Flame,
  ChevronDown,
} from 'lucide-react';

export interface PlanManagementMenuProps {
  plans: any[];
  selectedPlan: any;
  onSelectPlan: (planId: string) => void;
  onOpenWizardNew: () => void;
  onOpenWizardEdit: (plan: any) => void;
  onSetDefaultPlan: (planId: string) => Promise<void>;
  onResetDefaultPlan: (planId: string) => Promise<void>;
  onOpenDeleteConfirm: (plan: any) => void;
  updating?: boolean;
}

export function PlanManagementMenu({
  plans,
  selectedPlan,
  onSelectPlan,
  onOpenWizardNew,
  onOpenWizardEdit,
  onSetDefaultPlan,
  onResetDefaultPlan,
  onOpenDeleteConfirm,
  updating = false,
}: PlanManagementMenuProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const defaultPlan = plans.find((p) => p.isDefault) || plans[0];
  const isCurrentDefault = selectedPlan?.isDefault || selectedPlan?.id === defaultPlan?.id;

  const handleReset = async () => {
    if (!selectedPlan || resetting) return;
    setResetting(true);
    try {
      await onResetDefaultPlan(selectedPlan.id);
    } catch (err) {
      console.error('Reset plan failed', err);
    } finally {
      setResetting(false);
      setDropdownOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2 shrink-0 relative">
      {updating && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="hidden sm:inline text-[11px]">Updating...</span>
        </div>
      )}

      {/* Plan Selector Dropdown */}
      <div className="relative">
        <select
          value={selectedPlan?.id || ''}
          onChange={(e) => onSelectPlan(e.target.value)}
          className="bg-card border border-border rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary/50 shadow-xs appearance-none cursor-pointer"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.isDefault ? '★ (Default)' : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Default Badge */}
      {isCurrentDefault && (
        <span className="hidden md:inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
          Default Plan
        </span>
      )}

      {/* New Plan Button */}
      <button
        onClick={onOpenWizardNew}
        className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
        title="Create new plan using Setup Wizard"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">New Plan</span>
      </button>

      {/* Plan Management Menu Dropdown Button */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-1 bg-muted/40 hover:bg-muted text-foreground border border-border p-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          title="Plan Actions & Settings"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {dropdownOpen && (
          <>
            {/* Backdrop to dismiss */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />

            {/* Menu Popover */}
            <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-card border border-border rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-[11px] font-bold text-foreground truncate">{selectedPlan?.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isCurrentDefault ? 'Primary Baseline Plan' : 'Scenario Plan'}
                </p>
              </div>

              {/* Re-run Wizard */}
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenWizardEdit(selectedPlan);
                }}
                title="Review and adjust all plan settings (retirement age, accounts, income, expenses, investment flows) in the step-by-step wizard."
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary rounded-xl transition-colors text-left cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Re-run Setup Wizard</span>
              </button>

              {/* Set as Default Plan */}
              {!isCurrentDefault && (
                <button
                  onClick={async () => {
                    setDropdownOpen(false);
                    await onSetDefaultPlan(selectedPlan.id);
                  }}
                  title="Make this the active plan used for projections, dashboards, and the FIRE engine."
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-amber-500/10 hover:text-amber-600 rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Set as Default Plan</span>
                </button>
              )}

              {/* Re-Sync Finances */}
              <button
                onClick={handleReset}
                disabled={resetting}
                title="Re-import your latest linked accounts, paystub salary, and auto-generate income/expense events and investment flows. Overwrites custom changes."
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-blue-500/10 hover:text-blue-600 rounded-xl transition-colors text-left cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${resetting ? 'animate-spin' : ''}`} />
                <span>{resetting ? 'Syncing...' : 'Re-Sync Finances'}</span>
              </button>

              <div className="border-t border-border my-1" />

              {/* Delete Plan */}
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenDeleteConfirm(selectedPlan);
                }}
                title="Permanently remove this plan and all its settings, accounts, events, and flows."
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Delete Plan...</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
