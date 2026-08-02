'use client';

import React from 'react';
import { Input } from '@/components/ui/input';

export interface RealEstateFormMeta {
  address?: string;
  valuationMethod?: string;
  bedrooms?: string | number;
  bathrooms?: string | number;
  squareFootage?: string | number;
  purchasePrice?: string | number;
  purchaseDate?: string;
  zipCode?: string;
  linkedMortgageId?: string;
  mortgageAccountIds?: string[];
  syncFrequency?: string;
  [key: string]: any;
}

interface RealEstateFormFieldsProps {
  meta: RealEstateFormMeta;
  onChange: (updated: RealEstateFormMeta) => void;
  validatingAddress?: boolean;
  onValidateAddress?: () => void;
  validationResult?: { status: 'success' | 'error'; message: string } | null;
  availableMortgages?: Array<{ id: string; name: string }>;
  showSyncFrequency?: boolean;
}

export function extractZipCodeFromAddress(address?: string): string | null {
  if (!address) return null;
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

export function RealEstateFormFields({
  meta,
  onChange,
  validatingAddress,
  onValidateAddress,
  validationResult,
  availableMortgages = [],
  showSyncFrequency = true,
}: RealEstateFormFieldsProps) {

  const handleAddressChange = (newAddress: string) => {
    const extractedZip = extractZipCodeFromAddress(newAddress);
    const updated: RealEstateFormMeta = {
      ...meta,
      address: newAddress,
    };
    if (extractedZip && (!meta.zipCode || meta.zipCode === extractZipCodeFromAddress(meta.address || ''))) {
      updated.zipCode = extractedZip;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Property Address */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Property Address</label>
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <Input
              value={meta.address || ''}
              onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="e.g., 123 Main St, San Francisco, CA 94105"
            />
          </div>
          {onValidateAddress && (
            <button
              type="button"
              onClick={onValidateAddress}
              disabled={validatingAddress}
              className="px-3 py-2 text-xs font-semibold bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground rounded-lg transition-all"
            >
              {validatingAddress ? 'Checking...' : 'Validate'}
            </button>
          )}
        </div>
        {validationResult && (
          <p className={`text-xs mt-1 font-medium ${validationResult.status === 'success' ? 'text-chart-1' : 'text-destructive'}`}>
            {validationResult.message}
          </p>
        )}
      </div>

      {/* Valuation Method */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Valuation Method</label>
        <select
          value={meta.valuationMethod || 'manual'}
          onChange={(e) => onChange({ ...meta, valuationMethod: e.target.value })}
          className="w-full h-10 px-3 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="manual">Manual (Use balance/snapshot entries)</option>
          <option value="redfin">Automated Redfin Estimates</option>
          <option value="hpi">FHFA Housing Price Index (HPI) Growth</option>
        </select>
      </div>

      {/* Beds, Baths, Sq Ft */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Beds</label>
          <Input
            type="number"
            step="0.5"
            value={meta.bedrooms || ''}
            onChange={(e) => onChange({ ...meta, bedrooms: e.target.value })}
            placeholder="e.g., 3"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Baths</label>
          <Input
            type="number"
            step="0.5"
            value={meta.bathrooms || ''}
            onChange={(e) => onChange({ ...meta, bathrooms: e.target.value })}
            placeholder="e.g., 2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Sq Ft</label>
          <Input
            type="number"
            value={meta.squareFootage || ''}
            onChange={(e) => onChange({ ...meta, squareFootage: e.target.value })}
            placeholder="e.g., 1500"
          />
        </div>
      </div>

      {/* Purchase Price & Purchase Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
          <Input
            type="number"
            step="0.01"
            value={meta.purchasePrice || ''}
            onChange={(e) => onChange({ ...meta, purchasePrice: e.target.value })}
            placeholder="e.g., 350000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
          <Input
            type="date"
            value={meta.purchaseDate || ''}
            onChange={(e) => onChange({ ...meta, purchaseDate: e.target.value })}
          />
        </div>
      </div>

      {/* ZIP Code */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-foreground">ZIP Code (for HPI estimation)</label>
          {extractZipCodeFromAddress(meta.address) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              Auto-detected
            </span>
          )}
        </div>
        <Input
          value={meta.zipCode || ''}
          onChange={(e) => onChange({ ...meta, zipCode: e.target.value })}
          placeholder="e.g., 94105"
        />
      </div>

      {/* Linked Mortgage */}
      {availableMortgages.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Linked Mortgage</label>
          <select
            value={meta.linkedMortgageId || ''}
            onChange={(e) => onChange({ ...meta, linkedMortgageId: e.target.value })}
            className="w-full h-10 px-3 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">None / Unlinked</option>
            {availableMortgages.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sync Frequency */}
      {showSyncFrequency && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Sync Frequency</label>
          <select
            value={meta.syncFrequency || 'monthly'}
            onChange={(e) => onChange({ ...meta, syncFrequency: e.target.value })}
            className="w-full h-10 px-3 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="manual">Manual Only</option>
          </select>
        </div>
      )}
    </div>
  );
}
