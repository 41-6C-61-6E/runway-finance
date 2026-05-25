import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  let userId = 'anonymous';
  try {
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    }
  } catch {
    // Ignored, fallback to anonymous
  }

  try {
    const body = await request.json();
    const { errorName, errorMessage, errorStack, url } = body;

    if (!errorMessage) {
      return NextResponse.json({ error: 'Missing error message' }, { status: 400 });
    }

    logger.error(`[client-error] Captured browser exception: ${errorMessage}`, {
      userId,
      errorName: errorName || 'Error',
      errorMessage,
      errorStack: errorStack || 'No stack trace available',
      url: url || 'unknown-url',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[client-error] Failed to parse client-side error payload', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
