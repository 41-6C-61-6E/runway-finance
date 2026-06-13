import { getDb } from '@/lib/db';
import { paystubAutoGenerateSettings } from '@/lib/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { runAutoGenerate } from '@/lib/services/paystub-auto-generate';
import { logger } from '@/lib/logger';

const LOG_TAG = '[paystub-auto-generate-scheduler]';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

class PaystubAutoGenerateScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(): Promise<void> {
    this._isRunning = true;
    logger.info(`${LOG_TAG} Scheduler initialized`);
    await this.execute();
  }

  private scheduleCheck(): void {
    this.timer = setTimeout(() => this.execute(), CHECK_INTERVAL_MS);
  }

  private async execute(): Promise<void> {
    this.timer = null;

    try {
      const db = getDb();

      // Find all users with enabled auto-generate settings that have a base paystub
      const userIds = await db
        .selectDistinct({ userId: paystubAutoGenerateSettings.userId })
        .from(paystubAutoGenerateSettings)
        .where(
          and(
            eq(paystubAutoGenerateSettings.isEnabled, true),
            isNotNull(paystubAutoGenerateSettings.basePaystubId),
          )
        )
        .then(rows => rows.map(r => r.userId));

      if (userIds.length === 0) {
        logger.debug(`${LOG_TAG} No users with enabled auto-generate settings`);
        this.scheduleCheck();
        return;
      }

      let totalGenerated = 0;

      for (const userId of userIds) {
        try {
          const dek = await getServerDEK(userId);
          const count = await runAutoGenerate(userId, dek);
          totalGenerated += count;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('No encryption keys') || msg.includes('No server-wrapped')) {
            logger.warn(`${LOG_TAG} Skipping user — ${msg}`, { userId });
          } else {
            logger.error(`${LOG_TAG} Failed for user`, { userId, error: msg });
          }
        }
      }

      if (totalGenerated > 0) {
        logger.info(`${LOG_TAG} Generated ${totalGenerated} paystubs across ${userIds.length} users`);
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Check cycle failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.scheduleCheck();
  }

  shutdown(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._isRunning = false;
    logger.info(`${LOG_TAG} Scheduler shut down`);
  }
}

export const paystubAutoGenerateScheduler = new PaystubAutoGenerateScheduler();
