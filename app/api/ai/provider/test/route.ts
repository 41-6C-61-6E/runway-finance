import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProviders } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { DEFAULT_TEST_PROMPT } from '@/lib/ai/prompts';
import { isMaskedKey, testChatCompletion } from '@/lib/ai/openai-compat';
import { readEnvProvider } from '@/lib/db/seed-ai-providers';

/**
 * Test the single provider. Accepts the *unsaved* form values so the Test
 * button always exercises exactly what the user sees. Blank apiKey falls
 * back to the saved encrypted key.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; model?: string; apiKey?: string; jsonMode?: boolean; prompt?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const db = getDb();
  const dek = await getSessionDEK();
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, session.user.id))
    .orderBy(asc(aiProviders.createdAt))
    .limit(10);
  const saved = rows.find((r) => r.isActive) ?? rows[0] ?? null;

  let savedKey = '';
  if (saved?.apiKeyEncrypted) {
    try {
      savedKey = await decryptField(saved.apiKeyEncrypted, dek);
    } catch {
      /* empty */
    }
  }

  const rawKey = (body.apiKey ?? '').trim();
  const apiKey = !rawKey || isMaskedKey(rawKey) ? savedKey : rawKey;

  // When the deployment enforces a provider via env, test exactly what
  // production will use.
  const envProvider = readEnvProvider();
  const endpoint = (envProvider?.endpoint ?? body.endpoint ?? saved?.endpoint ?? '').trim();
  const model = (envProvider?.model ?? body.model ?? saved?.model ?? '').trim();
  const effectiveKey = envProvider?.apiKey ? envProvider.apiKey : apiKey;
  const jsonMode = body.jsonMode ?? saved?.jsonMode ?? false;
  const prompt = body.prompt || DEFAULT_TEST_PROMPT;

  const result = await testChatCompletion({ endpoint, model, apiKey: effectiveKey, jsonMode, prompt });
  return NextResponse.json(result);
}
