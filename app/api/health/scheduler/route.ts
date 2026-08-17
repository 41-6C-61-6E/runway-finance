import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';
import { paystubAutoGenerateScheduler } from '@/lib/services/paystub-auto-generate-scheduler';
import { weeklyNetWorthScheduler } from '@/lib/services/weekly-networth-scheduler';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const schedulers = {
    syncScheduler: {
      isRunning: syncScheduler.isRunning,
      armedCount: syncScheduler.armedCount,
      lastInitAt: syncScheduler.lastInitAt,
      lastTickAt: syncScheduler.lastTickAt,
      lastError: syncScheduler.lastError,
    },
    manualAccountScheduler: {
      isRunning: manualAccountScheduler.isRunning,
      armedCount: manualAccountScheduler.armedCount,
      lastInitAt: manualAccountScheduler.lastInitAt,
      lastTickAt: manualAccountScheduler.lastTickAt,
      lastError: manualAccountScheduler.lastError,
    },
    paystubAutoGenerateScheduler: {
      isRunning: paystubAutoGenerateScheduler.isRunning,
      armedCount: paystubAutoGenerateScheduler.armedCount,
      lastInitAt: paystubAutoGenerateScheduler.lastInitAt,
      lastTickAt: paystubAutoGenerateScheduler.lastTickAt,
      lastError: paystubAutoGenerateScheduler.lastError,
    },
    weeklyNetWorthScheduler: {
      isRunning: weeklyNetWorthScheduler.isRunning,
      armedCount: weeklyNetWorthScheduler.armedCount,
      lastInitAt: weeklyNetWorthScheduler.lastInitAt,
      lastTickAt: weeklyNetWorthScheduler.lastTickAt,
      lastError: weeklyNetWorthScheduler.lastError,
    },
  };

  const allHealthy = Object.values(schedulers).every((s) => s.isRunning);

  return NextResponse.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    schedulers,
  });
}
