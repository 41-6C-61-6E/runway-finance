'use client'

import { handleSignOut } from './server-actions'

export default function SignOutForm() {
  return (
    <form action={handleSignOut}>
      <button
        type="submit"
        className="w-full inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 shadow-md hover:shadow-lg transition-all duration-200"
      >
        Sign Out
      </button>
    </form>
  )
}
