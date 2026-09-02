'use client';

import { useMemo } from 'react';
import { X, MousePointerClick, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { getPreciseDateRange } from '@/lib/utils/date-window';
import { AccountTransactions } from '@/components/features/accounts/AccountTransactions';
import type { TimeRange } from '@/components/charts/chart-filters';
import type { Account } from './account-types';

interface AccountDetailPanelProps {
  account: Account | null;
  historyData: any[];
  hierarchyTimeframe: TimeRange;
  onHierarchyTimeframeChange?: (tf: TimeRange) => void;
  onClose: () => void;
}

export default function AccountDetailPanel({
  account,
  historyData,
  hierarchyTimeframe,
  onHierarchyTimeframeChange,
  onClose,
}: AccountDetailPanelProps) {
  // Balance change over the selected timeframe (mirrors net-worth-summary delta styling)
  const trendStats = useMemo(() => {
    if (!account || historyData.length === 0) return null;
    const range = getPreciseDateRange(hierarchyTimeframe);
    let startIdx = 0;
    let endIdx = historyData.length - 1;
    if (hierarchyTimeframe !== 'all') {
      const foundStart = historyData.findIndex((d) => d.date >= range.start);
      if (foundStart !== -1) startIdx = foundStart;
      for (let i = historyData.length - 1; i >= 0; i--) {
        if (historyData[i].date <= range.end) {
          endIdx = i;
          break;
        }
      }
    }
    const points = historyData.slice(startIdx, endIdx + 1).map((d) => d[account.id] ?? 0);
    if (points.length < 2) return null;
    const starting = points[0];
    const current = points[points.length - 1];
    const change = current - starting;
    const percentChange = starting !== 0 ? (change / starting) * 100 : 0;
    const isLiab = isLiabilityAccount(account.type);
    const isPositive = isLiab ? change <= 0 : change >= 0;
    return { change, percentChange, isPositive };
  }, [account, historyData, hierarchyTimeframe]);

  if (!account) {
    return (
      <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
        <div className="py-16 px-6 text-center border border-dashed border-border/40 rounded-xl m-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <MousePointerClick className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">Select an account</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1.5">
            Click any account in the list to see its balance history and recent activity here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-sidebar-foreground truncate">{account.name}</h3>
              <span
                className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 flex-shrink-0 truncate max-w-[140px] sm:max-w-[180px]"
                title={account.institution || 'Unknown Institution'}
              >
                {account.institution || 'Unknown Institution'}
              </span>
              {account.isHidden && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-micro sm:text-[10px] font-bold text-destructive bg-destructive/10 px-1 rounded cursor-help shrink-0">Hidden</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    This account is hidden from lists and summaries
                  </TooltipContent>
                </Tooltip>
              )}
              {account.isExcludedFromNetWorth && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-micro sm:text-[10px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded cursor-help shrink-0">Excluded</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Excluded from Net Worth totals
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account details"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Balance + period delta — same line like combined chart */}
        <div className="flex items-baseline gap-2.5 mt-2.5 flex-wrap">
          <p className="text-xl sm:text-2xl font-bold font-mono text-sidebar-foreground blur-number">
            {formatCurrency(account.balance, account.currency)}
          </p>
          {trendStats && trendStats.change !== 0 && (
            <p
              className={`text-xs sm:text-sm font-medium ${
                trendStats.isPositive ? 'text-chart-1' : 'text-destructive'
              }`}
            >
              {trendStats.change >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
              )}
              {formatCurrency(Math.abs(trendStats.change), account.currency)} (
              {formatPlainPercent(Math.abs(trendStats.percentChange))})
            </p>
          )}
        </div>
      </div>

      {/* Detail content (balance history + recent activity) */}
      <AccountTransactions
        accountId={account.id}
        historyData={historyData}
        isLiability={isLiabilityAccount(account.type)}
        hierarchyTimeframe={hierarchyTimeframe}
        onHierarchyTimeframeChange={onHierarchyTimeframeChange}
        className="bg-transparent"
      />
    </div>
  );
}
