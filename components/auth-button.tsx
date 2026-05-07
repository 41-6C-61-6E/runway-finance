"use client";

import { handleSignIn, handleSignOut } from './server-actions';

export function SignIn({
  provider,
  ...props
}: { provider?: string } & React.ComponentPropsWithRef<"button">) {
  return (
    <form action={handleSignIn}>
      <input type="hidden" name="provider" value={provider || ''} />
      <button
        className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        {...props}
      >
        Sign In
      </button>
    </form>
  );
}

export function SignOut(props: React.ComponentPropsWithRef<"button">) {
  return (
    <form action={handleSignOut}>
      <button
        className="w-full inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 shadow-md hover:shadow-lg transition-all duration-200"
        {...props}
      >
        Sign Out
      </button>
    </form>
  );
}
