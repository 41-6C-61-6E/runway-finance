'use client'

import { handleSignOut } from './server-actions'
import { LogOut } from 'lucide-react'

export default function SignOutForm({ iconOnly }: { iconOnly?: boolean }) {
  return (
    <form action={handleSignOut}>
      {iconOnly ? (
        <button
          type="submit"
          className="flex items-center justify-center p-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-sidebar-foreground/70 bg-sidebar-accent/50 hover:bg-sidebar-accent rounded-lg border border-sidebar-border transition-all"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      )}
    </form>
  )
}
