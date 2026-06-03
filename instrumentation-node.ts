import { logger, setDevMode } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

const LOG_TAG = '[finance-sync]';

export async function registerNodeInstrumentation(): Promise<void> {
  // Run database migrations
  try {
    const { initDb: runMigrations } = await import('@/lib/db/migrate');
    await runMigrations(process.env.DATABASE_URL ?? '');
  } catch (err) {
    logger.error('[startup] Database initialization failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Initialize per-connection sync scheduler
  try {
    await syncScheduler.init();
    logger.info(`${LOG_TAG} Sync scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Sync scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Initialize manual account sync scheduler
  try {
    await manualAccountScheduler.init();
    logger.info(`${LOG_TAG} Manual account scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Manual account scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (process.env.DEV_MODE === 'true') {
    setDevMode(true);
    logger.info(`${LOG_TAG} Dev mode enabled.`);
  }

  // Graceful shutdown
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    const handleShutdown = () => {
      syncScheduler.shutdown();
      manualAccountScheduler.shutdown();
      logger.info(`${LOG_TAG} Schedulers stopped.`);
    };
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  }
}
