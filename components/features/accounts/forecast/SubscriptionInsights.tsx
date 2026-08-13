'use client';

import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Tv,
  CheckCircle2,
  ExternalLink,
  DollarSign,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import type { SubscriptionInsightData, RecurringStreamItem } from '../account-types';

interface SubscriptionInsightsProps {
  insights: SubscriptionInsightData[];
  streams: RecurringStreamItem[];
}

export function SubscriptionInsights({ insights, streams }: SubscriptionInsightsProps) {
  const activeSubscriptions = streams.filter((s) => s.isActive && s.type === 'subscription');

  const monthlyTotal = activeSubscriptions.reduce((sum, s) => {
    const mult =
      s.frequency === 'weekly' ? 4.33 :
      s.frequency === 'biweekly' ? 2.17 :
      s.frequency === 'quarterly' ? 1 / 3 :
      s.frequency === 'yearly' ? 1 / 12 : 1;
    return sum + s.amount * mult;
  }, 0);

  const topSubscriptions = [...activeSubscriptions]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground">
              Subscription Intelligence
            </h3>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-bold text-foreground">
            {formatCurrency(monthlyTotal)}
            <span className="text-xs font-normal text-muted-foreground">/mo</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatCurrency(monthlyTotal * 12)}/year total
          </div>
        </div>
      </div>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* ── 1. Alert Banners (e.g. Price Increases) ── */}
        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                  insight.severity === 'warning' || insight.severity === 'critical'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                    : 'border-primary/20 bg-primary/5 text-foreground'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-xs">{insight.title}</div>
                  <div className="text-muted-foreground dark:text-muted-foreground/90">
                    {insight.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 2. Top Subscriptions Breakdown ── */}
        {topSubscriptions.length > 0 ? (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Top Active Subscriptions
            </h4>
            <div className="space-y-2">
              {topSubscriptions.map((sub) => {
                const yearly = sub.amount * 12;
                const pctOfTotal = monthlyTotal > 0 ? (sub.amount / monthlyTotal) * 100 : 0;
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/20 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{sub.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        ({sub.frequency})
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-foreground">{formatCurrency(sub.amount)}/mo</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatCurrency(yearly)}/yr ({Math.round(pctOfTotal)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl">
            No active subscriptions detected yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
