import { auth } from '@/lib/auth';
import { getServerKey, unwrapKey } from '@/lib/crypto';
import { getDb } from '@/lib/db';
import { userEncryptionKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

// Get the DEK for the current authenticated user (from JWT session)
export async function getSessionDEK(): Promise<Uint8Array> {
  const session = await auth();
  const dekHex = (session?.user as Record<string, unknown> | undefined)?.dek;
  if (!dekHex || typeof dekHex !== 'string') {
    throw new Error('No encryption key available — user may not be authenticated');
  }
  return hexToBytes(dekHex);
}

// Get a user's DEK via the server recovery key (for cron sync / admin operations)
export async function getServerDEK(userId: string): Promise<Uint8Array> {
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

  if (keyRow.serverWrappedDek && keyRow.serverWrappingIv && keyRow.serverWrappingTag) {
    return unwrapKey(
      {
        ciphertext: keyRow.serverWrappedDek,
        iv: keyRow.serverWrappingIv,
        tag: keyRow.serverWrappingTag,
      },
      serverKey,
    );
  }

  // Fallback: if no server-wrapped DEK exists, try the password-wrapped DEK
  // This handles existing users before server re-wrap
  return unwrapKey(
    {
      ciphertext: keyRow.wrappedDek,
      iv: keyRow.wrappingIv,
      tag: keyRow.wrappingTag,
    },
    serverKey,
  );
}
