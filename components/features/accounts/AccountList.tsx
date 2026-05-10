'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

// ── Type hierarchy mapping ──────────────────────────────────────────────
const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string; icon: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  savings:    { group: 'Banking',       subGroup: 'Savings',          icon: '🏦' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards',     icon: '💳' },
  investment: { group: 'Investments',   subGroup: 'Brokerage',        icon: '📈' },
  brokerage:  { group: 'Investments',   subGroup: 'Brokerage',        icon: '📈' },
  retirement: { group: 'Investments',   subGroup: 'Retirement',       icon: '📈' },
  otherAsset: { group: 'Investments',   subGroup: 'Other Assets',     icon: '📈' },
  hsa:        { group: 'Health',        subGroup: 'Health Accounts',  icon: '🏥' },
  health:     { group: 'Health',        subGroup: 'Health Accounts',  icon: '🏥' },
  loan:       { group: 'Loans',         subGroup: 'Loans',            icon: '📋' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages',        icon: '📋' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities',    icon: '⚠️' },
};

const GROUP_ORDER = ['Banking', 'Credit', 'Savings', 'Investments', 'Health', 'Loans', 'Liabilities'];

function getHierarchy(accountType: string) {
  return TYPE_HIERARCHY[accountType] ?? { group: 'Other', subGroup: 'Other', icon: '📁' };
}

// ── Helpers ─────────────────────────────────────────────────────────────
const formatCurrency = (balance: string, currency: string) => {
  const num = parseFloat(balance);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
      color: 'text-gray-400',
      sign: '',
    };
  };


