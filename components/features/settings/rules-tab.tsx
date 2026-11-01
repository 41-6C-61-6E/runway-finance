'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { SectionHeading } from '@/components/ui/section-heading';
import { Play, Plus, Search, Sparkles, ChevronUp, ChevronDown, Pencil, Trash2, X } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import type { Condition, Rule, Category, TagItem } from './rules/types';
import { FIELD_OPTIONS, OPERATOR_OPTIONS } from './rules/types';
import { RuleEditorSheet } from './rules/rule-editor-sheet';
import { RuleBulkEditDialog } from './rules/rule-bulk-edit-dialog';

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
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'my' | 'system' | 'ai'>('my');
  const [systemToggling, setSystemToggling] = useState(false);
  const [aiToggling, setAiToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkEditingOpen, setBulkEditingOpen] = useState(false);
  const [bulkDeletingIds, setBulkDeletingIds] = useState<string[] | null>(null);

  useEffect(() => {
    setSelectedRuleIds([]);
  }, [activeSubTab, searchQuery]);

  const openBulkEditDialog = () => {
    setBulkEditingOpen(true);
  };

  const handleBulkRun = async (ids: string[]) => {
    setBulkLoading(true);
    try {
      const res = await fetch('/api/category-rules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, action: 'run' }),
      });
      if (!res.ok) throw new Error('Failed to run rules');
      const data = await res.json();
      showFeedback('success', `Rules applied: ${data.matched} transactions matched.`);
      setSelectedRuleIds([]);
      await fetchRules();
    } catch (error) {
      console.error('Error running bulk rules:', error);
      showFeedback('error', 'Failed to run selected rules.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkToggleActive = async (ids: string[], active: boolean) => {
    setBulkLoading(true);
    try {
      const res = await fetch('/api/category-rules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ids,
          action: 'update',
          updates: { isActive: active }
        }),
      });
      if (!res.ok) throw new Error('Failed to update rules');
      showFeedback('success', `Successfully ${active ? 'enabled' : 'disabled'} ${ids.length} rules.`);
      setSelectedRuleIds([]);
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rules:', error);
      showFeedback('error', 'Failed to update selected rules.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeletingIds) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/category-rules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ids: bulkDeletingIds,
          action: 'delete'
        }),
      });
      if (!res.ok) throw new Error('Failed to delete rules');
      showFeedback('success', `Successfully deleted ${bulkDeletingIds.length} rules.`);
      setSelectedRuleIds([]);
      setBulkDeletingIds(null);
      await fetchRules();
    } catch (error) {
      console.error('Error deleting rules:', error);
      showFeedback('error', 'Failed to delete selected rules.');
    } finally {
      setBulkLoading(false);
    }
  };

  const getCategoryName = useCallback((id: string | null) => {
    if (!id) return null;
    return categories.find((c) => c.id === id) ?? null;
  }, [categories]);

  const systemRules = useMemo(() => rules.filter((r) => r.isSystem), [rules]);
  const systemRulesAllActive = useMemo(
    () => systemRules.length > 0 && systemRules.every((r) => r.isActive),
    [systemRules]
  );

  const aiRules = useMemo(() => rules.filter((r) => r.createdByAi && !r.isSystem), [rules]);
  const aiRulesAllActive = useMemo(
    () => aiRules.length > 0 && aiRules.every((r) => r.isActive),
    [aiRules]
  );

  const activeTabRules = useMemo(() => {
    switch (activeSubTab) {
      case 'my':
        return rules.filter((r) => !r.isSystem && !r.createdByAi);
      case 'system':
        return systemRules;
      case 'ai':
        return aiRules;
      default:
        return rules;
    }
  }, [rules, activeSubTab, systemRules, aiRules]);

  const filteredRules = useMemo(() => {
    try {
      let result = activeTabRules;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((r) => {
          try {
            const cat = r.setCategoryId ? getCategoryName(r.setCategoryId) : null;
            const catName = cat ? cat.name.toLowerCase() : '';

            return (
              (r.name && r.name.toLowerCase().includes(q)) ||
              (r.conditionValue && r.conditionValue.toLowerCase().includes(q)) ||
              (catName && catName.includes(q))
            );
          } catch (e) {
            console.error('Error filtering rule:', e);
            return false;
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error in filteredRules calculation:', error);
      return [];
    }
  }, [activeTabRules, searchQuery, categories, getCategoryName]);

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
    } catch (error) {
      console.error('Error running rule:', error);
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
    } catch (error) {
      console.error('Error running all rules:', error);
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
    } catch (error) {
      console.error('Error resetting rules:', error);
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
    } catch (error) {
      console.error('Error fetching rules:', error);
      setRules([]);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategories([]);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { credentials: 'include' });
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching tags:', error);
      setTags([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchCategories(), fetchTags()])
      .finally(() => setLoading(false));
  }, [fetchRules, fetchCategories, fetchTags]);

  const openAdd = () => {
    setEditingRule(null);
    setDrawerOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditingRule(rule);
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setEditingRule(null);
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
    } catch (error) {
      console.error('Error deleting rule:', error);
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
    } catch (error) {
      console.error('Error moving rule:', error);
    }
  };

  const handleToggleActive = async (rule: Rule) => {
    const originalValue = rule.isActive;
    const newValue = !originalValue;
    // Optimistically update rules list state
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: newValue } : r)));
    try {
      const res = await fetch(`/api/category-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: newValue }),
      });
      if (!res.ok) throw new Error('Failed to update active status');
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rule active status:', error);
      // Rollback on error
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: originalValue } : r)));
    }
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
    } catch (error) {
      console.error('Error toggling system rules:', error);
      showFeedback('error', 'Failed to toggle system rules.');
    } finally {
      setSystemToggling(false);
    }
  };

  const handleToggleAiRules = async () => {
    const newActive = !aiRulesAllActive;
    setAiToggling(true);
    try {
      const res = await fetch('/api/category-rules/toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: newActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle AI rules');
      showFeedback('success', `AI rules ${newActive ? 'enabled' : 'disabled'}.`);
      await fetchRules();
    } catch (error) {
      console.error('Error toggling AI rules:', error);
      showFeedback('error', 'Failed to toggle AI rules.');
    } finally {
      setAiToggling(false);
    }
  };

  const formatCondition = (rule: Rule) => {
    try {
      const conditions = rule.conditions && rule.conditions.length > 0 
        ? rule.conditions 
        : [{
            field: rule.conditionField,
            operator: rule.conditionOperator,
            value: rule.conditionValue,
            caseSensitive: rule.conditionCaseSensitive,
          }];
      
      return conditions.map(cond => {
        const field = FIELD_OPTIONS.find((f) => f.value === cond.field)?.label ?? cond.field;
        const op = OPERATOR_LABELS[cond.operator] ?? cond.operator;
        return `${field} ${op} "${cond.value}"`;
      }).join(' AND ');
    } catch (error) {
      console.error('Error formatting condition:', error);
      return 'Invalid condition';
    }
  };

  const formatAction = (rule: Rule) => {
    try {
      const parts: string[] = [];
      if (rule.setCategoryId) {
        const cat = getCategoryName(rule.setCategoryId);
        if (cat) parts.push(`→ ${cat.name}`);
      }
      if (rule.setPayee) parts.push(`payee: "${rule.setPayee}"`);
      if (rule.setReviewed === true) parts.push('mark reviewed');
      return parts.length > 0 ? parts.join(', ') : '—';
    } catch (error) {
      console.error('Error formatting action:', error);
      return '—';
    }
  };

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading rules...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <SectionHeading>Categorization Rules</SectionHeading>
        <div className="flex items-center gap-2 flex-wrap">
          {feedback && (
            <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${feedback.type === 'success' ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
              {feedback.message}
            </span>
          )}
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Reset to Defaults
          </button>
          <ActionButton
            onClick={handleRunAll}
            disabled={runningAll || filteredRules.length === 0}
            icon={Play}
            className="shrink-0"
          >
            {runningAll ? 'Running...' : 'Run All'}
          </ActionButton>
          <ActionButton
            onClick={openAdd}
            icon={Plus}
            className="shrink-0"
          >
            Add Rule
          </ActionButton>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex border-b border-border/60 w-full gap-6 mb-4 pb-0.5">
        {([
          { key: 'my' as const, label: 'My Rules', count: rules.filter((r) => !r.isSystem && !r.createdByAi).length },
          { key: 'system' as const, label: 'System Rules', count: systemRules.length },
          { key: 'ai' as const, label: 'AI Rules', count: aiRules.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`pb-2 px-1 text-[11px] sm:text-sm font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
              activeSubTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 text-xs ${
                activeSubTab === tab.key
                  ? 'text-primary/70'
                  : 'text-muted-foreground/50'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab-specific controls + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
            placeholder={
              activeSubTab === 'my'
                ? 'Search your rules...'
                : activeSubTab === 'system'
                ? 'Search system rules...'
                : 'Search AI rules...'
            }
            aria-label="Search rules"
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

        {(activeSubTab === 'system' || activeSubTab === 'ai') && (
          <div className="flex items-center gap-2 shrink-0 border-l border-border pl-3">
            <span className="text-xs text-foreground/70">
              {activeSubTab === 'system' ? 'Enable All' : 'Enable All'}
            </span>
            <Switch
              checked={activeSubTab === 'system' ? systemRulesAllActive : aiRulesAllActive}
              onCheckedChange={
                activeSubTab === 'system' ? handleToggleSystemRules : handleToggleAiRules
              }
              disabled={activeSubTab === 'system' ? systemToggling : aiToggling}
            />
          </div>
        )}
      </div>

      {filteredRules.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {searchQuery ? 'No rules match your search.' : 'No rules yet. Create rules to automatically categorize transactions during sync.'}
          </p>
        </div>
      )}

      {filteredRules.length > 0 && (
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filteredRules.length > 0 && filteredRules.every((r) => selectedRuleIds.includes(r.id))}
              onChange={(e) => {
                if (e.target.checked) {
                  const newSelection = Array.from(new Set([...selectedRuleIds, ...filteredRules.map((r) => r.id)]));
                  setSelectedRuleIds(newSelection);
                } else {
                  const filteredIds = filteredRules.map((r) => r.id);
                  setSelectedRuleIds(selectedRuleIds.filter((id) => !filteredIds.includes(id)));
                }
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
              id="select-all-rules"
            />
            <label htmlFor="select-all-rules" className="text-xs text-muted-foreground cursor-pointer select-none font-medium">
              Select All on page ({filteredRules.length})
            </label>
          </div>
          {selectedRuleIds.length > 0 && (
            <button
              onClick={() => setSelectedRuleIds([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear Selection
            </button>
          )}
        </div>
      )}

      {selectedRuleIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs font-semibold text-primary">{selectedRuleIds.length} rules selected</span>
          <div className="h-4 w-px bg-border/60 mx-1" />
          
          <button
            onClick={() => handleBulkRun(selectedRuleIds)}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            <Play className="h-3 w-3" /> Run Selected
          </button>
          
          <button
            onClick={() => openBulkEditDialog()}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" /> Bulk Edit
          </button>

          <button
            onClick={() => handleBulkToggleActive(selectedRuleIds, true)}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            Enable
          </button>

          <button
            onClick={() => handleBulkToggleActive(selectedRuleIds, false)}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            Disable
          </button>

          <button
            onClick={() => setBulkDeletingIds(selectedRuleIds)}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {filteredRules.map((rule, idx) => {
          const cat = rule.setCategoryId ? getCategoryName(rule.setCategoryId) : null;
          const isSelected = selectedRuleIds.includes(rule.id);
          return (
            <div
              key={rule.id}
              className={`p-3 sm:p-4 bg-card border border-border rounded-lg transition-colors group flex items-start gap-3 ${
                !rule.isActive ? 'opacity-50' : ''
              } ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}
            >
              <div className="pt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRuleIds([...selectedRuleIds, rule.id]);
                    } else {
                      setSelectedRuleIds(selectedRuleIds.filter((id) => id !== rule.id));
                    }
                  }}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-mono text-muted-foreground shrink-0">#{rule.priority}</span>
                  <span className="text-foreground text-sm font-medium truncate">{rule.name}</span>
                  {rule.isSystem && (
                    <span className="text-[10px] text-muted-foreground shrink-0">System</span>
                  )}
                  {rule.createdByAi && (
                    <Sparkles className="h-3 w-3 opacity-60 flex-shrink-0" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {formatCondition(rule)}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
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
                <div className="flex flex-wrap items-center gap-1 mt-2">
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
            </div>
          );
        })}
      </div>

      {/* Add/Edit Drawer */}
      <RuleEditorSheet
        open={drawerOpen}
        onClose={handleClose}
        editingRule={editingRule}
        categories={categories}
        tags={tags}
        rulesCount={rules.length}
        onSaveSuccess={fetchRules}
        showFeedback={showFeedback}
      />

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

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={!!bulkDeletingIds} onOpenChange={(open) => !open && setBulkDeletingIds(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Rules</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the <strong>{bulkDeletingIds?.length}</strong> selected rules? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {bulkLoading ? 'Deleting...' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit Dialog */}
      <RuleBulkEditDialog
        open={bulkEditingOpen}
        onClose={() => setBulkEditingOpen(false)}
        selectedRuleIds={selectedRuleIds}
        categories={categories}
        tags={tags}
        onUpdateSuccess={async () => {
          setSelectedRuleIds([]);
          await fetchRules();
        }}
        showFeedback={showFeedback}
      />
    </div>
  );
}
