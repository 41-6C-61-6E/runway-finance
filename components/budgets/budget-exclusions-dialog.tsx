'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserSettings } from '@/components/user-settings-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SlidersHorizontal,
  Search,
  Tag as TagIcon,
  FolderTree,
  ShieldAlert,
  Info,
  Check,
  RotateCcw,
  ArrowRightLeft,
  Briefcase,
  EyeOff,
  Layers,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';

interface CategoryItem {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
  categoryType: string;
  isSystem: boolean;
  excludeFromReports: boolean;
  isDiscretionary: boolean;
  transactionCount?: number;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  transactionCount?: number;
}

interface BudgetExclusionsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function BudgetExclusionsDialog({ open, onClose }: BudgetExclusionsDialogProps) {
  const queryClient = useQueryClient();
  const settingsContext = useUserSettings();
  const settings = settingsContext?.settings || {};
  const updateSetting = settingsContext?.updateSetting;

  const [activeTab, setActiveTab] = useState<'categories' | 'tags' | 'defaults'>('categories');
  const [categorySearch, setCategorySearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Local state for exclusions
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Initialize from user settings
  useEffect(() => {
    if (open) {
      const exclusions = settings.budgetExclusions || {};
      setSelectedCategoryIds(Array.isArray(exclusions.categoryIds) ? exclusions.categoryIds : []);
      setSelectedTagIds(Array.isArray(exclusions.tagIds) ? exclusions.tagIds : []);
      setCategorySearch('');
      setTagSearch('');
    }
  }, [open, settings.budgetExclusions]);

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

  // Fetch all user tags
  const { data: tags = [], isLoading: tagsLoading } = useQuery<TagItem[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json();
    },
    enabled: open,
  });

  // Categorize into Standard (customizable) vs System Defaults
  const { standardCategories, defaultExcludedCategories } = useMemo(() => {
    const standard: CategoryItem[] = [];
    const defaults: CategoryItem[] = [];

    for (const cat of categories) {
      // Default excluded categories: transfers, compound payroll deductions, or excludeFromReports
      if (cat.categoryType === 'transfer' || cat.categoryType === 'compound' || cat.excludeFromReports) {
        defaults.push(cat);
      } else {
        standard.push(cat);
      }
    }

    return { standardCategories: standard, defaultExcludedCategories: defaults };
  }, [categories]);

  // Organize standard categories into hierarchy (roots & children)
  const categoryTree = useMemo(() => {
    const roots = standardCategories.filter((c) => !c.parentId);
    const childMap = new Map<string, CategoryItem[]>();

    for (const c of standardCategories) {
      if (c.parentId) {
        const list = childMap.get(c.parentId) || [];
        list.push(c);
        childMap.set(c.parentId, list);
      }
    }

    // Filter by search
    const q = categorySearch.toLowerCase().trim();
    if (!q) {
      return roots.map((root) => ({
        ...root,
        children: childMap.get(root.id) || [],
      }));
    }

    const filtered: Array<CategoryItem & { children: CategoryItem[] }> = [];
    for (const root of roots) {
      const matchesRoot = root.name.toLowerCase().includes(q);
      const matchingChildren = (childMap.get(root.id) || []).filter((ch) =>
        ch.name.toLowerCase().includes(q)
      );

      if (matchesRoot || matchingChildren.length > 0) {
        filtered.push({
          ...root,
          children: matchesRoot ? (childMap.get(root.id) || []) : matchingChildren,
        });
      }
    }

    return filtered;
  }, [standardCategories, categorySearch]);

  // Filtered tags
  const filteredTags = useMemo(() => {
    const q = tagSearch.toLowerCase().trim();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  }, [tags, tagSearch]);

  // Group default exclusions for display
  const defaultExclusionGroups = useMemo(() => {
    const transfers = defaultExcludedCategories.filter((c) => c.categoryType === 'transfer');
    const compounds = defaultExcludedCategories.filter((c) => c.categoryType === 'compound');
    const reportsExcluded = defaultExcludedCategories.filter((c) => c.excludeFromReports && c.categoryType !== 'transfer' && c.categoryType !== 'compound');

    return { transfers, compounds, reportsExcluded };
  }, [defaultExcludedCategories]);

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCategories = () => {
    const allIds = standardCategories.map((c) => c.id);
    setSelectedCategoryIds(allIds);
  };

  const handleClearAllCategories = () => {
    setSelectedCategoryIds([]);
  };

  const handleSave = async () => {
    if (!updateSetting) return;
    setSaving(true);
    try {
      await updateSetting('budgetExclusions', {
        categoryIds: selectedCategoryIds,
        tagIds: selectedTagIds,
      });

      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Budget exclusions saved successfully');
      onClose();
    } catch (err) {
      toast.error('Failed to save budget exclusions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border shadow-2xl">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border/80 text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
                Budget Exclusions
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure custom categories and tags to ignore from budget actuals and unbudgeted calculations.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-border/60 bg-muted/20">
            <div className="grid grid-cols-3 w-full bg-muted/60 h-9 p-1 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => setActiveTab('categories')}
                className={cn(
                  "text-xs font-medium gap-1.5 flex items-center justify-center rounded-md transition-all cursor-pointer",
                  activeTab === 'categories'
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Categories</span>
                {selectedCategoryIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
                    {selectedCategoryIds.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tags')}
                className={cn(
                  "text-xs font-medium gap-1.5 flex items-center justify-center rounded-md transition-all cursor-pointer",
                  activeTab === 'tags'
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TagIcon className="w-3.5 h-3.5" />
                <span>Tags</span>
                {selectedTagIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('defaults')}
                className={cn(
                  "text-xs font-medium gap-1.5 flex items-center justify-center rounded-md transition-all cursor-pointer",
                  activeTab === 'defaults'
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Default Exclusions</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* 1. CUSTOM CATEGORIES TAB */}
            {activeTab === 'categories' && (
            <div className="m-0 space-y-3 outline-none">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-background border-border/80"
                  />
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectAllCategories}
                    className="px-2 py-1 text-[11px] font-medium text-foreground bg-accent hover:bg-accent/80 border border-border/70 rounded transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllCategories}
                    className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-accent hover:bg-accent/80 border border-border/70 rounded transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-accent/40 border border-border/60 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Excluded categories are ignored from budget target pacing, actuals aggregation, and the "Everything Else" catch-all bucket.
                </span>
              </div>

              {categoriesLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading categories...</span>
                </div>
              ) : categoryTree.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No matching categories found
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl divide-y divide-border/60 bg-background/50 overflow-hidden">
                  {categoryTree.map((root) => {
                    const isRootIgnored = selectedCategoryIds.includes(root.id);
                    return (
                      <div key={root.id} className="p-2.5 sm:p-3 space-y-2">
                        {/* Parent Row */}
                        <div
                          onClick={() => toggleCategory(root.id)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                            isRootIgnored ? "bg-destructive/10 border border-destructive/20" : "hover:bg-accent/60"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0"
                              style={{
                                borderColor: isRootIgnored ? 'var(--destructive)' : 'var(--border)',
                                backgroundColor: isRootIgnored ? 'var(--destructive)' : 'transparent',
                              }}
                            >
                              {isRootIgnored && <Check className="w-3 h-3 text-white stroke-[3]" />}
                            </div>
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: root.color }} />
                            <span className={cn("text-xs font-semibold truncate", isRootIgnored ? "text-destructive line-through" : "text-foreground")}>
                              {root.name}
                            </span>
                            {root.isIncome && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                Income
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                            {isRootIgnored ? 'Ignored' : 'Included'}
                          </span>
                        </div>

                        {/* Children List */}
                        {root.children && root.children.length > 0 && (
                          <div className="pl-6 sm:pl-7 pr-1 space-y-1">
                            {root.children.map((child) => {
                              const isChildIgnored = selectedCategoryIds.includes(child.id);
                              return (
                                <div
                                  key={child.id}
                                  onClick={() => toggleCategory(child.id)}
                                  className={cn(
                                    "flex items-center justify-between p-1.5 px-2 rounded-md cursor-pointer transition-colors text-xs",
                                    isChildIgnored ? "bg-destructive/10 text-destructive border border-destructive/20" : "hover:bg-accent/50 text-foreground"
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0"
                                      style={{
                                        borderColor: isChildIgnored ? 'var(--destructive)' : 'var(--border)',
                                        backgroundColor: isChildIgnored ? 'var(--destructive)' : 'transparent',
                                      }}
                                    >
                                      {isChildIgnored && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                                    </div>
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color }} />
                                    <span className={cn("truncate font-medium", isChildIgnored ? "line-through text-destructive" : "")}>
                                      {child.name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                    {isChildIgnored ? 'Ignored' : 'Included'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* 2. CUSTOM TAGS TAB */}
            {activeTab === 'tags' && (
            <div className="m-0 space-y-3 outline-none">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search transaction tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="pl-8 text-xs h-8 bg-background border-border/80"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-accent/40 border border-border/60 text-xs text-muted-foreground flex items-start gap-2">
                <TagIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Transactions tagged with an excluded tag (such as <code className="text-primary font-mono font-semibold">#reimbursable</code> or <code className="text-primary font-mono font-semibold">#split</code>) will be omitted from all budget actuals and spending calculations.
                </span>
              </div>

              {tagsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading tags...</span>
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg space-y-1">
                  <p className="font-semibold text-foreground">No tags found</p>
                  <p className="text-[11px]">Create tags on your transactions or in Settings &gt; Tags to filter spending by custom markers.</p>
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl divide-y divide-border/60 bg-background/50 overflow-hidden">
                  {filteredTags.map((tag) => {
                    const isIgnored = selectedTagIds.includes(tag.id);
                    return (
                      <div
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          "flex items-center justify-between p-2.5 sm:p-3 cursor-pointer transition-colors",
                          isIgnored ? "bg-destructive/10 border-l-2 border-l-destructive" : "hover:bg-accent/60"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0"
                            style={{
                              borderColor: isIgnored ? 'var(--destructive)' : 'var(--border)',
                              backgroundColor: isIgnored ? 'var(--destructive)' : 'transparent',
                            }}
                          >
                            {isIgnored && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="px-2 py-0.5 text-xs font-semibold rounded-md flex items-center gap-1 shrink-0"
                              style={{
                                backgroundColor: `${tag.color || '#6366f1'}20`,
                                color: tag.color || '#6366f1',
                                border: `1px solid ${tag.color || '#6366f1'}40`,
                              }}
                            >
                              <TagIcon className="w-3 h-3 shrink-0" />
                              <span>{tag.name}</span>
                            </span>
                            {tag.description && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                                &mdash; {tag.description}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {tag.transactionCount ?? 0} txs
                          </span>
                          <span className={cn("text-xs font-mono font-medium", isIgnored ? "text-destructive" : "text-muted-foreground")}>
                            {isIgnored ? 'Ignored' : 'Active'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* 3. DEFAULT SYSTEM EXCLUSIONS TAB */}
            {activeTab === 'defaults' && (
            <div className="m-0 space-y-4 outline-none">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-primary">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Automatic System Exclusions</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  These categories are automatically ignored by default to prevent double counting transfers, financial reallocations, and payroll withholdings as operating consumption expenses.
                </p>
              </div>

              {/* Transfers Group */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
                  <span>Transfers & Adjustments (Auto-Excluded)</span>
                </div>
                <div className="border border-border/80 rounded-xl divide-y divide-border/60 bg-muted/15 overflow-hidden">
                  {defaultExclusionGroups.transfers.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No transfer categories configured</div>
                  ) : (
                    defaultExclusionGroups.transfers.map((cat) => (
                      <div key={cat.id} className="p-2.5 sm:px-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-medium text-foreground">{cat.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                          Transfer
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Payroll Compounds Group */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span>Payroll Deductions & Compounds (Auto-Excluded)</span>
                </div>
                <div className="border border-border/80 rounded-xl divide-y divide-border/60 bg-muted/15 overflow-hidden">
                  {defaultExclusionGroups.compounds.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No compound payroll categories configured</div>
                  ) : (
                    defaultExclusionGroups.compounds.map((cat) => (
                      <div key={cat.id} className="p-2.5 sm:px-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-medium text-foreground">{cat.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20">
                          Payroll Compound
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Report Exclusions */}
              {defaultExclusionGroups.reportsExcluded.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                    <EyeOff className="w-3.5 h-3.5 text-primary" />
                    <span>Explicit Report Exclusions</span>
                  </div>
                  <div className="border border-border/80 rounded-xl divide-y divide-border/60 bg-muted/15 overflow-hidden">
                    {defaultExclusionGroups.reportsExcluded.map((cat) => (
                      <div key={cat.id} className="p-2.5 sm:px-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-medium text-foreground">{cat.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                          Hidden from Reports
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 sm:p-4 border-t border-border/80 bg-muted/20 flex flex-row items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground font-mono">
            {selectedCategoryIds.length} categories, {selectedTagIds.length} tags ignored
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-foreground hover:bg-accent border border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save Exclusions</span>
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
