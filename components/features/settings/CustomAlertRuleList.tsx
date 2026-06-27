'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  Bell,
  BellOff,
  Clock,
  Goal,
  TrendingUp,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Eye,
} from 'lucide-react';
import CustomAlertRuleForm from './CustomAlertRuleForm';
import type { AlertCondition, AlertConditionField } from '@/lib/db/schema/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerType = 'transaction' | 'account_balance' | 'savings_goal' | 'cash_flow';

interface AccountItem { id: string; name: string; }
interface GoalItem { id: string; name: string; }

interface CustomRule {
  id: string;
  name: string;
  isEnabled: boolean;
  triggerType: TriggerType;
  criteria: Record<string, any>;
  conditionOperator: 'AND' | 'OR' | null;
  conditions: AlertCondition[] | null;
  conditionTree: any | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  accountsList: AccountItem[];
  goalsList: GoalItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<TriggerType, React.ReactNode> = {
  transaction: <ArrowUpDown className="h-3.5 w-3.5" />,
  account_balance: <TrendingUp className="h-3.5 w-3.5" />,
  savings_goal: <Goal className="h-3.5 w-3.5" />,
  cash_flow: <TrendingUp className="h-3.5 w-3.5" />,
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  transaction: 'Transaction',
  account_balance: 'Balance',
  savings_goal: 'Goal',
  cash_flow: 'Cash Flow',
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  transaction: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  account_balance: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  savings_goal: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cash_flow: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const FIELD_LABELS: Record<AlertConditionField, string> = {
  account: 'from specific account',
  amount_min: 'amount ≥',
  amount_max: 'amount ≤',
  keyword: 'keyword:',
  balance_above_value: 'balance >',
  balance_below_value: 'balance <',
  balance_above_account: 'balance > account',
  balance_below_account: 'balance < account',
  goal_reached_percentage: 'goal ≥',
  goal_reached_amount: 'goal amount ≥ $',
  cf_net_savings_below: 'net savings <',
  cf_net_savings_above: 'net savings >',
  cf_savings_rate_below: 'savings rate <',
  cf_savings_rate_above: 'savings rate >',
};

// ── Rule summary builder ──────────────────────────────────────────────────────

function buildRuleSummary(
  rule: CustomRule,
  accountsList: AccountItem[],
  goalsList: GoalItem[]
): string {
  const conditions: AlertCondition[] = rule.conditionTree?.conditions?.length
    ? rule.conditionTree.conditions
    : rule.conditions || [];

  if (conditions.length === 0) {
    return 'Legacy rule (no conditions to display)';
  }

  const operator = rule.conditionOperator || (rule.conditionTree?.operator ?? 'AND');
  const parts = conditions.slice(0, 3).map((cond) => {
    const label = FIELD_LABELS[cond.field] || cond.field;
    let val = '';
    if (cond.field === 'account' || cond.field.includes('_account')) {
      const acc = accountsList.find((a) => a.id === String(cond.value));
      val = acc ? acc.name : String(cond.value);
    } else if (cond.field.includes('goal')) {
      const goal = goalsList.find((g) => g.id === cond.goalId);
      const goalName = goal ? goal.name : 'unknown goal';
      const pct = cond.field === 'goal_reached_percentage' ? `${cond.value}%` : `$${cond.value}`;
      val = `${pct} (${goalName})`;
    } else if (cond.field === 'keyword') {
      val = `"${cond.value}"`;
    } else if (cond.field.startsWith('cf_savings_rate')) {
      val = `${cond.value}%`;
    } else {
      val = `$${cond.value}`;
    }
    return `${label} ${val}`;
  });

  const summary = parts.join(` ${operator} `);
  const hasMore = conditions.length > 3 || (rule.conditionTree?.subGroups?.length ?? 0) > 0;
  return summary + (hasMore ? ` ${operator} …` : '');
}

// ── Last fired lookup ─────────────────────────────────────────────────────────

function useLastFired(ruleId: string, isEnabled: boolean) {
  const [lastFired, setLastFired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isEnabled) return;
    setLoading(true);
    fetch(`/api/notifications/custom-alerts/${ruleId}/last-fired`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data?.lastFired) setLastFired(data.lastFired); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ruleId, isEnabled]);

