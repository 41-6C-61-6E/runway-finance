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
function cleanEnvValue(val?: string): string {
  if (!val) return '';
  let trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Read optional environment variables to define a default AI provider
 * that will be auto-seeded for every user.
 *
 * Env vars:
 *   AI_PROVIDER_NAME        — Display name (e.g. "OpenAI", "Ollama") [required]
 *   AI_PROVIDER_ENDPOINT    — Base URL (e.g. "https://api.openai.com/v1") [required]
 *   AI_PROVIDER_MODEL       — Model identifier (e.g. "gpt-4o-mini") [required]
 *   AI_PROVIDER_API_KEY     — API key (optional for local providers like Ollama)
 */
export function readEnvProvider() {
  const name = cleanEnvValue(process.env.AI_PROVIDER_NAME);
  const rawEndpoint = cleanEnvValue(process.env.AI_PROVIDER_ENDPOINT);
  const model = cleanEnvValue(process.env.AI_PROVIDER_MODEL);
  const apiKey = cleanEnvValue(process.env.AI_PROVIDER_API_KEY);

  if (!name || !rawEndpoint || !model) {
    return null;
  }

  const endpoint = rawEndpoint.replace(/\/+$/, '');

  return {
    name,
    endpoint,
    model,
    apiKey: apiKey || null,
  };
}

/**
 * Ensure the env-configured AI provider exists for the given user.
 * Idempotent — skips if a provider with the same name + endpoint already exists,
 * preserving any user customizations and manually entered API keys.
 * @param dek Optional DEK for encrypting the API key. Falls back to getServerDEK if not provided.
 */
export async function seedUserAiProviders(userId: string, dek?: Uint8Array): Promise<void> {
  const envProvider = readEnvProvider();
  if (!envProvider) {
    return;
  }

  const db = getDb();

  // Check if this provider already exists for this user (comparing normalized endpoint)
  const existing = await db
    .select()
    .from(aiProviders)
    .where(
      eq(aiProviders.userId, userId)
    )
    .limit(50);

  const existingProvider = existing.find(
    (row) => row.name === envProvider.name && row.endpoint.replace(/\/+$/, '') === envProvider.endpoint
  );

  // If already seeded or configured by user, do not overwrite their key/settings
  if (existingProvider) {
    return;
  }

  // Deactivate any previously active providers so the seeded provider is active
  await db
    .update(aiProviders)
    .set({ isActive: false })
    .where(eq(aiProviders.userId, userId));

  // Encrypt the API key using the server-wrapped DEK (if apiKey is provided)
  if (!dek) {
    dek = await getServerDEK(userId);
  }
  const apiKeyEncrypted = envProvider.apiKey ? await encryptField(envProvider.apiKey, dek) : null;

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
    hasApiKey: !!envProvider.apiKey,
  });
}
