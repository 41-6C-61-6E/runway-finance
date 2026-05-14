'use client';

import { Suspense, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { ReactQueryProvider } from '@/lib/query-client';
import DevLogPane from '@/components/dev-log-pane';
import { PWARegister } from '@/components/pwa-register';
import { Analytics } from '@vercel/analytics/next';
import { ChartColorSchemeInitializer } from '@/components/chart-color-scheme-initializer';
import { CardStyleInitializer } from '@/components/card-style-initializer';

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <ThemeProvider defaultTheme="dark" attribute="data-theme">
        <SessionProvider>
          <ChartColorSchemeInitializer />
          <CardStyleInitializer />
          <div className="min-h-screen flex flex-col">
            <Suspense fallback={null}>
              <main className="flex-1">{children}</main>
            </Suspense>
            <DevLogPane />
          </div>
          <PWARegister />
          <Analytics />
        </SessionProvider>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}
