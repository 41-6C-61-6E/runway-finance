import { getDb } from '@/lib/db';
import { aiProviders, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { decryptField, encryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

/**
 * Read optional environment variables to define a default AI provider
 * that will be auto-seeded for every user.
 *
 * Env vars (all optional, all must be present to create a provider):
 *   AI_PROVIDER_NAME        — Display name (e.g. "OpenAI", "Ollama")
 *   AI_PROVIDER_ENDPOINT    — Base URL (e.g. "https://api.openai.com/v1")
 *   AI_PROVIDER_MODEL       — Model identifier (e.g. "gpt-4o-mini")
 *   AI_PROVIDER_API_KEY     — API key (encrypted per-user)
 */
function readEnvProvider() {
  const { AI_PROVIDER_NAME, AI_PROVIDER_ENDPOINT, AI_PROVIDER_MODEL, AI_PROVIDER_API_KEY } = process.env;

  if (!AI_PROVIDER_NAME || !AI_PROVIDER_ENDPOINT || !AI_PROVIDER_MODEL || !AI_PROVIDER_API_KEY) {
    return null;
  }

  return {
    name: AI_PROVIDER_NAME,
    endpoint: AI_PROVIDER_ENDPOINT,
    model: AI_PROVIDER_MODEL,
    apiKey: AI_PROVIDER_API_KEY,
  };
}

/**
 * Ensure the env-configured AI provider exists for the given user.
 * Idempotent — skips if a provider with the same name + endpoint already exists.
 * @param dek Optional DEK for encrypting the API key. Falls back to getServerDEK if not provided.
 */
export async function seedUserAiProviders(userId: string, dek?: Uint8Array): Promise<void> {
  const envProvider = readEnvProvider();
  if (!envProvider) {
    return;
  }

  const db = getDb();

  // Check if this provider already exists for this user
  const existing = await db
    .select()
    .from(aiProviders)
    .where(
      eq(aiProviders.userId, userId)
    )
    .limit(10);

  const existingProvider = existing.find(
    (row) => row.name === envProvider.name && row.endpoint === envProvider.endpoint
  );

  if (existingProvider) {
    if (!dek) {
      dek = await getServerDEK(userId);
    }
    let existingApiKey = '';
    if (existingProvider.apiKeyEncrypted) {
      try {
        existingApiKey = await decryptField(existingProvider.apiKeyEncrypted, dek);
      } catch (err) {
        logger.error('[seed-ai-providers] Failed to decrypt existing api key', { error: String(err) });
      }
    }

    if (existingApiKey !== envProvider.apiKey || existingProvider.model !== envProvider.model) {
      logger.info('[seed-ai-providers] Updating existing provider with new env config', {
        userId,
        name: envProvider.name,
        modelChanged: existingProvider.model !== envProvider.model,
        apiKeyChanged: existingApiKey !== envProvider.apiKey,
      });

      const apiKeyEncrypted = await encryptField(envProvider.apiKey, dek);
      await db
        .update(aiProviders)
        .set({
          model: envProvider.model,
          apiKeyEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(aiProviders.id, existingProvider.id));
    }
    return;
  }

  // Deactivate any previously active providers so only one is active
  await db
    .update(aiProviders)
    .set({ isActive: false })
    .where(eq(aiProviders.userId, userId));

  // Encrypt the API key using the server-wrapped DEK
  if (!dek) {
    dek = await getServerDEK(userId);
  }
  const apiKeyEncrypted = await encryptField(envProvider.apiKey, dek);

  const [created] = await db.insert(aiProviders).values({
    userId,
    name: envProvider.name,
    endpoint: envProvider.endpoint,
    model: envProvider.model,
    apiKeyEncrypted,
    isActive: true,
  }).returning();

  await db
    .update(userSettings)
    .set({ aiActiveProviderId: created.id, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));

  logger.info('[seed-ai-providers] Seeded active provider for user', {
    userId,
    name: envProvider.name,
    endpoint: envProvider.endpoint,
    model: envProvider.model,
  });
}
