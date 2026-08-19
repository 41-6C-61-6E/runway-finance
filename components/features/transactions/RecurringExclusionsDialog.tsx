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
import { getTypesByGroup } from '@/lib/constants/account-types';
import {
  SlidersHorizontal,
  Search,
  Landmark,
  Layers,
  CheckSquare,
  Square,
  MinusSquare,
  Loader2,
  Plus,
  X,
} from 'lucide-react';

interface CategoryItem {
  id: string;
  name: string;
  parentId?: string | null;
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

  const [activeTab, setActiveTab] = useState<'categories' | 'accounts' | 'types' | 'merchants'>('categories');
  const [categorySearch, setCategorySearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [newMerchantPattern, setNewMerchantPattern] = useState('');
  const [saving, setSaving] = useState(false);

  // Local state for exclusions
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([]);
  const [merchantPatterns, setMerchantPatterns] = useState<string[]>([]);

  // Initialize from user settings (only when the dialog opens, so that
  // settings refreshes mid-edit don't clobber local selections)
  useEffect(() => {
    if (open) {
      const exclusions = (settings.recurringExclusions as any) || {};
      setSelectedCategoryIds(Array.isArray(exclusions.categoryIds) ? exclusions.categoryIds : []);
      setSelectedAccountIds(Array.isArray(exclusions.accountIds) ? exclusions.accountIds : []);
      setSelectedAccountTypes(Array.isArray(exclusions.accountTypes) ? exclusions.accountTypes : []);
      setMerchantPatterns(Array.isArray(exclusions.merchantPatterns) ? exclusions.merchantPatterns : []);
      setCategorySearch('');
      setAccountSearch('');
      setNewMerchantPattern('');
    }
  }, [open]);


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

  // Category tree: parents with nested children (1 level deep is enough for
  // the typical category hierarchy; deeper descendants are appended as children)
  const { categoryParents, categoryChildrenById } = useMemo(() => {
    const ids = new Set(categories.map((c) => c.id));
    const childrenById = new Map<string, CategoryItem[]>();
    const parents: CategoryItem[] = [];
    for (const cat of categories) {
      if (cat.parentId && ids.has(cat.parentId)) {
        const list = childrenById.get(cat.parentId) || [];
        list.push(cat);
        childrenById.set(cat.parentId, list);
      } else {
        parents.push(cat);
      }
    }
    return { categoryParents: parents, categoryChildrenById: childrenById };
  }, [categories]);

  // Categories visible in the list, respecting search (a parent row shows when
  // it matches, or when any of its children match; only matching children are
  // rendered under it while searching)
  const visibleCategoryRows = useMemo(() => {
    const query = categorySearch.toLowerCase().trim();
    const matches = (c: CategoryItem) => (query ? c.name.toLowerCase().includes(query) : true);
    return categoryParents
      .map((parent) => {
        const allChildren = categoryChildrenById.get(parent.id) || [];
        const children = query ? allChildren.filter((c) => matches(c)) : allChildren;
        const show = matches(parent) || children.length > 0;
        if (!show) return null;
        return { parent, children, allChildren };
      })
      .filter(Boolean) as { parent: CategoryItem; children: CategoryItem[]; allChildren: CategoryItem[] }[];
  }, [categoryParents, categoryChildrenById, categorySearch]);

  // Effective selection for a parent: selected if its ID or all listed
  // children are selected; "partial" if some (but not all) are selected
  const parentSelectionState = (parent: CategoryItem, children: CategoryItem[]) => {
    const childIds = children.map((c) => c.id);
    const selectedChildren = childIds.filter((id) => selectedCategoryIds.includes(id)).length;
    const parentSelected = selectedCategoryIds.includes(parent.id);
    const totalSelected = selectedChildren + (parentSelected ? 1 : 0);
    if (totalSelected === childIds.length + 1) return 'all' as const;
    if (totalSelected === 0) return 'none' as const;
    return 'partial' as const;
  };

  const handleToggleCategoryGroup = (parent: CategoryItem, children: CategoryItem[]) => {
    const parentSel = selectedCategoryIds.includes(parent.id);
    const allChildIds = children.map((c) => c.id);
    const allSelected = parentSel && allChildIds.every((id) => selectedCategoryIds.includes(id));
    setSelectedCategoryIds((prev) => {
      if (allSelected && allChildIds.length > 0) {
        // Deselect parent and all children
        return prev.filter((id) => id !== parent.id && !allChildIds.includes(id));
      }
      // Select parent and all children
      const next = new Set(prev);
      next.add(parent.id);
      for (const id of allChildIds) next.add(id);
      return [...next];
    });
  };

  // Account types with counts derived from the user's accounts
  const accountTypesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const acc of accounts) {
      if (!acc.type) continue;
      counts.set(acc.type, (counts.get(acc.type) || 0) + 1);
    }
    return getTypesByGroup()
      .map((g) => ({
        group: g.group,
        types: g.types.filter((t) => counts.has(t.value)),
        count: g.types.reduce((n, t) => n + (counts.get(t.value) || 0), 0),
      }))
      .filter((g) => g.types.length > 0);
  }, [accounts]);

  const typeGroupState = (types: { value: string }[]) => {
    const all = types.length > 0 && types.every((t) => selectedAccountTypes.includes(t.value));
    const some = types.some((t) => selectedAccountTypes.includes(t.value));
    if (all) return 'all' as const;
    if (some) return 'partial' as const;
    return 'none' as const;
  };

  const handleToggleTypeGroup = (types: { value: string }[]) => {
    const all = types.every((t) => selectedAccountTypes.includes(t.value));
    setSelectedAccountTypes((prev) => {
      if (all) return prev.filter((id) => !types.some((t) => t.value === id));
      const next = new Set(prev);
      for (const t of types) next.add(t.value);
      return [...next];
    });
  };

  const handleToggleAccountType = (type: string) => {
    setSelectedAccountTypes((prev) =>
      prev.includes(type) ? prev.filter((id) => id !== type) : [...prev, type]
    );
  };

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
        accountTypes: selectedAccountTypes,
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
                Configure categories, accounts, account types, and payee keywords to ignore from automatic subscription detection.
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
              { id: 'types', label: `Types (${selectedAccountTypes.length})` },
              { id: 'merchants', label: `Keywords (${merchantPatterns.length})` },
            ]}
            activeTab={activeTab}
            onChange={(t) => setActiveTab(t as 'categories' | 'accounts' | 'types' | 'merchants')}
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
              <p className="text-[11px] text-muted-foreground">
                Selecting a parent category also excludes all of its sub-categories.
              </p>

              {categoriesLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  Loading categories...
                </div>
              ) : (
                <div className="border border-border/60 rounded-xl divide-y divide-border/40 max-h-[300px] overflow-y-auto">
                  {visibleCategoryRows.length === 0 && (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      No categories match your search.
                    </p>
                  )}
                  {visibleCategoryRows.map(({ parent, children, allChildren }) => {
                    const parentState = parentSelectionState(parent, allChildren);
                    return (
                      <div key={parent.id}>
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryGroup(parent, allChildren)}
                          className={cn(
                            'w-full p-2.5 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                            (parentState === 'all' || (parentState === 'partial' && selectedCategoryIds.includes(parent.id))) && 'bg-primary/5'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-foreground truncate">{parent.name}</span>
                            {allChildren.length > 0 && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {allChildren.length} sub-categor{allChildren.length === 1 ? 'y' : 'ies'}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0">
                            {parentState === 'all' ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : parentState === 'partial' ? (
                              <MinusSquare className="w-4 h-4 text-primary/70" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground/60" />
                            )}
                          </div>
                        </button>
                        {children.length > 0 ? (
                          <div className="border-t border-border/30">
                            {children.map((cat) => {
                              const isSelected = selectedCategoryIds.includes(cat.id);
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => handleToggleCategory(cat.id)}
                                  className={cn(
                                    'w-full pl-8 pr-2.5 py-2 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                                    isSelected && 'bg-primary/5'
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: cat.color || '#6366f1' }}
                                    />
                                    <span className="text-foreground/90 truncate">{cat.name}</span>
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
                        ) : null}
                      </div>
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
          {/* ── Account Types Tab ── */}
          {activeTab === 'types' && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Exclude entire account types or subtypes (e.g. Retirement, Mortgage). This
                applies to all of your accounts of the selected type — not just linked ones.
              </p>

              {accountsLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  Loading accounts...
                </div>
              ) : accountTypesWithCounts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No linked accounts with known types to exclude by type.
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {accountTypesWithCounts.map(({ group, types, count }) => {
                    const groupState = typeGroupState(types);
                    return (
                      <div key={group} className="border border-border/60 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleToggleTypeGroup(types)}
                          className={cn(
                            'w-full p-2.5 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                            groupState === 'all' && 'bg-primary/5'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground truncate">{group}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {count} account{count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {groupState === 'all' ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : groupState === 'partial' ? (
                              <MinusSquare className="w-4 h-4 text-primary/70" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground/60" />
                            )}
                          </div>
                        </button>
                        <div className="border-t border-border/30 divide-y divide-border/30">
                          {types.map((t) => {
                            const isSelected = selectedAccountTypes.includes(t.value);
                            return (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => handleToggleAccountType(t.value)}
                                className={cn(
                                  'w-full pl-8 pr-2.5 py-2 flex items-center justify-between text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer',
                                  isSelected && 'bg-primary/5'
                                )}
                              >
                                <span className="text-foreground/90 truncate">{t.label}</span>
                                <div className="shrink-0">
                                  {isSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-muted-foreground/60" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
