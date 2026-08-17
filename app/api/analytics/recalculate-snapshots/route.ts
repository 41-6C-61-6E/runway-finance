import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { runBackgroundRecalculation, recalculationStatus } from '@/lib/services/startup-recalculation';
import { logger } from '@/lib/logger';
import { apiUnauthorized, handleApiError } from '@/lib/api/response';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return apiUnauthorized();
    }

    return NextResponse.json({
      success: true,
      status: recalculationStatus,
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

    logger.info('Triggering manual snapshot recalculation in background', { userId: dataUserId, type });

    if (recalculationStatus.status === 'running') {
      return NextResponse.json(
        { error: 'already_running', message: 'A recalculation is already in progress' },
        { status: 409 }
      );
    }

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