'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Play, Search } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';

type Rule = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  isSystem: boolean;
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
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSystemRules, setShowSystemRules] = useState(true);
  const [systemToggling, setSystemToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const getCategoryName = (id: string | null) => {
    if (!id) return null;
    return categories.find((c) => c.id === id) ?? null;
  };

  const systemRules = useMemo(() => rules.filter((r) => r.isSystem), [rules]);
  const systemRulesAllActive = useMemo(
    () => systemRules.length > 0 && systemRules.every((r) => r.isActive),
    [systemRules]
  );
  const filteredRules = useMemo(() => {
    let result = rules;
    if (!showSystemRules) {
      result = result.filter((r) => !r.isSystem);
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter((r) => {
      const cat = r.setCategoryId ? getCategoryName(r.setCategoryId) : null;
      const catName = cat ? cat.name.toLowerCase() : '';
      return (
        r.name.toLowerCase().includes(q) ||
        r.conditionValue.toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [rules, searchQuery, categories, showSystemRules]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleRunNow = async (ruleId: string) => {
    setRunningRuleId(ruleId);
    try {
      const res = await fetch(`/api/category-rules/${ruleId}/apply`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to apply rule');
      const data = await res.json();
      showFeedback('success', `Rule applied: ${data.matched} of ${data.total} transactions matched.`);
      await fetchRules();
    } catch {
      showFeedback('error', 'Failed to apply rule.');
    } finally {
      setRunningRuleId(null);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      const res = await fetch('/api/category-rules/apply-all', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to apply rules');
      const data = await res.json();
      showFeedback('success', `All rules applied: ${data.updated} of ${data.total} transactions updated.`);
      await fetchRules();
    } catch {
      showFeedback('error', 'Failed to apply all rules.');
    } finally {
      setRunningAll(false);
    }
  };

  const handleResetToDefaults = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/category-rules/reset', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to reset rules');
      setShowResetConfirm(false);
      showFeedback('success', 'Rules reset to defaults.');
      await fetchRules();
    } catch {
      showFeedback('error', 'Failed to reset rules.');
    } finally {
      setResetting(false);
    }
  };

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
    } catch {}
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
    } catch {}
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
    } catch {}
  };

  const handleToggleSystemRules = async () => {
    const newActive = !systemRulesAllActive;
    setSystemToggling(true);
    try {
      const res = await fetch('/api/category-rules/toggle-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: newActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle system rules');
      showFeedback('success', `System rules ${newActive ? 'enabled' : 'disabled'}.`);
      await fetchRules();
    } catch {
      showFeedback('error', 'Failed to toggle system rules.');
    } finally {
      setSystemToggling(false);
    }
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
    return <div className="text-muted-foreground py-4">Loading rules...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Categorization Rules</h2>
        <div className="flex items-center gap-2">
          {feedback && (
            <span className={`text-xs px-2 py-1 rounded-lg ${feedback.type === 'success' ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}`}>
              {feedback.message}
            </span>
          )}
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleRunAll}
            disabled={runningAll || rules.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-all disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {runningAll ? 'Running...' : 'Run All'}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
            placeholder="Search rules by name, keyword, or category..."
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/70 whitespace-nowrap">Show System</span>
            <Switch
              checked={showSystemRules}
              onCheckedChange={setShowSystemRules}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/70 whitespace-nowrap">Enable System</span>
            <Switch
              checked={systemRulesAllActive}
              onCheckedChange={handleToggleSystemRules}
              disabled={systemToggling}
            />
          </div>
        </div>
      </div>

      {filteredRules.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {searchQuery ? 'No rules match your search.' : 'No rules yet. Create rules to automatically categorize transactions during sync.'}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {filteredRules.map((rule, idx) => {
          const cat = rule.setCategoryId ? getCategoryName(rule.setCategoryId) : null;
          return (
            <div
              key={rule.id}
              className={`p-4 bg-card border border-border rounded-lg transition-colors group ${
                !rule.isActive ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground shrink-0">#{rule.priority}</span>
                  <span className="text-foreground text-sm font-medium truncate">{rule.name}</span>
                  {rule.isSystem && (
                    <span className="text-[10px] text-muted-foreground shrink-0">System</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRunNow(rule.id)}
                    disabled={runningRuleId === rule.id}
                    className="p-1.5 text-muted-foreground hover:text-chart-2 transition-colors disabled:opacity-30"
                    title="Apply this rule now"
                  >
                    <Play className={`h-3.5 w-3.5 ${runningRuleId === rule.id ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleMove(rule.id, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMove(rule.id, 'down')}
                    disabled={idx === filteredRules.length - 1}
                    className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(rule)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Edit rule">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleting(rule)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Delete rule">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {formatCondition(rule)}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70 min-w-0">
                  <span className="truncate">{formatAction(rule)}</span>
                  {cat && (
                    <span
                      className="px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: `${cat.color}33`,
                        color: cat.color,
                      }}
                    >
                      {cat.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground/60">Active</span>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={() => handleToggleActive(rule)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-foreground/15" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-card border-l border-border p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-foreground mb-6">
              {editingRule ? 'Edit Rule' : 'Add Rule'}
            </h3>

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
                <h4 className="text-sm font-medium text-foreground mb-3">Condition</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Field</label>
                    <select
                      value={formField}
                      onChange={(e) => setFormField(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Operator</label>
                    <select
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {OPERATOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs text-muted-foreground mb-1">Value</label>
                  <input
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g., AMAZON"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-foreground/80">Case Sensitive</span>
                  <Switch
                    checked={formCaseSensitive}
                    onCheckedChange={setFormCaseSensitive}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Action</h4>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Set Category</label>
                  <select
                    value={formCategoryId || ''}
                    onChange={(e) => setFormCategoryId(e.target.value || null)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  <label className="block text-xs text-muted-foreground mb-1">Set Payee (optional)</label>
                  <input
                    value={formSetPayee}
                    onChange={(e) => setFormSetPayee(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Override payee name"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-foreground/80">Mark as Reviewed</span>
                  <Switch
                    checked={formSetReviewed === true}
                    onCheckedChange={(checked) => setFormSetReviewed(checked ? true : null)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => { setDrawerOpen(false); setEditingRule(null); }}
                className="flex-1 px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formValue.trim()}
                className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the rule <strong>{deleting?.name}</strong>?
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
            <AlertDialogTitle>Reset Rules to Defaults</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong className="text-destructive">permanently delete all your custom rules</strong> and restore the default system rules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleResetToDefaults}
              disabled={resetting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Reset to Defaults'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
