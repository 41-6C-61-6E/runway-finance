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

    // Prevent multiple concurrent runs for the same user
    if (activeAnalysisSessions.has(userId)) {
      return NextResponse.json({ error: 'Analysis already running' }, { status: 409 });
    }

    const abortController = new AbortController();
    // Register the session in the shared state so it can be cancelled
    activeAnalysisSessions.set(userId, { abortController, timeoutId: null });

    try {
      // Call the actual analysis service
      const result = await analyzeUncategorized(userId);
      
      return NextResponse.json({ 
        success: true, 
        proposalsCreated: result.proposalsCreated,
        autoApproved: result.autoApproved,
        errors: result.errors 
      });
    } finally {
      // Ensure we clean up the state when done
      activeAnalysisSessions.delete(userId);
    }
  } catch (error) {
    console.error('[AI_ANALYZE_ERROR]', error);
    return NextResponse.json({ error: 'Failed to run analysis' }, { status: 500 });
  }
}

export const maxDuration = 300; // 5 minute timeout for long-running AI tasks