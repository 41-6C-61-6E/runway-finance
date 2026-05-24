'use client';

import { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';

interface MortgageAttributesMeta {
  originalLoanAmount?: string;
  interestRate?: string;
  termMonths?: string;
  monthlyPayment?: string;
  escrowAmount?: string;
  purchaseDate?: string;
  extraPrincipal?: string;
  pmi?: string;
  escrow?: string;
}

interface MortgageAttributesFormProps {
  meta: Record<string, string>;
  onChange: (meta: Record<string, string>) => void;
  showStartDate?: boolean;
  allMortgages?: { id: string; name: string }[];
}

/**
 * Reusable form component for editing mortgage attributes.
 * Used in both ManualAccountsSection and PropertyCard for SimpleFIN mortgages.
 */
export function MortgageAttributesForm({
  meta,
  onChange,
  showStartDate = true,
  allMortgages = [],
}: MortgageAttributesFormProps) {
  const status = meta.mortgageStatus || 'active';

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Mortgage Status</label>
        <select
          value={status}
          onChange={(e) => onChange({ ...meta, mortgageStatus: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="active">Active</option>
          <option value="paid_off">Paid Off</option>
          <option value="refinanced">Refinanced</option>
        </select>
      </div>

      {status === 'paid_off' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Payoff Date</label>
          <Input
            type="date"
            value={meta.payoffDate || ''}
            onChange={(e) => onChange({ ...meta, payoffDate: e.target.value })}
            required
          />
        </div>
      )}

      {status === 'refinanced' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Refinance Date</label>
              <Input
                type="date"
                value={meta.refinanceDate || ''}
                onChange={(e) => onChange({ ...meta, refinanceDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payoff Balance</label>
              <Input
                type="number"
                step="0.01"
                value={meta.payoffBalance || ''}
                onChange={(e) => onChange({ ...meta, payoffBalance: e.target.value })}
                placeholder="e.g., 240000"
                required
              />
            </div>
          </div>
          {allMortgages.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Refinanced By Loan</label>
              <select
                value={meta.refinancedByLoanId || ''}
                onChange={(e) => onChange({ ...meta, refinancedByLoanId: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select refinancing mortgage...</option>
                {allMortgages.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {showStartDate && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Start Date (origination)</label>
          <Input
            type="date"
            value={meta.purchaseDate || ''}
            onChange={(e) => onChange({ ...meta, purchaseDate: e.target.value })}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Original Loan Amount</label>
          <Input
            type="number"
            step="0.01"
            value={meta.originalLoanAmount || ''}
            onChange={(e) => onChange({ ...meta, originalLoanAmount: e.target.value })}
            placeholder="e.g., 300000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Interest Rate (%)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.interestRate || ''}
            onChange={(e) => onChange({ ...meta, interestRate: e.target.value })}
            placeholder="e.g., 6.5"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Term (months)</label>
          <Input
            type="number"
            value={meta.termMonths || '360'}
            onChange={(e) => onChange({ ...meta, termMonths: e.target.value })}
            placeholder="e.g., 360"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Monthly Payment (P&amp;I)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.monthlyPayment || ''}
            onChange={(e) => onChange({ ...meta, monthlyPayment: e.target.value })}
            placeholder="e.g., 2212"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">PMI (monthly, optional)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.pmi || ''}
            onChange={(e) => onChange({ ...meta, pmi: e.target.value })}
            placeholder="e.g., 80"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Escrow (taxes, ins., optional)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.escrow || meta.escrowAmount || ''}
            onChange={(e) => onChange({ ...meta, escrow: e.target.value, escrowAmount: e.target.value })}
            placeholder="e.g., 400"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Extra Principal (monthly, optional)</label>
        <Input
          type="number"
          step="0.01"
          value={meta.extraPrincipal || ''}
          onChange={(e) => onChange({ ...meta, extraPrincipal: e.target.value })}
          placeholder="e.g., 200"
        />
      </div>
    </>
  );
}
