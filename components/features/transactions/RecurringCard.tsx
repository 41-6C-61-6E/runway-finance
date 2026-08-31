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
  Tag,
  Merge,
  Square,
  CheckSquare,
  CircleAlert,
  Landmark,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

function getStatusBadge(item: RecurringItem) {
  if (item.isPaused) {
    return (
      <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider shrink-0">
        Paused
      </span>
    );
  }

  if (item.isConfirmed) {
    // Confirmed is the default state — no badge needed. Needs-review is the
    // only status worth flagging (small icon + tooltip).
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex p-1 rounded-md text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 cursor-help"
          aria-label="Needs review"
        >
          <CircleAlert className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Needs review — confirm or dismiss to decide its status.
      </TooltipContent>
    </Tooltip>
  );
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
          '@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 cursor-pointer flex flex-col justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-2 ring-primary border-primary',
          item.isPaused && 'opacity-60'
        )}
      >
        {/* ── Top Row: Checkbox, Icon, Merchant & Category, Status & Action Icons ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Checkbox (subtle until hover/selected) */}
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
                  'shrink-0 transition-colors p-1 -m-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
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
                {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
            )}

            {/* Category dot avatar */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-border/40"
              style={{
                backgroundColor: `${item.categoryColor || '#6366f1'}15`,
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.categoryColor || '#6366f1' }}
              />
            </div>

            {/* Title & Category Info */}
            <div className="min-w-0">
              <h4 className="font-semibold text-sm text-foreground truncate leading-tight">
                {item.displayName}
              </h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 truncate">
                {item.categoryName ? (
                  <span className="truncate">{item.categoryName}</span>
                ) : (
                  <span className="italic opacity-60">Uncategorized</span>
                )}
              </div>
            </div>
          </div>

          {/* Top Right: Status Badge & Quick Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {getStatusBadge(item)}

            <TooltipProvider delayDuration={150}>
              {/* Quick Review Buttons for unconfirmed items (X and Check) */}
              {!item.isConfirmed && !item.isDismissed && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleDismiss}
                        disabled={loadingAction}
                        aria-label="Dismiss suggestion"
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-56">
                          Dismiss — hides it; won't reappear in future scans.
                          It stays in the Dismissed tab.
                        </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loadingAction}
                        aria-label="Confirm subscription"
                        className="p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-56">
                          Confirm — keeps it active in forecasts and bill alerts.
                        </TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Action Popover Menu (···) */}
              <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(true);
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                        aria-label="More options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    More options
                  </TooltipContent>
                </Tooltip>

                <PopoverContent align="end" className="w-56 p-1.5 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenDetail(item);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer text-left"
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
                      className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer text-left"
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
                    className="w-full px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2 transition-colors cursor-pointer text-left"
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
                      className="w-full px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer text-left"
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
                      className="w-full px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark as Needs Review</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDismiss();
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-md flex items-start gap-2 transition-colors cursor-pointer text-left"
                  >
                    <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">Dismiss</span>
                      <span className="block text-[10px] font-normal text-muted-foreground leading-tight mt-0.5">
                        Hides it — it won't reappear in future scans (stays in Dismissed).
                      </span>
                    </span>
                  </button>

                  <div className="h-px bg-border/40 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDelete();
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md flex items-start gap-2 transition-colors cursor-pointer text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">Delete</span>
                      <span className="block text-[10px] font-normal text-foreground/60 leading-tight mt-0.5">
                        Removes the rule permanently — may reappear if the pattern is detected again.
                      </span>
                    </span>
                  </button>
                </PopoverContent>
              </Popover>
            </TooltipProvider>
          </div>
        </div>

        {/* ── Bottom Row: Amount & Frequency ── */}
        <div className="flex items-baseline justify-between pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'text-lg sm:text-xl font-bold font-mono tracking-tight',
                  isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                {isIncome ? '+' : '-'}
                {formatCurrency(item.averageAmount)}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {formatFrequencyUnit(item.frequency)}
                </span>
                {item.accountName && (
                  <span className="inline-block align-baseline text-[10px] font-normal text-muted-foreground/80 ml-1 max-w-[8rem] truncate">
                    · {item.accountName}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <span className="flex items-center gap-1.5">
                <Landmark className="w-3 h-3 shrink-0 opacity-70" />
                {item.accountName ? `Occurs on ${item.accountName}` : 'Any account'}
              </span>
            </TooltipContent>
          </Tooltip>

          <div className="text-xs text-muted-foreground font-medium">
            {formatFrequencyLabel(item.frequency)}
          </div>
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
