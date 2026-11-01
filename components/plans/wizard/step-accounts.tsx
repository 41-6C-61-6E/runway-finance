'use client';

import React from 'react';

export interface PlanAccountItem {
  id: string;
  name?: string;
  type?: string;
  balance?: string | number;
  isIncluded?: boolean;
}

interface StepAccountsProps {
  accountsToDisplay: PlanAccountItem[];
  accountInclusions: Record<string, boolean>;
  toggleAccountInclusion: (accId: string) => void;
  handleSelectAllAccounts: (include: boolean) => void;
}

export function StepAccounts({
  accountsToDisplay,
  accountInclusions,
  toggleAccountInclusion,
  handleSelectAllAccounts,
}: StepAccountsProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-foreground">Select Portfolio Accounts to Include</h4>
          <p className="text-[11px] text-muted-foreground">
            Checked accounts are included in accumulation savings and drawdown calculations
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleSelectAllAccounts(true)}
            className="text-primary hover:underline font-semibold cursor-pointer"
          >
            Select All
          </button>
          <span className="text-muted-foreground">•</span>
          <button
            type="button"
            onClick={() => handleSelectAllAccounts(false)}
            className="text-muted-foreground hover:underline cursor-pointer"
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {accountsToDisplay.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
            No accounts found. Default starter accounts will be created for this plan.
          </div>
        ) : (
          accountsToDisplay.map((acc) => {
            const isInc = accountInclusions[acc.id] !== false;
            return (
              <div
                key={acc.id}
                onClick={() => toggleAccountInclusion(acc.id)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isInc
                    ? 'bg-muted/30 border-primary/40 shadow-xs'
                    : 'bg-muted/10 border-border opacity-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isInc}
                    onChange={() => toggleAccountInclusion(acc.id)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">{acc.name || 'Account'}</span>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {(acc.type || 'account').replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-foreground">
                  ${(parseFloat(String(acc.balance)) || 0).toLocaleString()}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
