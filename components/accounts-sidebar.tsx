'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, EyeOff, Ban, Plus } from 'lucide-react';
import { useSidebar, ACCOUNTS_MIN_WIDTH, ACCOUNTS_MAX_WIDTH, COLLAPSED_WIDTH } from '@/components/sidebar-context';
import AccountDetailDrawer from '@/components/features/accounts/AccountDetailDrawer';

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

// ── Type hierarchy mapping ──
const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string; icon: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  savings:    { group: 'Banking',       subGroup: 'Savings',          icon: '🏦' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards',     icon: '💳' },
  investment: { group: 'Investments',   subGroup: 'Brokerage',        icon: '📈' },
  brokerage:  { group: 'Investments',   subGroup: 'Brokerage',        icon: '📈' },
  retirement: { group: 'Investments',   subGroup: 'Retirement',       icon: '📈' },
  529:        { group: 'Investments',   subGroup: '529 Account',      icon: '📈' },
  otherAsset: { group: 'Investments',   subGroup: 'Other Assets',     icon: '📈' },
  vehicle:    { group: 'Assets',        subGroup: 'Vehicles',         icon: '🚗' },
  crypto:     { group: 'Assets',        subGroup: 'Crypto Currency',  icon: '🚗' },
  metals:     { group: 'Assets',        subGroup: 'Metals',           icon: '🚗' },
  realestate: { group: 'Assets',        subGroup: 'Real Estate',      icon: '🚗' },
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

// ── Helpers ──
const formatCurrency = (balance: string, currency: string) => {
  const num = parseFloat(balance);
  const isPositive = num >= 0;
  return {
    text: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(num)),
    color: isPositive ? 'text-emerald-400' : 'text-grey-300',
    sign: isPositive ? '' : '-',
  };
};

// ── Account Row ──
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
      className="flex items-center justify-between py-1 pl-8 pr-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors group/account"
      onClick={() => onOpenDrawer(account)}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" />
        <span className="text-sm text-gray-300 truncate">{account.name}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-0.5 opacity-0 group-hover/account:opacity-100 transition-opacity">
          <button
            onClick={onToggleHidden(account.id, 'isHidden')}
            className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title={account.isHidden ? 'Show account' : 'Hide account'}
          >
            {account.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <button
            onClick={onToggleHidden(account.id, 'isExcludedFromNetWorth')}
            className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
          >
            {account.isExcludedFromNetWorth ? <Ban className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
        <span className={`font-mono text-sm font-semibold tabular-nums ${fmt.color}`}>
          {fmt.sign}{fmt.text}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function AccountsSidebar() {
  const [isResizing, setIsResizing] = useState(false);
  const { sidebarWidth, accountsWidth, setAccountsWidth } = useSidebar();
  const startXRef = useRef(0);
  const startWidthRef = useRef(accountsWidth);

  const { data: accounts = [], refetch } = useQuery({
    queryKey: ['accounts', false],
    queryFn: async () => {
      const res = await fetch(`/api/accounts?includeHidden=false`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

  // Filter out hidden/excluded accounts
  const visibleAccounts = accounts.filter((a) => !a.isHidden && !a.isExcludedFromNetWorth);

  // Hierarchical grouping
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

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

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

      refetch();
    },
    [accounts, refetch]
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
    refetch();
  }, [refetch]);

  // Sort groups by defined order, then alphabetically
  const sortedGroups = Array.from(hierarchy.keys()).sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = accountsWidth;
  }, [accountsWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = Math.min(ACCOUNTS_MAX_WIDTH, Math.max(ACCOUNTS_MIN_WIDTH, startWidthRef.current + delta));
    setAccountsWidth(newWidth);
  }, [isResizing, setAccountsWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const fmt = formatCurrency(String(totalNetWorth), 'USD');

  // Empty state
  if (accounts.length === 0) {
    return (
      <>
        <aside 
          className="fixed top-0 h-screen bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col p-3 flex-shrink-0 overflow-hidden transition-all duration-200 z-10"
          style={{ left: `${COLLAPSED_WIDTH}px`, width: `${accountsWidth}px` }}
        >
          <div className="text-sm text-gray-500 text-center py-8">No accounts</div>
        </aside>
        <div
          className="fixed top-0 z-30 cursor-col-resize"
          style={{
            left: `${sidebarWidth + accountsWidth}px`,
            width: '6px',
            height: '100vh',
            marginLeft: '-3px',
            background: isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
          }}
          onMouseDown={handleResizeDown}
        >
          <div className="w-1 h-full mx-auto bg-white/10 hover:bg-blue-500/50 transition-colors" />
        </div>
      </>
    );
  }

  return (
    <>
      <aside 
        className="fixed top-0 h-screen bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 z-10"
        style={{ left: `${COLLAPSED_WIDTH}px`, width: `${accountsWidth}px` }}
      >
        {/* Net Worth Header */}
        <div className="p-3 border-b border-white/5">
          <div className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Net Worth</div>
          <div className={`font-mono text-lg font-bold truncate ${fmt.color}`}>
            {fmt.text}
          </div>
        </div>

        {/* Hierarchical Account List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {sortedGroups.map((group) => {
              const subMap = hierarchy.get(group)!;
              const groupTotal = getGroupTotal(group);
              const groupFmt = formatCurrency(String(groupTotal), 'USD');
              const groupExpanded = isGroupExpanded(group);

              return (
                <div key={group}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/5 transition-colors text-left"
                  >
                    {groupExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex-1 truncate">
                      {group}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${groupFmt.color}`}>
                      {groupFmt.sign}{groupFmt.text}
                    </span>
                  </button>

                  {/* Sub-groups */}
                  {groupExpanded && Array.from(subMap.entries()).map(([subGroup, accs]) => {
                    const subGroupTotal = getSubGroupTotal(group, subGroup);
                    const subGroupFmt = formatCurrency(String(subGroupTotal), 'USD');
                    const subGroupExpanded = isSubGroupExpanded(group, subGroup);
                    const subGroupIcon = accs[0] ? getHierarchy(accs[0].type).icon : '📁';

                    return (
                      <div key={`${group}::${subGroup}`}>
                        <button
                          onClick={() => toggleSubGroup(group, subGroup)}
                          className="w-full flex items-center gap-1.5 px-3 py-0.5 rounded-md hover:bg-white/5 transition-colors text-left"
                        >
                          {subGroupExpanded ? (
                            <ChevronDown className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                          )}
                          <span className="text-sm text-gray-500 flex-1 truncate">{subGroup}</span>
                          <span className={`font-mono text-sm ${subGroupFmt.color}`}>
                            {subGroupFmt.sign}{subGroupFmt.text}
                          </span>
                        </button>

                        {/* Accounts */}
                        {subGroupExpanded && accs.map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            onToggleHidden={handleToggleHidden}
                            onOpenDrawer={handleOpenDrawer}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Resize Handle */}
      <div
        className="fixed top-0 z-30 cursor-col-resize"
        style={{
          left: `${COLLAPSED_WIDTH + accountsWidth}px`,
          width: '6px',
          height: '100vh',
          marginLeft: '-3px',
          background: isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
        }}
        onMouseDown={handleResizeDown}
      >
        <div className="w-1 h-full mx-auto bg-white/10 hover:bg-blue-500/50 transition-colors" />
      </div>

      {/* Account Detail Drawer */}
      {selectedAccount && (
        <AccountDetailDrawer
          account={selectedAccount}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          onSuccess={handleDrawerSuccess}
        />
      )}
    </>
  );
}
