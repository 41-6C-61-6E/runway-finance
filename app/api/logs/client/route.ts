import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(`client-logs:${ip}`, 30, 60_000))) {
    return NextResponse.json({ error: 'Too many log requests' }, { status: 429 });
  }

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

    if (!errorMessage || typeof errorMessage !== 'string') {
      return NextResponse.json({ error: 'Missing error message' }, { status: 400 });
    }

    const cleanMessage = String(errorMessage).slice(0, 500).replace(/[\r\n\t]+/g, ' ');
    const cleanStack = errorStack ? String(errorStack).slice(0, 2000) : 'No stack trace available';
    const cleanUrl = url ? String(url).slice(0, 500) : 'unknown-url';
    const cleanName = errorName ? String(errorName).slice(0, 100) : 'Error';

    logger.error(`[client-error] Captured browser exception: ${cleanMessage}`, {
      userId,
      errorName: cleanName,
      errorMessage: cleanMessage,
      errorStack: cleanStack,
      url: cleanUrl,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[client-error] Failed to parse client-side error payload', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
