'use client';

import { usePathname } from 'next/navigation';
import AccountsSidebar from '@/components/accounts-sidebar';
import ResizableSidebar from '@/components/resizable-sidebar';
import { useSidebar, SidebarProvider } from '@/components/sidebar-context';
import { PrivacyModeProvider } from '@/components/privacy-mode-provider';
import { ReactNode } from 'react';

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/signin';
  const isSettingsPage = pathname === '/settings';

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <PrivacyModeProvider>
        <>
          <ResizableSidebar />
          {!isSettingsPage && <AccountsSidebar />}
          <AuthenticatedLayoutContent isSettingsPage={isSettingsPage}>
            {children}
          </AuthenticatedLayoutContent>
        </>
      </PrivacyModeProvider>
    </SidebarProvider>
  );
}

function AuthenticatedLayoutContent({ children, isSettingsPage }: { children: ReactNode; isSettingsPage: boolean }) {
  const { accountsWidth } = useSidebar();

  return (
    <>
      <div style={{ marginLeft: isSettingsPage ? '64px' : `${64 + accountsWidth}px` }}>
        {children}
      </div>
    </>
  );
}
