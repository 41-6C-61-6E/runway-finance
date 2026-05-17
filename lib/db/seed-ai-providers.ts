import { getDb } from '@/lib/db';
import { aiProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
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
 */
export async function seedUserAiProviders(userId: string): Promise<void> {
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

  const alreadyExists = existing.some(
    (row) => row.name === envProvider.name && row.endpoint === envProvider.endpoint
  );

  if (alreadyExists) {
    logger.debug('[seed-ai-providers] Provider already exists for user', {
      userId,
      name: envProvider.name,
    });
    return;
  }

  // Encrypt the API key using the server-wrapped DEK
  const dek = await getServerDEK(userId);
  const apiKeyEncrypted = await encryptField(envProvider.apiKey, dek);

  await db.insert(aiProviders).values({
    userId,
    name: envProvider.name,
    endpoint: envProvider.endpoint,
    model: envProvider.model,
    apiKeyEncrypted,
    isActive: false,
  });

  logger.info('[seed-ai-providers] Seeded provider for user', {
    userId,
    name: envProvider.name,
    endpoint: envProvider.endpoint,
    model: envProvider.model,
  });
}
