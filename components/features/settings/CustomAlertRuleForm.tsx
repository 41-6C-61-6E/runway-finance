'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Info, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import type {
  AlertCondition,
  AlertConditionField,
  ConditionOperator,
  ConditionTreeNode,
} from '@/lib/db/schema/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerType = 'transaction' | 'account_balance' | 'savings_goal' | 'cash_flow';

interface AccountItem { id: string; name: string; }
interface GoalItem { id: string; name: string; }

interface Props {
  editingRule: any | null;     // null = creating new
  accountsList: AccountItem[];
  goalsList: GoalItem[];
  onSaved: () => void;
  onCancel: () => void;
}

// ── Labels / metadata ────────────────────────────────────────────────────────

const TRIGGER_TYPE_LABELS: Record<TriggerType, { label: string; description: string }> = {
  transaction: {
    label: 'Transaction Alert',
    description: 'Fire when a new transaction matches your criteria (account, amount, keyword).',
  },
  account_balance: {
    label: 'Account Balance Alert',
    description: 'Fire when an account balance crosses above or below a threshold or another account\'s balance.',
  },
  savings_goal: {
    label: 'Savings Goal Alert',
    description: 'Fire when a savings goal hits a percentage or dollar milestone.',
  },
  cash_flow: {
    label: 'Cash Flow Alert',
    description: 'Fire when your monthly net savings or savings rate crosses a threshold.',
  },
};

const FIELD_LABELS: Record<AlertConditionField, string> = {
  account: 'Transaction is from a specific account',
  amount_min: 'Transaction amount is at least ($)',
  amount_max: 'Transaction amount is at most ($)',
  keyword: 'Description / payee contains keyword',
  balance_above_value: 'Balance rises above a fixed amount ($)',
  balance_below_value: 'Balance falls below a fixed amount ($)',
  balance_above_account: 'Balance rises above another account\'s balance',
  balance_below_account: 'Balance falls below another account\'s balance',
  goal_reached_percentage: 'Goal reaches a percentage of target (%)',
  goal_reached_amount: 'Goal reaches a dollar amount ($)',
  cf_net_savings_below: 'Monthly net savings falls below ($)',
  cf_net_savings_above: 'Monthly net savings rises above ($)',
  cf_savings_rate_below: 'Monthly savings rate falls below (%)',
  cf_savings_rate_above: 'Monthly savings rate rises above (%)',
};

const FIELDS_FOR_TRIGGER: Record<TriggerType, AlertConditionField[]> = {
  transaction: ['account', 'amount_min', 'amount_max', 'keyword'],
  account_balance: ['balance_above_value', 'balance_below_value', 'balance_above_account', 'balance_below_account'],
  savings_goal: ['goal_reached_percentage', 'goal_reached_amount'],
  cash_flow: ['cf_net_savings_below', 'cf_net_savings_above', 'cf_savings_rate_below', 'cf_savings_rate_above'],
};

const ACCOUNT_FIELDS: AlertConditionField[] = ['account', 'balance_above_account', 'balance_below_account'];
const GOAL_FIELDS: AlertConditionField[] = ['goal_reached_percentage', 'goal_reached_amount'];
const PERCENT_FIELDS: AlertConditionField[] = ['goal_reached_percentage', 'cf_savings_rate_below', 'cf_savings_rate_above'];

// ── Sub-components ────────────────────────────────────────────────────────────

