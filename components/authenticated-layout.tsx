'use client';

import { usePathname } from 'next/navigation';
import AccountsSidebar from '@/components/accounts-sidebar';
import { useSidebar, SidebarProvider } from '@/components/sidebar-context';
import { ReactNode } from 'react';

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSettingsPage = pathname === '/settings';

  return (
    <SidebarProvider>
      <AuthenticatedLayoutContent isSettingsPage={isSettingsPage}>
        {children}
      </AuthenticatedLayoutContent>
    </SidebarProvider>
  );
}

function AuthenticatedLayoutContent({ children, isSettingsPage }: { children: ReactNode; isSettingsPage: boolean }) {
  const { sidebarWidth, accountsWidth } = useSidebar();

  return (
    <>
      {!isSettingsPage && <AccountsSidebar />}
      <div style={{ marginLeft: isSettingsPage ? `${sidebarWidth}px` : `${sidebarWidth + accountsWidth}px` }}>
        {children}
      </div>
    </>
  );
}
