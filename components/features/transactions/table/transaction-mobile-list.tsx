'use client';

import { useMemo, useState } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { ChevronDown, Repeat, Sparkles } from 'lucide-react';
import { ListRow } from '@/components/ui/list-row';
import { Select } from '@/components/ui/select';
import AiCategorizeButton from '@/components/features/transactions/ai-categorize-button';
import { formatAmount } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { COLUMN_LABELS } from './column-constants';
import { MobileCategoryPickerSheet } from './category-picker';
import {
  formatDateGroupLabel,
  formatShortTransactionDate,
  formatSignedTransactionAmount,
  getDateKey,
  getMerchantInitial,
  matchRecurringPattern,
  tagColorStyle,
  type Category,
  type CreateCategoryInput,
  type FlattenedTransaction,
  type RecurringPattern,
  type Transaction,
} from './types';

const MOBILE_SORT_OPTIONS = [
  { value: 'date:desc', label: 'Newest' },
  { value: 'date:asc', label: 'Oldest' },
  { value: 'amount:desc', label: 'Largest' },
  { value: 'amount:asc', label: 'Smallest' },
  { value: 'description:asc', label: 'A–Z' },
] as const;

interface ParentWithSplits {
  tx: FlattenedTransaction;
  splits: FlattenedTransaction[];
}

interface DateSection {
  dateKey: string;
  label: string;
  items: ParentWithSplits[];
}

interface TransactionMobileListProps {
  transactions: Transaction[];
  flattenedTransactions: FlattenedTransaction[];
  total: number;
  totalAmount: number | null;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  categories: Category[];
  recurringPatterns: RecurringPattern[];
  showRegisterTags: boolean;
  showAccountTags: boolean;
  aiConfigured?: boolean;
  onTransactionClick?: (tx: Transaction) => void;
  onSetCategory: (
    txId: string,
    categoryId: string | null,
    categoryName?: string | null,
    categoryColor?: string | null,
  ) => Promise<void>;
  onCreateCategory: (txId: string, input: CreateCategoryInput) => Promise<void>;
  onAiProposalCreated?: () => void;
}

