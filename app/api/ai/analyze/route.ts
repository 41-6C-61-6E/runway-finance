import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { startAiAnalysis } from '@/lib/services/ai-analysis-runner';

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const settings = await db
      .select({ aiEnabled: userSettings.aiEnabled, aiSuggestionsEnabled: userSettings.aiSuggestionsEnabled })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (settings[0] && (settings[0].aiEnabled === false || settings[0].aiSuggestionsEnabled === false)) {
      return NextResponse.json({ error: 'AI Suggestions are disabled in settings' }, { status: 403 });
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
