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
        className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-foreground bg-muted hover:bg-accent rounded-lg border border-border transition-all"
        {...props}
      >
        Sign Out
      </button>
    </form>
  );
}
