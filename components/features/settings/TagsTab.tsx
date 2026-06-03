'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Pencil, Trash2, Tag, Search, Hash } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useUserSettings } from '@/components/user-settings-provider';

type Tag = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  transactionCount: number;
  accountCount: number;
  budgetCount: number;
  goalCount: number;
  usageCount: number;
  createdAt: string;
};

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [custom, setCustom] = useState(value);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setCustom(c); }}
            className={`w-6 h-6 rounded-full border-2 transition-all ${value === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); onChange(e.target.value); }}
          className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
          title="Custom color"
        />
        <span className="text-xs text-muted-foreground">Custom</span>
        <span className="text-xs font-mono text-muted-foreground">{custom}</span>
      </div>
    </div>
  );
}

function TagBadge({ tag }: { tag: Pick<Tag, 'name' | 'color'> }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}
    >
      <Hash className="h-2.5 w-2.5" />
      {tag.name}
    </span>
  );
}

export default function TagsTab() {
  const [tagList, setTagList] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formDescription, setFormDescription] = useState('');

  const settingsContext = useUserSettings();
  const settings = settingsContext?.settings;
  const updateSetting = settingsContext?.updateSetting;

  const visibilitySettings = settings?.accountTagVisibility || {
    sidebar: true,
    transactions: true,
    legend: true,
    budgets: true,
    forecast: true,
    suggestions: true,
  };

  const toggleVisibility = async (field: string) => {
    if (!updateSetting) return;
    const currentVal = visibilitySettings[field] !== false;
    await updateSetting('accountTagVisibility', {
      [field]: !currentVal
    });
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { credentials: 'include' });
      const data = await res.json();
      setTagList(Array.isArray(data) ? data : []);
    } catch {
      setTagList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const openAdd = () => {
    setEditingTag(null);
    setFormName('');
    setFormColor('#6366f1');
    setFormDescription('');
    setDrawerOpen(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setFormDescription(tag.description ?? '');
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setEditingTag(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const body = { name: formName.trim(), color: formColor, description: formDescription.trim() || null };
      if (editingTag) {
        const res = await fetch(`/api/tags/${editingTag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to update tag');
        showFeedback('success', 'Tag updated.');
      } else {
        const res = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create tag');
        showFeedback('success', 'Tag created.');
      }
      setDrawerOpen(false);
      setEditingTag(null);
      await fetchTags();
    } catch {
      showFeedback('error', 'Failed to save tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/tags/${deleting.id}`, { method: 'DELETE', credentials: 'include' });
      setDeleting(null);
      showFeedback('success', 'Tag deleted.');
      await fetchTags();
    } catch {
      showFeedback('error', 'Failed to delete tag.');
    }
  };

  const filtered = tagList.filter((t) =>
    !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="text-muted-foreground py-4 text-sm">Loading tags...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Tags</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create tags to organize transactions, accounts, budgets, and goals across categories.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {feedback && (
            <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${feedback.type === 'success' ? 'bg-status-positive/20 text-status-positive' : 'bg-destructive/20 text-destructive'}`}>
              {feedback.message}
            </span>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            New Tag
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
          placeholder="Search tags..."
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >×</button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <Tag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {searchQuery ? 'No tags match your search.' : 'No tags yet. Create your first tag to start organizing.'}
          </p>
          {!searchQuery && (
            <button
              onClick={openAdd}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-all"
            >
              <Plus className="h-4 w-4" />
              Create Tag
            </button>
          )}
        </div>
      )}

      {/* Tag list */}
      <div className="space-y-2">
        {filtered.map((tag) => (
          <div
            key={tag.id}
            onClick={() => openEdit(tag)}
            className="flex items-center justify-between p-4 bg-card border border-border rounded-lg cursor-pointer hover:bg-muted/50 hover:border-foreground/20 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Color swatch */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: tag.color, boxShadow: `0 0 0 2px ${tag.color}66, 0 0 0 4px hsl(var(--card))` }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TagBadge tag={tag} />
                  {tag.usageCount > 0 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {tag.usageCount} use{tag.usageCount !== 1 ? 's' : ''}
                      {tag.transactionCount > 0 && ` · ${tag.transactionCount} tx`}
                    </span>
                  )}
                </div>
                {tag.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{tag.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(tag); }}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded"
                title="Edit tag"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleting(tag); }}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded"
                title="Delete tag"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Account Tag Display Settings */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-1">Account Tag Display Settings</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Control where account tags and color indicators are shown in the interface.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in Accounts Sidebar</label>
              <p className="text-[10px] text-muted-foreground">Display color dots next to account names in the sidebar</p>
            </div>
            <Switch
              checked={visibilitySettings.sidebar !== false}
              onCheckedChange={() => toggleVisibility('sidebar')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in Transaction Register</label>
              <p className="text-[10px] text-muted-foreground">Display indicators in transactions list and detail drawer</p>
            </div>
            <Switch
              checked={visibilitySettings.transactions !== false}
              onCheckedChange={() => toggleVisibility('transactions')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in Chart Legends</label>
              <p className="text-[10px] text-muted-foreground">Display indicators in the Balance History chart legend</p>
            </div>
            <Switch
              checked={visibilitySettings.legend !== false}
              onCheckedChange={() => toggleVisibility('legend')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in Budget Table</label>
              <p className="text-[10px] text-muted-foreground">Display indicators next to accounts in budget item details</p>
            </div>
            <Switch
              checked={visibilitySettings.budgets !== false}
              onCheckedChange={() => toggleVisibility('budgets')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in Cash Flow Forecast</label>
              <p className="text-[10px] text-muted-foreground">Display indicators in the Cash Flow Projection tables</p>
            </div>
            <Switch
              checked={visibilitySettings.forecast !== false}
              onCheckedChange={() => toggleVisibility('forecast')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <label className="text-xs font-medium text-foreground">Show in AI Suggestions &amp; Cleanup</label>
              <p className="text-[10px] text-muted-foreground">Display indicators in recommendations and cleanup tools</p>
            </div>
            <Switch
              checked={visibilitySettings.suggestions !== false}
              onCheckedChange={() => toggleVisibility('suggestions')}
            />
          </div>
        </div>
      </div>

      {/* Add/Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="right" className="w-full max-w-sm bg-card border-l border-border p-6 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {editingTag ? 'Edit Tag' : 'New Tag'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tag Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="e.g., Home Remodel, Side Income"
                autoFocus
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Color</label>
              <ColorPicker value={formColor} onChange={setFormColor} />
            </div>

            {/* Preview */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Preview</label>
              {formName ? (
                <TagBadge tag={{ name: formName, color: formColor }} />
              ) : (
                <span className="text-xs text-muted-foreground italic">Enter a name to preview</span>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground resize-none"
                placeholder="What is this tag for?"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => { setDrawerOpen(false); setEditingTag(null); }}
              className="flex-1 px-4 py-2 text-sm text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="flex-1 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : editingTag ? 'Update' : 'Create'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>?
              {deleting && deleting.usageCount > 0 && (
                <span className="block mt-1 text-amber-500">
                  This tag is used {deleting.usageCount} time{deleting.usageCount !== 1 ? 's' : ''} and will be removed from all associated items.
                </span>
              )}
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
    </div>
  );
}
