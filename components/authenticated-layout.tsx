'use client';

import { usePathname } from 'next/navigation';
import AccountsSidebar from '@/components/accounts-sidebar';
import ResizableSidebar from '@/components/resizable-sidebar';
import { useSidebar, SidebarProvider } from '@/components/sidebar-context';
import { PrivacyModeProvider } from '@/components/privacy-mode-provider';
import { AccountSubheadingsProvider } from '@/components/account-subheadings-provider';
import { ReduceTransparencyProvider } from '@/components/reduce-transparency-provider';
import { ReactNode, useState, useEffect } from 'react';

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
        <ReduceTransparencyProvider>
        <AccountSubheadingsProvider>
          <>
            <ResizableSidebar />
            {!isSettingsPage && <AccountsSidebar />}
            <AuthenticatedLayoutContent isSettingsPage={isSettingsPage}>
              {children}
            </AuthenticatedLayoutContent>
          </>
        </AccountSubheadingsProvider>
        </ReduceTransparencyProvider>
      </PrivacyModeProvider>
    </SidebarProvider>
  );
}

function AuthenticatedLayoutContent({ children, isSettingsPage }: { children: ReactNode; isSettingsPage: boolean }) {
  const { accountsWidth, accountsCollapsed } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use a stable default (e.g., collapsed) during hydration to match server expectations
  const marginLeft = (!mounted || isSettingsPage || accountsCollapsed) 
    ? '64px' 
    : `${64 + accountsWidth}px`;

  return (
    <>
      <div style={{ marginLeft }}>
        {children}
      </div>
    </>
  );
}
