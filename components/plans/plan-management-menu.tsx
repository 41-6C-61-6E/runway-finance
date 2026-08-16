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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';


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
          className="bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none shadow-xs appearance-none cursor-pointer"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* New Plan Button */}
      <button
        onClick={onOpenWizardNew}
        className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-xs cursor-pointer"
        title="Create new plan using Setup Wizard"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">New Plan</span>
      </button>

      {/* Plan Management Menu Dropdown Button */}
      <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Plan Actions & Settings"
            className="flex items-center gap-1 bg-muted/40 hover:bg-muted text-foreground border border-border p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-56 p-1.5 space-y-1 rounded-xl shadow-xl border-border bg-card">
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-[11px] font-bold text-foreground truncate">{selectedPlan?.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {isCurrentDefault ? 'Primary Baseline Plan' : 'Scenario Plan'}
            </p>
          </div>

          {/* Re-run Wizard */}
          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              onOpenWizardEdit(selectedPlan);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary rounded-lg transition-colors text-left cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Re-run Setup Wizard</span>
          </button>

          {/* Set as Default Plan */}
          {!isCurrentDefault && (
            <button
              type="button"
              onClick={async () => {
                setDropdownOpen(false);
                await onSetDefaultPlan(selectedPlan.id);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-amber-500/10 hover:text-amber-600 rounded-lg transition-colors text-left cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>Set as Default Plan</span>
            </button>
          )}

          {/* Re-Sync Finances */}
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-blue-500/10 hover:text-blue-600 rounded-lg transition-colors text-left cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Syncing...' : 'Re-Sync Finances'}</span>
          </button>

          <div className="border-t border-border my-1" />

          {/* Delete Plan */}
          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              onOpenDeleteConfirm(selectedPlan);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors text-left cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete Plan...</span>
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

