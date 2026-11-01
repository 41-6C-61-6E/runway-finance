'use client';

import { ReactNode } from 'react';
import { UserSettingsProvider } from '@/components/user-settings-provider';
import { SidebarProvider } from '@/components/sidebar-context';
import { PrivacyModeProvider } from '@/components/privacy-mode-provider';
import { ReduceTransparencyProvider } from '@/components/reduce-transparency-provider';
import { AccountSubheadingsProvider } from '@/components/account-subheadings-provider';
import { MobileSubNavProvider } from '@/components/mobile-subnav-context';
import { AdviceProvider } from '@/components/features/advice/advice-provider';

/**
 * Composed provider tree for authenticated layouts in canonical dependency order.
 */
export function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <UserSettingsProvider>
      <SidebarProvider>
        <PrivacyModeProvider>
          <ReduceTransparencyProvider>
            <AccountSubheadingsProvider>
              <MobileSubNavProvider>
                <AdviceProvider>
                  {children}
                </AdviceProvider>
              </MobileSubNavProvider>
            </AccountSubheadingsProvider>
          </ReduceTransparencyProvider>
        </PrivacyModeProvider>
      </SidebarProvider>
    </UserSettingsProvider>
  );
}
