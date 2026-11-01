'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, X } from 'lucide-react';
import type { Rule, Category, TagItem, Condition } from './types';
import { FIELD_OPTIONS, OPERATOR_OPTIONS } from './types';

interface RuleEditorSheetProps {
  open: boolean;
  onClose: () => void;
  editingRule: Rule | null;
  categories: Category[];
  tags: TagItem[];
  rulesCount: number;
  onSaveSuccess: () => Promise<void>;
  showFeedback: (type: 'success' | 'error', message: string) => void;
}

export function RuleEditorSheet({
  open,
  onClose,
  editingRule,
  categories,
  tags,
  rulesCount,
  onSaveSuccess,
  showFeedback,
}: RuleEditorSheetProps) {
  const [formName, setFormName] = useState('');
  const [formConditions, setFormConditions] = useState<Condition[]>([]);
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formSetPayee, setFormSetPayee] = useState('');
  const [formTagId, setFormTagId] = useState<string | null>(null);
  const [formSetReviewed, setFormSetReviewed] = useState<boolean | null>(null);
  const [formOverrideExisting, setFormOverrideExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (editingRule) {
      setFormName(editingRule.name);
      const conditions = editingRule.conditions && editingRule.conditions.length > 0
        ? editingRule.conditions.map((c) => ({ ...c, id: c.id || Math.random().toString() }))
        : [{
            id: Math.random().toString(),
            field: editingRule.conditionField,
            operator: editingRule.conditionOperator,
            value: editingRule.conditionValue,
            caseSensitive: editingRule.conditionCaseSensitive,
          }];
      setFormConditions(conditions);
      setFormCategoryId(editingRule.setCategoryId);
      setFormTagId(editingRule.setTagId ?? null);
      setFormSetPayee(editingRule.setPayee ?? '');
      setFormSetReviewed(editingRule.setReviewed);
      setFormOverrideExisting(!!editingRule.overrideExisting);
    } else {
      setFormName('');
      setFormConditions([
        {
          id: Math.random().toString(),
          field: 'description',
          operator: 'contains',
          value: '',
          caseSensitive: false,
        },
      ]);
      setFormCategoryId(null);
      setFormTagId(null);
      setFormSetPayee('');
      setFormSetReviewed(null);
      setFormOverrideExisting(false);
    }
  }, [open, editingRule]);

  const handleSave = async () => {
    if (!formName.trim() || formConditions.length === 0 || formConditions.some((c) => !c.value.trim())) return;
    setSaving(true);
    try {
      const firstCondition = formConditions[0];
      const body: Record<string, unknown> = {
        name: formName.trim(),
        conditionField: firstCondition.field,
        conditionOperator: firstCondition.operator,
        conditionValue: firstCondition.value.trim(),
        conditionCaseSensitive: firstCondition.caseSensitive,
        ...(formConditions.length > 1 && {
          conditions: formConditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: c.value.trim(),
            caseSensitive: c.caseSensitive,
          })),
        }),
        setCategoryId: formCategoryId || null,
        setTagId: formTagId || null,
        setPayee: formSetPayee.trim() || null,
        setReviewed: formSetReviewed ?? null,
        overrideExisting: formOverrideExisting,
        priority: editingRule ? editingRule.priority : rulesCount,
      };

      if (editingRule) {
        await fetch(`/api/category-rules/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } else {
        await fetch('/api/category-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      }

      onClose();
      await onSaveSuccess();
    } catch (error) {
      console.error('Error saving rule:', error);
      showFeedback('error', 'Failed to save rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="bg-card border-l border-border p-6 overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{editingRule ? 'Edit Rule' : 'Add Rule'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Rule Name</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
              placeholder="e.g., Amazon Purchases"
            />
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Conditions (all must match)</h4>
              <button
                type="button"
                onClick={() => {
                  setFormConditions([
                    ...formConditions,
                    {
                      id: Math.random().toString(),
                      field: 'description',
                      operator: 'contains',
                      value: '',
                      caseSensitive: false,
                    },
                  ]);
                }}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Condition
              </button>
            </div>

            <div className="space-y-3">
              {formConditions.map((condition, idx) => (
                <div key={condition.id} className="p-3 bg-muted/30 border border-border rounded-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Field</label>
                      <Select
                        value={condition.field}
                        onChange={(e) => {
                          const updated = [...formConditions];
                          updated[idx] = { ...updated[idx], field: e.target.value };
                          setFormConditions(updated);
                        }}
                      >
                        {FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Operator</label>
                      <Select
                        value={condition.operator}
                        onChange={(e) => {
                          const updated = [...formConditions];
                          updated[idx] = { ...updated[idx], operator: e.target.value };
                          setFormConditions(updated);
                        }}
                      >
                        {OPERATOR_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-muted-foreground mb-1">Value</label>
                    <input
                      value={condition.value}
                      onChange={(e) => {
                        const updated = [...formConditions];
                        updated[idx] = { ...updated[idx], value: e.target.value };
                        setFormConditions(updated);
                      }}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="e.g., AMAZON"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={condition.caseSensitive}
                        onChange={(e) => {
                          const updated = [...formConditions];
                          updated[idx] = { ...updated[idx], caseSensitive: e.target.checked };
                          setFormConditions(updated);
                        }}
                        className="rounded border-border text-primary focus:ring-ring"
                        id={`case-${condition.id}`}
                      />
                      <label htmlFor={`case-${condition.id}`} className="text-xs text-foreground/80 cursor-pointer">
                        Case Sensitive
                      </label>
                    </div>
                    {formConditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormConditions(formConditions.filter((_, i) => i !== idx));
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove condition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Action</h4>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Set Category</label>
              <Select
                value={formCategoryId || ''}
                onChange={(e) => setFormCategoryId(e.target.value || null)}
              >
                <option value="">Don&apos;t change category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.parentId ? '  ' : ''}
                    {cat.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">Set Payee (optional)</label>
              <input
                value={formSetPayee}
                onChange={(e) => setFormSetPayee(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Override payee name"
              />
            </div>

            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">Set Tag (optional)</label>
              <Select
                value={formTagId || ''}
                onChange={(e) => setFormTagId(e.target.value || null)}
              >
                <option value="">Don&apos;t set a tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-foreground/80">Mark as Reviewed</span>
              <Switch
                checked={formSetReviewed === true}
                onCheckedChange={(checked) => setFormSetReviewed(checked ? true : null)}
              />
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/80 font-medium">Override Existing Category</span>
                <Switch
                  checked={formOverrideExisting}
                  onCheckedChange={(checked) => setFormOverrideExisting(checked)}
                />
              </div>
              {formOverrideExisting && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 font-normal">
                  ⚠️ Warning: Enabling this option will cause this rule to overwrite existing category assignments on matching transactions.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !formName.trim() || formConditions.length === 0 || formConditions.some((c) => !c.value.trim())}
            className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