export function TransactionMobileList({
  transactions,
  flattenedTransactions,
  total,
  totalAmount,
  sorting,
  onSortingChange,
  categories,
  recurringPatterns,
  showRegisterTags,
  showAccountTags,
  aiConfigured,
  onTransactionClick,
  onSetCategory,
  onCreateCategory,
  onAiProposalCreated,
}: TransactionMobileListProps) {
  const [pickerTx, setPickerTx] = useState<FlattenedTransaction | null>(null);

  const activeSort = sorting[0] ?? { id: 'date', desc: true };
  const currentSortValue = `${activeSort.id}:${activeSort.desc ? 'desc' : 'asc'}`;
  const isKnownSort = MOBILE_SORT_OPTIONS.some((o) => o.value === currentSortValue);
  const isGroupedByDate = activeSort.id === 'date';

  const parentItems = useMemo<ParentWithSplits[]>(() => {
    const items: ParentWithSplits[] = [];
    for (const row of flattenedTransactions) {
      if (row.isSplitChild) {
        const last = items[items.length - 1];
        if (last && (!row.parentTxId || last.tx.id === row.parentTxId)) {
          last.splits.push(row);
        }
      } else {
        items.push({ tx: row, splits: [] });
      }
    }
    return items;
  }, [flattenedTransactions]);

  const dateSections = useMemo<DateSection[]>(() => {
    if (!isGroupedByDate) return [];
    const now = new Date();
    const groups = new Map<string, ParentWithSplits[]>();
    for (const item of parentItems) {
      const key = getDateKey(item.tx.date) || 'unknown';
      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return Array.from(groups.entries()).map(([dateKey, items]) => ({
      dateKey,
      label: dateKey === 'unknown' ? 'Undated' : formatDateGroupLabel(dateKey, now),
      items,
    }));
  }, [isGroupedByDate, parentItems]);

  const handleSortChange = (value: string) => {
    const [id, dir] = value.split(':');
    if (!id) return;
    onSortingChange([{ id, desc: dir !== 'asc' }]);
  };

  const renderTransactionItem = ({ tx, splits }: ParentWithSplits) => {
    const isPending = tx.pending;
    const hasSplits = Boolean(tx.splits && tx.splits.length > 0);
    const displayName = tx.payee || tx.description;
    const formattedAmount = formatSignedTransactionAmount(tx.amount);
    const numericAmount = parseFloat(tx.amount);
    const isPositive = !Number.isNaN(numericAmount) && numericAmount > 0;
    const recurringMatch = matchRecurringPattern(tx, recurringPatterns);

    const visibleTxTags = showRegisterTags ? (tx.tags ?? []) : [];
    const visibleAccountTags =
      showRegisterTags && showAccountTags ? (tx.accountTags ?? []) : [];
    const hasTags = visibleTxTags.length > 0 || visibleAccountTags.length > 0;

    const handleOpenParent = () => {
      onTransactionClick?.(tx);
    };

    return (
      <div key={tx.id}>
        <ListRow
          element="div"
          data-list-row="transaction"
          showChevron={false}
          ariaLabel={`${displayName}${isPending ? ' (pending)' : ''}, ${formattedAmount}`}
          onActivate={handleOpenParent}
          className={cn(
            'px-1.5 py-3 group',
            isPending && 'bg-primary/[0.04] dark:bg-primary/[0.08] rounded-lg',
          )}
          bodyClassName="flex items-start gap-3 w-full min-w-0"
        >
          {/* Left Category Initial Avatar */}
          <div
            aria-hidden="true"
            className={cn(
              'w-9 h-9 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-xs font-semibold select-none',
              tx.categoryName
                ? 'category-pill'
                : 'bg-muted text-muted-foreground border border-dashed border-border',
              isPending && 'opacity-75 border border-dashed border-primary/50',
            )}
            style={tx.categoryName ? tagColorStyle(tx.categoryColor) : undefined}
          >
            {getMerchantInitial(displayName)}
          </div>

          {/* Right Content Column */}
          <div className="flex-1 min-w-0">
            {/* Line 1: Merchant + Badges | Signed Amount */}
            <div className="flex items-baseline justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className={cn(
                    'text-sm truncate leading-snug',
                    isPending
                      ? 'font-medium text-muted-foreground'
                      : 'font-semibold text-foreground',
                  )}
                >
                  {displayName}
                </span>
                {recurringMatch && (
                  <span
                    className="inline-flex items-center p-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0"
                    aria-label={`Recurring: ${recurringMatch.name}`}
                    title={`Recurring: ${recurringMatch.name}`}
                  >
                    <Repeat className="w-3 h-3" />
                  </span>
                )}
                {hasSplits && (
                  <span className="px-1.5 py-0.5 text-micro font-bold rounded bg-primary/15 text-primary border border-primary/25 uppercase tracking-wider select-none shrink-0">
                    Split
                  </span>
                )}
              </div>

              <span
                className={cn(
                  'text-sm font-mono font-semibold tabular-nums whitespace-nowrap shrink-0 financial-value',
                  isPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground',
                  isPending && 'opacity-75',
                )}
              >
                {formattedAmount}
              </span>
            </div>

            {/* Line 2: Category Pill + AI | Status · Account (· Date when non-date sorted) */}
            <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {hasSplits ? (
                  <span className="text-caption text-muted-foreground">
                    {tx.splits!.length} splits
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickerTx(tx);
                    }}
                    aria-label={
                      tx.categoryName
                        ? `Change category: ${tx.categoryName}`
                        : 'Assign category'
                    }
                    className="inline-flex items-center max-w-full min-w-0 py-1 -my-1 rounded-full cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {tx.categoryName ? (
                      <span
                        className="category-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium max-w-full min-w-0 active:opacity-80"
                        style={tagColorStyle(tx.categoryColor)}
                      >
                        {tx.categorizedByAi && (
                          <Sparkles className="h-2.5 w-2.5 shrink-0 opacity-70" />
                        )}
                        <span className="truncate">{tx.categoryName}</span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium border border-dashed border-border text-muted-foreground active:bg-muted whitespace-nowrap">
                        <span>Uncategorized</span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                      </span>
                    )}
                  </button>
                )}

                {!tx.categoryId && !hasSplits && aiConfigured && (
                  <AiCategorizeButton
                    transactionId={tx.id}
                    onSuggested={onAiProposalCreated}
                    className="shrink-0"
                  />
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 max-w-[46%] min-w-0 text-caption text-muted-foreground">
                {isPending && (
                  <>
                    <span className="text-micro font-semibold text-primary shrink-0">
                      Pending
                    </span>
                    <span
                      className="text-muted-foreground/40 shrink-0"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  </>
                )}
                <span className="truncate" title={tx.accountName || undefined}>
                  {tx.accountName || '—'}
                </span>
                {!isGroupedByDate && (
                  <>
                    <span
                      className="text-muted-foreground/40 shrink-0"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatShortTransactionDate(tx.date)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Line 3: Tags (only rendered when visible tags exist) */}
            {hasTags && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {visibleTxTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="tag-pill inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-medium whitespace-nowrap"
                    style={tagColorStyle(tag.color)}
                  >
                    #{tag.name}
                  </span>
                ))}
                {visibleAccountTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="tag-pill inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-medium whitespace-nowrap"
                    style={tagColorStyle(tag.color)}
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </ListRow>

        {/* Split child rows cleanly indented below parent */}
        {splits.length > 0 && (
          <div className="ml-5 pl-3.5 border-l-2 border-primary/25">
            {splits.map((split) => {
              const splitAmount = formatSignedTransactionAmount(split.amount);
              const splitNum = parseFloat(split.amount);
              const splitPositive = !Number.isNaN(splitNum) && splitNum > 0;

              return (
                <ListRow
                  key={split.id}
                  element="div"
                  data-list-row="transaction-split"
                  showChevron={false}
                  minTouchHeight={false}
                  ariaLabel={`Split: ${split.description}, ${splitAmount}`}
                  onActivate={() => {
                    const parent = split.parentTxId
                      ? transactions.find((t) => t.id === split.parentTxId)
                      : undefined;
                    onTransactionClick?.(parent ?? tx);
                  }}
                  className="pl-2 pr-1.5 py-2"
                  bodyClassName="flex items-center justify-between gap-2.5 w-full min-w-0"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="text-muted-foreground/50 font-mono text-xs shrink-0 select-none"
                      aria-hidden="true"
                    >
                      ↳
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {split.description}
                    </span>
                    {split.categoryName && (
                      <span
                        className="category-pill px-1.5 py-0.5 rounded-full text-micro font-medium whitespace-nowrap shrink-0"
                        style={tagColorStyle(split.categoryColor)}
                      >
                        {split.categoryName}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-mono font-medium tabular-nums whitespace-nowrap shrink-0 financial-value',
                      splitPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {splitAmount}
                  </span>
                </ListRow>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Top Mobile Summary & Sort Strip */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-2 border-b border-border/60">
        <div className="text-xs text-muted-foreground min-w-0 truncate">
          <span>
            {total.toLocaleString()} {total === 1 ? 'transaction' : 'transactions'}
          </span>
          {totalAmount === null ? (
            <span className="ml-1.5 text-muted-foreground/80 animate-pulse">
              · Calculating...
            </span>
          ) : totalAmount !== 0 ? (
            <span className="ml-1.5 font-mono font-medium text-foreground financial-value">
              · {formatAmount(totalAmount)}
            </span>
          ) : null}
        </div>

        <Select
          wrapperClassName="w-auto shrink-0"
          className="h-8 text-xs font-medium pl-2.5 pr-7 py-0 rounded-lg border-border/80 bg-background"
          aria-label="Sort transactions"
          value={currentSortValue}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          {!isKnownSort && (
            <option value={currentSortValue}>
              {COLUMN_LABELS[activeSort.id] || activeSort.id}
            </option>
          )}
          {MOBILE_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Grouped or Flat Mobile List */}
      {isGroupedByDate ? (
        <div>
          {dateSections.map((section) => (
            <section key={section.dateKey} aria-label={section.label}>
              <div className="pt-3.5 pb-1.5 px-1.5 flex items-center justify-between border-b border-border/60">
                <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </h3>
                {section.items.length > 1 && (
                  <span className="text-micro text-muted-foreground/70 tabular-nums">
                    {section.items.length}
                  </span>
                )}
              </div>
              <div className="py-0.5">
                {section.items.map(renderTransactionItem)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="py-0.5">
          {parentItems.map(renderTransactionItem)}
        </div>
      )}

      {/* Bottom Sheet Category Picker */}
      <MobileCategoryPickerSheet
        transaction={pickerTx}
        categories={categories}
        onClose={() => setPickerTx(null)}
        onSelect={onSetCategory}
        onCreateCategory={onCreateCategory}
      />
    </div>
  );
}
