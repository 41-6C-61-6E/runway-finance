'use client';

import { useSession } from 'next-auth/react';
import SignOutForm from '@/components/sign-out-form';

export default function UserSection() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
        <div className="text-xs text-gray-500">Signed in as</div>
        <div className="text-sm text-white truncate">{session.user.email}</div>
      </div>
      <SignOutForm />
    </div>
  );
}
