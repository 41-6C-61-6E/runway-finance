import { DemoBadge } from "@/components/demo-badge";
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { Suspense } from 'react'
import { getUsers } from '@/lib/users'
import { debugLog, debugInfo, debugWarn } from '@/lib/debug'

async function HomeContent() {
  // Log startup info
  const debugMode = process.env.DEBUG === 'true'
  if (debugMode) {
    debugInfo('=== App page accessed ===')
    const users = await getUsers()
    debugLog(`Number of registered users: ${users.length}`)
    if (users.length > 0) {
      debugLog('Usernames:', users.map(u => u.username))
    } else {
      debugWarn('No users registered yet')
    }
  }

  const session = await auth()
  if (!session?.user) {
    if (debugMode) debugLog('No session found, redirecting to /signin')
    redirect('/signin')
  }
  if (debugMode) debugInfo('Session found, rendering main page')
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

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center mt-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full text-center space-y-8">
          {/* Version Badge */}
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20">
              Runway Finance
            </span>
            {/* Badge */}
            <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/30 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-600/20">
              Get ready for takeoff!
            </span>
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Runway Finance
              </span>
            </h1>
          </div>

          {/* Buttons */}
          <div className="mt-8">
            <form action={async () => {
              "use server";
              await signOut({ redirectTo: '/signin' });
            }}>
              <button
                type="submit"
                className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
              >
                Sign Out
              </button>
            </form>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 cursor-pointer">
              <a
                target="_blank"
                rel="noopener noreferrer"
              >
                Settings
              </a>
            </button>
          </div>
        </div>
      </div>

      <DemoBadge />
    </div>
  );
}

export default async function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
