'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, GitMerge, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

type Transaction = {
  id: string;
  date: string;
  postedDate: string | null;
  description: string;
  payee: string | null;
  memo: string | null;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  notes: string | null;
  reviewed: boolean | null;
  ignored: boolean | null;
  pending: boolean;
  categorizedByAi: boolean;
};

type DuplicateGroup = {
  id: string;
  amount: string;
  accountId: string;
  accountName: string | null;
  transactions: Transaction[];
};

type AccountMeta = {
  id: string;
  name: string;
  tags?: { id: string; name: string; color: string }[];
};

export default function DataCleanup() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedKeeps, setSelectedKeeps] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());

  // Filter States
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [simplefinOnly, setSimplefinOnly] = useState(true);
  const [accountsList, setAccountsList] = useState<AccountMeta[]>([]);

  // Fetch Accounts list
  useEffect(() => {
    fetch('/api/accounts', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccountsList(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch accounts:', err));
  }, []);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (simplefinOnly) params.set('simplefinOnly', 'true');

      const res = await fetch(`/api/data-explorer/duplicates?${params.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setGroups(json.duplicateGroups || []);
        
        // Auto-select the first transaction in each group as default keep
        const defaultKeeps: Record<string, string> = {};
        for (const g of json.duplicateGroups || []) {
          // Prefer posted transaction over pending transaction for keeping
          const bestKeep = g.transactions.find((t: Transaction) => !t.pending) || g.transactions[0];
          if (bestKeep) {
            defaultKeeps[g.id] = bestKeep.id;
          }
        }
        setSelectedKeeps(defaultKeeps);
      }
    } catch (err) {
      console.error('Failed to fetch duplicates:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId, startDate, endDate, simplefinOnly]);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  const handleDismiss = (groupId: string) => {
    setDismissedGroups((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
  };

  const handleMerge = async (group: DuplicateGroup) => {
    const keepId = selectedKeeps[group.id];
    if (!keepId) return;

    setProcessingId(group.id);
    try {
      const keepTx = group.transactions.find((t) => t.id === keepId);
      const deleteTxns = group.transactions.filter((t) => t.id !== keepId);

      if (!keepTx) return;

      // 1. Gather any missing info from other transactions to merge (category, notes, payee)
      let categoryId = keepTx.categoryId;
      let notes = keepTx.notes || '';
      let payee = keepTx.payee || '';

      for (const other of deleteTxns) {
        if (!categoryId && other.categoryId) {
          categoryId = other.categoryId;
        }
        if (other.notes && !notes.includes(other.notes)) {
          notes = notes ? `${notes}\n${other.notes}` : other.notes;
        }
        if (!payee && other.payee) {
          payee = other.payee;
        }
      }

      // 2. Update keep transaction if any values merged
      if (categoryId !== keepTx.categoryId || notes !== (keepTx.notes || '') || payee !== (keepTx.payee || '')) {
        await fetch(`/api/transactions/${keepId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ categoryId, notes, payee }),
        });
      }

      // 3. Soft delete duplicates
      const deleteIds = deleteTxns.map((t) => t.id);
      await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: deleteIds }),
      });

      setSuccessMessage(`Successfully merged duplicates into transaction "${keepTx.payee || keepTx.description}"!`);
      setTimeout(() => setSuccessMessage(null), 4000);

      // Remove group from view
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (err) {
      console.error('Failed to merge duplicates:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const activeGroups = groups.filter((g) => !dismissedGroups.has(g.id));

  const handleMergeAll = async () => {
    if (activeGroups.length === 0) return;
    if (!confirm(`Are you sure you want to merge all ${activeGroups.length} duplicate groups?`)) return;

    setProcessingId('all');
    let successCount = 0;

    try {
      for (const group of activeGroups) {
        const keepId = selectedKeeps[group.id];
        if (!keepId) continue;

        const keepTx = group.transactions.find((t) => t.id === keepId);
        const deleteTxns = group.transactions.filter((t) => t.id !== keepId);
        if (!keepTx) continue;

        // 1. Gather missing info
        let categoryId = keepTx.categoryId;
        let notes = keepTx.notes || '';
        let payee = keepTx.payee || '';

        for (const other of deleteTxns) {
          if (!categoryId && other.categoryId) {
            categoryId = other.categoryId;
          }
          if (other.notes && !notes.includes(other.notes)) {
            notes = notes ? `${notes}\n${other.notes}` : other.notes;
          }
          if (!payee && other.payee) {
            payee = other.payee;
          }
        }

        // 2. Update keep
        if (categoryId !== keepTx.categoryId || notes !== (keepTx.notes || '') || payee !== (keepTx.payee || '')) {
          await fetch(`/api/transactions/${keepId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ categoryId, notes, payee }),
          });
        }

        // 3. Soft delete duplicates
        const deleteIds = deleteTxns.map((t) => t.id);
        await fetch('/api/transactions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ids: deleteIds }),
        });

        successCount++;
      }

      setSuccessMessage(`Successfully merged ${successCount} duplicate groups!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      
      // Clear all merged groups from state
      const mergedIds = new Set(activeGroups.map((g) => g.id));
      setGroups((prev) => prev.filter((g) => !mergedIds.has(g.id)));
    } catch (err) {
      console.error('Failed to merge all duplicates:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteIndividual = async (groupId: string, txId: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    setProcessingId(groupId);
    try {
      await fetch(`/api/transactions/${txId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setSuccessMessage('Transaction deleted successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);

      // Update local state to remove just this transaction
      setGroups((prev) =>
        prev
          .map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              transactions: g.transactions.filter((t) => t.id !== txId),
            };
          })
          .filter((g) => g.transactions.length >= 2) // Remove group if fewer than 2 transactions remain
      );
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-500 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Duplicate Detection</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Identify and resolve potential duplicate transactions from bank sync issues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeGroups.length > 0 && (
            <button
              onClick={handleMergeAll}
              disabled={loading || processingId !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 border border-primary rounded-lg transition-colors disabled:opacity-50"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge All ({activeGroups.length})
            </button>
          )}
          <button
            onClick={fetchDuplicates}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Scan Data
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-card border border-border rounded-xl flex flex-wrap items-end gap-4 shadow-sm">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          >
            <option value="">All Accounts</option>
            {accountsList.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 min-w-[150px]">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          />
        </div>

        <div className="space-y-1.5 min-w-[150px]">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-2 h-9">
          <input
            type="checkbox"
            id="filter-simplefin-only"
            checked={simplefinOnly}
            onChange={(e) => setSimplefinOnly(e.target.checked)}
            className="rounded border-border text-primary focus:ring-ring cursor-pointer h-4 w-4"
          />
          <label htmlFor="filter-simplefin-only" className="text-xs font-semibold text-muted-foreground cursor-pointer select-none">
            SimpleFIN Only
          </label>
        </div>

        {(accountId || startDate || endDate || simplefinOnly) && (
          <button
            onClick={() => {
              setAccountId('');
              setStartDate('');
              setEndDate('');
              setSimplefinOnly(false);
            }}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            Reset Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center border border-dashed border-border rounded-xl">
          <RefreshCw className="h-8 w-8 text-primary/70 animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Scanning database for duplicate transactions...</p>
        </div>
      ) : activeGroups.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-xl">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <h3 className="font-bold text-base text-foreground">All Clean!</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            No duplicate transactions were found matching your current filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-xs font-medium">
              Found {activeGroups.length} potential duplicate group{activeGroups.length !== 1 ? 's' : ''}. Select the correct transaction to keep in each group, and click Merge.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {activeGroups.map((group) => {
              const keepId = selectedKeeps[group.id];
              const isProcessing = processingId === group.id || processingId === 'all';

              return (
                <div
                  key={group.id}
                  className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 text-xs font-semibold text-amber-500 bg-amber-500/10 rounded-full">
                        Duplicate Group
                      </span>
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5 min-w-0">
                        <span>{group.accountName || 'Unknown Account'}</span>
                        {(() => {
                          const account = accountsList.find((a) => a.id === group.accountId);
                          return account?.tags && account.tags.length > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {account.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                  title={tag.name}
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-foreground">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                        Math.abs(parseFloat(group.amount) || 0)
                      )}
                    </div>
                  </div>

                  {/* Card Body - Transactions list */}
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {group.transactions.map((tx) => {
                        const isKeep = keepId === tx.id;
                        return (
                          <div
                            key={tx.id}
                            onClick={() => setSelectedKeeps((prev) => ({ ...prev, [group.id]: tx.id }))}
                            className={`p-3.5 border rounded-xl cursor-pointer transition-all flex flex-col justify-between relative ${
                              isKeep
                                ? 'border-primary bg-primary/[0.02] shadow-sm'
                                : 'border-border hover:border-foreground/30 bg-background/50'
                            }`}
                          >
                            {/* Keep Indicator */}
                            <div className="absolute top-3.5 right-3.5">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                                  isKeep ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/35'
                                }`}
                              >
                                {isKeep && <div className="w-1.5 h-1.5 bg-background rounded-full" />}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {/* Date & Pending Tag */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {new Date(tx.date).toLocaleDateString()}
                                </span>
                                {tx.pending && (
                                  <span className="inline-flex items-center text-chart-3" title="Pending">
                                    <svg className="h-1.5 w-1.5 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
                                      <circle cx="4" cy="4" r="3" />
                                    </svg>
                                    <span className="text-[10px] ml-1 font-medium">Pending</span>
                                  </span>
                                )}
                              </div>

                              {/* Payee / Desc */}
                              <div className="text-sm font-semibold text-foreground pr-6 truncate">
                                {tx.payee || tx.description}
                              </div>

                              {/* Category */}
                              <div>
                                {tx.categoryName ? (
                                  <span
                                    className="px-2 py-0.5 text-[10px] rounded-full font-medium inline-flex items-center gap-1"
                                    style={{
                                      backgroundColor: `${tx.categoryColor}22`,
                                      color: tx.categoryColor || 'var(--color-primary)',
                                    }}
                                  >
                                    {tx.categoryName}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                                    Uncategorized
                                  </span>
                                )}
                              </div>

                              {/* Notes & Memo */}
                              {(tx.memo || tx.notes) && (
                                <div className="text-[11px] text-muted-foreground bg-muted/20 border border-border/40 rounded-lg p-2 mt-1.5 space-y-1">
                                  {tx.memo && (
                                    <div>
                                      <span className="font-semibold uppercase text-[8px] tracking-wider text-muted-foreground mr-1">
                                        Memo:
                                      </span>
                                      {tx.memo}
                                    </div>
                                  )}
                                  {tx.notes && (
                                    <div>
                                      <span className="font-semibold uppercase text-[8px] tracking-wider text-muted-foreground mr-1">
                                        Notes:
                                      </span>
                                      {tx.notes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Individual Delete Action */}
                            <div className="flex justify-end pt-3 mt-3 border-t border-border/40">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteIndividual(group.id, tx.id);
                                }}
                                disabled={isProcessing}
                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                                title="Delete this record"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Footer actions */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/10 border-t border-border">
                    <button
                      onClick={() => handleDismiss(group.id)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                    >
                      Not duplicates (Dismiss)
                    </button>
                    <button
                      onClick={() => handleMerge(group)}
                      disabled={isProcessing || !keepId}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg shadow-sm transition-opacity disabled:opacity-50"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      {isProcessing ? 'Merging...' : 'Merge & Keep Selected'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
