'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { apiFetch } from '@/lib/utils/api-client';
import type { Account, TagItem } from '@/components/features/accounts/account-types';
import AccountHierarchyTree from '@/components/features/accounts/account-hierarchy-tree';

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
    queryFn: () => apiFetch<Account[]>('/api/accounts?includeHidden=true'),
    enabled: !!session?.user,
  });

  // 2. Fetch Tags list
  const { data: allTags = [] } = useQuery<TagItem[]>({
    queryKey: ['tags'],
    queryFn: () => apiFetch<TagItem[]>('/api/tags'),
    enabled: !!session?.user,
  });

  // 3. Fetch Accounts History Data
  const { data: historyRes } = useQuery<{ data: any[]; accounts: any[] }>({
    queryKey: ['accounts-history'],
    queryFn: () => apiFetch<{ data: any[]; accounts: any[] }>('/api/accounts/history?timeframe=all'),
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
    <div className="min-h-screen bg-background text-foreground pb-12">
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