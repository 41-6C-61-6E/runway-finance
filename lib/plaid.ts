import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

export async function getPlaidConfig(userId: string, dek: Uint8Array) {
  const settings = await getDb()
    .select({ apiKeys: userSettings.apiKeys })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings.length || !settings[0].apiKeys) {
    throw new Error('Plaid API credentials not configured. Please add them in Settings -> Advanced tab.');
  }

  const decrypted = await decryptField(settings[0].apiKeys, dek);
  if (!decrypted) {
    throw new Error('Plaid API credentials decryption failed.');
  }

  let keys: Record<string, string> = {};
  try {
    keys = JSON.parse(decrypted);
  } catch {
    throw new Error('Failed to parse API keys settings.');
  }

  const clientId = keys.plaidClientId;
  const secret = keys.plaidSecret;
  const env = keys.plaidEnvironment || 'sandbox';

  if (!clientId || !secret) {
    throw new Error('Plaid Client ID or Secret is missing. Please add them in Settings -> Advanced tab.');
  }

  return { clientId, secret, env };
}

export async function getPlaidClient(userId: string, dek: Uint8Array): Promise<PlaidApi> {
  const { clientId, secret, env } = await getPlaidConfig(userId, dek);

  const environment = PlaidEnvironments[env as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox;

  const configuration = new Configuration({
    basePath: environment,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
        'Plaid-Version': '2020-09-14',
      },
    },
  });

  return new PlaidApi(configuration);
}
