import { activeAnalysisSessions } from '@/lib/ai/analysis-sessions';
import { analyzeUncategorized } from '@/lib/services/ai-categorizer';
import { logger } from '@/lib/logger';

const LOG_TAG = '[ai-analysis-runner]';

/**
 * Start an AI analysis run for a user, registering it in the shared session
 * map so `GET /api/ai/status`, the transactions progress pill, and the
 * suggestions modal all observe the same run — whether it was started from
 * the UI, the settings tab, or automatically after a sync.
 *
 * The optional `dek` is captured by the caller (which still has request
 * scope) so the background run doesn't depend on request-scoped auth after
 * the originating response completes.
 *
 * Synchronous up to session registration: callers can fire-and-forget and
 * the run stays visible. Returns 'started' or 'already-running'.
 */
export function startAiAnalysis(
  userId: string,
  opts?: { dek?: Uint8Array },
): 'started' | 'already-running' {
  if (activeAnalysisSessions.has(userId)) {
    return 'already-running';
  }

  const abortController = new AbortController();
  activeAnalysisSessions.set(userId, {
    abortController,
    timeoutId: null,
    processedCount: 0,
    totalCount: null,
    status: 'running',
    log: [],
    startedAt: Date.now(),
  });

  // Background run — never awaited by the caller to avoid HTTP timeouts.
  analyzeUncategorized(
    userId,
    (processedCount, totalCount) => {
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.processedCount = processedCount;
        existing.totalCount = totalCount;
      }
    },
    (message) => {
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.log.push(message);
        if (existing.log.length > 50) {
          existing.log = existing.log.slice(-50);
        }
      }
    },
    abortController,
    opts?.dek,
  )
    .then((result) => {
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'completed';
        existing.processedCount = existing.totalCount ?? 0;
        existing.proposalsCreated = result.proposalsCreated;
        existing.autoApproved = result.autoApproved;
      }
      if (result.errors.length > 0) {
        logger.warn(`${LOG_TAG} Analysis finished with errors`, { userId, errors: result.errors });
      } else {
        logger.info(`${LOG_TAG} Analysis completed`, {
          userId,
          proposalsCreated: result.proposalsCreated,
          autoApproved: result.autoApproved,
        });
      }
    })
    .catch((error) => {
      logger.error(`${LOG_TAG} Analysis failed`, { userId, error: String(error) });
      const existing = activeAnalysisSessions.get(userId);
      if (existing) {
        existing.status = 'error';
        existing.error = error instanceof Error ? error.message : String(error);
        existing.log.push(`Error: ${existing.error}`);
      }
    })
    .finally(() => {
      setTimeout(() => {
        activeAnalysisSessions.delete(userId);
      }, 30000); // Retain status for 30s to allow frontend polling to read the final state
    });

  return 'started';
}
