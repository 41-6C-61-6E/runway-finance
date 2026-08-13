'use client';

import React, { useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Tv,
  Zap,
  Home,
  Briefcase,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  Edit2,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import type { RecurringStreamItem } from '../account-types';

interface UpcomingTimelineViewProps {
  streams: RecurringStreamItem[];
  onEditStream: (stream: RecurringStreamItem) => void;
  onToggleActive: (stream: RecurringStreamItem) => void;
  accountNames?: Record<string, string>;
}

export function UpcomingTimelineView({
  streams,
  onEditStream,
  onToggleActive,
  accountNames = {},
}: UpcomingTimelineViewProps) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);

  // Group recurring streams into timeline buckets:
  // 1. Next 7 Days
  // 2. Later This Month
  // 3. Next Month & Beyond
  const { dueNext7Days, laterThisMonth, nextMonthBeyond } = useMemo(() => {
    const activeStreams = streams.filter((s) => s.isActive);
    // Sort ascending by nextExpectedDate
    const sorted = [...activeStreams].sort((a, b) =>
      a.nextExpectedDate.localeCompare(b.nextExpectedDate)
    );

    const sevenDaysOut = new Date(today);
    sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);
    const sevenDaysStr = sevenDaysOut.toISOString().split('T')[0];

    const currentYearMonth = todayStr.substring(0, 7);

    const d7: RecurringStreamItem[] = [];
    const thisMo: RecurringStreamItem[] = [];
    const nextMo: RecurringStreamItem[] = [];

    for (const s of sorted) {
      if (s.nextExpectedDate <= sevenDaysStr) {
        d7.push(s);
      } else if (s.nextExpectedDate.startsWith(currentYearMonth)) {
        thisMo.push(s);
      } else {
        nextMo.push(s);
      }
    }

    return {
      dueNext7Days: d7,
      laterThisMonth: thisMo,
      nextMonthBeyond: nextMo,
    };
  }, [streams, today, todayStr]);

  const renderStreamCard = (stream: RecurringStreamItem) => {
    const isIncome = stream.type === 'income';
    const isSubscription = stream.type === 'subscription';
    const isBill = stream.type === 'bill';
    const isLoan = stream.type === 'loan';

    const diffDays = Math.round(
      (new Date(stream.nextExpectedDate + 'T00:00:00Z').getTime() -
        new Date(todayStr + 'T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24)
    );

    let statusPill = null;
    if (diffDays === 0) {
      statusPill = (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          Due Today
        </span>
      );
    } else if (diffDays === 1) {
      statusPill = (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          Due Tomorrow
        </span>
      );
    } else if (diffDays > 1 && diffDays <= 7) {
      statusPill = (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          In {diffDays} days
        </span>
      );
    } else if (diffDays < 0) {
      statusPill = (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
          Overdue ({Math.abs(diffDays)}d)
        </span>
      );
    } else {
      statusPill = (
        <span className="text-[10px] text-muted-foreground">
          {formatSafeUTCDate(stream.nextExpectedDate, { month: 'short', day: 'numeric' })}
        </span>
      );
    }

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

    const accountName = stream.accountId ? accountNames[stream.accountId] || 'Linked Account' : null;

    return (
      <div
        key={stream.id}
        className="group flex items-center justify-between p-3 sm:p-3.5 rounded-xl border border-border/40 bg-card/40 hover:bg-card/80 hover:border-border/80 transition-all gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            <IconComponent className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                {stream.name}
              </span>
              {statusPill}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span className="capitalize">{stream.frequency}</span>
              {accountName && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[120px]">{accountName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="text-right">
            <div
              className={`text-xs sm:text-sm font-bold ${
                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
              }`}
            >
              {isIncome ? '+' : '-'}
              {formatCurrency(stream.amount)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatSafeUTCDate(stream.nextExpectedDate, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStream(stream)}
            className="h-8 w-8 p-0 opacity-80 group-hover:opacity-100 hover:bg-muted"
            title="Edit Recurring Stream"
          >
            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    );
  };

  if (streams.length === 0) {
    return (
      <div className="text-center py-10 px-4 border border-dashed border-border/60 rounded-xl bg-muted/20">
        <Calendar className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
        <h4 className="font-medium text-sm text-foreground">No Recurring Streams Detected</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          As you link accounts and sync transactions, recurring bills, subscriptions, and salary dates will automatically appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Next 7 Days Section ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h4 className="font-semibold text-xs uppercase tracking-wider text-foreground">
              Due in Next 7 Days
            </h4>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-muted font-medium text-muted-foreground">
              {dueNext7Days.length}
            </span>
          </div>
        </div>

        {dueNext7Days.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {dueNext7Days.map(renderStreamCard)}
          </div>
        ) : (
          <div className="p-3.5 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-border/30">
            No bills or deposits expected in the next 7 days.
          </div>
        )}
      </div>

      {/* ── 2. Later This Month Section ── */}
      {laterThisMonth.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Later This Month
            </h4>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-muted font-medium text-muted-foreground">
              {laterThisMonth.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {laterThisMonth.map(renderStreamCard)}
          </div>
        </div>
      )}

      {/* ── 3. Next Month & Beyond Section ── */}
      {nextMonthBeyond.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Next Month & Beyond
            </h4>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-muted font-medium text-muted-foreground">
              {nextMonthBeyond.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {nextMonthBeyond.map(renderStreamCard)}
          </div>
        </div>
      )}
    </div>
  );
}
