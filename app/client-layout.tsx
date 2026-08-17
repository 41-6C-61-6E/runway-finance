'use client';

import { Suspense, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { ReactQueryProvider } from '@/lib/query-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWARegister } from '@/components/pwa-register';
import { ChangelogModal } from '@/components/changelog-modal';
import { Analytics } from '@vercel/analytics/next';
import { ChartColorSchemeInitializer } from '@/components/chart-color-scheme-initializer';
import { ClientErrorReporter } from '@/components/client-error-reporter';
import { OfflineBanner } from '@/components/offline-banner';
import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';

function ThemedToaster() {
  const { theme } = useTheme();
  // Map custom moonlight/dark themes to dark, daylight to light
  const toastTheme = theme === 'light' ? 'light' : 'dark';
  return <Toaster richColors closeButton position="top-center" theme={toastTheme} />;
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <ThemeProvider defaultTheme="moonlight" attribute="data-theme">
        <SessionProvider>
          <TooltipProvider delayDuration={300}>
            <ClientErrorReporter>
              <ThemedToaster />
              <OfflineBanner />
              <ChartColorSchemeInitializer />
              <div className="min-h-[100dvh] flex flex-col">
                <Suspense fallback={null}>
                  <main className="flex-1">{children}</main>
                </Suspense>
              </div>
              <PWARegister />
              <ChangelogModal />
              <Analytics />
            </ClientErrorReporter>
          </TooltipProvider>
        </SessionProvider>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}

