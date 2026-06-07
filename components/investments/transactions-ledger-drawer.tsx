'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Trash2, Edit3, Loader2, ArrowUpRight, ArrowDownLeft, Receipt, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { InvestmentAccountDetails } from '@/lib/services/investments';

export interface Transaction {
  id: string;
  accountId: string;
  ticker: string;
  type: 'buy' | 'sell' | 'dividend' | 'split';
  shares: string;
  pricePerShare: string;
  commission: string;
  transactionDate: string;
  notes: string | null;
}

interface TransactionsLedgerDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account: InvestmentAccountDetails | null;
  onEditTransaction?: (transaction: Transaction) => void;
}

export function TransactionsLedgerDrawer({
  open,
  onClose,
  onSuccess,
  account,
  onEditTransaction,
}: TransactionsLedgerDrawerProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTransactions = async () => {
    if (!account) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/investments/transactions?accountId=${account.id}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load transactions');
      }
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred fetching ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && account) {
      fetchTransactions();
    }
  }, [open, account]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction? This will recalculate your stock positions.')) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/investments/transactions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete transaction');
      }

      // Refresh local list
      await fetchTransactions();
      // Notify parent to refresh the main holdings table
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred while deleting transaction');
    } finally {
      setDeletingId(null);
    }
  };

  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px] max-w-[95vw] overflow-y-auto bg-card/95 backdrop-blur-lg border-l border-border/40 flex flex-col h-full p-0">
        <SheetHeader className="p-6 pb-4 border-b border-border/20 flex-shrink-0">
          <SheetTitle className="text-lg font-bold text-foreground">Transaction History</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Ledger for account <span className="font-semibold text-foreground">{account.name}</span>
          </p>
        </SheetHeader>

        {/* Ledger Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center">
              {error}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/40 rounded-xl bg-muted/10">
              <p className="text-xs text-muted-foreground">No transactions logged in this ledger yet.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Click &quot;Log Txn&quot; in the holdings table to add buys or sells.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((txn) => {
                const sharesNum = parseFloat(txn.shares);
                const priceNum = parseFloat(txn.pricePerShare);
                const commissionNum = parseFloat(txn.commission || '0');
                const totalAmount = sharesNum * priceNum + (txn.type === 'buy' ? commissionNum : -commissionNum);
                
                const isBuy = txn.type === 'buy';
                const isSell = txn.type === 'sell';
                const isDiv = txn.type === 'dividend';
                const isSplit = txn.type === 'split';

                return (
                  <div
                    key={txn.id}
                    className="p-4 rounded-xl bg-card border border-border/40 hover:border-primary/20 transition-all flex items-start justify-between gap-4 group"
                  >
                    {/* Icon and metadata */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-xl flex-shrink-0 ${
                        isBuy ? 'bg-emerald-500/10 text-emerald-500' :
                        isSell ? 'bg-rose-500/10 text-rose-500' :
                        isDiv ? 'bg-violet-500/10 text-violet-500' :
                        'bg-sky-500/10 text-sky-500'
                      }`}>
                        {isBuy && <ArrowDownLeft className="h-4 w-4" />}
                        {isSell && <ArrowUpRight className="h-4 w-4" />}
                        {isDiv && <Receipt className="h-4 w-4" />}
                        {isSplit && <RefreshCw className="h-4 w-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                            {isBuy && 'Bought'}
                            {isSell && 'Sold'}
                            {isDiv && 'Dividend'}
                            {isSplit && 'Split'}
                          </span>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                            {txn.ticker}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">
                          {new Date(txn.transactionDate).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </p>
                        {txn.notes && (
                          <p className="text-[10px] text-muted-foreground mt-2 italic bg-muted/20 px-2 py-1 rounded">
                            {txn.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cost and Actions */}
                    <div className="flex flex-col items-end gap-2 text-right flex-shrink-0">
                      <div className="font-mono text-xs">
                        {isSplit ? (
                          <span className="font-bold text-foreground">{sharesNum}:1 Split</span>
                        ) : (
                          <>
                            <span className="font-bold text-foreground">
                              {sharesNum.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                            </span>
                            <span className="text-muted-foreground text-[10px] block">
                              @ {formatCurrency(priceNum)}
                            </span>
                            {commissionNum > 0 && (
                              <span className="text-muted-foreground text-[9px] block">
                                (Comm: {formatCurrency(commissionNum)})
                              </span>
                            )}
                            <span className={`text-[10px] font-bold mt-0.5 block ${
                              isBuy || isDiv ? 'text-emerald-500' : 'text-rose-500'
                            }`}>
                              {isBuy || isDiv ? '-' : '+'}{formatCurrency(totalAmount)}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5">
                        {onEditTransaction && (
                          <button
                            onClick={() => onEditTransaction(txn)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Edit transaction"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(txn.id)}
                          disabled={deletingId === txn.id}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete transaction"
                        >
                          {deletingId === txn.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Close */}
        <div className="p-6 border-t border-border/20 flex-shrink-0 flex justify-end">
          <SheetClose asChild>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
            >
              Close Ledger
            </button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
