'use client';

import { useQuery } from '@tanstack/react-query';
import AccountList from '@/components/features/accounts/AccountList';
import ResizableSidebar from '@/components/resizable-sidebar';
import ContentWrapper from '@/components/content-wrapper';

function AccountsListWithFetch() {
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) return [];
      return res.json();
    },
  });

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

      {/* Navigation Sidebar */}
      <ResizableSidebar />

      {/* Main Content */}
      <ContentWrapper>
        <main className="relative z-10 mt-20 px-6 lg:px-12 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold">
            <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
              Accounts
            </span>
          </h1>
        </div>
        <AccountList initialAccounts={accounts} />
      </main>
      </ContentWrapper>
    </div>
  );
}

export default function AccountsPage() {
  return <AccountsListWithFetch />;
}
