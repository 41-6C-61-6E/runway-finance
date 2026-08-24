import { getDb } from '@/lib/db';
import { holdings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';

const LOG_TAG = '[api-investments-holding-overrides]';

/**
 * Validate a user-supplied ticker-style identifier (fund ticker or public
 * ETF equivalent). Accepts 1–12 uppercase letters/digits and the standard
 * suffix characters (. - =), matching the pattern used elsewhere in the
 * app (account-history `isValidTicker`).
 */
export function isValidIdentifier(value: string): boolean {
  const clean = value.trim().toUpperCase();
  if (clean.length === 0 || clean.length > 12) return false;
  return /^[A-Z0-9.=\-]+$/.test(clean);
}

/**
 * Persist user-set display/price-override identifiers for a security.
 *
 * Updates apply to ALL account rows for the security (the same fund held
 * across accounts), scoped to the given user. Values are stored encrypted
 * at rest like all other holding fields.
 *
 * @param securityId     Plaid security id of the holding
 * @param userId         data-owner user id
 * @param tickerOverride  '' clears the value, a ticker sets it, `undefined`
 *            leaves the current DB value untouched.
 * @param publicEquivalent  same three-state semantics as `tickerOverride`.
 */
export async function updateHoldingOverrides(
  securityId: string,
  userId: string,
  tickerOverride: string | undefined,
  publicEquivalent: string | undefined,
): Promise<void> {
  const dek = await getSessionDEK();

  const set: Record<string, unknown> = { updatedAt: new Date() };

  // Three-state per field:
  //   undefined → omit from the UPDATE (keep the current DB value)
  //   ''        → write NULL (explicit clear)
  //   other     → write the encrypted value
  // NOTE: the "clear" case must be `null`, not `undefined` — Drizzle omits
  // `undefined` columns from the generated UPDATE, which would silently keep
  // the previous value.
  const toEncryptedOrNull = async (val: string) => {
    const trimmed = val.trim();
    return trimmed.length === 0
      ? null
      : encryptField(trimmed.toUpperCase(), dek);
  };
  if (tickerOverride !== undefined) {
    set.tickerOverride = await toEncryptedOrNull(tickerOverride);
  }
  if (publicEquivalent !== undefined) {
    set.publicEquivalent = await toEncryptedOrNull(publicEquivalent);
  }

  const updated = await getDb()
    .update(holdings)
    .set(set)
    .where(and(eq(holdings.userId, userId), eq(holdings.securityId, securityId)))
    .returning({ id: holdings.id });

  if (updated.length === 0) {
    // The holding may have been orphaned/cleaned by a sync since the client
    // opened the drawer. Distinguish "not found" from transient errors so the
    // UI can surface a meaningful message.
    throw new Error('holding_not_found');
  }

  logger.info(`${LOG_TAG} Updated overrides for security`, {
    securityId,
    overrideSent: tickerOverride !== undefined,
    equivalentSent: publicEquivalent !== undefined,
    rows: updated.length,
  });
}

/**
 * Resolve the effective display ticker for a holding:
 * user override (if set and valid) → Plaid-reported ticker →
 * user-assigned public equivalent (so a fund without a ticker can still
 * resolve to a live price) → null.
 */
export function resolveDisplayTicker(
  ticker: string | null | undefined,
  tickerOverride: string | null | undefined,
  publicEquivalent?: string | null | undefined,
): string | null {
  const override = (tickerOverride ?? '').trim().toUpperCase();
  if (override && isValidIdentifier(override)) return override;
  const t = (ticker ?? '').trim().toUpperCase();
  if (t) return t;
  const eq = (publicEquivalent ?? '').trim().toUpperCase();
  if (eq && isValidIdentifier(eq)) return eq;
  return null;
}

/** Decrypt a possibly-missing override field (never throws on null/empty). */
export async function decryptOverrideField(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const dek = await getSessionDEK();
  try {
    const plain = await decryptField(value, dek);
    const clean = plain.trim().toUpperCase();
    return clean.length > 0 ? clean : null;
  } catch (err) {
    logger.warn(`${LOG_TAG} Failed to decrypt override field`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
