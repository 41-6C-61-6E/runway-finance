import 'server-only';
import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, userSettings, userNotifications } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import webpush from 'web-push';

// Initialize web-push if VAPID keys are available in process.env
const cleanEnv = (val?: string) => {
  if (!val) return val;
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

let isInitialized = false;

function ensureVapidInitialized(): boolean {
  if (isInitialized) return true;
  const publicKey = cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
  const subject = cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@example.com';

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      isInitialized = true;
      logger.info('[notifications-service] VAPID details initialized successfully');
    } catch (err) {
      logger.error('[notifications-service] Failed to set VAPID details:', err);
    }
  }
  return isInitialized;
}

export type PushResult = { sent: boolean; reason?: string };

/**
 * Notification types that warrant high-urgency push delivery.
 * Explicit set instead of string-matching so new types are opt-in (fixes F3.8).
 */
const URGENT_PUSH_TYPES = new Set([
  'budget_alert',
  'sync_error',
  'large_transaction',
  'custom_balance_alert',
]);

/**
 * Inserts a row into the in-app notification inbox. Returns the new row's id,
 * or undefined if the insert failed.
 */
async function insertInboxNotification(
  userId: string,
  title: string,
  body: string,
  urlPath: string | undefined,
  type: string
): Promise<string | undefined> {
  try {
    const db = getDb();
    const [newNotif] = await db
      .insert(userNotifications)
      .values({
        userId,
        title,
        body,
        urlPath: urlPath || '/',
        type,
      })
      .returning({ id: userNotifications.id });
    return newNotif?.id;
  } catch (dbErr) {
    logger.error('[notifications-service] Failed to save in-app notification to DB:', dbErr);
    return undefined;
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  urlPath?: string,
  type: string = 'generic',
  key?: string
): Promise<PushResult> {
  const db = getDb();

  const finalKey = key || `generic:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;

  // 1. Atomic rate-limit + dedup insert (fixes F3.1 TOCTOU race).
  let maxNotifications = 5;
  let periodMinutes = 60;

  try {
    const [settings] = await db
      .select({
        maxNotificationsPerPeriod: userSettings.maxNotificationsPerPeriod,
        notificationLimiterPeriodMinutes: userSettings.notificationLimiterPeriodMinutes,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    maxNotifications = settings?.maxNotificationsPerPeriod ?? 5;
    periodMinutes = settings?.notificationLimiterPeriodMinutes ?? 60;
    const limiterExempt = type === 'test';

    const limiterClause = limiterExempt
      ? sql`true`
      : sql`(SELECT count(*) FROM sent_notifications
             WHERE user_id = ${userId}
               AND type <> 'test'
               AND sent_at > now() - make_interval(mins => ${periodMinutes})) < ${maxNotifications}`;

    const result: any = await db.execute(
      sql`INSERT INTO sent_notifications (user_id, type, key)
          SELECT ${userId}, ${type}, ${finalKey}
          WHERE ${limiterClause}
          ON CONFLICT (user_id, key) DO NOTHING
          RETURNING id`
    );
    const insertedRows: Array<{ id: string }> = Array.isArray(result) ? result : (result?.rows ?? []);

    if (insertedRows.length === 0) {
      let isDedupHit = false;
      try {
        const [existing] = await db
          .select({ id: sentNotifications.id })
          .from(sentNotifications)
          .where(and(eq(sentNotifications.userId, userId), eq(sentNotifications.key, finalKey)))
          .limit(1);
        isDedupHit = !!existing;
      } catch (lookupErr) {
        logger.error('[notifications-service] Dedup disambiguation lookup failed:', lookupErr);
        isDedupHit = true;
      }

      if (isDedupHit) {
        logger.debug('[notifications-service] Duplicate notification suppressed.', { key: finalKey });
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }

      logger.warn('[notifications-service] Rate limit exceeded. Push suppressed; saving in-app notification only.', {
        userId,
        maxNotifications,
        periodMinutes,
      });
      await insertInboxNotification(userId, title, body, urlPath, type);
      return { sent: false, reason: 'Rate limit exceeded.' };
    }
  } catch (err) {
    logger.error('[notifications-service] Atomic limiter insert failed, falling back to dedup-only insert:', err);
    try {
      const inserted = await db
        .insert(sentNotifications)
        .values({
          userId,
          type,
          key: finalKey,
        })
        .onConflictDoNothing({ target: [sentNotifications.userId, sentNotifications.key] })
        .returning({ id: sentNotifications.id });

      if (key && inserted.length === 0) {
        logger.debug('[notifications-service] Duplicate notification suppressed.', { key });
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }
    } catch (fallbackErr) {
      logger.error('[notifications-service] Error logging sent notification / dedup check:', fallbackErr);
      if (key) {
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }
    }
  }

  // 2. Save notification to userNotifications inbox table
  const dbNotificationId = await insertInboxNotification(userId, title, body, urlPath, type);

  // 4. Send push notification to all active devices (if configured)
  if (!ensureVapidInitialized()) {
    logger.warn('[notifications-service] VAPID keys missing. Saved in-app notification only.');
    return { sent: true, reason: 'VAPID keys not configured. Saved in-app only.' };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) {
    logger.info('[notifications-service] No push subscriptions found. Saved in-app notification.');
    return { sent: true, reason: 'No registered push devices. Saved in-app only.' };
  }

  const payload = JSON.stringify({
    id: dbNotificationId,
    title,
    body,
    url: urlPath || '/',
    tag: dbNotificationId || type,
  });

  const isUrgent = URGENT_PUSH_TYPES.has(type);
  const pushOptions = {
    TTL: 86400, // 24 hours
    urgency: isUrgent ? ('high' as const) : ('normal' as const),
  };

  let sentSuccessfully = false;

  const promises = subs.map(async (sub) => {
    try {
      const keys = sub.keys as { p256dh: string; auth: string };
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      };

      const timeoutMs = 10000;
      const pushPromise = webpush.sendNotification(pushSubscription, payload, pushOptions);
      await Promise.race([
        pushPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Push notification timed out')), timeoutMs)
        ),
      ]);
      sentSuccessfully = true;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 403) {
        logger.info('[notifications-service] Deleting expired/invalid push subscription', {
          id: sub.id,
          endpoint: sub.endpoint ? `${sub.endpoint.slice(0, 40)}…(redacted)` : undefined,
          statusCode: err.statusCode,
        });
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        logger.error('[notifications-service] Error sending push notification', {
          endpoint: sub.endpoint ? `${sub.endpoint.slice(0, 40)}…(redacted)` : undefined,
          error: String(err),
        });
      }
    }
  });

  await Promise.all(promises);

  if (sentSuccessfully) {
    return { sent: true };
  }

  return { sent: true, reason: 'All push subscription endpoints failed/expired. Saved in-app only.' };
}

/**
 * Deletes sent_notifications rows older than the retention window (R3).
 */
export async function pruneSentNotifications(retentionDays = 90): Promise<number> {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result: any = await db.execute(
      sql`DELETE FROM sent_notifications WHERE sent_at < ${cutoff} RETURNING id`
    );
    const rows: Array<{ id: string }> = Array.isArray(result) ? result : (result?.rows ?? []);
    if (rows.length > 0) {
      logger.info('[notifications-service] Pruned old sent_notifications rows', {
        count: rows.length,
        retentionDays,
      });
    }
    return rows.length;
  } catch (err) {
    logger.error('[notifications-service] Error pruning sent notifications:', err);
    return 0;
  }
}

