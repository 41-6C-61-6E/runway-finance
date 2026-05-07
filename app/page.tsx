import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

async function HomeContent() {
  const session = await auth()
  if (!session?.user) {
    redirect('/signin')
  }

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

          {/* User Info Panel */}
          <div className="mt-8 p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 max-w-md mx-auto">
            <div className="space-y-4">
              {/* User Email */}
              <div className="text-sm text-gray-400 dark:text-gray-500">
                Signed in as
              </div>
              <div className="text-lg font-medium text-white">
                {session.user.email}
              </div>

              {/* Settings Button */}
              <a
                href="/settings"
                className="inline-flex items-center justify-center w-full px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 cursor-pointer"
              >
                Settings
              </a>

              {/* Sign Out Button */}
              <form action={async () => {
                "use server";
                await signOut({ redirectTo: '/signin' });
              }}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center w-full px-6 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
