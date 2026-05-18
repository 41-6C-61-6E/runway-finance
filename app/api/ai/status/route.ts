import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const existing = activeAnalysisSessions.get(userId);

  if (!existing) {
    return NextResponse.json({ status: 'idle' });
  }

  return NextResponse.json({
    status: 'running',
    processedCount: 0,
    totalCount: 0,
    error: null,
  });
}
