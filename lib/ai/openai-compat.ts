import { DEFAULT_TEST_PROMPT } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { fetchSecure, validateEndpointUrl } from '@/lib/utils/ssrf';

export const TEST_TIMEOUT_MS = 45_000;
export const MODELS_TIMEOUT_MS = 15_000;

/** Normalize user input: trim + strip trailing slashes. */
export function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** Build the chat-completions URL, preserving any base path (e.g. `/api`). */
export function buildChatUrl(endpoint: string): string {
  return `${normalizeEndpoint(endpoint)}/chat/completions`;
}

/** Build the models URL, preserving any base path. */
export function buildModelsUrl(endpoint: string): string {
  return `${normalizeEndpoint(endpoint)}/models`;
}

/**
 * Hint when the user pasted an Open WebUI management-API base (`.../api/v1`
 * or `.../v1`). Open WebUI's OpenAI-compatible chat lives at
 * `POST {base}/api/chat/completions`, while `/api/v1/*` is the management
 * API and returns `405 {"detail":"Method Not Allowed"}` for chat posts.
 */
export function openWebUIBaseHint(endpoint: string): string | null {
  try {
    const url = new URL(normalizeEndpoint(endpoint));
    const path = url.pathname.replace(/\/+$/, '');
    if (/(^|\/)api\/v1$/.test(path)) {
      const fixed = `${url.origin}${path.replace(/\/v1$/, '')}`;
      return `This looks like the Open WebUI management API. Use ${fixed} instead (remove the trailing /v1).`;
    }
    if (path === '/v1') {
      return 'This looks like a version-only path. For Open WebUI use https://your-host/api instead.';
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isMaskedKey(value: string): boolean {
  return /^[•*]+$/.test(value) || /\.{3}/.test(value);
}

type TestChatArgs = {
  endpoint: string;
  model: string;
  apiKey?: string;
  jsonMode?: boolean;
  prompt?: string;
  timeoutMs?: number;
};

export type TestChatResult = {
  ok: boolean;
  message: string;
  response?: string;
};

/**
 * Single shared chat-completion test used by every test path so the Test
 * button exercises the same request shape as production (no `chat_id`,
 * `temperature: 0.1`, optional `response_format`, `fetchSecure` so
 * redirects are followed and SSRF-checked on every hop).
 */
export async function testChatCompletion(args: TestChatArgs): Promise<TestChatResult> {
  const endpoint = normalizeEndpoint(args.endpoint);
  const model = (args.model || '').trim();
  const userPrompt = args.prompt || DEFAULT_TEST_PROMPT;
  const timeoutMs = args.timeoutMs ?? TEST_TIMEOUT_MS;

  if (!endpoint) {
    return { ok: false, message: 'No endpoint provided. Enter the URL and try again.' };
  }
  if (!model) {
    return { ok: false, message: 'No model provided. Pick a model from the list or type one.' };
  }

  const validated = await validateEndpointUrl(endpoint);
  if ('error' in validated) {
    return { ok: false, message: validated.error };
  }

  const targetUrl = buildChatUrl(endpoint);
  logger.info('Testing AI connection', { endpoint, model, hasKey: !!args.apiKey });

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Respond directly and quickly.' },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
  };
  if (args.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (args.apiKey) {
      headers['Authorization'] = `Bearer ${args.apiKey}`;
    }

    const startTime = Date.now();
    const res = await fetchSecure(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeoutMs,
    });
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text();
      let detail = text.slice(0, 500);
      try {
        const json = JSON.parse(text);
        const raw = json.error?.message ?? json.error ?? json.message ?? json.detail ?? detail;
        detail = typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 500);
      } catch {
        /* keep raw text */
      }

      // Open WebUI management-API base misconfiguration is the common 405.
      if (res.status === 405) {
        const hint = openWebUIBaseHint(endpoint);
        return {
          ok: false,
          message: `API returned 405 after ${elapsed}ms: ${detail}${hint ? ` ${hint}` : ' The endpoint rejected POST — check the base path (for Open WebUI use …/api, not …/api/v1).'}`,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Authentication failed (${res.status}) after ${elapsed}ms: ${detail} Check the API key.` };
      }
      if (res.status === 404) {
        return { ok: false, message: `API returned 404 after ${elapsed}ms: ${detail} Check the endpoint base path and model name.` };
      }
      if (res.status === 429) {
        return { ok: false, message: `API rate-limited (429) after ${elapsed}ms: ${detail}` };
      }
      return { ok: false, message: `API returned ${res.status} after ${elapsed}ms: ${detail}` };
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const responseContent =
      (typeof msg?.content === 'string' && msg.content) ||
      msg?.reasoning ||
      msg?.reasoning_content ||
      '(empty response)';

    return {
      ok: true,
      message: `Connected to ${model} at ${endpoint} (${elapsed}ms)`,
      response: responseContent,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    logger.error('AI connection test failed', { endpoint, error: message });

    if (/aborted|timeout|Timeout/i.test(message)) {
      return {
        ok: false,
        message: 'Request timed out. The model may still be loading (first run can take 30s+). Wait a moment and try again. For Open WebUI use the …/api base, not …/api/v1.',
      };
    }
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|Failed to fetch/i.test(message)) {
      return { ok: false, message: `Cannot reach ${endpoint}. Check that the server is running and the URL is correct.` };
    }
    if (/SSRF blocked/i.test(message)) {
      return { ok: false, message: message };
    }
    return { ok: false, message };
  }
}

type FetchModelsArgs = {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
};

/** Shared models listing: accepts OpenAI `{data:[{id}]}` and Ollama/Open WebUI shapes. */
export async function fetchModelsList(args: FetchModelsArgs): Promise<{ models?: string[]; error?: string }> {
  const endpoint = normalizeEndpoint(args.endpoint);
  if (!endpoint) {
    return { error: 'No endpoint provided' };
  }

  const validated = await validateEndpointUrl(endpoint);
  if ('error' in validated) {
    return { error: validated.error };
  }

  const targetUrl = buildModelsUrl(endpoint);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (args.apiKey) {
      headers['Authorization'] = `Bearer ${args.apiKey}`;
    }

    const res = await fetchSecure(targetUrl, {
      method: 'GET',
      headers,
      timeoutMs: args.timeoutMs ?? MODELS_TIMEOUT_MS,
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        return { error: 'Authentication failed. Check the API key.' };
      }
      return { error: `API returned status ${res.status}: ${text.slice(0, 200)}` };
    }

    const resData = await res.json();
    let models: string[] = [];
    if (resData && typeof resData === 'object') {
      if (Array.isArray(resData.data)) {
        models = resData.data.map((m: any) => m.id || m.name).filter(Boolean);
      } else if (Array.isArray(resData.models)) {
        models = resData.models.map((m: any) => m.name || m.id).filter(Boolean);
      } else if (Array.isArray(resData)) {
        models = resData.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      }
    }

    models.sort((a, b) => a.localeCompare(b));
    return { models };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch models';
    logger.error('Failed to fetch AI models', { endpoint, error: message });
    if (/aborted|timeout|Timeout/i.test(message)) {
      return { error: 'Model list timed out. Check the endpoint and try again.' };
    }
    return { error: 'Failed to fetch AI models' };
  }
}
