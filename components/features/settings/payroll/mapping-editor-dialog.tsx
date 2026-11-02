'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Category, FieldMapping, MappingTemplate } from './types';
import { descriptionLabel, groupedMappingKeys, sectionLabel } from './utils';

interface MappingEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingMapping: MappingTemplate | null;
  mappingEditorFields: Record<string, FieldMapping>;
  setMappingEditorFields: React.Dispatch<React.SetStateAction<Record<string, FieldMapping>>>;
  mappingEditorName: string;
  setMappingEditorName: (name: string) => void;
  mappingEditorEmployer: string;
  setMappingEditorEmployer: (emp: string) => void;
  mappingEditorAccount: string;
  setMappingEditorAccount: (acc: string) => void;
  mappingEditorTag: string;
  setMappingEditorTag: (tag: string) => void;
  mappingSaving: boolean;
  accounts: { id: string; name: string; institution?: string | null }[];
  tags: { id: string; name: string }[];
  categories: Category[];
  handleSaveMapping: () => void;
}

export function MappingEditorDialog({
  open,
  onOpenChange,
  editingMapping,
  mappingEditorFields,
  setMappingEditorFields,
  mappingEditorName,
  setMappingEditorName,
  mappingEditorEmployer,
  setMappingEditorEmployer,
  mappingEditorAccount,
  setMappingEditorAccount,
  mappingEditorTag,
  setMappingEditorTag,
  mappingSaving,
  accounts,
  tags,
  categories,
  handleSaveMapping,
}: MappingEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMapping ? 'Edit Field Mapping' : 'Create Field Mapping'}</DialogTitle>
          <DialogDescription>
            Define how each paystub field maps to a category. Set &quot;Import&quot; to create transactions, or &quot;Ignore&quot; to store data without creating transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Template Name</label>
              <Input
                value={mappingEditorName}
                onChange={(e) => setMappingEditorName(e.target.value)}
                placeholder="e.g., My Employer Weekly"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Employer Name</label>
              <Input
                value={mappingEditorEmployer}
                onChange={(e) => setMappingEditorEmployer(e.target.value)}
                placeholder="e.g., Acme Corp"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Target Account</label>
              <Select
                value={mappingEditorAccount}
                onChange={(e) => setMappingEditorAccount(e.target.value)}
              >
                <option value="">No Account (Virtual: From Paystub)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.institution || 'Manual'})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Transaction Tag</label>
              <Select
                value={mappingEditorTag}
                onChange={(e) => setMappingEditorTag(e.target.value)}
              >
                <option value="">Default (paystub)</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="p-3 bg-muted/60 border border-border rounded-lg text-xs space-y-1.5 leading-normal">
            <p className="font-semibold text-foreground">💡 Target Account &amp; Duplicate Prevention Info:</p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Virtual (From Paystub):</strong> Recommended if you sync your bank feed automatically. Tracks gross income and taxes in charts without duplicating the bank&apos;s net paycheck deposit.
              </li>
              <li>
                <strong className="text-foreground">Real Bank Account:</strong> Select this if you manually track your balance. Make sure to ignore the bank&apos;s net paycheck deposit transaction to prevent double-counting.
              </li>
            </ul>
          </div>

          {/* Add new field */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Add Field</label>
            <div className="flex gap-2">
              <Select
                className="h-7 text-xs"
                id="newFieldSection"
              >
                <option value="earnings">Earnings</option>
                <option value="taxes">Taxes</option>
                <option value="before_tax_deductions">Pre-Tax Deductions</option>
                <option value="after_tax_deductions">Post-Tax Deductions</option>
              </Select>
              <Input
                id="newFieldName"
                placeholder="Description name"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  const section = (document.getElementById('newFieldSection') as HTMLSelectElement)?.value;
                  const name = (document.getElementById('newFieldName') as HTMLInputElement)?.value;
                  if (section && name) {
                    setMappingEditorFields((prev) => ({
                      ...prev,
                      [`${section}:${name}`]: { action: 'import', categoryId: null, accountId: null, tagId: null },
                    }));
                    (document.getElementById('newFieldName') as HTMLInputElement).value = '';
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Mapping Fields by Section */}
          {Object.entries(groupedMappingKeys(mappingEditorFields)).map(([section, keys]) => (
            <div key={section}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {sectionLabel(`${section}:`)}
              </h3>
              <div className="space-y-1.5">
                {keys.map((key) => {
                  const field = mappingEditorFields[key];
                  return (
                    <div key={key} className="flex flex-col gap-2 p-2.5 bg-muted/50 rounded-lg border border-border">
                      <div className="flex items-center justify-between min-w-0">
                        <span className="text-xs font-medium text-foreground truncate flex-1 pr-2">
                          {descriptionLabel(key)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMappingEditorFields((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          }}
                          className="text-xs text-destructive hover:text-destructive/80 px-1.5"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Select
                          className="h-7 text-xs"
                          value={field.action}
                          onChange={(e) => {
                            setMappingEditorFields((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], action: e.target.value as 'import' | 'ignore' },
                            }));
                          }}
                        >
                          <option value="import">Import</option>
                          <option value="ignore">Ignore</option>
                        </Select>
                        {field.action === 'import' && (
                          <>
                            <Select
                              className="h-7 text-xs"
                              wrapperClassName="max-w-[130px]"
                              value={field.categoryId || ''}
                              onChange={(e) => {
                                setMappingEditorFields((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key], categoryId: e.target.value || null },
                                }));
                              }}
                            >
                              <option value="">No category</option>
                              {categories
                                .filter((c) => c.categoryType === 'compound')
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} {c.isIncome ? '(Income)' : ''}
                                  </option>
                                ))}
                            </Select>
                            <Select
                              className="h-7 text-xs"
                              wrapperClassName="max-w-[130px]"
                              value={field.accountId || ''}
                              onChange={(e) => {
                                setMappingEditorFields((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key], accountId: e.target.value || null },
                                }));
                              }}
                            >
                              <option value="">Default Account</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name}
                                </option>
                              ))}
                            </Select>
                            <Select
                              className="h-7 text-xs"
                              wrapperClassName="max-w-[110px]"
                              value={field.tagId || ''}
                              onChange={(e) => {
                                setMappingEditorFields((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key], tagId: e.target.value || null },
                                }));
                              }}
                            >
                              <option value="">Default Tag</option>
                              {tags.map((tag) => (
                                <option key={tag.id} value={tag.id}>
                                  {tag.name}
                                </option>
                              ))}
                            </Select>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(mappingEditorFields).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No fields defined. Import a JSON file first or add fields manually above.
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveMapping}
            disabled={mappingSaving || !mappingEditorName}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {mappingSaving ? 'Saving...' : editingMapping ? 'Update Mapping' : 'Create Mapping'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
