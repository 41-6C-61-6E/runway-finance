import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    if (activeAnalysisSessions.has(userId)) {
      return NextResponse.json({ error: 'Analysis already running' }, { status: 409 });
    }

    const abortController = new AbortController();
    activeAnalysisSessions.set(userId, {
      abortController,
      timeoutId: null,
      processedCount: 0,
      totalCount: null,
      status: 'running',
    });

    try {
      const result = await analyzeUncategorized(userId, (processedCount, totalCount) => {
        const existing = activeAnalysisSessions.get(userId);
        if (existing) {
          existing.processedCount = processedCount;
          existing.totalCount = totalCount;
        }
      });

      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'completed';
        existing.processedCount = existing.totalCount ?? 0;
      }

      return NextResponse.json({
        success: true,
        proposalsCreated: result.proposalsCreated,
        autoApproved: result.autoApproved,
        errors: result.errors,
      });
    } finally {
      setTimeout(() => {
        activeAnalysisSessions.delete(userId);
      }, 5000);
    }
  } catch (error) {
    console.error('[AI_ANALYZE_ERROR]', error);
    return NextResponse.json({ error: 'Failed to run analysis' }, { status: 500 });
  }
}

export const maxDuration = 300;
