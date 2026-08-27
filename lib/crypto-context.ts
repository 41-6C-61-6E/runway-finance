import { auth } from '@/lib/auth';
import { enterDekFallbackContext, getServerKey, unwrapKey, type DekFallbackContext } from '@/lib/crypto';
import { getDb } from '@/lib/db';
import { dekVersions, userEncryptionKeys } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const DEK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedDEKEntry {
  dek: Uint8Array;
  householdId: string;
  fallbackDeks: Uint8Array[];
  expiresAt: number;
}

const globalForDEKCache = globalThis as unknown as {
  userDEKCache?: Map<string, CachedDEKEntry>;
};

const userDEKCache = globalForDEKCache.userDEKCache ?? new Map<string, CachedDEKEntry>();

if (process.env.NODE_ENV !== 'production') {
  globalForDEKCache.userDEKCache = userDEKCache;
}

export function invalidateUserDEKCache(userId?: string): void {
  if (userId) {
    userDEKCache.delete(userId);
  } else {
    userDEKCache.clear();
  }
}

// Get the DEK for the current authenticated user
export async function getSessionDEK(): Promise<Uint8Array> {
  // SECURITY (H-2, 2026-08-27 security review): TEST_DEK_HEX lets tests
  // substitute a fixed DEK, but if it ever reached a deployed environment it
  // would make EVERY user read/write with the same key (cross-user exposure).
  // It is therefore honored ONLY in test processes; in any other environment
  // its mere presence is a misconfiguration and fails closed.
  const inTestProcess = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (process.env.TEST_DEK_HEX) {
    if (!inTestProcess) {
      logger.error('[crypto-context] FATAL: TEST_DEK_HEX is set outside a test process. Refusing to start key resolution.');
      throw new Error('TEST_DEK_HEX may only be set in a test environment (VITEST=true or NODE_ENV=test)');
    }
    return hexToBytes(process.env.TEST_DEK_HEX);
  }
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('No encryption key available — user may not be authenticated');
  }
  return getServerDEK(userId);
}

// Load the household's older DEKs (newest first), excluding the current DEK.
// Never throws: on any failure the caller falls back to no fallbacks.
async function loadHouseholdFallbackDeks(householdId: string, currentDek: Uint8Array): Promise<Uint8Array[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(dekVersions)
      .where(eq(dekVersions.primaryUserId, householdId))
      .orderBy(desc(dekVersions.version));

    const serverKey = getServerKey();
    const fallbackDeks: Uint8Array[] = [];
    for (const row of rows) {
      const dek = await unwrapKey(
        {
          ciphertext: row.dekWrappedServer,
          iv: row.wrappingIv,
          tag: row.wrappingTag ?? '',
        },
        serverKey,
      );
      if (!bytesEqual(dek, currentDek)) {
        fallbackDeks.push(dek);
      }
    }
    return fallbackDeks;
  } catch (err) {
    logger.warn('[crypto-context] Failed to load household DEK fallbacks', {
      householdId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// Get a user's DEK via the server recovery key (for cron sync / admin operations)
export async function getServerDEK(userId: string): Promise<Uint8Array> {
  // Anchor the fallback context in the caller's async execution before any
  // await: Node 20 does not reliably propagate a store entered after an
  // await in an async function, so the context is created empty, entered
  // synchronously, and filled once the fallbacks are loaded.
  const fallbackCtx: DekFallbackContext = { fallbackDeks: [] };
  enterDekFallbackContext(fallbackCtx);

  const cached = userDEKCache.get(userId);
  const cacheValid = !!cached && Date.now() < cached.expiresAt;

  let dek: Uint8Array;
  let fallbackDeks: Uint8Array[];

  if (cacheValid && cached) {
    dek = cached.dek;
    fallbackDeks = cached.fallbackDeks;
  } else {
    userDEKCache.delete(userId);

    const db = getDb();
    const [keyRow] = await db
      .select()
      .from(userEncryptionKeys)
      .where(eq(userEncryptionKeys.userId, userId))
      .limit(1);

    if (!keyRow) {
      throw new Error(`No encryption keys found for user: ${userId}`);
    }

    const serverKey = getServerKey();

    if (!keyRow.serverWrappedDek || !keyRow.serverWrappingIv) {
      throw new Error(
        `No server-wrapped encryption key found for user ${userId} — ` +
        `serverWrappedDek=${!!keyRow.serverWrappedDek}, ` +
        `serverWrappingIv=${!!keyRow.serverWrappingIv}, ` +
        `serverWrappingTag=${!!keyRow.serverWrappingTag}, ` +
        `wrappedDek=${!!keyRow.wrappedDek}, ` +
        `salt=${!!keyRow.salt}`
      );
    }

    dek = await unwrapKey(
      {
        ciphertext: keyRow.serverWrappedDek,
        iv: keyRow.serverWrappingIv,
        tag: keyRow.serverWrappingTag ?? '',
      },
      serverKey,
    );

    const householdId = keyRow.primaryUserId ?? userId;
    fallbackDeks = await loadHouseholdFallbackDeks(householdId, dek);
    userDEKCache.set(userId, {
      dek,
      householdId,
      fallbackDeks,
      expiresAt: Date.now() + DEK_CACHE_TTL_MS,
    });
  }

  fallbackCtx.fallbackDeks = fallbackDeks;
  return dek;
}
