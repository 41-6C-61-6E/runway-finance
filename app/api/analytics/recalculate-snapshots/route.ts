import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { runBackgroundRecalculation, recalculationStatus } from '@/lib/services/startup-recalculation';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      status: recalculationStatus,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching recalculation status', { error: errorMsg });
    return NextResponse.json(
      { error: 'status_fetch_failed', message: errorMsg },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Authentication required' },
        { status: 401 }
      );
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error starting snapshot recalculation', { error: errorMsg });
    return NextResponse.json(
      { error: 'recalculation_failed', message: errorMsg },
      { status: 500 }
    );
  }
}