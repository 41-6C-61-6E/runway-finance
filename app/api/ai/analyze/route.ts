import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { activeAnalysisSessions } from '../state';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
    });

    // Get timeout from user settings (default 600s)
    const db = getDb();
    const settingsRow = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const timeoutSeconds = settingsRow[0]?.aiAnalysisTimeoutSeconds ?? 600;

    // Set a server-side timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'error';
        existing.error = 'Analysis timed out';
        existing.log.push(`Timed out after ${timeoutSeconds}s`);
      }
    }, timeoutSeconds * 1000);

    if (activeAnalysisSessions.get(userId)?.timeoutId) {
      clearTimeout(activeAnalysisSessions.get(userId)!.timeoutId!);
    }
    activeAnalysisSessions.get(userId)!.timeoutId = timeoutId;

    try {
      const result = await analyzeUncategorized(
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
        }
      );

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
      clearTimeout(timeoutId);
      setTimeout(() => {
        activeAnalysisSessions.delete(userId);
      }, 5000);
    }
  } catch (error) {
    console.error('[AI_ANALYZE_ERROR]', error);
    const existing = activeAnalysisSessions.get(userId || '');
    if (existing) {
      existing.status = 'error';
      existing.error = error instanceof Error ? error.message : String(error);
      existing.log.push(`Error: ${existing.error}`);
    }
    return NextResponse.json({ error: 'Failed to run analysis' }, { status: 500 });
  }
}

export const maxDuration = 600;
