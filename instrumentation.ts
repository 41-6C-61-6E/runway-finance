/**
 * Next.js instrumentation hook — registers the periodic SimpleFIN sync cron job.
 * Only registers if SYNC_CRON_SCHEDULE is set (non-empty).
 * Default schedule: every 6 hours.
 */

import cron from 'node-cron';
import { debugInfo, debugWarn } from '@/lib/debug';
import { syncAllConnections } from '@/lib/services/sync-all';

const LOG_TAG = '[runway-sync]';
const DEFAULT_SCHEDULE = '0 */6 * * *';

export function register(): void {
  const schedule = process.env.SYNC_CRON_SCHEDULE ?? '';

  if (!schedule) {
    debugWarn(`${LOG_TAG} SYNC_CRON_SCHEDULE is not set — periodic sync is disabled.`);
    return;
  }

  const task = cron.schedule(schedule, () => {
    syncAllConnections().catch((err) => {
      debugWarn(`${LOG_TAG} Cron task error: ${err instanceof Error ? err.message : String(err)}`);
    });
  });

  debugInfo(`${LOG_TAG} Cron registered: ${schedule}`);

  // Allow graceful shutdown
  process.on('SIGTERM', () => {
    task.stop();
    debugInfo(`${LOG_TAG} Cron stopped.`);
  });
}
