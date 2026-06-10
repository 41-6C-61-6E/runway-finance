'use client';

import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Briefcase, DollarSign, Percent, FolderSync, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InvestmentsSummaryProps {
  summary: {
    totalBalance: number;
    totalCostBasis: number | null;
    totalUnrealizedGainLoss: number | null;
    totalUnrealizedReturnPct: number | null;
    holdingsCount: number;
  };
}

export function InvestmentsSummary({ summary }: InvestmentsSummaryProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('investmentsSummary');

  const {
    totalBalance,
    totalCostBasis,
    totalUnrealizedGainLoss,
    totalUnrealizedReturnPct,
    holdingsCount,
  } = summary;

  const hasGainLoss = totalUnrealizedGainLoss !== null && totalCostBasis !== null && totalCostBasis > 0;
  const isPositive = totalUnrealizedGainLoss ? totalUnrealizedGainLoss >= 0 : false;

  const renderCard = (
    title: string,
    valueElement: React.ReactNode,
    subtextElement?: React.ReactNode,
    icon?: React.ComponentType<{ className?: string }>
  ) => {
    const Icon = icon;
    return (
      <div className="p-5">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {Icon && <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0" />}
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-2xl font-bold text-foreground tracking-tight">{valueElement}</div>
          {subtextElement && <div className="text-xs text-muted-foreground">{subtextElement}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary shrink-0" />
            <span>Portfolio Summary</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 sm:divide-x divide-border">
          {/* Total Value */}
          {renderCard(
            'Portfolio Value',
            <span className="financial-value">{formatCurrency(totalBalance)}</span>,
            'Combined balance of all investment accounts',
            DollarSign
          )}

          {/* Total Cost Basis */}
          {renderCard(
            'Total Cost Basis',
            totalCostBasis !== null ? (
              <span className="financial-value">{formatCurrency(totalCostBasis)}</span>
            ) : (
              <span className="text-muted-foreground/50 font-normal text-lg">—</span>
            ),
            <div className="flex items-center gap-1">
              <span>Original acquisition cost</span>
              {totalCostBasis === null && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="focus:outline-none">
                        <Info className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground cursor-pointer" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      Cost basis information is not provided by your financial institutions for all holdings.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>,
            FolderSync
          )}

          {/* Unrealized Return */}
          {renderCard(
            'Unrealized Return',
            hasGainLoss ? (
              <span className={`financial-value ${isPositive ? 'text-chart-1' : 'text-destructive'}`}>
                {isPositive ? '+' : ''}
                {formatCurrency(totalUnrealizedGainLoss)}
              </span>
            ) : (
              <span className="text-muted-foreground/50 font-normal text-lg">—</span>
            ),
            hasGainLoss ? (
              <div className={`flex items-center gap-0.5 font-medium ${isPositive ? 'text-chart-1' : 'text-destructive'}`}>
                <span>{isPositive ? '↑' : '↓'}</span>
                <span className="financial-value">{totalUnrealizedReturnPct?.toFixed(2)}%</span>
                <span className="text-muted-foreground font-normal ml-1">all-time</span>
              </div>
            ) : (
              'Requires holding cost basis'
            ),
            Percent
          )}

          {/* Securities Count */}
          {renderCard(
            'Holdings Count',
            <span>{holdingsCount}</span>,
            'Unique securities and assets tracked',
            Briefcase
          )}
        </div>
      )}
    </div>
  );
}
