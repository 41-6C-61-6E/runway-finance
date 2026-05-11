'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronLeft, Eye, EyeOff, Ban, Plus } from 'lucide-react';
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

const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking' },
  savings:    { group: 'Banking',       subGroup: 'Savings' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards' },
  investment: { group: 'Investments',   subGroup: 'Brokerage' },
  brokerage:  { group: 'Investments',   subGroup: 'Brokerage' },
  retirement: { group: 'Investments',   subGroup: 'Retirement' },
  529:        { group: 'Investments',   subGroup: '529 Account' },
  otherAsset: { group: 'Assets',        subGroup: 'Other Assets' },
  vehicle:    { group: 'Assets',        subGroup: 'Vehicles' },
  crypto:     { group: 'Assets',        subGroup: 'Crypto Currency' },
  metals:     { group: 'Assets',        subGroup: 'Metals' },
  realestate: { group: 'Assets',        subGroup: 'Real Estate' },
  hsa:        { group: 'Health',        subGroup: 'Health Accounts' },
  health:     { group: 'Health',        subGroup: 'Health Accounts' },
  loan:       { group: 'Loans',         subGroup: 'Loans' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities' },
};

const GROUP_ORDER = ['Banking', 'Credit', 'Savings', 'Investments', 'Health', 'Loans', 'Liabilities', 'Assets'];

function getHierarchy(accountType: string) {
  return TYPE_HIERARCHY[accountType] ?? { group: 'Other', subGroup: 'Other' };
}

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
    sign: isPositive ? '' : '-',
  };
};

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
      className="flex items-center justify-between py-0.5 pl-7 pr-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group/account"
      onClick={() => onOpenDrawer(account)}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-1 h-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
        <span className="text-sm text-muted-foreground truncate">{account.name}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-0.5 opacity-0 group-hover/account:opacity-100 transition-opacity">
          <button
            onClick={onToggleHidden(account.id, 'isHidden')}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
            title={account.isHidden ? 'Show account' : 'Hide account'}
          >
            {account.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <button
            onClick={onToggleHidden(account.id, 'isExcludedFromNetWorth')}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
            title={account.isExcludedFromNetWorth ? 'Include in net worth' : 'Exclude from net worth'}
          >
            {account.isExcludedFromNetWorth ? <Ban className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
        <span className={`font-mono text-xs font-semibold tabular-nums blur-number text-muted-foreground`}>
          {fmt.sign}{fmt.text}
        </span>
      </div>
    </div>
  );
}

export default function AccountsSidebar() {
  const [isResizing, setIsResizing] = useState(false);
  const { sidebarWidth, accountsWidth, setAccountsWidth, accountsCollapsed, toggleAccountsCollapsed } = useSidebar();
  const navCollapsedWidth = 64;
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

  const visibleAccounts = accounts.filter((a) => !a.isHidden && !a.isExcludedFromNetWorth);

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

  const totalNetWorth = useMemo(() => {
    return visibleAccounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  }, [visibleAccounts]);

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

  if (accountsCollapsed) {
    return (
      <button
        onClick={toggleAccountsCollapsed}
        className="fixed top-0 z-40 flex items-center justify-center w-6 h-10 mt-3 bg-card border border-border rounded-r-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
        style={{ left: `${sidebarWidth}px` }}
        title="Expand accounts sidebar"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        <aside 
          className="fixed top-0 h-screen bg-card border-r border-border flex flex-col p-3 flex-shrink-0 overflow-hidden transition-all duration-200 z-10"
          style={{ left: `${navCollapsedWidth}px`, width: `${accountsWidth}px` }}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground text-center py-8">No accounts</div>
            <button
              onClick={toggleAccountsCollapsed}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse accounts sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </aside>
        <div
          className="fixed top-0 z-30 cursor-col-resize"
          style={{
            left: `${navCollapsedWidth + accountsWidth}px`,
            width: '6px',
            height: '100vh',
            marginLeft: '-3px',
            background: isResizing ? 'var(--color-ring)' : 'transparent',
          }}
          onMouseDown={handleResizeDown}
        >
          <div className="w-1 h-full mx-auto bg-border hover:bg-ring/50 transition-colors" />
        </div>
      </>
    );
  }

  return (
    <>
      <aside 
        className="fixed top-0 h-screen bg-card border-r border-border flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 z-10"
        style={{ left: `${navCollapsedWidth}px`, width: `${accountsWidth}px` }}
      >
        {/* Net Worth Header */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Worth</div>
            <button
              onClick={toggleAccountsCollapsed}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse accounts sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className={`font-mono text-base font-bold truncate blur-number text-foreground`}>
            {fmt.text}
          </div>
        </div>

        {/* Hierarchical Account List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-1.5 space-y-0.5">
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
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors text-left"
                  >
                    {groupExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1 truncate">
                      {group}
                    </span>
                    <span className={`font-mono text-xs font-semibold blur-number text-muted-foreground`}>
                      {groupFmt.sign}{groupFmt.text}
                    </span>
                  </button>

                  {/* Sub-groups */}
                  {groupExpanded && Array.from(subMap.entries()).map(([subGroup, accs]) => {
                    const subGroupTotal = getSubGroupTotal(group, subGroup);
                    const subGroupFmt = formatCurrency(String(subGroupTotal), 'USD');
                    const subGroupExpanded = isSubGroupExpanded(group, subGroup);

                    return (
                      <div key={`${group}::${subGroup}`}>
                        <button
                          onClick={() => toggleSubGroup(group, subGroup)}
                          className="w-full flex items-center gap-1.5 px-3 py-0.5 rounded-md hover:bg-muted/30 transition-colors text-left"
                        >
                          {subGroupExpanded ? (
                            <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground/70 flex-1 truncate">{subGroup}</span>
                          <span className={`font-mono text-xs blur-number text-muted-foreground/70`}>
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
          left: `${navCollapsedWidth + accountsWidth}px`,
          width: '6px',
          height: '100vh',
          marginLeft: '-3px',
          background: isResizing ? 'var(--color-ring)' : 'transparent',
        }}
        onMouseDown={handleResizeDown}
      >
        <div className="w-1 h-full mx-auto bg-border hover:bg-ring/50 transition-colors" />
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