  return { lastFired, loading };
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  accountsList,
  goalsList,
  onEdit,
  onDelete,
  onToggle,
  onPreview,
}: {
  rule: CustomRule;
  accountsList: AccountItem[];
  goalsList: GoalItem[];
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onToggle: (enabled: boolean) => Promise<void>;
  onPreview: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const summary = buildRuleSummary(rule, accountsList, goalsList);
  const hasSubGroups = (rule.conditionTree?.subGroups?.length ?? 0) > 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (v: boolean) => {
    setToggling(true);
    try {
      await onToggle(v);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        rule.isEnabled
          ? 'bg-muted/20 border-border'
          : 'bg-muted/5 border-border/50 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Enable/disable toggle */}
        <div className="pt-0.5">
          {toggling
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : <Switch checked={rule.isEnabled} onCheckedChange={handleToggle} id={`rule-enabled-${rule.id}`} />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{rule.name}</span>
            {/* Type badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${TRIGGER_COLORS[rule.triggerType]}`}>
              {TRIGGER_ICONS[rule.triggerType]}
              {TRIGGER_LABELS[rule.triggerType]}
            </span>
            {hasSubGroups && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Mixed AND/OR
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {summary}
          </p>

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <LastFiredBadge ruleId={rule.id} isEnabled={rule.isEnabled} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={onPreview}
            title="Test this rule against recent data"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
            title="Edit rule"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {/* AlertDialog delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Delete rule"
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete alert rule?</AlertDialogTitle>
                <AlertDialogDescription>
                  "<strong>{rule.name}</strong>" will be permanently deleted. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {deleting ? 'Deleting…' : 'Delete rule'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function LastFiredBadge({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) {
  const { lastFired, loading } = useLastFired(ruleId, isEnabled);
  if (!isEnabled) return <span>Disabled</span>;
  if (loading) return <span>Checking…</span>;
  if (!lastFired) return <span>Never fired</span>;
  const date = new Date(lastFired);
  const rel = formatRelative(date);
  return <span title={date.toLocaleString()}>Last fired: {rel}</span>;
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({
  rule,
  onClose,
}: {
  rule: CustomRule;
  onClose: () => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/notifications/custom-alerts/${rule.id}/preview`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error))))
      .then((data) => setResult(data))
      .catch((err) => { toast.error(typeof err === 'string' ? err : 'Preview failed.'); onClose(); })
      .finally(() => setLoading(false));
  }, [rule.id]);

  const hasMatches = result && result.matchCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-lg w-full max-h-[80dvh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule Preview</p>
            <h3 className="font-semibold text-foreground mt-0.5">{rule.name}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 shrink-0">✕</Button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Simulating rule against your data…
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 font-semibold text-sm ${hasMatches ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                {hasMatches ? '✅' : '⭕'} {result.notice}
              </div>

              {/* Transaction matches */}
              {result.transactionMatches?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Matching transactions (last 30 days)
                  </p>
                  <div className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
                    {result.transactionMatches.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 bg-background/50 hover:bg-muted/20 transition-colors">
                        <div>
                          <p className="text-sm font-medium truncate max-w-[280px]">{tx.description || tx.payee}</p>
                          <p className="text-xs text-muted-foreground">{tx.date} · {tx.accountName}</p>
                        </div>
                        <span className="text-sm font-semibold ml-4">${tx.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {result.transactionMatches.length >= 20 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20">
                        Showing first 20 of many matches
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Balance matches */}
              {result.balanceMatches?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Accounts currently triggering rule
                  </p>
                  <div className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
                    {result.balanceMatches.map((acc: any) => (
                      <div key={acc.accountId} className="flex items-center justify-between px-3 py-2.5 bg-background/50">
                        <p className="text-sm font-medium">{acc.accountName}</p>
                        <span className="text-sm font-semibold">${acc.balance.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash flow */}
              {result.cashFlowMatches?.length > 0 && (
                <div className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
                  {result.cashFlowMatches.map((cf: any) => (
                    <div key={cf.yearMonth} className="flex items-center justify-between px-3 py-2.5 bg-background/50">
                      <p className="text-sm font-medium">{cf.yearMonth}</p>
                      <p className="text-xs text-muted-foreground">{cf.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="p-4 border-t border-border flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border p-8 text-center space-y-4">
      <Bell className="h-8 w-8 text-muted-foreground mx-auto" />
      <div className="space-y-1">
        <p className="font-semibold text-foreground">No custom alert rules yet</p>
        <p className="text-sm text-muted-foreground">
          Custom alerts let you define exactly when to get notified — by amount, keyword, balance threshold, goal milestone, or cash flow.
        </p>
      </div>
      <div className="text-left inline-block">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Example rules you could create:</p>
        <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
          <li>Alert when any transaction from "Amazon" exceeds $50</li>
          <li>Alert when my checking balance falls below $500</li>
          <li>Alert when my emergency fund goal reaches 50%</li>
          <li>Alert when monthly net savings falls below $0 for 2 months</li>
        </ul>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd} className="mt-2">
        <Plus className="h-4 w-4 mr-1.5" />
        Create your first rule
      </Button>
    </div>
  );
}

// ── Main list component ───────────────────────────────────────────────────────

export default function CustomAlertRuleList({ accountsList, goalsList }: Props) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [previewRule, setPreviewRule] = useState<CustomRule | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/custom-alerts');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load alert rules.');
      }
    } catch {
      toast.error('Network error. Could not load alert rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = async (rule: CustomRule, enabled: boolean) => {
    const res = await fetch(`/api/notifications/custom-alerts/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: enabled }),
    });
    if (res.ok) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isEnabled: enabled } : r));
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed to toggle rule.');
    }
  };

  const handleDelete = async (rule: CustomRule) => {
    const res = await fetch(`/api/notifications/custom-alerts/${rule.id}`, { method: 'DELETE' });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast.success(`"${rule.name}" deleted.`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed to delete rule.');
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingRule(null);
    fetchRules();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading rules…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Form (create or edit) */}
      {(showForm || editingRule !== null) && (
        <CustomAlertRuleForm
          editingRule={editingRule}
          accountsList={accountsList}
          goalsList={goalsList}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditingRule(null); }}
        />
      )}

      {/* Rule list */}
      {rules.length === 0 && !showForm ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              accountsList={accountsList}
              goalsList={goalsList}
              onEdit={() => { setEditingRule(rule); setShowForm(false); }}
              onDelete={() => handleDelete(rule)}
              onToggle={(v) => handleToggle(rule, v)}
              onPreview={() => setPreviewRule(rule)}
            />
          ))}
          {/* Add rule button at bottom */}
          {!showForm && editingRule === null && (
            <Button
              variant="outline"
              size="sm"
              id="add-alert-rule"
              className="w-full border-dashed"
              onClick={() => { setEditingRule(null); setShowForm(true); }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add alert rule
            </Button>
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewRule && (
        <PreviewModal rule={previewRule} onClose={() => setPreviewRule(null)} />
      )}
    </div>
  );
}
