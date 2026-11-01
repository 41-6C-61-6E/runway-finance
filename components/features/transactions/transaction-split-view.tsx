'use client';

import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Repeat, Plus } from "lucide-react";
import type { Transaction, Category } from "./transaction-detail-drawer";

export interface MatchingRecurringItem {
  displayName?: string;
  frequency?: string;
  nextExpectedDate?: string;
  isPaused?: boolean;
}

interface SplitViewProps {
  transaction: Transaction;
  date: string;
  description: string;
  text: string;
  payee: string;
  memo: string;
  notes: string;
  reviewed: boolean;
  pending: boolean;
  saving: boolean;
  deleting: boolean;
  setPayee: (v: string) => void;
  setMemo: (v: string) => void;
  setNotes: (v: string) => void;
  toggleReviewed: () => void;
  setPending: (v: boolean) => void;
  handleSave: () => void;
  handleRevertSplit: () => void;
  categories: Category[];
  parents: Category[];
  getChildren: (parentId: string) => Category[];
  mode: 'create' | 'edit';
  matchingRecurring: MatchingRecurringItem | null;
  setRecurringModalOpen: (v: boolean) => void;
}

export function TransactionSplitView(props: SplitViewProps) {
  const {
    transaction, date, description, text, payee, memo, notes, reviewed, pending,
    saving, deleting, setPayee, setMemo, setNotes, toggleReviewed, setPending,
    handleSave, handleRevertSplit, categories, parents, getChildren,
    mode, matchingRecurring, setRecurringModalOpen
  } = props;

  return (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="p-4 bg-muted/10 border border-border rounded-xl space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Amount</span>
                  <span className="font-mono text-xl font-bold text-foreground">{text}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</span>
                  <span className="text-sm text-foreground">{new Date(date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between gap-x-4 items-start">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Description</span>
                  <span className="text-sm text-foreground font-medium text-right break-words">{description}</span>
                </div>
              </div>

              {/* Splits List */}
              <div className="p-4 bg-muted/20 border border-border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Transaction Splits</span>
                  <button
                    type="button"
                    onClick={handleRevertSplit}
                    disabled={saving || deleting}
                    className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                  >
                    Revert Split
                  </button>
                </div>
                <div className="space-y-2">
                  {transaction.splits?.map((split, idx: number) => {
                    const cat = categories.find((c) => c.id === split.categoryId);
                    return (
                      <div key={split.id || idx} className="flex items-center justify-between text-xs p-2.5 bg-background border border-border/50 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">{split.description || transaction.description}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color || '#a1a1aa' }} />
                            {cat?.name || 'Uncategorized'}
                            {split.notes && <span className="truncate max-w-[120px] text-muted-foreground/60">• {split.notes}</span>}
                          </div>
                        </div>
                        <div className="font-semibold text-foreground text-right pl-3">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(split.amount) || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parent Metadata Editor */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Payee</label>
                  <input
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Enter payee"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Memo</label>
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Enter memo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none"
                    placeholder="Add notes"
                  />
                </div>

                {/* Recurring Status Banner / Action */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      matchingRecurring ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Repeat className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                        {matchingRecurring ? matchingRecurring.displayName : 'Recurring Status'}
                        {matchingRecurring && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase tracking-wider">
                            {matchingRecurring.frequency}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {matchingRecurring
                          ? `Next due: ${matchingRecurring.nextExpectedDate || 'N/A'}${matchingRecurring.isPaused ? ' (Paused)' : ''}`
                          : 'Not tracked as recurring'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {matchingRecurring ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRecurringModalOpen(true)}
                        className="h-7 text-xs px-2.5 font-medium rounded-lg"
                      >
                        Edit Rule
                      </Button>
                    ) : mode === 'edit' && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => setRecurringModalOpen(true)}
                        className="h-7 text-xs px-2.5 font-medium rounded-lg shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Mark Recurring
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">Reviewed</span>
                    <div className="text-right">
                      <Switch checked={reviewed} onCheckedChange={toggleReviewed} />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {reviewed ? 'Marked as reviewed' : 'Needs review'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/80">Pending</span>
                    <div className="text-right">
                      <Switch checked={pending} onCheckedChange={(v) => setPending(v)} />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {pending ? 'Marked as pending' : 'Cleared'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || deleting}
                    className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
  );
}

interface SplitFormProps {
  transaction: Transaction;
  description?: string;
  categories: Category[];
  parents: Category[];
  getChildren: (parentId: string) => Category[];
  onSuccess: () => void;
  onClose: () => void;
  onCancel: () => void;
}

export function TransactionSplitForm({ transaction, description, parents, getChildren, onSuccess, onClose, onCancel }: SplitFormProps) {
  const parentAmount = transaction ? parseFloat(transaction.amount) : 0;
  const parentAbs = Math.abs(parentAmount);

  const [splitRows, setSplitRows] = useState<{
    amount: string;
    categoryId: string | null;
    description: string;
    notes: string;
    tagIds: string[];
  }[]>([
    { amount: "", categoryId: null, description: "", notes: "", tagIds: [] },
    { amount: "", categoryId: null, description: "", notes: "", tagIds: [] },
  ]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  const splitsSum = splitRows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
  const remainingAmount = parentAbs - splitsSum;

  const addSplitRow = () => {
    setSplitRows([
      ...splitRows,
      { amount: "", categoryId: null, description: "", notes: "", tagIds: [] },
    ]);
  };

  const removeSplitRow = (index: number) => {
    setSplitRows(splitRows.filter((_, idx) => idx !== index));
  };

  const updateSplitRow = (index: number, key: string, value: unknown) => {
    setSplitRows(
      splitRows.map((r, idx) => (idx === index ? { ...r, [key]: value } : r))
    );
  };

  const handleSaveSplits = async () => {
    if (!transaction) return;
    setSplitSaving(true);
    setSplitError(null);
    try {
      const payload = {
        splits: splitRows.map((r) => ({
          amount: r.amount.replace(/[^\d.-]/g, ""),
          categoryId: r.categoryId,
          description: r.description.trim() || undefined,
          notes: r.notes.trim() || undefined,
          tagIds: r.tagIds.length > 0 ? r.tagIds : undefined,
        })),
      };

      const res = await fetch(`/api/transactions/${transaction.id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setSplitError(errData.message || "Failed to split transaction");
      }
    } catch (err) {
      console.error(err);
      setSplitError("An error occurred");
    } finally {
      setSplitSaving(false);
    }
  };

  return (
            <div className="space-y-4">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex justify-between items-center text-xs font-semibold text-primary uppercase tracking-wider">
                  <span>Splitting Transaction</span>
                  <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parentAbs)}</span>
                </div>
              </div>

              {splitError && (
                <div className="p-2.5 bg-destructive/15 border border-destructive/20 rounded-lg text-xs font-medium text-destructive">
                  {splitError}
                </div>
              )}

              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="p-3 bg-muted/10 border border-border/50 rounded-xl space-y-2.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Split #{idx + 1}</span>
                      {splitRows.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(idx)}
                          className="text-[10px] font-semibold text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Amount</label>
                        <input
                          type="text"
                          value={row.amount}
                          onChange={(e) => updateSplitRow(idx, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Category</label>
                        <Select
                          className="h-9 text-xs rounded px-2"
                          value={row.categoryId || ''}
                          onChange={(e) => updateSplitRow(idx, 'categoryId', e.target.value || null)}
                        >
                          <option value="">Uncategorized</option>
                          {parents.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              <option value={p.id}>{p.name}</option>
                              {getChildren(p.id).map((c) => (
                                <option key={c.id} value={c.id}>
                                  &nbsp;&nbsp;{c.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Description (Optional)</label>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateSplitRow(idx, 'description', e.target.value)}
                        placeholder={description || 'Inherit description'}
                        className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addSplitRow}
                className="w-full py-2 bg-transparent text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg border border-dashed border-primary/30 transition-all"
              >
                + Add Split Part
              </button>

              {/* Status bar */}
              <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Allocated:</span>
                  <span className="text-foreground">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(splitsSum)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Remaining:</span>
                  {Math.abs(remainingAmount) < 0.01 ? (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-600 dark:text-green-400 font-bold rounded text-[10px] uppercase tracking-wider">Balanced</span>
                  ) : (
                    <span className={`font-semibold ${remainingAmount < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(remainingAmount)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 px-4 py-2 text-sm font-semibold border border-input text-foreground bg-background rounded-lg hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSplits}
                  disabled={splitSaving || Math.abs(remainingAmount) >= 0.01}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {splitSaving ? 'Saving...' : 'Save Splits'}
                </button>
              </div>
            </div>
  );
}
