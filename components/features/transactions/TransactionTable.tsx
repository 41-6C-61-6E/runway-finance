'use client';

import { useState, useEffect, useCallback } from 'react';

type Transaction = {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amount: string;
  pending: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  reviewed: boolean | null;
};

interface TransactionTableProps {
  filters: Record<string, string | null>;
  onSelectAll: (ids: string[]) => void;
}

export default function TransactionTable({ filters, onSelectAll }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const res = await fetch(`/api/transactions?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      setTransactions(data.data || []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    onSelectAll(Array.from(selectedIds));
  }, [selectedIds, onSelectAll]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === transactions.length && transactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }, [selectedIds, transactions]);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    const isPositive = num >= 0;
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
      color: isPositive ? 'text-emerald-400' : 'text-red-400',
    };
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-gray-400 text-lg mb-4">No transactions found.</p>
          <a
            href="/settings"
            className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
          >
            Connect a Financial Institution
          </a>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === transactions.length && transactions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Description</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium hidden lg:table-cell">Account</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Category</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium">Amount</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const { text, color } = formatAmount(tx.amount);
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${
                        tx.pending ? 'text-gray-400 italic' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-white max-w-xs truncate">
                        {tx.payee || tx.description}
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{tx.accountName || '—'}</td>
                      <td className="px-4 py-3">
                        {tx.categoryName ? (
                          <span
                            className="px-2 py-0.5 text-xs rounded-full font-medium"
                            style={{
                              backgroundColor: `${tx.categoryColor}33`,
                              color: tx.categoryColor || '#6366f1',
                            }}
                          >
                            {tx.categoryName}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">Uncategorized</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${color}`}>{text}</td>
                      <td className="px-4 py-3 text-center">
                        {tx.pending ? (
                          <span className="text-xs text-amber-400">⏳</span>
                        ) : tx.reviewed ? (
                          <span className="text-xs text-emerald-400">✓</span>
                        ) : (
                          <span className="text-xs text-gray-500">○</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <span className="text-sm text-gray-400">
                {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
