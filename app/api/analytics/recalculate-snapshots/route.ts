import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { runBackgroundRecalculation, recalculationStatus } from '@/lib/services/startup-recalculation';
import { logger } from '@/lib/logger';
import { apiUnauthorized, handleApiError } from '@/lib/api/response';

// L-3 (2026-08-27 security review): per-user cooldown for this heavy job.
// The single process-global status made one user's run block (and leak
// progress to) everyone; a per-user rate limit bounds how often any one
// household can trigger a full recalculation.
const RECALC_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const lastRecalcStart = new Map<string, number>();

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return apiUnauthorized();
    }
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;

    // Only report runs this user owns/triggered (or system-wide startup runs).
    const visible = !recalculationStatus.owner || recalculationStatus.owner === dataUserId;
    return NextResponse.json({
      success: true,
      status: visible ? recalculationStatus : { ...recalculationStatus, currentUser: null, errors: [] },
    });
  } catch (error) {
    logger.error('Error fetching recalculation status', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to fetch recalculation status');
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return apiUnauthorized();
    }

    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const dek = await getSessionDEK();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'netWorth';

    // L-3: per-user cooldown.
    const last = lastRecalcStart.get(dataUserId) ?? 0;
    const now = Date.now();
    if (now - last < RECALC_COOLDOWN_MS) {
      const retryInSec = Math.ceil((RECALC_COOLDOWN_MS - (now - last)) / 1000);
      return NextResponse.json(
        { error: 'rate_limited', message: `Recalculation was triggered recently. Try again in ${retryInSec}s.` },
        { status: 429 }
      );
    }

    logger.info('Triggering manual snapshot recalculation in background', { userId: dataUserId, type });

    if (recalculationStatus.status === 'running') {
      return NextResponse.json(
        { error: 'already_running', message: 'A recalculation is already in progress' },
        { status: 409 }
      );
    }

    lastRecalcStart.set(dataUserId, Date.now());

    // Trigger in the background without awaiting
    runBackgroundRecalculation(true, dataUserId, type, dek).catch((err) => {
      logger.error('Error in manual background recalculation run', { userId: dataUserId, error: String(err) });
    });

    return NextResponse.json({
      success: true,
      message: 'Recalculation started in background',
      status: 'running',
    });
  } catch (error) {
    logger.error('Error starting snapshot recalculation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, 'Failed to start snapshot recalculation');
  }
}