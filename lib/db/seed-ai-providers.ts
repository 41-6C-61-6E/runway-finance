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
 * Enforce the env-configured AI provider for the given user.
 * When the AI_PROVIDER_* env vars are set, they always win: the user's
 * single provider row is created or overwritten (endpoint, model, name)
 * so the deployment-wide provider is active for everyone. When the env
 * also provides an API key, the saved key is replaced too; when it does
 * not, the user's existing key is kept. Extra legacy rows are removed.
 * No-op when the env vars are absent/incomplete.
 * @param dek Optional DEK for encrypting the API key. Falls back to getServerDEK if not provided.
 */
export async function seedUserAiProviders(userId: string, dek?: Uint8Array): Promise<void> {
  const envProvider = readEnvProvider();
  if (!envProvider) {
    return;
  }

  const db = getDb();

  const existing = await db
    .select()
    .from(aiProviders)
    .where(
      eq(aiProviders.userId, userId)
    )
    .limit(50);

  // Encrypt the API key using the server-wrapped DEK (if apiKey is provided)
  if (!dek) {
    dek = await getServerDEK(userId);
  }

  const single = existing.find((row) => row.isActive) ?? existing[0] ?? null;

  if (!single) {
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
    return;
  }

  // Env always overrides: bring the single row in line with the deployment.
  // The API key is replaced only when the env provides one that differs
  // from the saved key; when the env omits it, the user's key is kept.
  const updates: Record<string, any> = {
    name: envProvider.name,
    endpoint: envProvider.endpoint,
    model: envProvider.model,
    isActive: true,
    updatedAt: new Date(),
  };
  let keyNeedsUpdate = false;
  if (envProvider.apiKey) {
    try {
      const current = single.apiKeyEncrypted ? await decryptField(single.apiKeyEncrypted, dek) : '';
      keyNeedsUpdate = current !== envProvider.apiKey;
    } catch {
      keyNeedsUpdate = true;
    }
    if (keyNeedsUpdate) {
      updates.apiKeyEncrypted = await encryptField(envProvider.apiKey, dek);
    }
  }

  const needsUpdate =
    single.name !== envProvider.name ||
    single.endpoint.replace(/\/+$/, '') !== envProvider.endpoint ||
    single.model !== envProvider.model ||
    single.isActive !== true ||
    keyNeedsUpdate;

  if (needsUpdate) {
    const [updated] = await db
      .update(aiProviders)
      .set(updates)
      .where(eq(aiProviders.id, single.id))
      .returning();

    await db
      .update(userSettings)
      .set({ aiActiveProviderId: updated.id, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId));

    logger.info('[seed-ai-providers] Enforced env provider for user', {
      userId,
      name: envProvider.name,
      endpoint: envProvider.endpoint,
      model: envProvider.model,
      keyReplaced: keyNeedsUpdate,
    });
  }

  // Remove legacy extra rows so only one remains.
  const extras = existing.map((r) => r.id).filter((id) => id !== single.id);
  for (const id of extras) {
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
  }
}
