'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Category, TagItem } from './types';

interface RuleBulkEditDialogProps {
  open: boolean;
  onClose: () => void;
  selectedRuleIds: string[];
  categories: Category[];
  tags: TagItem[];
  onUpdateSuccess: () => Promise<void>;
  showFeedback: (type: 'success' | 'error', message: string) => void;
}

export function RuleBulkEditDialog({
  open,
  onClose,
  selectedRuleIds,
  categories,
  tags,
  onUpdateSuccess,
  showFeedback,
}: RuleBulkEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [bulkUpdateFields, setBulkUpdateFields] = useState({
    isActive: false,
    setCategoryId: false,
    setTagId: false,
    setPayee: false,
    setReviewed: false,
    overrideExisting: false,
  });
  const [bulkFormIsActive, setBulkFormIsActive] = useState(true);
  const [bulkFormCategoryId, setBulkFormCategoryId] = useState<string | null>(null);
  const [bulkFormTagId, setBulkFormTagId] = useState<string | null>(null);
  const [bulkFormSetPayee, setBulkFormSetPayee] = useState('');
  const [bulkFormSetReviewed, setBulkFormSetReviewed] = useState<boolean | null>(null);
  const [bulkFormOverrideExisting, setBulkFormOverrideExisting] = useState(false);

  const handleBulkUpdate = async () => {
    const updates: Record<string, unknown> = {};
    if (bulkUpdateFields.isActive) updates.isActive = bulkFormIsActive;
    if (bulkUpdateFields.setCategoryId) updates.setCategoryId = bulkFormCategoryId;
    if (bulkUpdateFields.setTagId) updates.setTagId = bulkFormTagId;
    if (bulkUpdateFields.setPayee) updates.setPayee = bulkFormSetPayee.trim() || null;
    if (bulkUpdateFields.setReviewed) updates.setReviewed = bulkFormSetReviewed;
    if (bulkUpdateFields.overrideExisting) updates.overrideExisting = bulkFormOverrideExisting;

    if (Object.keys(updates).length === 0) {
      showFeedback('error', 'Please select at least one field to update.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/category-rules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ids: selectedRuleIds,
          action: 'update',
          updates,
        }),
      });
      if (!res.ok) throw new Error('Failed to bulk update rules');
      showFeedback('success', `Successfully updated ${selectedRuleIds.length} rules.`);
      onClose();
      await onUpdateSuccess();
    } catch (error) {
      console.error('Error bulk updating rules:', error);
      showFeedback('error', 'Failed to bulk update rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Bulk Edit Rules</DialogTitle>
          <DialogDescription>
            Select the fields you want to update for the {selectedRuleIds.length} selected rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Active Status */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.isActive}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, isActive: e.target.checked })}
                id="bulk-update-active"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-active" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Active Status
              </label>
            </div>
            {bulkUpdateFields.isActive && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                <span className="text-xs text-muted-foreground">Status</span>
                <Switch
                  checked={bulkFormIsActive}
                  onCheckedChange={setBulkFormIsActive}
                />
              </div>
            )}
          </div>

          {/* Set Category */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.setCategoryId}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, setCategoryId: e.target.checked })}
                id="bulk-update-category"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-category" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Category Action
              </label>
            </div>
            {bulkUpdateFields.setCategoryId && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <label className="block text-[11px] text-muted-foreground mb-1">Category</label>
                <Select
                  value={bulkFormCategoryId || ''}
                  onChange={(e) => setBulkFormCategoryId(e.target.value || null)}
                >
                  <option value="">Don&apos;t set category (Clear category)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.parentId ? '  ' : ''}{cat.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Set Tag */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.setTagId}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, setTagId: e.target.checked })}
                id="bulk-update-tag"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-tag" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Tag Action
              </label>
            </div>
            {bulkUpdateFields.setTagId && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <label className="block text-[11px] text-muted-foreground mb-1">Tag</label>
                <Select
                  value={bulkFormTagId || ''}
                  onChange={(e) => setBulkFormTagId(e.target.value || null)}
                >
                  <option value="">Don&apos;t set a tag (Clear tag)</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Set Payee */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.setPayee}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, setPayee: e.target.checked })}
                id="bulk-update-payee"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-payee" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Payee Overwrite Action
              </label>
            </div>
            {bulkUpdateFields.setPayee && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <label className="block text-[11px] text-muted-foreground mb-1">Payee Name</label>
                <input
                  value={bulkFormSetPayee}
                  onChange={(e) => setBulkFormSetPayee(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Clear payee or set new payee"
                />
              </div>
            )}
          </div>

          {/* Set Reviewed */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.setReviewed}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, setReviewed: e.target.checked })}
                id="bulk-update-reviewed"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-reviewed" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Reviewed Action
              </label>
            </div>
            {bulkUpdateFields.setReviewed && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                <span className="text-xs text-muted-foreground">Mark as Reviewed</span>
                <Switch
                  checked={bulkFormSetReviewed === true}
                  onCheckedChange={(checked) => setBulkFormSetReviewed(checked ? true : null)}
                />
              </div>
            )}
          </div>

          {/* Override Existing */}
          <div className="flex flex-col gap-1.5 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkUpdateFields.overrideExisting}
                onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, overrideExisting: e.target.checked })}
                id="bulk-update-override"
                className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
              />
              <label htmlFor="bulk-update-override" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                Update Override Existing Option
              </label>
            </div>
            {bulkUpdateFields.overrideExisting && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                <span className="text-xs text-muted-foreground">Override Existing Category</span>
                <Switch
                  checked={bulkFormOverrideExisting}
                  onCheckedChange={setBulkFormOverrideExisting}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBulkUpdate}
            disabled={saving || !Object.values(bulkUpdateFields).some(Boolean)}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {saving ? 'Updating...' : 'Apply Changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
