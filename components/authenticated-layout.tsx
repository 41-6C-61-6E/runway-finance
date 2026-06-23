'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import AccountsSidebar from '@/components/accounts-sidebar';
import ResizableSidebar from '@/components/resizable-sidebar';
import { useSidebar, SidebarProvider, COLLAPSED_WIDTH } from '@/components/sidebar-context';
import { PrivacyModeProvider } from '@/components/privacy-mode-provider';
import { AccountSubheadingsProvider } from '@/components/account-subheadings-provider';
import { ReduceTransparencyProvider } from '@/components/reduce-transparency-provider';
import { UserSettingsProvider } from '@/components/user-settings-provider';
import { MobileNav } from '@/components/mobile-nav';
import { ReactNode, useState, useEffect } from 'react';

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  const isAuthPage = pathname === '/signin';
  const isOfflinePage = pathname === '/offline';

  useEffect(() => {
    if (status === 'unauthenticated' && !isAuthPage && !isOfflinePage) {
      router.push('/signin');
    } else if (status === 'authenticated' && isAuthPage) {
      router.push('/');
    }
  }, [status, isAuthPage, isOfflinePage, router]);

  if (isAuthPage || isOfflinePage) {
    if (status === 'authenticated' && isAuthPage) {
      return null;
    }
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <LoadingSpinner category="default" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const isSettingsPage = pathname === '/settings';
  const hideAccountsSidebar = isSettingsPage;

  return (
    <UserSettingsProvider>
      <SidebarProvider>
        <PrivacyModeProvider>
          <ReduceTransparencyProvider>
          <AccountSubheadingsProvider>
            <>
              <ResizableSidebar />
              {!hideAccountsSidebar && <AccountsSidebar />}
              <AuthenticatedLayoutContent hideAccountsSidebar={hideAccountsSidebar}>
                {children}
              </AuthenticatedLayoutContent>
              <MobileNav />
            </>
          </AccountSubheadingsProvider>
          </ReduceTransparencyProvider>
        </PrivacyModeProvider>
      </SidebarProvider>
    </UserSettingsProvider>
  );
}

function AuthenticatedLayoutContent({ children, hideAccountsSidebar }: { children: ReactNode; hideAccountsSidebar: boolean }) {
  const { sidebarWidth, accountsWidth, accountsCollapsed } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use a stable default (e.g., collapsed) during hydration to match server expectations
  const desktopMarginLeft = (!mounted || hideAccountsSidebar || accountsCollapsed) 
    ? `${COLLAPSED_WIDTH}px` 
    : `${COLLAPSED_WIDTH + accountsWidth}px`;

  return (
    <>
      <div 
        style={{ 
          '--sidebar-margin-left': desktopMarginLeft 
        } as React.CSSProperties} 
        className="transition-all duration-200 ml-0 md:ml-[var(--sidebar-margin-left)] pb-28 md:pb-0"
      >
        {children}
      </div>
    </>
  );
}

