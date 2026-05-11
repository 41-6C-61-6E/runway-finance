'use client';

import { Suspense, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { ReactQueryProvider } from '@/lib/query-client';
import DevLogPane from '@/components/dev-log-pane';
import { Analytics } from '@vercel/analytics/next';

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <ThemeProvider defaultTheme="dark" attribute="data-theme">
        <SessionProvider>
          <Suspense fallback={null}>
            <main>{children}</main>
          </Suspense>
          <DevLogPane />
          <Analytics />
        </SessionProvider>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}
