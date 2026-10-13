'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import type { Account, TagItem } from '@/components/features/accounts/account-types';
import AccountHierarchyTree from '@/components/features/accounts/AccountHierarchyTree';

function AccountsContent() {
  const { data: session } = useSession();
  const { isEnabled } = useSyntheticData();
  const isNetWorthEnabled = isEnabled('netWorth');
  const isRealEstateEnabled = isEnabled('realEstate');

  const searchParams = useSearchParams();
  const targetAccountId = searchParams.get('accountId') || searchParams.get('account');

  // 1. Fetch Accounts list
  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['accounts', true],
    queryFn: async () => {
      const res = await fetch('/api/accounts?includeHidden=true', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    enabled: !!session?.user,
  });

  // 2. Fetch Tags list
  const { data: allTags = [] } = useQuery<TagItem[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tags');
      return res.json();
    },
    enabled: !!session?.user,
  });

  // 3. Fetch Accounts History Data
  const { data: historyRes } = useQuery<{ data: any[]; accounts: any[] }>({
    queryKey: ['accounts-history'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/history?timeframe=all`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: !!session?.user,
  });

  const historyData = historyRes?.data || [];

  // Filter accounts according to net worth & real estate synthetic toggles
  const filteredAllAccounts = useMemo(() => {
    return allAccounts.filter((acc) => {
      if (acc.isExcludedFromNetWorth) return false;
      if (!isNetWorthEnabled && !acc.connectionId && !acc.plaidConnectionId) return false;
      const isRealEstate = [
        'realestate',
        'primaryhome',
        'secondaryhome',
        'rentalproperty',
        'commercial',
        'land',
        'otherrealestate',
      ].includes(acc.type.toLowerCase());
      if (isRealEstate && !isRealEstateEnabled && !acc.connectionId && !acc.plaidConnectionId) return false;
      return true;
    });
  }, [allAccounts, isNetWorthEnabled, isRealEstateEnabled]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-12 transition-all">
      <PageHeader title="Accounts" icon={Landmark} />

      <PageContent maxWidth="max-w-7xl" className="space-y-5 sm:space-y-6">
        <AccountHierarchyTree
          filteredAllAccounts={filteredAllAccounts}
          allTags={allTags}
          historyData={historyData}
          accountsLoading={accountsLoading}
          targetAccountId={targetAccountId}
        />
      </PageContent>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsContent />
    </Suspense>
  );
}