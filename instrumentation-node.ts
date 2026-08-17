import { logger, setDevMode } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';
import { paystubAutoGenerateScheduler } from '@/lib/services/paystub-auto-generate-scheduler';
import { weeklyNetWorthScheduler } from '@/lib/services/weekly-networth-scheduler';

const LOG_TAG = '[finance-sync]';
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export async function registerNodeInstrumentation(): Promise<void> {
  // 1. Install top-level process safety nets before any async initialization
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    // Prevent unhandled promise rejections from killing the Node 20+ process
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('[process:unhandledRejection] Unhandled promise rejection caught', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    // Handle uncaught exceptions cleanly: log, stop schedulers, exit with 1 for orchestrator restart
    process.on('uncaughtException', (err: Error) => {
      logger.error('[process:uncaughtException] Fatal uncaught exception, terminating', {
        error: err.message,
        stack: err.stack,
      });
      try {
        syncScheduler.shutdown();
        manualAccountScheduler.shutdown();
        paystubAutoGenerateScheduler.shutdown();
        weeklyNetWorthScheduler.shutdown();
      } finally {
        process.exit(1);
      }
    });
  }

  // 2. Run database migrations
  try {
    const { initDb: runMigrations } = await import('@/lib/db/migrate');
    await runMigrations(process.env.DATABASE_URL ?? '');
  } catch (err) {
    logger.error('[startup] Database initialization failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // 3. Maintenance: Reconcile stuck running jobs & prune old logs
  try {
    const { reconcileStuckRunningJobs, pruneOldJobLogs } = await import('@/lib/services/scheduler-logger');
    await reconcileStuckRunningJobs();
    await pruneOldJobLogs(30);
  } catch (err) {
    logger.error('[startup] Scheduler log maintenance failed', { error: String(err) });
  }

  // 4. Initialize background schedulers
  try {
    await syncScheduler.init();
    logger.info(`${LOG_TAG} Sync scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Sync scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await manualAccountScheduler.init();
    logger.info(`${LOG_TAG} Manual account scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Manual account scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await paystubAutoGenerateScheduler.init();
    logger.info(`${LOG_TAG} Paystub auto-generate scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Paystub auto-generate scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await weeklyNetWorthScheduler.init();
    logger.info(`${LOG_TAG} Weekly Net Worth scheduler initialized.`);
  } catch (err) {
    logger.error(`${LOG_TAG} Weekly Net Worth scheduler initialization failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Watchdog: Periodically re-check scheduler status and auto-recover on transient DB recovery
  if (!watchdogTimer && typeof setInterval !== 'undefined') {
    watchdogTimer = setInterval(async () => {
      try {
        if (!syncScheduler.isRunning) {
          logger.warn('[watchdog] Sync scheduler not running; retrying init...');
          await syncScheduler.init();
        }
        if (!manualAccountScheduler.isRunning) {
          logger.warn('[watchdog] Manual account scheduler not running; retrying init...');
          await manualAccountScheduler.init();
        }
        if (!paystubAutoGenerateScheduler.isRunning) {
          await paystubAutoGenerateScheduler.init();
        }
        if (!weeklyNetWorthScheduler.isRunning) {
          await weeklyNetWorthScheduler.init();
        }
      } catch (err) {
        logger.error('[watchdog] Scheduler recovery check failed', { error: String(err) });
      }
    }, 60_000);
  }

  if (process.env.DEV_MODE === 'true') {
    setDevMode(true);
    logger.info(`${LOG_TAG} Dev mode enabled.`);
  }

  // 6. Production account self-healing
  try {
    const { healProductionAccounts } = await import('@/lib/services/heal-accounts');
    healProductionAccounts().catch((err: unknown) => {
      logger.error('[startup] Production accounts self-healing run failed', { error: String(err) });
    });
  } catch (err) {
    logger.error('[startup] Failed to initialize production accounts self-healing service', { error: String(err) });
  }

  // 7. Synthetic snapshot recalculations
  try {
    const { recalculateAllSnapshots } = await import('@/lib/services/startup-recalculation');
    recalculateAllSnapshots().catch((err: unknown) => {
      logger.error('[startup] Snapshot recalculation failed', { error: String(err) });
    });
  } catch (err) {
    logger.error('[startup] Failed to initialize snapshot recalculation', { error: String(err) });
  }

  // 8. Graceful shutdown
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    const handleShutdown = () => {
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      syncScheduler.shutdown();
      manualAccountScheduler.shutdown();
      paystubAutoGenerateScheduler.shutdown();
      weeklyNetWorthScheduler.shutdown();
      logger.info(`${LOG_TAG} Schedulers stopped.`);
      process.exit(0);
    };
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  }
}
