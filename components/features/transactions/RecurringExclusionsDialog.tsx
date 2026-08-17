'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserSettings } from '@/components/user-settings-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SlidersHorizontal,
  Search,
  FolderTree,
  ShieldAlert,
  Landmark,
  Layers,
  CheckSquare,
  Square,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface CategoryItem {
  id: string;
  name: string;
  color: string;
  isIncome: boolean;
  categoryType: string;
  excludeFromReports: boolean;
}

interface AccountItem {
  id: string;
  name: string;
  type: string;
  institutionName?: string;
  isVirtual?: boolean;
}

interface RecurringExclusionsDialogProps {
  open: boolean;
  onClose: () => void;
  onSavedAndRescan?: () => void;
}

export function RecurringExclusionsDialog({ open, onClose, onSavedAndRescan }: RecurringExclusionsDialogProps) {
  const queryClient = useQueryClient();
  const settingsContext = useUserSettings();
  const settings = settingsContext?.settings || {};
  const updateSetting = settingsContext?.updateSetting;

  const [activeTab, setActiveTab] = useState<'categories' | 'accounts' | 'merchants'>('categories');
  const [categorySearch, setCategorySearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [newMerchantPattern, setNewMerchantPattern] = useState('');
  const [saving, setSaving] = useState(false);

  // Local state for exclusions
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [merchantPatterns, setMerchantPatterns] = useState<string[]>([]);

  // Initialize from user settings
  useEffect(() => {
    if (open) {
      const exclusions = (settings.recurringExclusions as any) || {};
      setSelectedCategoryIds(Array.isArray(exclusions.categoryIds) ? exclusions.categoryIds : []);
      setSelectedAccountIds(Array.isArray(exclusions.accountIds) ? exclusions.accountIds : []);
      setMerchantPatterns(Array.isArray(exclusions.merchantPatterns) ? exclusions.merchantPatterns : []);
      setCategorySearch('');
      setAccountSearch('');
      setNewMerchantPattern('');
    }
  }, [open, settings.recurringExclusions]);

  // Fetch all user categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CategoryItem[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load categories');
      return res.json();
    },
    enabled: open,
  });

  // Fetch all user accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<AccountItem[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    enabled: open,
  });

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const query = categorySearch.toLowerCase().trim();
    return categories.filter((c) => c.name.toLowerCase().includes(query));
  }, [categories, categorySearch]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const query = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        (a.institutionName && a.institutionName.toLowerCase().includes(query))
    );
  }, [accounts, accountSearch]);

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleToggleAccount = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleAddMerchantPattern = () => {
    const trimmed = newMerchantPattern.trim().toLowerCase();
    if (!trimmed) return;
    if (!merchantPatterns.includes(trimmed)) {
      setMerchantPatterns((prev) => [...prev, trimmed]);
    }
    setNewMerchantPattern('');
  };

  const handleRemoveMerchantPattern = (pat: string) => {
    setMerchantPatterns((prev) => prev.filter((p) => p !== pat));
  };

  const handleSave = async (rescan: boolean = false) => {
    setSaving(true);
    try {
      const newExclusions = {
        categoryIds: selectedCategoryIds,
        accountIds: selectedAccountIds,
        merchantPatterns: merchantPatterns.filter(Boolean),
      };

      if (updateSetting) {
        await updateSetting('recurringExclusions', newExclusions);
      } else {
        await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurringExclusions: newExclusions }),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      queryClient.invalidateQueries({ queryKey: ['recurring'] });

      toast.success('Recurring detection exclusions saved');
      onClose();

      if (rescan && onSavedAndRescan) {
        onSavedAndRescan();
      }
    } catch (err) {
      toast.error('Failed to save exclusions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Recurring Exclusions
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Configure accounts, categories, and keywords to ignore from automatic subscription detection.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Selection */}
        <div className="px-5 pt-3">
          <AppTabs
            tabs={[
              { id: 'categories', label: `Categories (${selectedCategoryIds.length})` },
              { id: 'accounts', label: `Accounts (${selectedAccountIds.length})` },
              { id: 'merchants', label: `Keywords (${merchantPatterns.length})` },
            ]}
            activeTab={activeTab}
            onChange={(t) => setActiveTab(t as any)}
            variant="pills"
            size="sm"
          />
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* ── Categories Tab ── */}
          {activeTab === 'categories' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories to exclude..."
                  className="pl-8 text-xs h-9"
                />
              </div>

              {categoriesLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  Loading categories...
                </div>
              ) : (
                <div className="border border-border/60 rounded-xl divide-y divide-border/40 max-h-[300px] overflow-y-auto">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleToggleCategory(cat.id)}
                        className={cn(
                          'w-full p-2.5 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                          isSelected && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color || '#6366f1' }}
                          />
                          <span className="font-medium text-foreground truncate">{cat.name}</span>
                          {cat.excludeFromReports && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                              transfer/excluded
                            </span>
                          )}
                        </div>
                        <div className="shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground/60" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Accounts Tab ── */}
          {activeTab === 'accounts' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search linked accounts to exclude..."
                  className="pl-8 text-xs h-9"
                />
              </div>

              {accountsLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  Loading accounts...
                </div>
              ) : (
                <div className="border border-border/60 rounded-xl divide-y divide-border/40 max-h-[300px] overflow-y-auto">
                  {filteredAccounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handleToggleAccount(acc.id)}
                        className={cn(
                          'w-full p-2.5 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                          isSelected && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block">
                              {acc.name}
                            </span>
                            {acc.institutionName && (
                              <span className="text-[10px] text-muted-foreground block truncate">
                                {acc.institutionName} • {acc.type}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground/60" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Merchant Keywords Tab ── */}
          {activeTab === 'merchants' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newMerchantPattern}
                  onChange={(e) => setNewMerchantPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddMerchantPattern();
                    }
                  }}
                  placeholder="e.g. atm, venmo, check, internal transfer..."
                  className="text-xs h-9"
                />
                <Button
                  type="button"
                  onClick={handleAddMerchantPattern}
                  size="sm"
                  variant="outline"
                  className="text-xs h-9 font-medium shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>

              <div className="border border-border/60 rounded-xl p-3 min-h-[140px] max-h-[300px] overflow-y-auto space-y-1.5">
                {merchantPatterns.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No custom merchant keywords added yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {merchantPatterns.map((pat) => (
                      <span
                        key={pat}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-foreground text-xs font-mono border border-border/80"
                      >
                        <span>{pat}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMerchantPattern(pat)}
                          className="hover:text-destructive text-muted-foreground transition-colors ml-0.5"
                          title="Remove keyword"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-between sm:justify-between gap-2 flex-wrap">
          <p className="w-full order-first text-xs text-muted-foreground">
            Exclusions apply to future scans. Items already detected will stay until you remove them.
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="text-xs h-8"
            >
              Save & Re-Scan
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="text-xs h-8 font-semibold"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save Exclusions
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
