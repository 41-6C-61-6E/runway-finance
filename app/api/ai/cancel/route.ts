import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const existing = activeAnalysisSessions.get(userId);

  if (existing) {
    existing.abortController.abort();
    if (existing.timeoutId) clearTimeout(existing.timeoutId);
    activeAnalysisSessions.delete(userId);
  }

  return NextResponse.json({ ok: true });
}
