import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';
import { logger } from '@/lib/logger';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const result = await analyzeUncategorized(userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[ai/analyze] Failed', { userId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
