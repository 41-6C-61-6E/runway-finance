'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Rule = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  conditionCaseSensitive: boolean;
  setCategoryId: string | null;
  setPayee: string | null;
  setReviewed: boolean | null;
  categoryName: string | null;
  categoryColor: string | null;
};

type Category = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  isIncome: boolean;
};

const FIELD_OPTIONS = [
  { value: 'description', label: 'Description' },
  { value: 'payee', label: 'Payee' },
  { value: 'amount', label: 'Amount' },
  { value: 'memo', label: 'Memo' },
];

const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'regex', label: 'Regex' },
];

const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contains',
  equals: 'equals',
  starts_with: 'starts with',
  ends_with: 'ends with',
  regex: '~',
};

export default function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const [formName, setFormName] = useState('');
  const [formField, setFormField] = useState('description');
  const [formOperator, setFormOperator] = useState('contains');
  const [formValue, setFormValue] = useState('');
  const [formCaseSensitive, setFormCaseSensitive] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formSetPayee, setFormSetPayee] = useState('');
  const [formSetReviewed, setFormSetReviewed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/category-rules', { credentials: 'include' });
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setRules([]);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchCategories()]).finally(() => setLoading(false));
  }, [fetchRules, fetchCategories]);

  const openAdd = () => {
    setEditingRule(null);
    setFormName('');
    setFormField('description');
    setFormOperator('contains');
    setFormValue('');
    setFormCaseSensitive(false);
    setFormCategoryId(null);
    setFormSetPayee('');
    setFormSetReviewed(null);
    setDrawerOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormField(rule.conditionField);
    setFormOperator(rule.conditionOperator);
    setFormValue(rule.conditionValue);
    setFormCaseSensitive(rule.conditionCaseSensitive);
    setFormCategoryId(rule.setCategoryId);
    setFormSetPayee(rule.setPayee ?? '');
    setFormSetReviewed(rule.setReviewed);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formValue.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        conditionField: formField,
        conditionOperator: formOperator,
        conditionValue: formValue.trim(),
        conditionCaseSensitive: formCaseSensitive,
        setCategoryId: formCategoryId || null,
        setPayee: formSetPayee.trim() || null,
        setReviewed: formSetReviewed ?? null,
        priority: editingRule ? editingRule.priority : rules.length,
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

      setDrawerOpen(false);
      setEditingRule(null);
      await fetchRules();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/category-rules/${deleting.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleting(null);
      await fetchRules();
    } catch {
      // ignore
    }
  };

  const handleMove = async (ruleId: string, direction: 'up' | 'down') => {
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= rules.length) return;

    const reordered = [...rules];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const updates = reordered.map((r, i) => ({ id: r.id, priority: i }));

    try {
      await fetch('/api/category-rules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rules: updates }),
      });
      await fetchRules();
    } catch {
      // ignore
    }
  };

  const handleToggleActive = async (rule: Rule) => {
    try {
      await fetch(`/api/category-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      await fetchRules();
    } catch {
      // ignore
    }
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return null;
    const cat = categories.find((c) => c.id === id);
    return cat ?? null;
  };

  const formatCondition = (rule: Rule) => {
    const field = FIELD_OPTIONS.find((f) => f.value === rule.conditionField)?.label ?? rule.conditionField;
    const op = OPERATOR_LABELS[rule.conditionOperator] ?? rule.conditionOperator;
    return `${field} ${op} "${rule.conditionValue}"`;
  };

  const formatAction = (rule: Rule) => {
    const parts: string[] = [];
    if (rule.setCategoryId) {
      const cat = getCategoryName(rule.setCategoryId);
      if (cat) parts.push(`→ ${cat.name}`);
    }
    if (rule.setPayee) parts.push(`payee: "${rule.setPayee}"`);
    if (rule.setReviewed === true) parts.push('mark reviewed');
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  if (loading) {
    return <div className="text-gray-400 py-4">Loading rules...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Categorization Rules</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </button>
      </div>

      {rules.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-gray-400 text-sm">No rules yet. Create rules to automatically categorize transactions during sync.</p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule, idx) => {
          const cat = rule.setCategoryId ? getCategoryName(rule.setCategoryId) : null;
          return (
            <div
              key={rule.id}
              className={`p-4 bg-white/5 border border-white/10 rounded-lg transition-colors group ${
                !rule.isActive ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">#{rule.priority}</span>
                    <span className="text-white text-sm font-medium">{rule.name}</span>
                    {!rule.isActive && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-500/20 text-gray-400">Disabled</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-1">
                    {formatCondition(rule)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    <span>{formatAction(rule)}</span>
                    {cat && (
                      <span
                        className="px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${cat.color}33`,
                          color: cat.color,
                        }}
                      >
                        {cat.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors"
                    title={rule.isActive ? 'Disable' : 'Enable'}
                  >
                    {rule.isActive ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleMove(rule.id, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMove(rule.id, 'down')}
                    disabled={idx === rules.length - 1}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(rule)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleting(rule)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-gray-950 border-l border-white/10 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-6">
              {editingRule ? 'Edit Rule' : 'Add Rule'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Rule Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Amazon Purchases"
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Condition</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Field</label>
                    <select
                      value={formField}
                      onChange={(e) => setFormField(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Operator</label>
                    <select
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {OPERATOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Value</label>
                  <input
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., AMAZON"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-300">Case Sensitive</span>
                  <button
                    onClick={() => setFormCaseSensitive(!formCaseSensitive)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${formCaseSensitive ? 'bg-blue-600' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formCaseSensitive ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Action</h4>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Set Category</label>
                  <select
                    value={formCategoryId || ''}
                    onChange={(e) => setFormCategoryId(e.target.value || null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Don't change category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.parentId ? '  ' : ''}{cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Set Payee (optional)</label>
                  <input
                    value={formSetPayee}
                    onChange={(e) => setFormSetPayee(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Override payee name"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-300">Mark as Reviewed</span>
                  <button
                    onClick={() => setFormSetReviewed(formSetReviewed === true ? null : true)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${formSetReviewed === true ? 'bg-blue-600' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formSetReviewed === true ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => { setDrawerOpen(false); setEditingRule(null); }}
                className="flex-1 px-4 py-2 text-sm text-gray-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formValue.trim()}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="bg-gray-950/95 border-white/10 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the rule <strong>{deleting?.name}</strong>?
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
    </div>
  );
}
