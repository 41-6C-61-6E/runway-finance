'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CATEGORY_COLORS } from '@/lib/colors/palette';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Sparkles, Search, Filter, Copy, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type CategoryType = 'standard' | 'compound' | 'transfer';
type FormCategoryType = 'expense' | 'income' | 'compound' | 'transfer';

type Category = {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
  categoryType: CategoryType;
  expenseParentId: string | null;
  isSystem: boolean;
  createdByAi: boolean;
  excludeFromReports: boolean;
  hideFromTransactions: boolean;
  displayOrder: number;
  transactionCount: number;
};

const COLOR_OPTIONS = CATEGORY_COLORS;

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [cloning, setCloning] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<{ kept: number; deleted: number; created: number } | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showDescription, setShowDescription] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'compound' | 'transfer'>('all');
  const [filterSources, setFilterSources] = useState<Set<'system' | 'user' | 'ai'>>(
    new Set(['system', 'user', 'ai'])
  );

  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formColor, setFormColor] = useState('#6366f1');
  const [formCategoryType, setFormCategoryType] = useState<FormCategoryType>('expense');
  const [formExpenseParentId, setFormExpenseParentId] = useState<string | null>(null);
  const [formOrder, setFormOrder] = useState(0);
  const [formHideFromTransactions, setFormHideFromTransactions] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const categoryById = useMemo(() => new Map(categories.map((cat) => [cat.id, cat])), [categories]);

  const categoryPathById = useMemo(() => {
    const cache = new Map<string, string>();

    const buildPath = (id: string | null | undefined, seen = new Set<string>()): string => {
      if (!id) return '';
      const cached = cache.get(id);
      if (cached) return cached;

      const cat = categoryById.get(id);
      if (!cat) return '';
      if (seen.has(id)) return cat.name;

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const parentPath = buildPath(cat.parentId, nextSeen);
      const path = parentPath ? `${parentPath} > ${cat.name}` : cat.name;
      cache.set(id, path);
      return path;
    };

    categories.forEach((cat) => buildPath(cat.id));
    return cache;
  }, [categories, categoryById]);

  const compoundExpenseOptions = useMemo(
    () =>
      categories
        .filter((c) => c.categoryType !== 'compound' && c.categoryType !== 'transfer' && !c.isIncome)
        .map((c) => ({
          ...c,
          path: categoryPathById.get(c.id) ?? c.name,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [categories, categoryPathById]
  );

  const inferCompoundExpenseParentId = useCallback((compoundName: string) => {
    const candidates = compoundName
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .reverse();

    for (const candidate of candidates) {
      const match = compoundExpenseOptions.find((cat) => cat.name.toLowerCase() === candidate.toLowerCase());
      if (match) return match.id;
    }

    return null;
  }, [compoundExpenseOptions]);

  useEffect(() => {
    if (formCategoryType !== 'compound') return;
    if (formExpenseParentId) return;
    const inferred = inferCompoundExpenseParentId(formName);
    if (inferred) {
      setFormExpenseParentId(inferred);
    }
  }, [formCategoryType, formName, formExpenseParentId, inferCompoundExpenseParentId]);

  const getCategoryPath = useCallback(
    (id: string | null | undefined) => (id ? categoryPathById.get(id) ?? categoryById.get(id)?.name ?? '' : ''),
    [categoryPathById, categoryById]
  );

  const parents = categories.filter((c) => !c.parentId);
  const children = categories.filter((c) => c.parentId);
  const getChildren = (parentId: string) => children.filter((c) => c.parentId === parentId);

  const toggleSourceFilter = (source: 'system' | 'user' | 'ai') => {
    setFilterSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const categoryMatchesSource = (cat: Category): boolean => {
    if (filterSources.size === 0) return true;
    if (cat.isSystem && filterSources.has('system')) return true;
    if (cat.createdByAi && filterSources.has('ai')) return true;
    if (!cat.isSystem && !cat.createdByAi && filterSources.has('user')) return true;
    return false;
  };

  const categoryMatchesType = (cat: Category): boolean => {
    if (filterType === 'all') return true;
    if (filterType === 'compound') return cat.categoryType === 'compound';
    if (filterType === 'transfer') return cat.categoryType === 'transfer';
    if (filterType === 'income') return cat.categoryType === 'compound' || cat.isIncome;
    if (filterType === 'expense') return cat.categoryType !== 'compound' && cat.categoryType !== 'transfer' && !cat.isIncome;
    return false;
  };

  const categoryMatchesSearch = (cat: Category): boolean => {
    if (!searchQuery.trim()) return true;
    return cat.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  const parentHasMatchingChildren = (parentId: string): boolean => {
    return children.some(
      (child) =>
        child.parentId === parentId &&
        categoryMatchesSearch(child) &&
        categoryMatchesType(child) &&
        categoryMatchesSource(child)
    );
  };

  const filteredParents = useMemo(() => {
    return parents
      .filter((parent) => {
        const parentMatches =
          categoryMatchesSearch(parent) &&
          categoryMatchesType(parent) &&
          categoryMatchesSource(parent);

        if (parentMatches) return true;
        if (parentHasMatchingChildren(parent.id)) return true;
        return false;
      })
      .sort((a, b) => {
        const aPriority = a.categoryType === 'compound' || a.categoryType === 'transfer' || a.name === 'Transfers & Adjustments' ? 0 : 1;
        const bPriority = b.categoryType === 'compound' || b.categoryType === 'transfer' || b.name === 'Transfers & Adjustments' ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.displayOrder - b.displayOrder;
      });
  }, [parents, searchQuery, filterType, filterSources]);

  const expandAll = () => {
    setExpandedParents(new Set(filteredParents.map((p) => p.id)));
  };

  const collapseAll = () => {
    setExpandedParents(new Set());
  };

  const openAdd = () => {
    setIsAdding(true);
    setEditing(null);
    setCloning(null);
    setFormName('');
    setFormParentId(null);
    setFormColor('#6366f1');
    setFormCategoryType('expense');
    setFormExpenseParentId(null);
    setFormOrder(categories.length);
    setFormHideFromTransactions(false);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setCloning(null);
    setIsAdding(false);
    setFormName(cat.name);
    setFormParentId(cat.parentId);
    setFormColor(cat.color);
    setFormCategoryType(cat.categoryType === 'compound' ? 'compound' : cat.categoryType === 'transfer' ? 'transfer' : cat.isIncome ? 'income' : 'expense');
    setFormExpenseParentId(cat.expenseParentId);
    setFormOrder(cat.displayOrder);
    setFormHideFromTransactions(cat.hideFromTransactions ?? false);
  };

  const openClone = (cat: Category) => {
    setCloning(cat);
    setEditing(null);
    setIsAdding(false);
    setFormName(`${cat.name} (Copy)`);
    setFormParentId(cat.parentId);
    setFormColor(cat.color);
    setFormCategoryType(cat.categoryType === 'compound' ? 'compound' : cat.categoryType === 'transfer' ? 'transfer' : cat.isIncome ? 'income' : 'expense');
    setFormExpenseParentId(cat.expenseParentId);
    setFormOrder(cat.displayOrder + 1);
    setFormHideFromTransactions(cat.hideFromTransactions ?? false);
  };

  const handleClose = () => {
    setIsAdding(false);
    setEditing(null);
    setCloning(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const isCompound = formCategoryType === 'compound';
      const isTransfer = formCategoryType === 'transfer';
      const resolvedExpenseParentId = isCompound
        ? formExpenseParentId || inferCompoundExpenseParentId(formName)
        : null;
      const body = {
        name: formName.trim(),
        parentId: formParentId || null,
        color: formColor,
        isIncome: isCompound ? true : isTransfer ? false : formCategoryType === 'income',
        categoryType: isCompound ? 'compound' : isTransfer ? 'transfer' : 'standard',
        expenseParentId: resolvedExpenseParentId,
        displayOrder: formOrder,
        hideFromTransactions: formHideFromTransactions,
      };

      if (editing) {
        await fetch(`/api/categories/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } else {
        await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      }

      setIsAdding(false);
      setEditing(null);
      setCloning(null);
      await fetchCategories();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/categories/${deleting.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleting(null);
      await fetchCategories();
    } catch {}
  };

  const handleResetToDefaults = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/categories/reset', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      setShowResetConfirm(false);
      setResetResult({ kept: data.kept ?? 0, deleted: data.deleted ?? 0, created: data.created ?? 0 });
      await fetchCategories();
    } catch {}
    setResetting(false);
  };

  const toggleExpanded = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading categories...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">Categories</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative group/tooltip overflow-visible">
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refresh Categories
            </button>
            <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 text-center text-xs font-medium text-popover-foreground shadow-xl backdrop-blur-sm opacity-0 invisible transition-all duration-150 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:visible whitespace-normal">
              Removes unused categories, adds missing defaults, and re-classifies existing categories (e.g. marks Transfers as transfer type).
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Category
          </button>
        </div>
      </div>

      {/* Explanation */}
      <div className="mb-3 rounded-lg border border-border bg-muted/40">
        <button
          type="button"
          onClick={() => setShowDescription((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/60 transition-colors rounded-lg"
        >
          <span>Category type guide</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${showDescription ? 'rotate-180' : ''}`} />
        </button>
        {showDescription && (
          <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Income</strong> — appears on the income side of charts (cash flow, sankey).</p>
            <p><strong className="text-foreground">Expense</strong> — appears on the expense side of charts, tracked against budgets.</p>
            <p><strong className="text-foreground">Compound</strong> — a single transaction that is rendered as both income <em>and</em> expense (e.g. 401k contributions, payroll deductions). In charts, the compound category itself is used on the income side, and its linked <em>Uses Expense Category</em> is used on the expense side, so one transaction can show up in both places while net cash flow stays $0. You can point these links at either top-level or sub-level categories, depending on how you want the transaction to roll up in reports and Sankey.</p>
            <p><strong className="text-foreground">Transfer</strong> — a movement of funds between accounts (e.g. checking → savings). Does not affect income, expenses, or budgets.</p>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
            placeholder="Search categories..."
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filters and Expand/Collapse Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex flex-wrap rounded-lg border border-border">
            {(['all', 'income', 'expense', 'compound', 'transfer'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterType === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {type === 'all' ? 'All' : type === 'income' ? 'Income' : type === 'expense' ? 'Expense' : type === 'compound' ? 'Compound' : 'Transfer'}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {([
              { key: 'system' as const, label: 'System' },
              { key: 'user' as const, label: 'My' },
              { key: 'ai' as const, label: 'AI' },
            ]).map((source) => (
              <button
                key={source.key}
                onClick={() => toggleSourceFilter(source.key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  filterSources.has(source.key)
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground opacity-50 hover:opacity-70'
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md bg-background hover:bg-muted transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md bg-background hover:bg-muted transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Empty state for filters */}
      {filteredParents.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {searchQuery || filterSources.size === 0
              ? 'No categories match your filters.'
              : 'No categories yet.'}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {filteredParents.map((parent) => {
          const childList = getChildren(parent.id);
          const isExpanded = expandedParents.has(parent.id);
          return (
            <div key={parent.id}>
              <div
                onClick={() => openEdit(parent)}
                className="p-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {childList.length > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); toggleExpanded(parent.id); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                    <span className="text-foreground text-sm font-medium truncate">{parent.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(parent); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit category">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openClone(parent); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Clone category">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleting(parent); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete category">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    parent.categoryType === 'compound' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' :
                    parent.categoryType === 'transfer' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                    parent.isIncome ? 'bg-chart-1/15 text-chart-1' : 'bg-chart-5/15 text-chart-5'
                  }`}>
                    {parent.categoryType === 'compound' ? 'Compound' : parent.categoryType === 'transfer' ? 'Transfer' : parent.isIncome ? 'Income' : 'Expense'}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/60">{parent.transactionCount}</span>
                  {parent.isSystem && (
                    <span className="text-[10px] text-muted-foreground">System</span>
                  )}
                  {parent.createdByAi && (
                    <Sparkles className="h-3 w-3 opacity-60 flex-shrink-0" />
                  )}
                  {parent.hideFromTransactions && (
                    <span title="Hidden from transactions page">
                      <EyeOff className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                    </span>
                  )}
                </div>
              </div>
              {parent.categoryType === 'compound' && (parent.parentId || parent.expenseParentId) && (
                <div className="px-3 pt-1 pb-0.5 text-[10px] text-muted-foreground">
                  <span className="font-medium text-muted-foreground/80">Uses income category:</span>{' '}
                  {getCategoryPath(parent.parentId) || 'Not set'}
                  <span className="mx-1.5">•</span>
                  <span className="font-medium text-muted-foreground/80">Uses expense category:</span>{' '}
                  {getCategoryPath(parent.expenseParentId) || 'Not set'}
                </div>
              )}
               {(() => {
                 const filteredChildren = childList.filter(
                   (c) =>
                     categoryMatchesSearch(c) &&
                     categoryMatchesType(c) &&
                     categoryMatchesSource(c)
                 );
                 if (!isExpanded || filteredChildren.length === 0) return null;
                 return (
                   <div className="ml-6 mt-1 space-y-1">
                     {filteredChildren.map((child) => (
                       <div key={child.id}>
                          <div
                            onClick={() => openEdit(child)}
                            className="p-2.5 bg-muted/30 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                                <span className="text-foreground/80 text-sm truncate">{child.name}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <button onClick={(e) => { e.stopPropagation(); openEdit(child); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit category">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); openClone(child); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Clone category">
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleting(child); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete category">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                child.categoryType === 'compound' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' :
                                child.categoryType === 'transfer' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                 child.isIncome ? 'bg-chart-1/15 text-chart-1' : 'bg-chart-5/15 text-chart-5'
                              }`}>
                                {child.categoryType === 'compound' ? 'Compound' : child.categoryType === 'transfer' ? 'Transfer' : child.isIncome ? 'Income' : 'Expense'}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground/60">{child.transactionCount}</span>
                              {child.isSystem && (
                                <span className="text-[10px] text-muted-foreground">System</span>
                              )}
                              {child.createdByAi && (
                                <Sparkles className="h-3 w-3 opacity-60 flex-shrink-0" />
                              )}
                              {child.hideFromTransactions && (
                                <span title="Hidden from transactions page">
                                  <EyeOff className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                                </span>
                              )}
                            </div>
                          </div>
                         {child.categoryType === 'compound' && (child.parentId || child.expenseParentId) && (
                           <div className="px-2.5 pb-1 text-[10px] text-muted-foreground">
                             <span className="font-medium text-muted-foreground/80">Uses income category:</span>{' '}
                             {getCategoryPath(child.parentId) || 'Not set'}
                             <span className="mx-1.5">•</span>
                             <span className="font-medium text-muted-foreground/80">Uses expense category:</span>{' '}
                             {getCategoryPath(child.expenseParentId) || 'Not set'}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 );
               })()}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Drawer */}
      <Sheet open={isAdding || editing !== null || cloning !== null} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="right" className="bg-card border-l border-border p-6 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {editing ? 'Edit Category' : cloning ? 'Clone Category' : 'Add Category'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="Category name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {formCategoryType === 'compound' ? 'Uses Income Category' : 'Parent Group'}
              </label>
              <select
                value={formParentId || ''}
                onChange={(e) => setFormParentId(e.target.value || null)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">
                  {formCategoryType === 'compound' ? 'Select income category...' : 'None (top-level group)'}
                </option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      formColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Category Type</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(['expense', 'income', 'compound', 'transfer'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setFormCategoryType(type);
                      if (type === 'compound') {
                        setFormExpenseParentId((prev) => prev || inferCompoundExpenseParentId(formName));
                      } else {
                        setFormExpenseParentId(null);
                      }
                    }}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                      formCategoryType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : type === 'compound' ? 'Compound' : 'Transfer'}
                  </button>
                ))}
              </div>
            </div>
            {formCategoryType === 'compound' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Uses Expense Category</label>
                <select
                  value={formExpenseParentId || ''}
                  onChange={(e) => setFormExpenseParentId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select expense category...</option>
                  {compoundExpenseOptions
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.path}</option>
                    ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  This category is used as the expense-side category in charts and reporting. It can be top-level or nested.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Display Order</label>
              <input
                type="number"
                value={formOrder}
                onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <label className="block text-sm font-medium text-foreground">Hide from transactions</label>
                <p className="text-xs text-muted-foreground">Transactions in this category are hidden by default on the transactions page</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formHideFromTransactions}
                onClick={() => setFormHideFromTransactions(!formHideFromTransactions)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                  formHideFromTransactions ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                  formHideFromTransactions ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => { setIsAdding(false); setEditing(null); setCloning(null); }}
              className="flex-1 px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : editing ? 'Update' : cloning ? 'Clone' : 'Create'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>? Transactions using this category will become uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              Delete
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh Categories</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will <strong>remove unused categories</strong>, add missing defaults, and re-classify existing categories (e.g. Transfers will be marked as transfer type).
                </p>
                <p>
                  Categories that still have transactions, budgets, or rules assigned to them will be <strong>preserved</strong> to avoid uncategorizing your data.
                </p>
                <p>This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleResetToDefaults}
              disabled={resetting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {resetting ? 'Refreshing...' : 'Refresh'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Result */}
      <Dialog open={!!resetResult} onOpenChange={(o) => { if (!o) setResetResult(null); }}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle>Categories Refreshed</DialogTitle>
          </DialogHeader>
          {resetResult && (
            <div className="space-y-2 text-sm text-foreground/80">
              <p><strong className="text-foreground">{resetResult.kept}</strong> existing categories preserved</p>
              <p><strong className="text-foreground">{resetResult.deleted}</strong> unused categories removed</p>
              <p><strong className="text-foreground">{resetResult.created}</strong> new default categories created</p>
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setResetResult(null)}
              className="w-full px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
