'use client';

import { Suspense } from 'react';
import { useSidebar, COLLAPSED_WIDTH } from '@/components/sidebar-context';
import ResizableSidebar from '@/components/resizable-sidebar';
import AccountsSidebar from '@/components/accounts-sidebar';
import { SidebarProvider } from '@/components/sidebar-context';

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
        className="relative z-10 flex items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8"
        style={{ marginLeft: `${COLLAPSED_WIDTH + accountsWidth}px` }}
      >
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
