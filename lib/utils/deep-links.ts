import type { NetWorthChangeBarDataPoint, NetWorthChangeBucketSize } from './net-worth-change-bars';
import type { TimeFrame } from './date/timeframe';

export interface FlowLinkOptions {
  timeframe?: TimeFrame | string;
  date?: string;
  startDate?: string;
  endDate?: string;
}

export interface TransactionsLinkOptions {
  accountId?: string;
  accountIds?: string | string[];
  accountTypes?: string | string[];
  categoryId?: string;
  categoryIds?: string | string[];
  excludeCategoryIds?: string | string[];
  excludeTagIds?: string | string[];
  search?: string;
  type?: 'income' | 'expense';
  startDate?: string;
  endDate?: string;
  pending?: boolean;
  ignored?: boolean;
  view?: 'recurring' | 'calendar';
}

export interface BudgetLinkOptions {
  categoryId?: string;
  periodType?: 'monthly' | 'quarterly' | 'yearly';
  periodKey?: string;
  month?: string;
}

function normalizeListParam(value?: string | string[]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const cleaned = value.map((v) => v.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned.join(',') : null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildFlowLink(tab: 'wealth' | 'cash' | 'income', opts: FlowLinkOptions): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (opts.startDate && opts.endDate && !opts.timeframe) {
    params.set('startDate', opts.startDate);
    params.set('endDate', opts.endDate);
  } else {
    if (opts.timeframe) params.set('timeframe', opts.timeframe);
    if (opts.date) params.set('date', opts.date);
    if (opts.startDate) params.set('startDate', opts.startDate);
    if (opts.endDate) params.set('endDate', opts.endDate);
  }
  return `/flows?${params.toString()}`;
}

export function buildWealthFlowLink(opts: FlowLinkOptions): string {
  return buildFlowLink('wealth', opts);
}

export function buildCashFlowLink(opts: FlowLinkOptions): string {
  return buildFlowLink('cash', opts);
}

export function buildNetWorthChangeBarLink(
  entry: NetWorthChangeBarDataPoint,
  bucketSize: NetWorthChangeBucketSize
): string {
  switch (bucketSize) {
    case 'daily':
      return buildWealthFlowLink({ timeframe: '1d_discrete', date: entry.endDate });
    case 'weekly': {
      const startMs = Date.parse(`${entry.startDate}T00:00:00Z`);
      const endMs = Date.parse(`${entry.endDate}T00:00:00Z`);
      const diffDays = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.round((endMs - startMs) / 86_400_000)
        : -1;
      if (diffDays === 6) {
        return buildWealthFlowLink({ timeframe: '7d_discrete', date: entry.endDate });
      }
      return buildWealthFlowLink({ startDate: entry.startDate, endDate: entry.endDate });
    }
    case 'monthly':
      return buildWealthFlowLink({ timeframe: '1m', date: entry.date.slice(0, 7) });
    case 'quarterly': {
      const year = entry.date.slice(0, 4);
      const month = Number(entry.date.slice(5, 7));
      const qEndMonth = Math.ceil(month / 3) * 3;
      return buildWealthFlowLink({
        timeframe: '3m',
        date: `${year}-${String(qEndMonth).padStart(2, '0')}`,
      });
    }
    case 'yearly':
      return buildWealthFlowLink({ timeframe: '1y', date: `${entry.date.slice(0, 4)}-12` });
    case 'biweekly':
      return buildWealthFlowLink({ startDate: entry.startDate, endDate: entry.endDate });
  }
}

export function buildTransactionsLink(opts: TransactionsLinkOptions): string {
  const params = new URLSearchParams();
  if (opts.view) params.set('view', opts.view);
  if (opts.accountId) params.set('accountId', opts.accountId);
  const accountIds = normalizeListParam(opts.accountIds);
  if (accountIds) params.set('accountIds', accountIds);
  const accountTypes = normalizeListParam(opts.accountTypes);
  if (accountTypes) params.set('accountTypes', accountTypes);
  const categoryIds = normalizeListParam(opts.categoryIds);
  if (categoryIds) {
    params.set('categoryIds', categoryIds);
  } else if (opts.categoryId) {
    params.set('categoryId', opts.categoryId);
  }
  const excludeCategoryIds = normalizeListParam(opts.excludeCategoryIds);
  if (excludeCategoryIds) params.set('excludeCategoryIds', excludeCategoryIds);
  const excludeTagIds = normalizeListParam(opts.excludeTagIds);
  if (excludeTagIds) params.set('excludeTagIds', excludeTagIds);
  if (opts.search) params.set('search', opts.search);
  if (opts.type) params.set('type', opts.type);
  if (opts.startDate) params.set('startDate', opts.startDate);
  if (opts.endDate) params.set('endDate', opts.endDate);
  if (opts.pending !== undefined) params.set('pending', String(opts.pending));
  if (opts.ignored !== undefined) params.set('ignored', String(opts.ignored));

  const qs = params.toString();
  return qs ? `/transactions?${qs}` : '/transactions';
}

export function buildBudgetLink(opts: BudgetLinkOptions): string {
  const params = new URLSearchParams();
  if (opts.categoryId) params.set('categoryId', opts.categoryId);
  if (opts.periodType) params.set('periodType', opts.periodType);
  if (opts.periodKey) params.set('periodKey', opts.periodKey);
  if (opts.month) params.set('month', opts.month);
  const qs = params.toString();
  return qs ? `/budgets?${qs}` : '/budgets';
}

export function buildAccountLink(accountId: string): string {
  return `/accounts?accountId=${encodeURIComponent(accountId)}`;
}
