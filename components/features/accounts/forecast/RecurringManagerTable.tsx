'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  Edit2,
  Trash2,
  Tv,
  Zap,
  Briefcase,
  Home,
  Clock,
  Sparkles,
  DollarSign,
  Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import type { RecurringStreamItem, RecurringStreamType } from '../account-types';

interface RecurringManagerTableProps {
  streams: RecurringStreamItem[];
  onEditStream: (stream: RecurringStreamItem) => void;
  onToggleActive: (stream: RecurringStreamItem) => void;
  onDeleteStream: (stream: RecurringStreamItem) => void;
  onAddStream: () => void;
  accountNames?: Record<string, string>;
}

type FilterCategory = 'all' | 'income' | 'subscription' | 'bill' | 'loan';

export function RecurringManagerTable({
  streams,
  onEditStream,
  onToggleActive,
  onDeleteStream,
  onAddStream,
  accountNames = {},
}: RecurringManagerTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');

  const filteredStreams = useMemo(() => {
    return streams.filter((s) => {
      if (selectedCategory !== 'all' && s.type !== selectedCategory) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesPayee = s.payee.toLowerCase().includes(q);
        if (!matchesName && !matchesPayee) return false;
      }
      return true;
    });
  }, [streams, selectedCategory, search]);

  const counts = useMemo(() => {
    return {
      all: streams.length,
      income: streams.filter((s) => s.type === 'income').length,
      subscription: streams.filter((s) => s.type === 'subscription').length,
      bill: streams.filter((s) => s.type === 'bill').length,
      loan: streams.filter((s) => s.type === 'loan').length,
    };
  }, [streams]);

  const totalMonthlySpend = useMemo(() => {
    return filteredStreams
      .filter((s) => s.isActive && s.type !== 'income')
      .reduce((sum, s) => {
        const mult =
          s.frequency === 'weekly' ? 4.33 :
          s.frequency === 'biweekly' ? 2.17 :
          s.frequency === 'quarterly' ? 1 / 3 :
          s.frequency === 'yearly' ? 1 / 12 : 1;
        return sum + s.amount * mult;
      }, 0);
  }, [filteredStreams]);

  return (
    <div className="space-y-4">
      {/* ── Filter Bar & Actions ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'All Streams', count: counts.all },
              { id: 'income', label: 'Income', count: counts.income },
              { id: 'subscription', label: 'Subscriptions', count: counts.subscription },
              { id: 'bill', label: 'Bills & Utilities', count: counts.bill },
              { id: 'loan', label: 'Loans & Debt', count: counts.loan },
            ] as Array<{ id: FilterCategory; label: string; count: number }>
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedCategory === cat.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Add Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stream..."
              className="h-8 text-xs pl-8 bg-muted/40"
            />
          </div>
          <Button size="sm" onClick={onAddStream} className="h-8 text-xs gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Stream</span>
          </Button>
        </div>
      </div>

      {/* ── Streams Table / List ── */}
      <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
        {filteredStreams.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Clock className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
            <h4 className="font-medium text-sm text-foreground">No Streams Found</h4>
            <p className="text-xs text-muted-foreground mt-1">
              No recurring transactions match your current search or category filter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filteredStreams.map((stream) => {
              const isIncome = stream.type === 'income';
              const isSubscription = stream.type === 'subscription';
              const isBill = stream.type === 'bill';
              const isLoan = stream.type === 'loan';

              const IconComponent =
                isIncome ? Briefcase :
                isSubscription ? Tv :
                isBill ? Zap :
                isLoan ? Home : Clock;

              const iconBg =
                isIncome ? 'bg-emerald-500/10 text-emerald-500' :
                isSubscription ? 'bg-violet-500/10 text-violet-500' :
                isBill ? 'bg-amber-500/10 text-amber-500' :
                isLoan ? 'bg-blue-500/10 text-blue-500' : 'bg-muted text-muted-foreground';

              const accountName = stream.accountId ? accountNames[stream.accountId] || 'Account' : 'Any';

              return (
                <div
                  key={stream.id}
                  className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-all ${
                    !stream.isActive ? 'opacity-50 grayscale' : ''
                  }`}
                >
                  {/* Left: Stream Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {stream.name}
                        </span>

                        {stream.isAutoDetected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium">
                            <Sparkles className="w-2.5 h-2.5 text-primary" />
                            {stream.confidence}% AI
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium">
                            Custom
                          </span>
                        )}

                        {!stream.isActive && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-semibold">
                            Paused
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="capitalize font-medium">{stream.frequency}</span>
                        <span>•</span>
                        <span>
                          Next:{' '}
                          {formatSafeUTCDate(stream.nextExpectedDate, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {accountName && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[120px]">{accountName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pl-12 sm:pl-0">
                    <div className="text-right">
                      <div
                        className={`text-sm sm:text-base font-bold ${
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(stream.amount)}
                      </div>
                      <div className="text-[10px] text-muted-foreground capitalize">
                        {stream.frequency}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Active / Pause Toggle Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleActive(stream)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title={stream.isActive ? 'Pause stream' : 'Resume stream'}
                      >
                        {stream.isActive ? (
                          <PauseCircle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <PlayCircle className="w-4 h-4 text-emerald-500" />
                        )}
                      </Button>

                      {/* Edit Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditStream(stream)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Edit details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>

                      {/* Delete Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteStream(stream)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete stream"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {filteredStreams.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
          <span>Showing {filteredStreams.length} stream(s)</span>
          <span>
            Total Active Spend: <strong>{formatCurrency(totalMonthlySpend)}/mo</strong>
          </span>
        </div>
      )}
    </div>
  );
}
