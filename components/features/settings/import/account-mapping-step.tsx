'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface AccountItem {
  id: string;
  name: string;
  type: string;
}

export interface NewAccountData {
  name: string;
  type: string;
  currency: string;
  institution: string;
}

interface AccountMappingStepProps {
  uniqueAccountRefs: string[];
  accountMapping: Record<string, string>;
  allAccounts: AccountItem[];
  newAccounts: Record<string, NewAccountData>;
  EXCLUDED: string;
  handleAccountMappingChange: (csvRef: string, val: string) => void;
  handleNewAccountChange: (csvRef: string, field: string, val: string) => void;
  handleAccountMappingNext: () => void;
  setStep: (step: any) => void;
}

export function AccountMappingStep({
  uniqueAccountRefs,
  accountMapping,
  allAccounts,
  newAccounts,
  EXCLUDED,
  handleAccountMappingChange,
  handleNewAccountChange,
  handleAccountMappingNext,
  setStep,
}: AccountMappingStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Map each account reference from your CSV to an existing account or create a new one.
        Accounts left unmapped will be skipped during import.
      </p>

      {uniqueAccountRefs.filter((ref) => !accountMapping[ref]).length > 0 && (
        <div className="p-3 rounded-lg border border-chart-3/20 bg-chart-3/10 text-sm text-chart-3">
          <div className="font-medium mb-1">⚠ Unmapped accounts</div>
          <p>
            {uniqueAccountRefs.filter((ref) => !accountMapping[ref]).length} account(s) left unmapped — corresponding rows will be skipped. You can map them or explicitly exclude them.
          </p>
        </div>
      )}

      <div className="space-y-3 max-h-80 overflow-y-auto">
        {uniqueAccountRefs.map((csvRef) => (
          <div key={csvRef} className="p-3 rounded-lg border border-border bg-muted/20">
            <div className="text-sm font-medium text-foreground mb-2">CSV Account: {csvRef}</div>

            <Select
              className={`h-9 rounded-lg mb-2 ${accountMapping[csvRef] === EXCLUDED || !accountMapping[csvRef] ? 'opacity-50' : ''}`}
              value={accountMapping[csvRef] || ''}
              onChange={(e) => handleAccountMappingChange(csvRef, e.target.value)}
            >
              <option value="">— Select account —</option>
              <optgroup label="Existing accounts">
                {allAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
              </optgroup>
              <option value="new">+ Create new account</option>
              <option value={EXCLUDED}>— Exclude from import —</option>
            </Select>
            {(accountMapping[csvRef] === EXCLUDED || !accountMapping[csvRef]) && (
              <p className="text-xs text-chart-3 italic">Rows with this account will be skipped during import.</p>
            )}

            {accountMapping[csvRef] === 'new' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 p-2 rounded bg-background border border-border">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input
                    size={1}
                    value={newAccounts[csvRef]?.name || csvRef}
                    onChange={(e) => handleNewAccountChange(csvRef, 'name', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <Select
                    className="h-8 rounded-lg"
                    value={newAccounts[csvRef]?.type || 'checking'}
                    onChange={(e) => handleNewAccountChange(csvRef, 'type', e.target.value)}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit Card</option>
                    <option value="investment">Investment</option>
                    <option value="retirement">Retirement</option>
                    <option value="mortgage">Mortgage</option>
                    <option value="loan">Loan</option>
                    <option value="realestate">Real Estate</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Currency</label>
                  <Input
                    size={1}
                    value={newAccounts[csvRef]?.currency || 'USD'}
                    onChange={(e) => handleNewAccountChange(csvRef, 'currency', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Institution</label>
                  <Input
                    size={1}
                    value={newAccounts[csvRef]?.institution || ''}
                    onChange={(e) => handleNewAccountChange(csvRef, 'institution', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setStep(4)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button size="sm" onClick={handleAccountMappingNext}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
