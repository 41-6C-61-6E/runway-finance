'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { MappingTemplate } from './types';
import { sectionLabel } from './utils';

export interface ManualAddForm {
  employerName: string;
  employeeName: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  checkDate: string;
  grossCurrent: string;
  taxesCurrent: string;
  deductionsCurrent: string;
  netCurrent: string;
}

export interface ManualAddLineItem {
  section: string;
  description: string;
  amount: string;
  mappingAction: string;
  categoryId: string | null;
}

interface ManualAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualAddForm: ManualAddForm;
  setManualAddForm: React.Dispatch<React.SetStateAction<ManualAddForm>>;
  manualAddMappingId: string;
  setManualAddMappingId: (id: string) => void;
  mappings: MappingTemplate[];
  manualAddLineItems: ManualAddLineItem[];
  setManualAddLineItems: React.Dispatch<React.SetStateAction<ManualAddLineItem[]>>;
  manualAddError: string;
  manualAddSaving: boolean;
  getCategoryName: (id: string) => string;
  handleManualAdd: () => void;
}

export function ManualAddDialog({
  open,
  onOpenChange,
  manualAddForm,
  setManualAddForm,
  manualAddMappingId,
  setManualAddMappingId,
  mappings,
  manualAddLineItems,
  setManualAddLineItems,
  manualAddError,
  manualAddSaving,
  getCategoryName,
  handleManualAdd,
}: ManualAddDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setManualAddMappingId('');
          setManualAddLineItems([]);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Paystub Manually</DialogTitle>
          <DialogDescription>
            Enter the details from your paystub. Select a field mapping to pre-populate line items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Employer Name</label>
              <Input
                value={manualAddForm.employerName}
                onChange={(e) => setManualAddForm((f) => ({ ...f, employerName: e.target.value }))}
                placeholder="e.g., Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Employee Name</label>
              <Input
                value={manualAddForm.employeeName}
                onChange={(e) => setManualAddForm((f) => ({ ...f, employeeName: e.target.value }))}
                placeholder="e.g., John Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Period Start</label>
              <Input
                type="date"
                value={manualAddForm.payPeriodStart}
                onChange={(e) => setManualAddForm((f) => ({ ...f, payPeriodStart: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Period End</label>
              <Input
                type="date"
                value={manualAddForm.payPeriodEnd}
                onChange={(e) => setManualAddForm((f) => ({ ...f, payPeriodEnd: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Check Date</label>
              <Input
                type="date"
                value={manualAddForm.checkDate}
                onChange={(e) => setManualAddForm((f) => ({ ...f, checkDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Gross</label>
              <Input
                type="number"
                step="0.01"
                value={manualAddForm.grossCurrent}
                onChange={(e) => setManualAddForm((f) => ({ ...f, grossCurrent: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Taxes</label>
              <Input
                type="number"
                step="0.01"
                value={manualAddForm.taxesCurrent}
                onChange={(e) => setManualAddForm((f) => ({ ...f, taxesCurrent: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Deductions</label>
              <Input
                type="number"
                step="0.01"
                value={manualAddForm.deductionsCurrent}
                onChange={(e) => setManualAddForm((f) => ({ ...f, deductionsCurrent: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Net</label>
              <Input
                type="number"
                step="0.01"
                value={manualAddForm.netCurrent}
                onChange={(e) => setManualAddForm((f) => ({ ...f, netCurrent: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Field Mapping Selector */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Field Mapping (optional)</label>
            <Select
              value={manualAddMappingId}
              onChange={(e) => {
                const mappingId = e.target.value;
                setManualAddMappingId(mappingId);
                const mapping = mappings.find((m) => m.id === mappingId);
                if (mapping) {
                  setManualAddForm((f) => ({
                    ...f,
                    employerName: f.employerName || mapping.employerName || '',
                  }));
                  const items = Object.entries(mapping.mappings)
                    .filter(([, v]) => v.action === 'import')
                    .map(([key, v]) => {
                      const colonIdx = key.indexOf(':');
                      const section = key.slice(0, colonIdx);
                      const description = key.slice(colonIdx + 1);
                      return {
                        section,
                        description,
                        amount: '',
                        mappingAction: 'import',
                        categoryId: v.categoryId,
                      };
                    });
                  setManualAddLineItems(items);
                } else {
                  setManualAddLineItems([]);
                }
              }}
            >
              <option value="">No mapping (line items optional)</option>
              {mappings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.employerName ? `(${m.employerName})` : ''}
                </option>
              ))}
            </Select>
          </div>

          {manualAddError && (
            <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
              <p className="text-destructive text-sm">{manualAddError}</p>
            </div>
          )}

          {/* Line Items */}
          {manualAddLineItems.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Line Items ({manualAddLineItems.length})
              </label>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {manualAddLineItems.map((item, idx) => (
                  <div key={`${item.section}:${item.description}`} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground truncate">{sectionLabel(`${item.section}:`)} — {item.description}</div>
                      {item.categoryId && (
                        <div className="text-[10px] text-primary/60 truncate">{getCategoryName(item.categoryId)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.amount}
                        onChange={(e) => {
                          setManualAddLineItems((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], amount: e.target.value };
                            return next;
                          });
                        }}
                        placeholder="0.00"
                        className="w-24 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              setManualAddMappingId('');
              setManualAddLineItems([]);
            }}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleManualAdd}
            disabled={manualAddSaving || !manualAddForm.employerName || !manualAddForm.checkDate}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {manualAddSaving ? 'Saving...' : 'Add Paystub'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
