import { getDb } from '@/lib/db';
import { aiProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveDataUserId } from '@/lib/sharing';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { fetchSecure } from '@/lib/utils/ssrf';
import {
  normalizeEndpoint,
  buildChatUrl,
  isOpenRouterEndpoint,
  parseStoredFallbacks,
  buildModelParams,
} from '@/lib/ai/endpoints';
import { extractStreamChunk, createThinkStripper } from '@/lib/ai/stream';

export type ResolvedProvider = {
  providerId: string;
  endpoint: string;          // normalized
  model: string;             // primary
  fallbacks: string[];       // parseStoredFallbacks
  apiKey: string;            // decrypted, never logged
  host: string;              // URL hostname, for disclosure UI
  isOpenRouter: boolean;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'meta'; servedModel?: string }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number };

export class AiClientError extends Error {
  code:
    | 'provider_rate_limited'
    | 'provider_auth'
    | 'provider_not_found'
    | 'provider_error'
    | 'timeout'
    | 'empty_response';
  status?: number;
  detail?: string;

  constructor(
    code: AiClientError['code'],
    message: string,
    options?: { status?: number; detail?: string; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AiClientError';
    this.code = code;
    this.status = options?.status;
    this.detail = options?.detail;
  }
}

/**
 * Own provider → household provider → null.
 * Runs seedUserAiProviders first to enforce deployment-wide env providers.
 */
export async function resolveAiProvider(userId: string, dek: Uint8Array): Promise<ResolvedProvider | null> {
  const db = getDb();
  const dataUserId = await resolveDataUserId(userId);

  // Enforce deployment-wide provider (env vars win over saved settings)
  try {
    const { seedUserAiProviders } = await import('@/lib/db/seed-ai-providers');
    await seedUserAiProviders(userId, dek);
  } catch (err) {
    logger.warn('[ai-client] Failed to enforce env AI provider', { userId, error: String(err) });
  }

  const pickProvider = (rows: typeof aiProviders.$inferSelect[]) =>
    rows.find((r) => r.isActive) ?? rows[0];

  const ownProviderRows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, userId))
    .limit(10);

  let activeProvider = pickProvider(ownProviderRows);

  if (!activeProvider && dataUserId !== userId) {
    const householdProviderRows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.userId, dataUserId))
      .limit(10);
    activeProvider = pickProvider(householdProviderRows);
  }

  if (!activeProvider) {
    return null;
  }

  const endpoint = normalizeEndpoint(activeProvider.endpoint);
  let host = '';
  try {
    host = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`).hostname;
  } catch {
    host = endpoint;
  }

  let apiKey = '';
  if (activeProvider.apiKeyEncrypted) {
    try {
      apiKey = await decryptField(activeProvider.apiKeyEncrypted, dek);
    } catch (err) {
      logger.error('[ai-client] Failed to decrypt provider API key', { providerId: activeProvider.id, error: String(err) });
    }
  }

  return {
    providerId: activeProvider.id,
    endpoint,
    model: activeProvider.model,
    fallbacks: parseStoredFallbacks(activeProvider.fallbackModels),
    apiKey,
    host,
    isOpenRouter: isOpenRouterEndpoint(endpoint),
  };
}

/**
 * Streaming chat completion. Yields answer text only (reasoning removed).
 */
export async function* streamChat(args: {
  provider: ResolvedProvider;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { provider, messages, temperature = 0.3, maxTokens = 1200, signal } = args;
  const url = buildChatUrl(provider.endpoint);

  const modelParams = buildModelParams(provider.endpoint, provider.model, provider.fallbacks);
  const body: Record<string, any> = {
    ...modelParams,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    ...(provider.isOpenRouter
      ? { reasoning: { exclude: true } }
      : { enable_thinking: false }),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const MAX_RETRIES = 2;
  let response: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      response = await fetchSecure(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;

        if (isRetryable && attempt < MAX_RETRIES && !signal?.aborted) {
          let delay = Math.pow(2, attempt) * 1000;
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const sec = parseInt(retryAfter, 10);
            if (!isNaN(sec) && sec > 0 && sec <= 10) {
              delay = sec * 1000;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Map status code to AiClientError
        const safeSnippet = text.replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]').slice(0, 300);
        if (response.status === 429) {
          throw new AiClientError('provider_rate_limited', 'AI provider rate limit reached', {
            status: 429,
            detail: safeSnippet,
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new AiClientError('provider_auth', 'AI provider authentication failed', {
            status: response.status,
            detail: safeSnippet,
          });
        }
        if (response.status === 404) {
          throw new AiClientError('provider_not_found', 'AI provider model or endpoint not found', {
            status: 404,
            detail: safeSnippet,
          });
        }
        throw new AiClientError('provider_error', `AI provider error (${response.status})`, {
          status: response.status,
          detail: safeSnippet,
        });
      }

      // Success opening connection
      break;
    } catch (err) {
      if (err instanceof AiClientError || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Network error before response received
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const isTimeout = err instanceof Error && /timeout|abort/i.test(err.name);
      if (isTimeout) {
        throw new AiClientError('timeout', 'AI request timed out', { cause: err });
      }
      throw new AiClientError('provider_error', `AI network error: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
  }

  if (!response || !response.ok) {
    throw new AiClientError('provider_error', 'AI request failed');
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Non-streaming JSON response fallback
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (typeof data?.model === 'string' && data.model) {
      yield { type: 'meta', servedModel: data.model };
    }
    if (data?.usage) {
      yield {
        type: 'usage',
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      };
    }

    const msg = data.choices?.[0]?.message;
    const direct =
      (typeof msg?.content === 'string' && msg.content) ||
      extractStreamChunk(data).completedText ||
      '';

    const stripper = createThinkStripper();
    const stripped = stripper.process(direct) + stripper.flush();

    if (!stripped.trim()) {
      throw new AiClientError('empty_response', 'AI provider returned an empty response');
    }

    yield { type: 'text', text: stripped };
    return;
  }

  // SSE streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AiClientError('provider_error', 'Response body is not readable');
  }

  const decoder = new TextDecoder();
  const stripper = createThinkStripper();
  let buffer = '';
  let hasYieldedText = false;
  let completedSnapshot = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr);
          if (typeof chunk?.model === 'string' && chunk.model) {
            yield { type: 'meta', servedModel: chunk.model };
          }
          if (chunk?.usage) {
            yield {
              type: 'usage',
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
            };
          }

          const { text, completedText } = extractStreamChunk(chunk);
          if (completedText) {
            completedSnapshot += completedText;
          }

          if (text) {
            const cleanText = stripper.process(text);
            if (cleanText) {
              hasYieldedText = true;
              yield { type: 'text', text: cleanText };
            }
          }
        } catch {
          // Ignore malformed SSE chunk lines
        }
      }
    }

    const finalClean = stripper.flush();
    if (finalClean) {
      hasYieldedText = true;
      yield { type: 'text', text: finalClean };
    }

    if (!hasYieldedText && completedSnapshot) {
      const snapshotStripper = createThinkStripper();
      const snapshotClean = snapshotStripper.process(completedSnapshot) + snapshotStripper.flush();
      if (snapshotClean) {
        hasYieldedText = true;
        yield { type: 'text', text: snapshotClean };
      }
    }

    if (!hasYieldedText) {
      throw new AiClientError('empty_response', 'AI provider returned an empty response');
    }
  } finally {
    reader.releaseLock();
  }
}
