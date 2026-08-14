import { auth } from '@/lib/auth';
import { getServerKey, unwrapKey } from '@/lib/crypto';
import { getDb } from '@/lib/db';
import { userEncryptionKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

const DEK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedDEKEntry {
  dek: Uint8Array;
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
  if (process.env.TEST_DEK_HEX) {
    return hexToBytes(process.env.TEST_DEK_HEX);
  }
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('No encryption key available — user may not be authenticated');
  }
  return getServerDEK(userId);
}

// Get a user's DEK via the server recovery key (for cron sync / admin operations)
export async function getServerDEK(userId: string): Promise<Uint8Array> {
  const cached = userDEKCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.dek;
  }

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

  if (keyRow.serverWrappedDek && keyRow.serverWrappingIv) {
    const dek = await unwrapKey(
      {
        ciphertext: keyRow.serverWrappedDek,
        iv: keyRow.serverWrappingIv,
        tag: keyRow.serverWrappingTag ?? '',
      },
      serverKey,
    );
    userDEKCache.set(userId, { dek, expiresAt: Date.now() + DEK_CACHE_TTL_MS });
    return dek;
  }

  throw new Error(
    `No server-wrapped encryption key found for user ${userId} — ` +
    `serverWrappedDek=${!!keyRow.serverWrappedDek}, ` +
    `serverWrappingIv=${!!keyRow.serverWrappingIv}, ` +
    `serverWrappingTag=${!!keyRow.serverWrappingTag}, ` +
    `wrappedDek=${!!keyRow.wrappedDek}, ` +
    `salt=${!!keyRow.salt}`
  );
}
