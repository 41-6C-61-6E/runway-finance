'use client';

import { Suspense } from 'react';
import { useSidebar, COLLAPSED_WIDTH } from '@/components/sidebar-context';
import ResizableSidebar from '@/components/resizable-sidebar';
import AccountsSidebar from '@/components/accounts-sidebar';
import { SidebarProvider } from '@/components/sidebar-context';
import { NetWorthChart } from '@/components/net-worth-chart';

function DashboardContent() {
  const { sidebarWidth, accountsWidth } = useSidebar();

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated gradient background */}
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

      {/* Navigation Sidebar - fixed, overlays content */}
      <ResizableSidebar />

      {/* Accounts Sidebar - fixed, overlays content */}
      <AccountsSidebar />

      {/* Main Content - offset by both sidebar widths */}
      <main
        className="relative z-10 overflow-x-hidden px-4 sm:px-6 lg:px-8 py-8"
        style={{ 
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: `${COLLAPSED_WIDTH + accountsWidth}px`,
          width: `calc(100vw - ${COLLAPSED_WIDTH + accountsWidth}px)`,
        }}
      >
        <div className="max-w-7xl mx-auto h-full" style={{ maxWidth: '100%' }}>
          <Suspense fallback={<div className="text-slate-400">Loading chart...</div>}>
            <NetWorthChart />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SidebarProvider>
        <DashboardContent />
      </SidebarProvider>
    </Suspense>
  );
}
