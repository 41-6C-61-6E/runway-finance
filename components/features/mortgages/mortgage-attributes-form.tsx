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
  principal?: string;
  interest?: string;
  pmi?: string;
  escrow?: string;
}

interface MortgageAttributesFormProps {
  meta: Record<string, string>;
  onChange: (meta: Record<string, string>) => void;
  showStartDate?: boolean;
}

/**
 * Reusable form component for editing mortgage attributes.
 * Used in both ManualAccountsSection and PropertyCard for SimpleFIN mortgages.
 */
export function MortgageAttributesForm({
  meta,
  onChange,
  showStartDate = true,
}: MortgageAttributesFormProps) {
  return (
    <>
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
          <label className="block text-sm font-medium text-foreground mb-1">Monthly Payment</label>
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
          <label className="block text-sm font-medium text-foreground mb-1">Principal (monthly, optional)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.principal || ''}
            onChange={(e) => onChange({ ...meta, principal: e.target.value })}
            placeholder="e.g., 800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Interest (monthly, optional)</label>
          <Input
            type="number"
            step="0.01"
            value={meta.interest || ''}
            onChange={(e) => onChange({ ...meta, interest: e.target.value })}
            placeholder="e.g., 1000"
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
