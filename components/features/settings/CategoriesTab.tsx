'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Category = {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
  isSystem: boolean;
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
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

  const openAdd = () => {
    setEditing(null);
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
    } catch {
      // ignore
    }
  };

  const handleResetToDefaults = async () => {
    setResetting(true);
    try {
      await fetch('/api/categories/reset', {
        method: 'POST',
        credentials: 'include',
      });
      setShowResetConfirm(false);
      await fetchCategories();
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCategoryById = (id: string) => categories.find((c) => c.id === id);

  if (loading) {
    return <div className="text-gray-400 py-4">Loading categories...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Categories</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Category
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {parents.map((parent) => {
          const childList = getChildren(parent.id);
          const isExpanded = expandedParents.has(parent.id);
          return (
            <div key={parent.id}>
              <div
                onClick={() => openEdit(parent)}
                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {childList.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); toggleExpanded(parent.id); }} className="text-gray-400 hover:text-white flex-shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                  <span className="text-white text-sm font-medium truncate">{parent.name}</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    parent.isIncome ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {parent.isIncome ? 'Income' : 'Expense'}
                  </span>
                  {parent.isSystem && (
                    <span className="text-[10px] text-gray-500">System</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(parent); }} className="p-1 text-gray-400 hover:text-white transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleting(parent); }} className="p-1 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {isExpanded && childList.length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {childList.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => openEdit(child)}
                      className="flex items-center justify-between p-2.5 bg-white/[0.03] border border-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                        <span className="text-gray-300 text-sm truncate">{child.name}</span>
                        {child.isSystem && (
                          <span className="text-[10px] text-gray-500">System</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(child); }} className="p-1 text-gray-400 hover:text-white transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleting(child); }} className="p-1 text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Drawer */}
      {(editing !== undefined) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setEditing(null); }} />
          <div className="relative w-full max-w-md bg-gray-950 border-l border-white/10 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-6">
              {editing ? 'Edit Category' : 'Add Category'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Category name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Parent Group</label>
                <select
                  value={formParentId || ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (top-level group)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        formColor === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Income Category</span>
                <button
                  onClick={() => setFormIsIncome(!formIsIncome)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${formIsIncome ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formIsIncome ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Order</label>
                <input
                  type="number"
                  value={formOrder}
                  onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 px-4 py-2 text-sm text-gray-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="bg-gray-950/95 border-white/10 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>? Transactions using this category will become uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleting(null)}>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset to Defaults Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-gray-950/95 border-white/10 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Reset Categories to Defaults</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              This will <strong className="text-red-400">permanently delete all your custom categories</strong> and restore the default system categories. Any transactions linked to deleted categories will become uncategorized. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowResetConfirm(false)}>Cancel</AlertDialogCancel>
            <button
              onClick={handleResetToDefaults}
              disabled={resetting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting ? 'Resetting...' : 'Reset to Defaults'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
