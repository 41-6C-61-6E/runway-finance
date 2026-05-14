import cron from 'node-cron';
import { logger, setDevMode } from '@/lib/logger';
import { patchConsole, enableDevLogging } from '@/lib/dev-logs';

const LOG_TAG = '[runway-sync]';

export async function registerNodeInstrumentation(): Promise<void> {
  // Run database migrations
  try {
    const { initDb: runMigrations } = await import('@/lib/db/migrate');
    await runMigrations(process.env.DATABASE_URL ?? '');
  } catch (err) {
    logger.error('[startup] Database initialization failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Register cron sync task
  const schedule = process.env.SYNC_CRON_SCHEDULE ?? '';

  if (!schedule) {
    logger.warn(`${LOG_TAG} SYNC_CRON_SCHEDULE is not set — periodic sync is disabled.`);
    return;
  }

  const task = cron.schedule(schedule, async () => {
    try {
      const { syncAllConnections } = await import('@/lib/services/sync-all');
      await syncAllConnections();
    } catch (err) {
      logger.error(`${LOG_TAG} Cron task error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.info(`${LOG_TAG} Cron registered: ${schedule}`);

  if (process.env.DEV_MODE === 'true') {
    setDevMode(true);
    enableDevLogging();
    patchConsole();
    logger.info(`${LOG_TAG} Dev mode enabled — console logging captured.`);
  }

  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('SIGTERM', () => {
      task.stop();
      logger.info(`${LOG_TAG} Cron stopped.`);
    });
  }
}
