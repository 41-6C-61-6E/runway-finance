import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { startAiAnalysis } from '@/lib/services/ai-analysis-runner';

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = startAiAnalysis(userId);
    if (result === 'already-running') {
      return NextResponse.json({ error: 'Analysis already running' }, { status: 409 });
    }

    return NextResponse.json({ success: true, status: 'running' });
  } catch (error) {
    console.error('[AI_ANALYZE_KICKOFF_ERROR]', error);
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 });
  }
}

export const maxDuration = 3600;
