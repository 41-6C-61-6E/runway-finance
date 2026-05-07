'use client';

import { useState, useEffect, useCallback } from 'react';
import AccountDetailDrawer from './AccountDetailDrawer';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
};

export default function AccountList({ initialAccounts }: { initialAccounts: Account[] }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleToggleHidden = useCallback(
    (accountId: string, field: 'isHidden' | 'isExcludedFromNetWorth') => async (e: React.MouseEvent) => {
      e.stopPropagation();
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: !account[field] }),
      });

      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, [field]: !a[field] } : a))
      );
    },
    [accounts]
  );

  const handleOpenDrawer = useCallback((account: Account) => {
    setSelectedAccount(account);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedAccount(null);
  }, []);

  const handleDrawerSuccess = useCallback(() => {
    setDrawerOpen(false);
    setSelectedAccount(null);
    window.location.reload();
  }, []);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  // Group by institution
  const grouped = accounts.reduce<Record<string, Account[]>>((acc, account) => {
    const inst = account.institution || 'Unknown Institution';
    if (!acc[inst]) acc[inst] = [];
    acc[inst].push(account);
    return acc;
  }, {});

  const formatBalance = (balance: string, currency: string) => {
    const num = parseFloat(balance);
    const isPositive = num >= 0;
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
      color: isPositive ? 'text-emerald-400' : 'text-red-400',
    };
  };

  const typeBadge: Record<string, string> = {
    checking: 'bg-blue-500/20 text-blue-400',
    savings: 'bg-green-500/20 text-green-400',
    credit: 'bg-purple-500/20 text-purple-400',
    investment: 'bg-amber-500/20 text-amber-400',
    loan: 'bg-orange-500/20 text-orange-400',
    other: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.5) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 70%, rgba(168, 85, 247, 0.4) 0%, transparent 70%),
            radial-gradient(ellipse at 60% 20%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 40% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 65%)
          `,
        }}
      />

      <div className="relative z-10 ml-64 mt-20 px-6 lg:px-12 max-w-6xl">
        <h1 className="text-4xl font-bold mb-8">
          <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
            Accounts
          </span>
        </h1>

        {accounts.length === 0 ? (
          <div className="p-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-center">
            <p className="text-gray-400 text-lg mb-4">No accounts linked yet.</p>
            <a
              href="/settings"
              className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              Connect a Financial Institution
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([institution, instAccounts]) => (
              <div key={institution} className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-300 px-1">{institution}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {instAccounts.map((account) => {
                    const { text, color } = formatBalance(account.balance, account.currency);
                    return (
                      <div
                        key={account.id}
                        onClick={() => handleOpenDrawer(account)}
                        className="p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 hover:border-white/20 cursor-pointer transition-all group relative"
                      >
                        {/* Hover toggles */}
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={handleToggleHidden(account.id, 'isHidden')}
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                            title={account.isHidden ? 'Show account' : 'Hide account'}
                          >
                            {account.isHidden ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path d="M13.875 18.825A10.079 10.079 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={handleToggleHidden(account.id, 'isExcludedFromNetWorth')}
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                            title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${typeBadge[account.type] || typeBadge.other}`}>
                            {account.type}
                          </span>
                          {account.isHidden && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400">Hidden</span>
                          )}
                        </div>
                        <div className="text-white font-medium text-lg">{account.name}</div>
                        <div className={`font-mono text-xl mt-1 ${color}`}>{text}</div>
                        <div className="text-xs text-gray-500 mt-1">{account.currency}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAccount && (
        <AccountDetailDrawer
          account={selectedAccount}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          onSuccess={handleDrawerSuccess}
        />
      )}
    </div>
  );
}
