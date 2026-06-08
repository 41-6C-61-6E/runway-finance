import { logger, setDevMode } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';
import { paystubAutoGenerateScheduler } from '@/lib/services/paystub-auto-generate-scheduler';

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

  // Initialize paystub auto-generate scheduler
  try {
    paystubAutoGenerateScheduler.init();
    logger.info(`${LOG_TAG} Paystub auto-generate scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Paystub auto-generate scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (process.env.DEV_MODE === 'true') {
    setDevMode(true);
    logger.info(`${LOG_TAG} Dev mode enabled.`);
  }

  // Recalculate all synthetic snapshots and summaries on startup so that
  // any code changes that affect snapshot or summary logic take effect immediately
  try {
    const { recalculateAllSnapshots } = await import('@/lib/services/startup-recalculation');
    recalculateAllSnapshots().catch((err: unknown) => {
      logger.error('[startup] Snapshot recalculation failed', { error: String(err) });
    });
  } catch (err) {
    logger.error('[startup] Failed to initialize snapshot recalculation', { error: String(err) });
  }

  // Graceful shutdown
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    const handleShutdown = () => {
      syncScheduler.shutdown();
      manualAccountScheduler.shutdown();
      paystubAutoGenerateScheduler.shutdown();
      logger.info(`${LOG_TAG} Schedulers stopped.`);
    };
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  }
}
