import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      log: [],
      startedAt: Date.now(),
    });

    // Run analysis in the background without awaiting it to prevent HTTP timeouts
    analyzeUncategorized(
      userId,
      (processedCount, totalCount) => {
        const existing = activeAnalysisSessions.get(userId);
        if (existing) {
          existing.processedCount = processedCount;
          existing.totalCount = totalCount;
        }
      },
      (message) => {
        const existing = activeAnalysisSessions.get(userId);
        if (existing) {
          existing.log.push(message);
          if (existing.log.length > 50) {
            existing.log = existing.log.slice(-50);
          }
        }
      },
      abortController
    ).then((result) => {
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'completed';
        existing.processedCount = existing.totalCount ?? 0;
        existing.proposalsCreated = result.proposalsCreated;
        existing.autoApproved = result.autoApproved;
      }
    }).catch((error) => {
      console.error('[AI_ANALYZE_ERROR]', error);
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'error';
        existing.error = error instanceof Error ? error.message : String(error);
        existing.log.push(`Error: ${existing.error}`);
      }
    }).finally(() => {
      setTimeout(() => {
        activeAnalysisSessions.delete(userId);
      }, 30000); // Retain status for 30s to allow frontend polling to read the final state
    });

    return NextResponse.json({ success: true, status: 'running' });
  } catch (error) {
    console.error('[AI_ANALYZE_KICKOFF_ERROR]', error);
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 });
  }
}

export const maxDuration = 3600;
