'use client';

import { useState } from 'react';
import {
  MoreVertical,
  Check,
  X,
  Pause,
  Play,
  Trash2,
  Edit3,
  History,
  Calendar,
  CreditCard,
  Tag,
  AlertCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  Merge,
  Square,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { FrequencyType } from '@/lib/services/recurring-detection';

export interface RecurringItem {
  id: string;
  userId: string;
  merchantName: string;
  matchPattern?: string;
  displayName: string;
  customName: string | null;
  notes: string | null;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string;
  frequency: FrequencyType;
  averageAmount: number;
  lastAmount: number;
  monthlyAmount: number;
  annualAmount: number;
  lastDate: string;
  nextExpectedDate: string | null;
  daysUntilNext: number | null;
  isOverdue: boolean;
  flowType: 'income' | 'expense';
  isConfirmed: boolean;
  isDismissed: boolean;
  isPaused: boolean;
  occurrenceCount: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

interface RecurringCardProps {
  item: RecurringItem;
  selected?: boolean;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onOpenDetail: (item: RecurringItem) => void;
  onUpdate: (id: string, updates: Partial<RecurringItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMergeRequest?: (item: RecurringItem) => void;
}

export function formatFrequencyLabel(freq: FrequencyType): string {
  switch (freq) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Bi-weekly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'semi_annual':
      return 'Semi-annual';
    case 'annual':
      return 'Annual';
    default:
      return freq;
  }
}

export function formatFrequencyUnit(freq: FrequencyType): string {
  switch (freq) {
    case 'weekly':
      return '/wk';
    case 'biweekly':
      return '/2wk';
    case 'monthly':
      return '/mo';
    case 'quarterly':
      return '/qtr';
    case 'semi_annual':
      return '/6mo';
    case 'annual':
      return '/yr';
    default:
      return '';
  }
}

export default function RecurringCard({
  item,
  selected = false,
  onToggleSelect,
  onOpenDetail,
  onUpdate,
  onDelete,
  onMergeRequest,
}: RecurringCardProps) {
  const { privacyMode } = usePrivacyMode();
  const [loadingAction, setLoadingAction] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleConfirm = async (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setLoadingAction(true);
    try {
      await onUpdate(item.id, { isConfirmed: true, isDismissed: false });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDismiss = async (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setLoadingAction(true);
    try {
      await onUpdate(item.id, { isDismissed: true });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTogglePause = async (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setLoadingAction(true);
    try {
      await onUpdate(item.id, { isPaused: !item.isPaused });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setLoadingAction(true);
    try {
      await onDelete(item.id);
    } finally {
      setLoadingAction(false);
    }
  };

  const isIncome = item.flowType === 'income';
  const selectionMode = !!onToggleSelect;

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${item.displayName}`}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(item);
        }
      }}
      className={cn(
        'group relative p-4 rounded-2xl border bg-card transition-all cursor-pointer shadow-xs hover:shadow-md hover:border-primary/40 flex flex-col justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-primary border-primary bg-primary/[0.02]',
        item.isPaused && 'opacity-65 bg-muted/20 border-dashed',
        !item.isConfirmed && !item.isDismissed && 'border-amber-500/30 bg-amber-500/[0.02]'
      )}
    >
      {/* ── Top Row: Checkbox, Icon, Merchant Name, Status Badge & Menu ── */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Checkbox (always visible in selection mode, subtle until hover/selected) */}
          {onToggleSelect && (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(item.id, e);
              }}
              className={cn(
                'mt-1 shrink-0 transition-colors p-2.5 -m-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                selectionMode
                  ? selected
                    ? 'opacity-100 text-primary'
                    : 'opacity-100 text-muted-foreground/40 hover:text-muted-foreground group-hover:text-muted-foreground/70'
                  : selected
                    ? 'opacity-100 text-primary'
                    : 'opacity-0 group-hover:opacity-80 text-muted-foreground'
              )}
              aria-label="Select recurring item"
            >
              {selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            </button>
          )}

          {/* Category color circle / avatar */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
            style={{
              backgroundColor: `${item.categoryColor || '#6366f1'}18`,
              border: `1px solid ${item.categoryColor || '#6366f1'}35`,
            }}
          >
            <div
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: item.categoryColor || '#6366f1' }}
            />
          </div>

          {/* Title & Category Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-sm text-foreground truncate">{item.displayName}</h4>
              {item.customName && (
                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                  ({item.merchantName})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {item.categoryName ? (
                <span className="truncate flex items-center gap-1">
                  <Tag className="w-3 h-3 shrink-0 opacity-60" />
                  {item.categoryName}
                </span>
              ) : (
                <span className="text-muted-foreground/60 italic">Uncategorized</span>
              )}

              {item.accountName && (
                <>
                  <span>•</span>
                  <span className="truncate flex items-center gap-1">
                    <CreditCard className="w-3 h-3 shrink-0 opacity-60" />
                    {item.accountName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Right: Status Badge & Popover Menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status Badge */}
          {item.isPaused ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border flex items-center gap-1 font-mono">
              <Pause className="w-2.5 h-2.5" />
              Paused
            </span>
          ) : item.isConfirmed ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-mono">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />
              Confirmed
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1 font-mono">
              <Sparkles className="w-2.5 h-2.5 text-amber-500" />
              Needs Review
            </span>
          )}

          {/* Action Popover Menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(true);
                }}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenDetail(item);
                }}
                className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>

              {onMergeRequest && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onMergeRequest(item);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Merge className="w-3.5 h-3.5 text-primary" />
                  <span>Merge with Another...</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleTogglePause();
                }}
                className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer"
              >
                {item.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{item.isPaused ? 'Resume Tracking' : 'Pause Tracking'}</span>
              </button>

              {!item.isConfirmed && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleConfirm();
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Subscription</span>
                </button>
              )}

              {item.isConfirmed && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onUpdate(item.id, { isConfirmed: false });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Mark as Needs Review</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleDismiss();
                }}
                className="w-full px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>

              <div className="h-px bg-border/40 my-1" />

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
                className="w-full px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Middle: Amounts & Frequency ── */}
      <div className="flex items-baseline justify-between pt-1">
        <div>
          <div
            className={cn(
              'text-lg sm:text-xl font-extrabold font-mono tracking-tight',
              isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
              privacyMode && 'blur-xs select-none'
            )}
          >
            {isIncome ? '+' : '-'}
            {formatCurrency(item.averageAmount)}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {formatFrequencyUnit(item.frequency)}
            </span>
          </div>

          <div
            className={cn(
              'text-[11px] text-muted-foreground font-mono mt-0.5',
              privacyMode && 'blur-2xs select-none'
            )}
          >
            ≈ {formatCurrency(item.monthlyAmount)}/mo
            {item.frequency !== 'annual' && ` • ${formatCurrency(item.annualAmount)}/yr`}
          </div>
        </div>

        {/* Occurrences & Cadence */}
        <div className="text-right text-xs">
          <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-md">
            {formatFrequencyLabel(item.frequency)}
          </span>
          <div className="text-[10px] text-muted-foreground mt-1">
            {item.occurrenceCount} {item.occurrenceCount === 1 ? 'charge' : 'charges'} seen
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Next Expected Date & Action Prompts ── */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2 text-xs">
        {/* Next Expected Schedule */}
        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 truncate">
          <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" />
          {item.nextExpectedDate ? (
            <span className="truncate">
              Next: <strong className="text-foreground">{item.nextExpectedDate}</strong>
              {item.daysUntilNext !== null && !item.isPaused && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({item.daysUntilNext === 0
                    ? 'today'
                    : item.daysUntilNext === 1
                    ? 'tomorrow'
                    : item.daysUntilNext > 0
                    ? `in ${item.daysUntilNext}d`
                    : 'overdue'})
                </span>
              )}
            </span>
          ) : (
            <span className="italic opacity-70">Schedule pending</span>
          )}
        </div>

        {/* Quick Review Buttons for unconfirmed items */}
        {!item.isConfirmed && !item.isDismissed && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              disabled={loadingAction}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={loadingAction}
              className="h-7 px-2.5 text-xs font-semibold"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Confirm
            </Button>
          </div>
        )}
      </div>
    </div>

    <ConfirmDeleteDialog
      open={deleteDialogOpen}
      onOpenChange={setDeleteDialogOpen}
      title={`Delete ${item.displayName}?`}
      description="This cannot be undone."
      confirmText="Delete"
      busy={loadingAction}
      onConfirm={handleConfirmDelete}
    />
    </>
  );
}
