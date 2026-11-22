import type { CSSProperties } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, shiftDaysUTC, toDateString } from '@/lib/utils/date';

export const DEFAULT_CATEGORY_COLOR = '#6366f1';

export type TransactionTag = {
  id: string;
  name: string;
  color: string;
};

export type TransactionSplit = {
  id: string;
  amount: string;
  description?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  notes: string | null;
  tags?: TransactionTag[];
  category?: { name: string; color: string } | null;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amount: string;
  pending: boolean;
  postedDate: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  accountType?: string | null;
  reviewed: boolean | null;
  categorizedByAi: boolean;
  source?: string;
  tags?: TransactionTag[];
  accountTags?: TransactionTag[];
  notes?: string | null;
  splits?: TransactionSplit[];
};

export type FlattenedTransaction = Transaction & {
  isSplitChild?: boolean;
  parentTxId?: string;
};

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};

export type RecurringPattern = {
  id: string;
  name: string;
  pattern: string;
  frequency: string;
};

export type CreateCategoryInput = {
  name: string;
  parentId: string | null;
  color: string;
  isIncome: boolean;
};

export function tagColorStyle(color?: string | null): CSSProperties {
  return { '--tag-color': color || 'var(--color-primary)' } as CSSProperties;
}

export function dotBgStyle(color?: string | null): CSSProperties {
  return { backgroundColor: color || 'var(--color-primary)' };
}

export function formatSignedTransactionAmount(amount: string | number | null | undefined): string {
  return formatCurrency(amount, 'USD', 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
}

export function getDateKey(dateStr: string): string {
  if (!dateStr) return '';
  return String(dateStr).split('T')[0] || '';
}

export function formatDateGroupLabel(dateKey: string, now: Date = new Date()): string {
  if (!dateKey) return '';
  const todayKey = toDateString(now);
  if (dateKey === todayKey) return 'Today';
  const yesterdayKey = shiftDaysUTC(todayKey, -1);
  if (dateKey === yesterdayKey) return 'Yesterday';

  const yearPart = parseInt(dateKey.split('-')[0] || '', 10);
  const currentYear = now.getFullYear();
  const options: Intl.DateTimeFormatOptions =
    !isNaN(yearPart) && yearPart !== currentYear
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' };

  return formatSafeUTCDate(dateKey, options);
}

export function formatShortTransactionDate(dateStr: string): string {
  if (!dateStr) return '';
  return formatSafeUTCDate(dateStr, { month: 'short', day: 'numeric' });
}

export function getMerchantInitial(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '•';
  const match = trimmed.match(/[A-Za-z0-9]/);
  return (match ? match[0] : trimmed[0]).toUpperCase();
}

export function matchRecurringPattern(
  tx: Transaction,
  patterns: RecurringPattern[],
): RecurringPattern | null {
  const desc = (tx.payee || tx.description || '').toLowerCase();
  if (!desc || patterns.length === 0) return null;
  return (
    patterns.find((r) => {
      const alts = r.pattern
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      return alts.some((p) => desc.includes(p) || p.includes(desc));
    }) ?? null
  );
}

export function buildGoogleSearchUrl(tx: Pick<Transaction, 'payee' | 'description'>): string {
  const query =
    tx.payee && tx.description && tx.payee !== tx.description
      ? `${tx.payee} ${tx.description}`
      : tx.payee || tx.description;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
