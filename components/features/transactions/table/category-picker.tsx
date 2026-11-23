'use client';

import { useId, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { ClickOutsideBackdrop } from '@/components/ui/modal-overlay';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CATEGORY_COLOR,
  dotBgStyle,
  formatSignedTransactionAmount,
  tagColorStyle,
  type Category,
  type CreateCategoryInput,
  type FlattenedTransaction,
} from './types';

interface CategoryPickerContentProps {
  categories: Category[];
  currentCategoryId: string | null;
  onSelect: (
    categoryId: string | null,
    categoryName: string | null,
    categoryColor: string | null,
  ) => void | Promise<void>;
  onCreateCategory: (input: CreateCategoryInput) => Promise<void>;
  autoFocusSearch?: boolean;
  touchFriendly?: boolean;
  listMaxHeightClass?: string;
}

export function CategoryPickerContent({
  categories,
  currentCategoryId,
  onSelect,
  onCreateCategory,
  autoFocusSearch = true,
  touchFriendly = false,
  listMaxHeightClass = 'max-h-56',
}: CategoryPickerContentProps) {
  const incomeCheckboxId = useId();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [newColor, setNewColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [newIsIncome, setNewIsIncome] = useState(false);
  const [creatingLoading, setCreatingLoading] = useState(false);

  const parents = categories.filter((c) => !c.parentId || c.parentId === null);
  const getChildren = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);

  const handleSubmitCreate = async () => {
    if (!newName.trim() || creatingLoading) return;
    setCreatingLoading(true);
    try {
      await onCreateCategory({
        name: newName.trim(),
        parentId: newParentId || null,
        color: newColor,
        isIncome: newIsIncome,
      });
      setIsCreating(false);
    } finally {
      setCreatingLoading(false);
    }
  };

  if (isCreating) {
    return (
      <div className="p-3 space-y-2.5 flex flex-col flex-1 min-h-0 overflow-y-auto text-xs">
        <div className="font-semibold text-foreground uppercase tracking-wider text-micro">
          New Category
        </div>
        <div>
          <label className="block text-micro font-medium text-muted-foreground mb-1">
            Name
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            className={cn(
              'w-full px-2.5 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
              touchFriendly ? 'h-10 text-sm' : 'py-1.5 text-caption',
            )}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <div>
          <label className="block text-micro font-medium text-muted-foreground mb-1">
            Parent Category
          </label>
          <Select
            className={cn(
              'rounded-md px-2.5',
              touchFriendly ? 'h-10 text-sm' : 'h-9 text-caption',
            )}
            value={newParentId || ''}
            onChange={(e) => setNewParentId(e.target.value || null)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">None (top-level)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className={cn(
                'rounded cursor-pointer border border-input',
                touchFriendly ? 'w-7 h-7' : 'w-5 h-5',
              )}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-micro font-mono text-muted-foreground">
              {newColor}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id={incomeCheckboxId}
              checked={newIsIncome}
              onChange={(e) => setNewIsIncome(e.target.checked)}
              className="-m-1 p-1 rounded border-border text-primary focus:ring-ring"
              onClick={(e) => e.stopPropagation()}
            />
            <label
              htmlFor={incomeCheckboxId}
              className="text-caption font-medium text-muted-foreground"
            >
              Income
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating(false);
            }}
            className={cn(
              'flex-1 rounded-md text-foreground bg-muted hover:bg-accent transition-colors cursor-pointer',
              touchFriendly ? 'min-h-[44px] text-sm font-medium' : 'py-1.5 text-caption',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleSubmitCreate();
            }}
            disabled={creatingLoading || !newName.trim()}
            className={cn(
              'flex-1 rounded-md font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer',
              touchFriendly ? 'min-h-[44px] text-sm' : 'py-1.5 text-caption',
            )}
          >
            {creatingLoading ? 'Saving...' : 'Create'}
          </button>
        </div>
      </div>
    );
  }

  const filter = categoryFilter.trim().toLowerCase();
  const filteredParents = filter
    ? parents.filter(
        (p) =>
          p.name.toLowerCase().includes(filter) ||
          getChildren(p.id).some((c) => c.name.toLowerCase().includes(filter)),
      )
    : parents;

  const rowPaddingClass = touchFriendly
    ? 'min-h-[44px] py-2.5 text-sm'
    : 'py-1.5 text-xs';

  return (
    <>
      <div className="relative p-2 border-b border-border">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          placeholder="Search categories..."
          className={cn(
            'w-full pl-8 pr-2.5 bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            touchFriendly ? 'h-10 text-sm' : 'py-1.5 text-xs',
          )}
          autoFocus={autoFocusSearch}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className={cn('flex-1 min-h-0 overflow-y-auto', listMaxHeightClass)}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onSelect(null, null, null);
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 text-muted-foreground hover:bg-muted transition-colors text-left cursor-pointer',
            rowPaddingClass,
          )}
        >
          None
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsCreating(true);
            setNewName('');
            setNewParentId(null);
            setNewColor(DEFAULT_CATEGORY_COLOR);
            setNewIsIncome(false);
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 text-primary hover:bg-muted font-medium border-b border-border/50 transition-colors text-left cursor-pointer',
            rowPaddingClass,
          )}
        >
          + Create new category
        </button>

        {filteredParents.map((parent) => {
          const childList = filter
            ? getChildren(parent.id).filter((c) =>
                c.name.toLowerCase().includes(filter),
              )
            : getChildren(parent.id);
          if (
            filter &&
            childList.length === 0 &&
            !parent.name.toLowerCase().includes(filter)
          ) {
            return null;
          }
          return (
            <div key={parent.id}>
              <div className="flex items-center gap-2 px-3 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-muted">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={dotBgStyle(parent.color)}
                />
                {parent.name}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onSelect(parent.id, parent.name, parent.color);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 transition-colors text-left cursor-pointer',
                  rowPaddingClass,
                  currentCategoryId === parent.id
                    ? 'text-primary bg-primary/10 font-medium'
                    : 'text-foreground/80 hover:bg-muted',
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={dotBgStyle(parent.color)}
                />
                <span className="truncate">{parent.name}</span>
                {currentCategoryId === parent.id && (
                  <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                )}
              </button>
              {childList.map((child) => (
                <button
                  type="button"
                  key={child.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onSelect(child.id, child.name, child.color);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 pl-6 pr-3 transition-colors text-left cursor-pointer',
                    rowPaddingClass,
                    currentCategoryId === child.id
                      ? 'text-primary bg-primary/10 font-medium'
                      : 'text-foreground/80 hover:bg-muted',
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={dotBgStyle(child.color)}
                  />
                  <span className="truncate">{child.name}</span>
                  {currentCategoryId === child.id && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          );
        })}

        {filteredParents.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            No categories found
          </div>
        )}
      </div>
    </>
  );
}

interface DesktopCategoryCellProps {
  tx: FlattenedTransaction;
  categories: Category[];
  isOpen: boolean;
  dropdownPos: { top: number; left: number } | null;
  onToggle: (triggerEl: HTMLElement) => void;
  onClose: () => void;
  onSelect: (
    categoryId: string | null,
    categoryName: string | null,
    categoryColor: string | null,
  ) => void | Promise<void>;
  onCreateCategory: (input: CreateCategoryInput) => Promise<void>;
}

/**
 * Shared desktop category pill and dropdown cell used by both Detailed and
 * Compact desktop views of TransactionTable.
 */
export function DesktopCategoryCell({
  tx,
  categories,
  isOpen,
  dropdownPos,
  onToggle,
  onClose,
  onSelect,
  onCreateCategory,
}: DesktopCategoryCellProps) {
  return (
    <div className="relative max-w-full min-w-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(e.currentTarget);
        }}
        aria-label={
          tx.categoryName
            ? `Change category: ${tx.categoryName}`
            : 'Assign category'
        }
        className="flex items-center gap-1 max-w-full min-w-0 group/cat cursor-pointer rounded-full"
      >
        {tx.categoryName ? (
          <span
            className="category-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.8125rem] leading-5 font-medium max-w-full min-w-0"
            style={tagColorStyle(tx.categoryColor)}
            title={tx.categoryName}
          >
            {tx.categorizedByAi && (
              <Sparkles className="h-3 w-3 shrink-0 opacity-60" />
            )}
            <span className="truncate">{tx.categoryName}</span>
            <ChevronDown className="h-3 w-3 opacity-40 group-hover/cat:opacity-100 transition-opacity shrink-0" />
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.8125rem] leading-5 font-medium bg-muted text-muted-foreground group-hover/cat:text-foreground transition-colors max-w-full min-w-0"
            title="Uncategorized"
          >
            <span className="truncate">Uncategorized</span>
            <ChevronDown className="h-3 w-3 opacity-40 group-hover/cat:opacity-100 transition-opacity shrink-0" />
          </span>
        )}
      </button>

      {isOpen && dropdownPos && (
        <>
          <ClickOutsideBackdrop
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          <div
            className="fixed z-50 w-56 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <CategoryPickerContent
              categories={categories}
              currentCategoryId={tx.categoryId}
              onSelect={onSelect}
              onCreateCategory={onCreateCategory}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface MobileCategoryPickerSheetProps {
  transaction: FlattenedTransaction | null;
  categories: Category[];
  onClose: () => void;
  onSelect: (
    txId: string,
    categoryId: string | null,
    categoryName: string | null,
    categoryColor: string | null,
  ) => Promise<void>;
  onCreateCategory: (txId: string, input: CreateCategoryInput) => Promise<void>;
}

export function MobileCategoryPickerSheet({
  transaction,
  categories,
  onClose,
  onSelect,
  onCreateCategory,
}: MobileCategoryPickerSheetProps) {
  return (
    <Sheet
      open={Boolean(transaction)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] gap-3"
      >
        {transaction && (
          <>
            <SheetHeader className="text-left pr-8 space-y-0.5">
              <div className="flex items-baseline justify-between gap-3 min-w-0">
                <SheetTitle className="text-base font-semibold truncate">
                  {transaction.payee || transaction.description}
                </SheetTitle>
                <span className="text-sm font-mono font-semibold tabular-nums shrink-0 text-foreground financial-value">
                  {formatSignedTransactionAmount(transaction.amount)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Choose category</p>
            </SheetHeader>

            <div className="flex-1 min-h-0 flex flex-col border border-border rounded-xl overflow-hidden bg-background">
              <CategoryPickerContent
                key={transaction.id}
                categories={categories}
                currentCategoryId={transaction.categoryId}
                autoFocusSearch={false}
                touchFriendly={true}
                listMaxHeightClass=""
                onSelect={async (catId, catName, catColor) => {
                  await onSelect(transaction.id, catId, catName, catColor);
                  onClose();
                }}
                onCreateCategory={async (input) => {
                  await onCreateCategory(transaction.id, input);
                  onClose();
                }}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