function ConditionRow({
  cond,
  idx,
  triggerType,
  accountsList,
  goalsList,
  showRemove,
  onChange,
  onRemove,
}: {
  cond: AlertCondition;
  idx: number;
  triggerType: TriggerType;
  accountsList: AccountItem[];
  goalsList: GoalItem[];
  showRemove: boolean;
  onChange: (updates: Partial<AlertCondition>) => void;
  onRemove: () => void;
}) {
  const isAccountField = ACCOUNT_FIELDS.includes(cond.field);
  const isGoalField = GOAL_FIELDS.includes(cond.field);
  const isPercentField = PERCENT_FIELDS.includes(cond.field);
  const isCashFlow = cond.field.startsWith('cf_');

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-muted/10 border border-border/50">
      {/* Field selector */}
      <div className="flex-1 min-w-[200px] space-y-1.5">
        <Label htmlFor={`cond-field-${idx}`} className="text-xs font-semibold">Condition</Label>
        <select
          id={`cond-field-${idx}`}
          value={cond.field}
          onChange={(e) =>
            onChange({
              field: e.target.value as AlertConditionField,
              value: '',
              compareAccountId: undefined,
              goalId: undefined,
              consecutiveMonths: undefined,
            })
          }
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
        >
          {FIELDS_FOR_TRIGGER[triggerType].map((f) => (
            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
          ))}
        </select>
      </div>

      {/* Goal selector (only for goal fields) */}
      {isGoalField && (
        <div className="flex-1 min-w-[160px] space-y-1.5">
          <Label htmlFor={`cond-goal-${idx}`} className="text-xs font-semibold">Goal</Label>
          <select
            id={`cond-goal-${idx}`}
            value={cond.goalId || ''}
            onChange={(e) => onChange({ goalId: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
          >
            <option value="">Select a goal…</option>
            {goalsList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {/* Value input */}
      <div className="flex-1 min-w-[140px] space-y-1.5">
        <Label htmlFor={`cond-value-${idx}`} className="text-xs font-semibold">
          {isAccountField && cond.field !== 'account' ? 'Compare Account' : isAccountField ? 'Account' : 'Value'}
        </Label>
        {isAccountField ? (
          <select
            id={`cond-value-${idx}`}
            value={cond.field === 'account' ? String(cond.value) : (cond.compareAccountId || '')}
            onChange={(e) => {
              if (cond.field === 'account') {
                onChange({ value: e.target.value });
              } else {
                onChange({ compareAccountId: e.target.value, value: e.target.value });
              }
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
          >
            <option value="">Select account…</option>
            {accountsList.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
          </select>
        ) : cond.field === 'keyword' ? (
          <Input
            id={`cond-value-${idx}`}
            type="text"
            placeholder="e.g. Netflix, Amazon…"
            value={String(cond.value)}
            onChange={(e) => onChange({ value: e.target.value })}
            className="h-9 bg-background"
          />
        ) : (
          <div className="relative">
            <Input
              id={`cond-value-${idx}`}
              type="number"
              placeholder="0"
              value={cond.value === '' ? '' : String(cond.value)}
              onChange={(e) =>
                onChange({ value: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              className="h-9 bg-background"
            />
            {isPercentField && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                %
              </span>
            )}
            {!isPercentField && !isGoalField && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                $
              </span>
            )}
          </div>
        )}
      </div>

      {/* Consecutive months (cash flow only) */}
      {isCashFlow && (
        <div className="space-y-1.5 min-w-[90px]">
          <Label htmlFor={`cond-months-${idx}`} className="text-xs font-semibold whitespace-nowrap">
            For months
          </Label>
          <select
            id={`cond-months-${idx}`}
            value={cond.consecutiveMonths || 1}
            onChange={(e) => onChange({ consecutiveMonths: parseInt(e.target.value) || 1 })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* Remove button */}
      {showRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-9 px-2 text-destructive hover:bg-destructive/10 self-end"
          title="Remove condition"
        >
          ✕
        </Button>
      )}
    </div>
  );
}

// ── Tree node renderer ────────────────────────────────────────────────────────

function ConditionGroupNode({
  node,
  path,
  depth,
  triggerType,
  accountsList,
  goalsList,
  onChange,
  onRemoveSelf,
}: {
  node: ConditionTreeNode;
  path: number[];
  depth: number;
  triggerType: TriggerType;
  accountsList: AccountItem[];
  goalsList: GoalItem[];
  onChange: (path: number[], updater: (n: ConditionTreeNode) => ConditionTreeNode) => void;
  onRemoveSelf?: () => void;
}) {
  const addCondition = () => {
    const defaultField = FIELDS_FOR_TRIGGER[triggerType][0];
    onChange(path, (n) => ({
      ...n,
      conditions: [...n.conditions, { field: defaultField, value: '' }],
    }));
  };
  const addSubGroup = () => {
    const defaultField = FIELDS_FOR_TRIGGER[triggerType][0];
    onChange(path, (n) => ({
      ...n,
      subGroups: [
        ...(n.subGroups || []),
        { operator: 'AND' as ConditionOperator, conditions: [{ field: defaultField, value: '' }], subGroups: [] },
      ],
    }));
  };

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }} className="space-y-2">
      {/* Operator toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Match:</span>
          <div className="inline-flex rounded-lg overflow-hidden border border-border">
            {(['AND', 'OR'] as ConditionOperator[]).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => onChange(path, (n) => ({ ...n, operator: op }))}
                className={`px-3 py-1 text-xs font-bold transition-colors ${
                  node.operator === op
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {op}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {node.operator === 'AND' ? '(all must match)' : '(any must match)'}
          </span>
        </div>
        {depth > 0 && onRemoveSelf && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemoveSelf}
            className="h-7 px-2 text-destructive hover:bg-destructive/10 text-xs"
          >
            Remove group
          </Button>
        )}
      </div>

      {/* Conditions */}
      <div className="border border-border/50 rounded-lg p-3 bg-muted/10 space-y-2">
        {node.conditions.map((cond, condIdx) => (
          <div key={condIdx}>
            <ConditionRow
              cond={cond}
              idx={condIdx}
              triggerType={triggerType}
              accountsList={accountsList}
              goalsList={goalsList}
              showRemove={node.conditions.length > 1 || (node.subGroups?.length ?? 0) > 0}
              onChange={(updates) =>
                onChange(path, (n) => ({
                  ...n,
                  conditions: n.conditions.map((c, i) => (i === condIdx ? { ...c, ...updates } : c)),
                }))
              }
              onRemove={() =>
                onChange(path, (n) => ({
                  ...n,
                  conditions: n.conditions.filter((_, i) => i !== condIdx),
                }))
              }
            />
            {condIdx < node.conditions.length - 1 && (
              <div className="flex justify-center py-1">
                <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {node.operator}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Sub-groups */}
        {(node.subGroups || []).map((sg, sgIdx) => (
          <div key={sgIdx}>
            {node.conditions.length > 0 && (
              <div className="flex justify-center py-1">
                <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {node.operator}
                </span>
              </div>
            )}
            <ConditionGroupNode
              node={sg}
              path={[...path, sgIdx]}
              depth={depth + 1}
              triggerType={triggerType}
              accountsList={accountsList}
              goalsList={goalsList}
              onChange={onChange}
              onRemoveSelf={() =>
                onChange(path, (n) => ({
                  ...n,
                  subGroups: (n.subGroups || []).filter((_, i) => i !== sgIdx),
                }))
              }
            />
          </div>
        ))}

        {/* Group action buttons */}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
            + Condition
          </Button>
          {depth < 2 && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addSubGroup}>
              + Sub-group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preview result display ────────────────────────────────────────────────────

function PreviewResults({ result }: { result: any }) {
  if (!result) return null;
  const hasMatches = result.matchCount > 0;

  return (
    <div className={`rounded-lg p-4 text-sm space-y-3 border ${hasMatches ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/20 border-border/50'}`}>
      <div className="flex items-center gap-2 font-semibold">
        {hasMatches
          ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className={hasMatches ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
          {result.notice}
        </span>
      </div>

      {/* Transaction matches */}
      {result.transactionMatches && result.transactionMatches.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent matches</p>
          <div className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
            {result.transactionMatches.slice(0, 5).map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-3 py-2 bg-background/50">
                <div>
                  <p className="text-xs font-medium text-foreground truncate max-w-[260px]">
                    {tx.description || tx.payee || 'Unknown'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{tx.date} · {tx.accountName}</p>
                </div>
                <span className="text-xs font-semibold text-foreground ml-3">${tx.amount.toFixed(2)}</span>
              </div>
            ))}
            {result.transactionMatches.length > 5 && (
              <div className="px-3 py-2 bg-muted/10 text-[11px] text-muted-foreground">
                …and {result.transactionMatches.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Balance matches */}
      {result.balanceMatches && result.balanceMatches.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accounts currently in violation</p>
          <div className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
            {result.balanceMatches.map((acc: any) => (
              <div key={acc.accountId} className="flex items-center justify-between px-3 py-2 bg-background/50">
                <p className="text-xs font-medium">{acc.accountName}</p>
                <span className="text-xs font-semibold">${acc.balance.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash flow matches */}
      {result.cashFlowMatches && result.cashFlowMatches.length > 0 && (
        <div className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
          {result.cashFlowMatches.map((cf: any) => (
            <div key={cf.yearMonth} className="flex items-center justify-between px-3 py-2 bg-background/50">
              <p className="text-xs font-medium">{cf.yearMonth}</p>
              <span className="text-xs text-muted-foreground">{cf.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateConditions(conditions: AlertCondition[], triggerType: TriggerType): string | null {
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    if (!cond.field) return `Condition ${i + 1}: please select a field.`;
    if (ACCOUNT_FIELDS.includes(cond.field) && !cond.value && cond.field !== 'account') {
      return `Condition ${i + 1}: please select an account to compare.`;
    }
    if (cond.field === 'account' && !cond.value) {
      return `Condition ${i + 1}: please select an account.`;
    }
    if (GOAL_FIELDS.includes(cond.field)) {
      if (!cond.goalId) return `Condition ${i + 1}: please select a goal.`;
      if (cond.value === '' || cond.value === undefined) return `Condition ${i + 1}: please enter a value.`;
    } else if (cond.field !== 'keyword' && !ACCOUNT_FIELDS.includes(cond.field)) {
      if (cond.value === '' || cond.value === undefined) return `Condition ${i + 1}: please enter a value.`;
    }
  }
  return null;
}

function validateTree(node: ConditionTreeNode, triggerType: TriggerType): string | null {
  const err = validateConditions(node.conditions, triggerType);
  if (err) return err;
  for (const group of node.subGroups || []) {
    const subErr = validateTree(group, triggerType);
    if (subErr) return subErr;
  }
  return null;
}

function convertLegacyCriteriaToConditions(rule: any): AlertCondition[] {
  const crit = rule.criteria;
  const result: AlertCondition[] = [];
  if (rule.triggerType === 'transaction') {
    if (crit.accountId) result.push({ field: 'account', value: crit.accountId });
    if (crit.amountMin !== undefined) result.push({ field: 'amount_min', value: crit.amountMin });
    if (crit.amountMax !== undefined) result.push({ field: 'amount_max', value: crit.amountMax });
    if (crit.keyword) result.push({ field: 'keyword', value: crit.keyword });
  } else if (rule.triggerType === 'account_balance') {
    if (crit.operator === 'greater_than') {
      result.push(crit.compareType === 'account'
        ? { field: 'balance_above_account', value: String(crit.compareAccountId || ''), compareAccountId: crit.compareAccountId }
        : { field: 'balance_above_value', value: crit.value ?? 0 });
    } else {
      result.push(crit.compareType === 'account'
        ? { field: 'balance_below_account', value: String(crit.compareAccountId || ''), compareAccountId: crit.compareAccountId }
        : { field: 'balance_below_value', value: crit.value ?? 0 });
    }
  } else if (rule.triggerType === 'savings_goal') {
    result.push(crit.operator === 'reached_percentage'
      ? { field: 'goal_reached_percentage', value: crit.value ?? 0, goalId: crit.goalId }
      : { field: 'goal_reached_amount', value: crit.value ?? 0, goalId: crit.goalId });
  } else if (rule.triggerType === 'cash_flow') {
    const metric = crit.metric || 'net_savings';
    const op = crit.operator || 'less_than';
    const field: AlertConditionField = metric === 'net_savings'
      ? (op === 'less_than' ? 'cf_net_savings_below' : 'cf_net_savings_above')
      : (op === 'less_than' ? 'cf_savings_rate_below' : 'cf_savings_rate_above');
    result.push({ field, value: crit.value ?? 0, consecutiveMonths: crit.consecutiveMonths || 1 });
  }
  return result;
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function setTreeAtPath(
  tree: ConditionTreeNode,
  path: number[],
  updater: (node: ConditionTreeNode) => ConditionTreeNode
): ConditionTreeNode {
  if (path.length === 0) return updater(tree);
  const [idx, ...rest] = path;
  return {
    ...tree,
    subGroups: (tree.subGroups || []).map((g, i) =>
      i === idx ? setTreeAtPath(g, rest, updater) : g
    ),
  };
}

// ── Main form component ───────────────────────────────────────────────────────

export default function CustomAlertRuleForm({ editingRule, accountsList, goalsList, onSaved, onCancel }: Props) {
  const isEditing = editingRule !== null;

  // Derive initial state from editingRule
  const getInitialTriggerType = (): TriggerType =>
    editingRule?.triggerType || 'transaction';
  const getInitialConditions = (): AlertCondition[] => {
    if (!editingRule) return [{ field: 'amount_min', value: '' }];
    if (editingRule.conditionTree?.conditions?.length > 0 || editingRule.conditionTree?.subGroups?.length > 0) {
      return editingRule.conditionTree.conditions || [];
    }
    if (editingRule.conditions?.length > 0) return editingRule.conditions;
    return convertLegacyCriteriaToConditions(editingRule);
  };
  const getInitialTree = (): ConditionTreeNode | null => {
    if (!editingRule) return null;
    if (editingRule.conditionTree?.conditions?.length > 0 || editingRule.conditionTree?.subGroups?.length > 0) {
      return editingRule.conditionTree;
    }
    return null;
  };
  const getInitialTargetAccountId = (): string => {
    if (!editingRule) return '';
    return editingRule.criteria?.accountId || '';
  };

  const [ruleName, setRuleName] = useState(editingRule?.name || '');
  const [triggerType, setTriggerType] = useState<TriggerType>(getInitialTriggerType());
  const [conditions, setConditions] = useState<AlertCondition[]>(getInitialConditions());
  const [conditionOperator, setConditionOperator] = useState<ConditionOperator>(
    editingRule?.conditionOperator || 'AND'
  );
  const [conditionTree, setConditionTree] = useState<ConditionTreeNode | null>(getInitialTree());
  const [useTreeMode, setUseTreeMode] = useState(getInitialTree() !== null);
  const [targetAccountId, setTargetAccountId] = useState(getInitialTargetAccountId());
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleChangeTriggerType = (newType: TriggerType) => {
    setTriggerType(newType);
    const defaultField = FIELDS_FOR_TRIGGER[newType][0];
    setConditions([{ field: defaultField, value: '' }]);
    setConditionOperator('AND');
    setConditionTree(null);
    setUseTreeMode(false);
    setTargetAccountId('');
    setPreviewResult(null);
  };

  const handleTreeChange = (path: number[], updater: (n: ConditionTreeNode) => ConditionTreeNode) => {
    setConditionTree((prev) => (prev ? setTreeAtPath(prev, path, updater) : prev));
  };

  const enableTreeMode = () => {
    if (conditionTree) return;
    const defaultField = FIELDS_FOR_TRIGGER[triggerType][0];
    setConditionTree({
      operator: conditionOperator,
      conditions: conditions.length > 0 ? [...conditions] : [{ field: defaultField, value: '' }],
      subGroups: [],
    });
    setUseTreeMode(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) { toast.error('Please enter a name for this rule.'); return; }

    // Validate
    if (useTreeMode && conditionTree) {
      if (conditionTree.conditions.length === 0 && !(conditionTree.subGroups?.length)) {
        toast.error('Please add at least one condition.'); return;
      }
      const err = validateTree(conditionTree, triggerType);
      if (err) { toast.error(err); return; }
    } else {
      if (conditions.length === 0) { toast.error('Please add at least one condition.'); return; }
      const err = validateConditions(conditions, triggerType);
      if (err) { toast.error(err); return; }
    }

    setSaving(true);
    try {
      const url = isEditing
        ? `/api/notifications/custom-alerts/${editingRule.id}`
        : '/api/notifications/custom-alerts';
      const method = isEditing ? 'PATCH' : 'POST';

      // Store targetAccountId in criteria for account_balance rules
      const criteriaPayload = triggerType === 'account_balance' && targetAccountId
        ? { accountId: targetAccountId }
        : {};

      const body: Record<string, any> = {
        name: ruleName.trim(),
        triggerType,
        criteria: criteriaPayload,
      };

      if (useTreeMode && conditionTree) {
        body.conditionTree = conditionTree;
        body.conditions = conditionTree.conditions;
        body.conditionOperator = conditionTree.operator;
      } else {
        body.conditions = conditions;
        body.conditionOperator = conditionOperator;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(isEditing ? 'Alert rule updated.' : 'Alert rule created.');
        onSaved();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || `Failed to save rule (HTTP ${res.status}).`);
      }
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    // For new rules, save first
    if (!isEditing) {
      toast.info('Save the rule first, then use the Preview button on the rule card.');
      return;
    }
    setPreviewing(true);
    setShowPreview(true);
    try {
      const res = await fetch(`/api/notifications/custom-alerts/${editingRule.id}/preview`, {
        method: 'POST',
      });
      if (res.ok) {
        setPreviewResult(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Preview failed.');
        setShowPreview(false);
      }
    } catch {
      toast.error('Network error during preview.');
      setShowPreview(false);
    } finally {
      setPreviewing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const currentFields = FIELDS_FOR_TRIGGER[triggerType];
  const triggerInfo = TRIGGER_TYPE_LABELS[triggerType];

  return (
    <form onSubmit={handleSave} className="p-5 border border-border rounded-xl bg-muted/30 space-y-5">
      <h3 className="text-sm font-semibold text-foreground">
        {isEditing ? 'Edit Alert Rule' : 'New Custom Alert Rule'}
      </h3>

      {/* Name + Trigger Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rule-name" className="text-xs font-semibold">Rule Name</Label>
          <Input
            id="rule-name"
            type="text"
            placeholder="e.g. Low Checking Warning"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            className="h-9 bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-type" className="text-xs font-semibold">Alert Type</Label>
          <select
            id="rule-type"
            value={triggerType}
            onChange={(e) => handleChangeTriggerType(e.target.value as TriggerType)}
            disabled={isEditing}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground disabled:opacity-60"
          >
            {(Object.keys(TRIGGER_TYPE_LABELS) as TriggerType[]).map((t) => (
              <option key={t} value={t}>{TRIGGER_TYPE_LABELS[t].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trigger description */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground px-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{triggerInfo.description}</span>
      </div>

      {/* Account selector for balance rules */}
      {triggerType === 'account_balance' && (
        <div className="space-y-1.5">
          <Label htmlFor="target-account" className="text-xs font-semibold">
            Apply to Account <span className="text-muted-foreground font-normal">(optional — leave blank to monitor all accounts)</span>
          </Label>
          <select
            id="target-account"
            value={targetAccountId}
            onChange={(e) => setTargetAccountId(e.target.value)}
            className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
          >
            <option value="">All accounts</option>
            {accountsList.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* AND/OR + conditions */}
      <div className="space-y-3">
        {/* AND/OR toggle — always visible */}
        {!useTreeMode && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">When:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-border">
              {(['AND', 'OR'] as ConditionOperator[]).map((op) => (
                <button
                  key={op}
                  type="button"
                  id={`cond-op-${op.toLowerCase()}`}
                  onClick={() => setConditionOperator(op)}
                  className={`px-3 py-1 text-xs font-bold transition-colors ${
                    conditionOperator === op
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {conditionOperator === 'AND'
                ? 'all conditions must match'
                : 'any one condition must match'}
            </span>
          </div>
        )}

        {/* Conditions (flat or tree) */}
        {useTreeMode && conditionTree ? (
          <ConditionGroupNode
            node={conditionTree}
            path={[]}
            depth={0}
            triggerType={triggerType}
            accountsList={accountsList}
            goalsList={goalsList}
            onChange={handleTreeChange}
          />
        ) : (
          <div className="space-y-0">
            {conditions.map((cond, idx) => (
              <div key={idx}>
                <ConditionRow
                  cond={cond}
                  idx={idx}
                  triggerType={triggerType}
                  accountsList={accountsList}
                  goalsList={goalsList}
                  showRemove={conditions.length > 1}
                  onChange={(updates) =>
                    setConditions((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, ...updates } : c))
                    )
                  }
                  onRemove={() =>
                    setConditions((prev) => prev.filter((_, i) => i !== idx))
                  }
                />
                {conditions.length > 1 && idx < conditions.length - 1 && (
                  <div className="flex justify-center py-1.5">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {conditionOperator}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add condition / sub-group actions */}
        {!useTreeMode && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="add-condition"
              onClick={() => {
                const defaultField = currentFields[0];
                setConditions((prev) => [...prev, { field: defaultField, value: '' }]);
              }}
            >
              + Add Condition
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enableTreeMode}
              title="Create condition sub-groups with mixed AND/OR logic — e.g. (amount > $100) AND (from Amazon OR from eBay)"
            >
              + Add Sub-group
            </Button>
            {/* Sub-group tooltip */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              Sub-groups let you mix AND/OR logic in a single rule
            </div>
          </div>
        )}
      </div>

      {/* Preview result */}
      {showPreview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Rule Preview</p>
            <button
              type="button"
              onClick={() => { setShowPreview(false); setPreviewResult(null); }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>
          {previewing
            ? <div className="flex items-center gap-2 text-xs text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Running preview against your data…</div>
            : <PreviewResults result={previewResult} />
          }
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewing}
              className="text-xs"
            >
              {previewing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing…</> : '🔍 Test Rule'}
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : isEditing ? 'Update Rule' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </form>
  );
}
