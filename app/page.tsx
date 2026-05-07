import { Suspense } from 'react';
import ResizableSidebar from '@/components/resizable-sidebar';

export default async function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
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

        {/* Navigation Sidebar */}
        <ResizableSidebar />

        {/* Main Content */}
        <main className="relative z-10 flex items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl w-full text-center space-y-8">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Welcome to Runway Finance
              </span>
            </h1>
            <p className="text-lg text-gray-400">
              Your personal finance dashboard. Connect your accounts in Settings to get started.
            </p>
          </div>
        </main>
      </div>
    </Suspense>
  );
}
