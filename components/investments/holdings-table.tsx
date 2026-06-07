import React, { useState } from 'react';
import { 
  Briefcase, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  History, 
  Coins, 
  CloudLightning, 
  CloudOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Percent,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { HoldingPosition, InvestmentAccountDetails } from '@/lib/services/investments';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface HoldingsTableProps {
  accounts: InvestmentAccountDetails[];
  onAddHolding: (accountId: string) => void;
  onEditHolding: (holding: HoldingPosition, accountId: string, holdingId: string) => void;
  onDeleteHolding: (holdingId: string) => void;
  onAddTransaction: (accountId: string) => void;
  onConfigureAccount: (account: InvestmentAccountDetails) => void;
  onViewTransactions: (accountId: string) => void;
}

export function HoldingsTable({
  accounts,
  onAddHolding,
  onEditHolding,
  onDeleteHolding,
  onAddTransaction,
  onConfigureAccount,
  onViewTransactions,
}: HoldingsTableProps) {
  // Collapse/Expand state for each account block
  const [collapsedAccounts, setCollapsedAccounts] = useState<Record<string, boolean>>({});

  const toggleCollapse = (accountId: string) => {
    setCollapsedAccounts((prev) => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  return (
    <div className="space-y-6">
      {accounts.map((acc) => {
        const isCollapsed = collapsedAccounts[acc.id] || false;
        const hasHoldings = acc.holdings.length > 0;
        const totalCost = acc.holdings.reduce((sum, h) => sum + h.totalCost, 0);
        const gainLoss = acc.totalComputedValue - totalCost;
        const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
        const isGain = gainLoss >= 0;

        return (
          <div 
            key={acc.id} 
            className="bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md"
          >
            {/* Account Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-5 bg-muted/20 border-b border-border/40 gap-3">
              <div className="flex items-center gap-3">
                {/* Collapse button */}
                <button
                  onClick={() => toggleCollapse(acc.id)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-foreground">{acc.name}</h4>
                    {acc.synced ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 gap-0.5">
                        <CloudLightning className="h-2.5 w-2.5" /> Synced
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-gray-500/10 text-muted-foreground border border-border/40 gap-0.5">
                        <CloudOff className="h-2.5 w-2.5" /> Manual
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {acc.institution || 'Investment Account'} • Mode: <span className="font-semibold text-foreground capitalize">{acc.trackingMode.replace('_', ' ')}</span>
                  </p>
                </div>
              </div>

              {/* Balance Summary & Actions */}
              <div className="flex items-center justify-between sm:justify-end gap-5">
                <div className="text-right sm:pr-2">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="font-bold text-sm text-foreground font-mono">{formatCurrency(acc.totalComputedValue)}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Configure Account Settings */}
                  <button
                    onClick={() => onConfigureAccount(acc)}
                    className="p-2 rounded-xl bg-muted/40 hover:bg-muted border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                    title="Account Config"
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  {/* Actions depending on tracking mode */}
                  {acc.trackingMode === 'positions' && (
                    <button
                      onClick={() => onAddHolding(acc.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl border border-primary/20 transition-all active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Stock
                    </button>
                  )}

                  {acc.trackingMode === 'transactions' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onViewTransactions(acc.id)}
                        className="p-2 rounded-xl bg-muted/40 hover:bg-muted border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                        title="View Ledger"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onAddTransaction(acc.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl border border-primary/20 transition-all active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" /> Log Txn
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Account Content */}
            {!isCollapsed && (
              <div className="p-1">
                {acc.trackingMode === 'balance_only' ? (
                  <div className="py-8 text-center bg-muted/5 rounded-xl border border-dashed border-border/30 m-3">
                    <p className="text-xs text-muted-foreground">Holdings tracking is disabled for this account.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 mb-4">You only track the single aggregate balance value.</p>
                    <button
                      onClick={() => onConfigureAccount(acc)}
                      className="px-3 py-1.5 bg-muted border border-border text-xs font-semibold rounded-xl hover:bg-accent hover:text-foreground transition-colors"
                    >
                      Enable Positions or Transactions
                    </button>
                  </div>
                ) : !hasHoldings ? (
                  <div className="py-8 text-center bg-muted/5 rounded-xl border border-dashed border-border/30 m-3">
                    <p className="text-xs text-muted-foreground">No holdings or positions found.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 mb-4">
                      {acc.trackingMode === 'positions' 
                        ? 'Add manual positions (ticker, shares, cost basis) to get started.' 
                        : 'Log buy transactions in the ledger to compute positions.'}
                    </p>
                    {acc.trackingMode === 'positions' ? (
                      <button
                        onClick={() => onAddHolding(acc.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-95 transition-opacity"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add First Stock
                      </button>
                    ) : (
                      <button
                        onClick={() => onAddTransaction(acc.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-95 transition-opacity"
                      >
                        <Plus className="h-3.5 w-3.5" /> Log Buy Transaction
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/30 text-muted-foreground font-semibold">
                          <th className="py-3 px-4">Ticker</th>
                          <th className="py-3 px-3">Shares</th>
                          <th className="py-3 px-3">Cost Basis</th>
                          <th className="py-3 px-3">Current Price</th>
                          <th className="py-3 px-3">Market Value</th>
                          <th className="py-3 px-3">Total Cost</th>
                          <th className="py-3 px-3">Returns</th>
                          <th className="py-3 px-3 text-right">Weight</th>
                          <th className="py-3 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                        {acc.holdings.map((h, hIdx) => {
                          const isCash = h.isVirtualCash;
                          const holdingGain = h.gainLoss >= 0;
                          const holdingId = (h as any).id || `${acc.id}-${h.ticker}`;

                          return (
                            <tr 
                              key={h.ticker} 
                              className={`hover:bg-muted/10 transition-colors group ${
                                isCash ? 'bg-muted/5 font-sans' : ''
                              }`}
                            >
                              {/* Ticker & Name */}
                              <td className="py-3.5 px-4 font-sans">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                                    isCash 
                                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                      : 'bg-primary/10 text-primary border border-primary/20'
                                  }`}>
                                    {isCash ? <Coins className="h-4 w-4" /> : h.ticker.substring(0, 3)}
                                  </div>
                                  <div className="flex flex-col gap-0.5 truncate max-w-[150px]">
                                    <span className="font-bold text-foreground truncate">{h.ticker}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">{h.name}</span>
                                  </div>
                                </div>
                              </td>

                              {/* Shares */}
                              <td className="py-3.5 px-3 font-semibold text-foreground">
                                {isCash ? '-' : h.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </td>

                              {/* Cost Basis */}
                              <td className="py-3.5 px-3 text-muted-foreground">
                                {isCash ? '-' : formatCurrency(h.costBasis)}
                              </td>

                              {/* Current Price */}
                              <td className="py-3.5 px-3 text-muted-foreground">
                                {isCash ? '-' : (
                                  <div>
                                    <p className="text-foreground">{formatCurrency(h.currentPrice)}</p>
                                    {h.dailyChangePercent !== undefined && (
                                      <p className={`text-[9px] font-semibold flex items-center gap-0.5 ${
                                        h.dailyChangePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                      }`}>
                                        {h.dailyChangePercent >= 0 ? '+' : ''}{h.dailyChangePercent.toFixed(2)}%
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Market Value */}
                              <td className="py-3.5 px-3 font-bold text-foreground">
                                {formatCurrency(h.currentValue)}
                              </td>

                              {/* Total Cost */}
                              <td className="py-3.5 px-3 text-muted-foreground">
                                {formatCurrency(h.totalCost)}
                              </td>

                              {/* Returns */}
                              <td className="py-3.5 px-3">
                                {isCash ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <div className="flex flex-col">
                                    <span className={`font-bold ${holdingGain ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {holdingGain ? '+' : ''}{formatCurrency(h.gainLoss)}
                                    </span>
                                    <span className={`text-[9px] font-semibold ${holdingGain ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {holdingGain ? '+' : ''}{h.gainLossPercent.toFixed(2)}%
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Portfolio Weight */}
                              <td className="py-3.5 px-3 text-right text-muted-foreground font-semibold">
                                {h.allocationPercent.toFixed(1)}%
                              </td>

                              {/* Actions */}
                              <td className="py-3.5 px-4 text-center">
                                {isCash ? (
                                  <span className="text-[10px] text-muted-foreground italic flex items-center justify-center gap-1">
                                    Auto Swept <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                                  </span>
                                ) : acc.trackingMode === 'positions' ? (
                                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    <button
                                      onClick={() => onEditHolding(h, acc.id, holdingId)}
                                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                      title="Edit Position"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => onDeleteHolding(holdingId)}
                                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                      title="Delete Position"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground italic font-sans">
                                    Driven by ledger
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
