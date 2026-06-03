import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const existing = activeAnalysisSessions.get(userId);

  if (!existing) {
    return NextResponse.json({ status: 'idle' });
  }

  return NextResponse.json({
    status: existing.status,
    processedCount: existing.processedCount ?? 0,
    totalCount: existing.totalCount ?? 0,
    error: existing.error ?? null,
    log: existing.log ?? [],
  });
}
