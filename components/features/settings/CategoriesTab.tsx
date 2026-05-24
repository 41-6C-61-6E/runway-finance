'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Sparkles, Search, Filter } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';

type Category = {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
  isSystem: boolean;
  createdByAi: boolean;
  excludeFromReports: boolean;
  displayOrder: number;
};

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4',
  '#0ea5e9', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#64748b', '#78716c',
];

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<{ kept: number; deleted: number; created: number } | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterSources, setFilterSources] = useState<Set<'system' | 'user' | 'ai'>>(
    new Set(['system', 'user', 'ai'])
  );

  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formColor, setFormColor] = useState('#6366f1');
  const [formIsIncome, setFormIsIncome] = useState(false);
  const [formOrder, setFormOrder] = useState(0);
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
    if (filterType === 'income' && cat.isIncome) return true;
    if (filterType === 'expense' && !cat.isIncome) return true;
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
    return parents.filter((parent) => {
      const parentMatches =
        categoryMatchesSearch(parent) &&
        categoryMatchesType(parent) &&
        categoryMatchesSource(parent);

      if (parentMatches) return true;
      if (parentHasMatchingChildren(parent.id)) return true;
      return false;
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
    setFormName('');
    setFormParentId(null);
    setFormColor('#6366f1');
    setFormIsIncome(false);
    setFormOrder(categories.length);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setFormName(cat.name);
    setFormParentId(cat.parentId);
    setFormColor(cat.color);
    setFormIsIncome(cat.isIncome);
    setFormOrder(cat.displayOrder);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        parentId: formParentId || null,
        color: formColor,
        isIncome: formIsIncome,
        displayOrder: formOrder,
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Categories</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clean Up Categories
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Category
          </button>
        </div>
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
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['all', 'income', 'expense'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterType === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {type === 'all' ? 'All' : type === 'income' ? 'Income' : 'Expense'}
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
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {childList.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); toggleExpanded(parent.id); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                  <span className="text-foreground text-sm font-medium truncate">{parent.name}</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    parent.isIncome ? 'bg-chart-1/20 text-chart-1' : 'bg-primary/20 text-primary'
                  }`}>
                    {parent.isIncome ? 'Income' : 'Expense'}
                  </span>
                  {parent.isSystem && (
                    <span className="text-[10px] text-muted-foreground">System</span>
                  )}
                  {parent.createdByAi && (
                    <Sparkles className="h-3 w-3 opacity-60 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(parent); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleting(parent); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
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
                    <div
                      key={child.id}
                      onClick={() => openEdit(child)}
                      className="flex items-center justify-between p-2.5 bg-muted/30 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                        <span className="text-foreground/80 text-sm truncate">{child.name}</span>
                        {child.isSystem && (
                          <span className="text-[10px] text-muted-foreground">System</span>
                        )}
                        {child.createdByAi && (
                          <Sparkles className="h-3 w-3 opacity-60 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(child); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleting(child); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
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
      {(isAdding || editing !== null) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-foreground/15" onClick={() => { setIsAdding(false); setEditing(null); }} />
          <div className="relative w-full max-w-md bg-card border-l border-border p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-foreground mb-6">
              {editing ? 'Edit Category' : 'Add Category'}
            </h3>

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
                <label className="block text-sm font-medium text-foreground mb-1">Parent Group</label>
                <select
                  value={formParentId || ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">None (top-level group)</option>
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

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Income Category</span>
                <Switch
                  checked={formIsIncome}
                  onCheckedChange={setFormIsIncome}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Display Order</label>
                <input
                  type="number"
                  value={formOrder}
                  onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => { setIsAdding(false); setEditing(null); }}
                className="flex-1 px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <AlertDialogTitle>Clean Up Categories</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">
                This will <strong>remove unused categories</strong> and add any missing default categories.
              </p>
              <p className="mb-2">
                Categories that still have transactions, budgets, or rules assigned to them will be <strong>preserved</strong> to avoid uncategorizing your data.
              </p>
              <p>
                If a default category matches the name of an existing one, it will be kept as-is rather than replaced. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleResetToDefaults}
              disabled={resetting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {resetting ? 'Cleaning...' : 'Clean Up'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Result */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/15" onClick={() => setResetResult(null)}>
          <div className="bg-card border border-border rounded-xl shadow-lg p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground mb-3">Categories Reset</h3>
            <div className="space-y-2 text-sm text-foreground/80">
              <p><strong className="text-foreground">{resetResult.kept}</strong> existing categories preserved</p>
              <p><strong className="text-foreground">{resetResult.deleted}</strong> unused categories removed</p>
              <p><strong className="text-foreground">{resetResult.created}</strong> new default categories created</p>
            </div>
            <button
              onClick={() => setResetResult(null)}
              className="mt-4 w-full px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