// ── Account Row (single account line) ────────────────────────────────────
function AccountRow({
  account,
  onToggleHidden,
  onOpenDrawer,
}: {
  account: Account;
  onToggleHidden: (accountId: string, field: 'isHidden' | 'isExcludedFromNetWorth') => (e: React.MouseEvent) => void;
  onOpenDrawer: (account: Account) => void;
}) {
  const fmt = formatCurrency(account.balance, account.currency);

  return (
    <div
      className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group/account"
      onClick={() => onOpenDrawer(account)}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
        <span className="text-sm text-gray-200 truncate">{account.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1 opacity-0 group-hover/account:opacity-100 transition-opacity">
          <button
            onClick={onToggleHidden(account.id, 'isHidden')}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title={account.isHidden ? 'Show account' : 'Hide account'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {account.isHidden ? (
                <path d="M13.875 18.825A10.05 10.05 0 1012 19c-1.048 0-2.044-.147-2.998-.414M6 12l6 6m0 0l6-6m-6 6V7" />
              ) : (
                <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              )}
            </svg>
          </button>
          <button
            onClick={onToggleHidden(account.id, 'isExcludedFromNetWorth')}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {account.isExcludedFromNetWorth ? (
                <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              ) : (
                <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              )}
            </svg>
          </button>
        </div>
        <span className={`font-mono text-sm font-semibold tabular-nums ${fmt.color} financial-value`}>
          {fmt.sign}{fmt.text}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────
export default function AccountList({ initialAccounts, showHidden = false }: { initialAccounts: Account[]; showHidden?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  // Filter out hidden/excluded accounts unless showHidden is true
  const visibleAccounts = showHidden
    ? accounts
    : accounts.filter((a) => !a.isHidden && !a.isExcludedFromNetWorth);

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

  // Toggle group expansion
  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  // Toggle sub-group expansion
  const toggleSubGroup = useCallback((group: string, subGroup: string) => {
    const key = `${group}::${subGroup}`;
    setExpandedSubGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

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

  // ── Hierarchical grouping ─────────────────────────────────────────────
  const hierarchy = useMemo(() => {
    const map = new Map<string, Map<string, Account[]>>();

    for (const acc of visibleAccounts) {
      const { group, subGroup } = getHierarchy(acc.type);
      if (!map.has(group)) map.set(group, new Map());
      const subMap = map.get(group)!;
      if (!subMap.has(subGroup)) subMap.set(subGroup, []);
      subMap.get(subGroup)!.push(acc);
    }

    return map;
  }, [visibleAccounts]);

  // Total net worth
  const totalNetWorth = useMemo(() => {
    return visibleAccounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  }, [visibleAccounts]);

  // Group totals
  const getGroupTotal = useCallback(
    (group: string) => {
      const subMap = hierarchy.get(group);
      if (!subMap) return 0;
      let total = 0;
      for (const accs of subMap.values()) {
        for (const a of accs) total += parseFloat(a.balance);
      }
      return total;
    },
    [hierarchy]
  );

  // Sub-group totals
  const getSubGroupTotal = useCallback(
    (group: string, subGroup: string) => {
      const accs = hierarchy.get(group)?.get(subGroup);
      if (!accs) return 0;
      return accs.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    },
    [hierarchy]
  );

  const isGroupExpanded = (group: string) => expandedGroups[group] ?? true;
  const isSubGroupExpanded = (group: string, subGroup: string) =>
    expandedSubGroups[`${group}::${subGroup}`] ?? true;

  // Sort groups by defined order, then alphabetically
  const sortedGroups = Array.from(hierarchy.keys()).sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // ── Empty state ───────────────────────────────────────────────────────
  if (accounts.length === 0) {
    return (
      <div className="p-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-center">
        <p className="text-gray-400 text-lg mb-4">No accounts linked yet.</p>
        <a
          href="/settings"
          className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
        >
          Connect a Financial Institution
        </a>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Total Net Worth Header */}
      <div className="mb-8">
        <div className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Total Net Worth</div>
        <div className="font-mono text-4xl font-bold text-gray-400">
          {formatCurrency(String(totalNetWorth), 'USD').text}
        </div>
      </div>

      {/* Hierarchical Groups */}
      <div className="space-y-2">
        {sortedGroups.map((group) => {
          const groupTotal = getGroupTotal(group);
          const subGroups = Array.from(hierarchy.get(group)?.entries() || []);
          const expanded = isGroupExpanded(group);

          return (
            <div key={group} className="rounded-xl overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-gray-300 font-semibold">{group}</span>
                </div>
                <div className="font-mono text-lg font-semibold text-gray-400">
                  {formatCurrency(String(groupTotal), 'USD').text}
                </div>
              </button>

              {/* Sub-groups / Accounts */}
              {expanded && (
                <div className="px-4 pb-2 space-y-1">
                  {subGroups.map(([subGroup, accs]) => {
                    const subTotal = getSubGroupTotal(group, subGroup);

                    // If sub-group has multiple accounts, show it as a collapsible header
                    if (accs.length > 1) {
                      const subExpanded = isSubGroupExpanded(group, subGroup);
                      return (
                        <div key={subGroup} className="ml-3">
                          <button
                            onClick={() => toggleSubGroup(group, subGroup)}
                            className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 group/sub"
                          >
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-3 h-3 text-gray-500 transition-transform ${subExpanded ? 'rotate-0' : '-rotate-90'}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path d="M19 9l-7 7-7-7" />
                              </svg>
                              <span className="text-gray-400 text-sm font-medium">{subGroup}</span>
                              <span className="text-gray-600 text-xs">({accs.length})</span>
                            </div>
                            <div className="font-mono text-sm font-semibold tabular-nums text-gray-400">
                              {formatCurrency(String(subTotal), 'USD').text}
                            </div>
                          </button>
                          {subExpanded && (
                            <div className="ml-5 space-y-0">
                              {accs.map((acc) => (
                                <AccountRow
                                  key={acc.id}
                                  account={acc}
                                  onToggleHidden={handleToggleHidden}
                                  onOpenDrawer={handleOpenDrawer}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Single account — render inline
                    return (
                      <AccountRow
                        key={accs[0].id}
                        account={accs[0]}
                        onToggleHidden={handleToggleHidden}
                        onOpenDrawer={handleOpenDrawer}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Drawer */}
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
