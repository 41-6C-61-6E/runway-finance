import { DEFAULT_TEST_PROMPT } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { fetchSecure, validateEndpointUrl } from '@/lib/utils/ssrf';
import { extractJsonObject, isJsonFormatRejection } from '@/lib/services/ai-categorizer';
import {
  normalizeEndpoint,
  buildChatUrl,
  buildModelsUrl,
  usesV1BasePath,
  isOpenRouterEndpoint,
  buildModelParams,
} from '@/lib/ai/endpoints';

// Re-exported so existing import sites keep working.
export {
  normalizeEndpoint,
  buildChatUrl,
  buildModelsUrl,
  usesV1BasePath,
  isOpenRouterEndpoint,
  MAX_FALLBACK_MODELS,
  sanitizeFallbacks,
  parseStoredFallbacks,
  buildModelParams,
} from '@/lib/ai/endpoints';

export const TEST_TIMEOUT_MS = 45_000;
export const MODELS_TIMEOUT_MS = 15_000;

/**
 * Hint when the user pasted an Open WebUI management-API base (`.../api/v1`
 * or `.../v1`). Open WebUI's OpenAI-compatible chat lives at
 * `POST {base}/api/chat/completions`, while `/api/v1/*` is the management
 * API and returns `405 {"detail":"Method Not Allowed"}` for chat posts.
 * Skipped for hosts where `/v1` is correct (OpenRouter, OpenAI).
 */
export function openWebUIBaseHint(endpoint: string): string | null {
  if (usesV1BasePath(endpoint)) {
    return null;
  }
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
  prompt?: string;
  timeoutMs?: number;
  /** OpenRouter failover list; ignored by other backends. */
  fallbacks?: string[];
  /**
   * When true (default prompt), the response is validated as JSON the same
   * way production parsing does — the test then proves the model can do the
   * actual categorization task, not just chat. Skipped for custom prompts
   * whose shape is unknown.
   */
  expectJson?: boolean;
};

export type TestChatResult = {
  ok: boolean;
  message: string;
  response?: string;
};

/**
 * Single shared chat-completion test used by every test path so the Test
 * button exercises the same request shape as production (no `chat_id`,
 * `temperature: 0.1`, automatic JSON mode with plain fallback, `fetchSecure`
 * so redirects are followed and SSRF-checked on every hop).
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
  const modelParams = buildModelParams(endpoint, model, args.fallbacks);
  logger.info('Testing AI connection', { endpoint, model, fallbacks: 'models' in modelParams ? (modelParams.models as string[]).slice(1) : [], hasKey: !!args.apiKey });

  const baseBody: Record<string, unknown> = {
    ...modelParams,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Respond directly and quickly.' },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    // OpenRouter supports the `reasoning` parameter (see callAiApi).
    ...(isOpenRouterEndpoint(endpoint) ? { reasoning: { enabled: true } } : {}),
  };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (args.apiKey) {
      headers['Authorization'] = `Bearer ${args.apiKey}`;
    }

    // Smart JSON mode (mirrors production): try constrained JSON first,
    // fall back to plain when the server rejects `response_format`.
    let res: Response | null = null;
    let elapsed = 0;
    let usedJsonMode = false;
    let lastDetail = '';
    for (const useJsonFormat of [true, false]) {
      const body: Record<string, unknown> = { ...baseBody };
      if (useJsonFormat) {
        body.response_format = { type: 'json_object' };
      }
      const startTime = Date.now();
      const attempt = await fetchSecure(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeoutMs,
      });
      elapsed = Date.now() - startTime;

      if (attempt.ok) {
        res = attempt;
        usedJsonMode = useJsonFormat;
        break;
      }
      const text = await attempt.text();
      let detail = text.slice(0, 500);
      try {
        const json = JSON.parse(text);
        const raw = json.error?.message ?? json.error ?? json.message ?? json.detail ?? detail;
        detail = typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 500);
      } catch {
        /* keep raw text */
      }
      if (useJsonFormat && attempt.status === 400 && isJsonFormatRejection(detail)) {
        logger.info('Test connection: server rejected response_format, retrying without JSON mode', { endpoint });
        lastDetail = detail;
        continue;
      }
      res = attempt;
      lastDetail = detail;
      break;
    }
    if (!res) {
      return { ok: false, message: `Connection failed: ${lastDetail || 'no response'}` };
    }
    const detail = lastDetail;

    if (!res.ok) {

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
    const servedBy = typeof data?.model === 'string' && data.model && data.model !== model
      ? ` served by ${data.model}`
      : '';

    // Mirror the real task: the default prompt demands JSON, so prove the
    // model returns parseable JSON rather than just connected chat.
    const modeNote = usedJsonMode ? ' (JSON mode)' : ' (plain mode)';
    if (args.expectJson !== false) {
      const check = validateTestJson(responseContent);
      if (!check.ok) {
        return {
          ok: false,
          message: `Connected${modeNote}, but the model did not return valid JSON (categorization needs JSON). Preview: ${check.preview} Try a model that follows JSON instructions.`,
          response: responseContent,
        };
      }
      return {
        ok: true,
        message: `Connected to ${model} at ${endpoint} (${elapsed}ms) — valid JSON returned${modeNote}${servedBy}`,
        response: responseContent,
      };
    }

    return {
      ok: true,
      message: `Connected to ${model} at ${endpoint} (${elapsed}ms)${modeNote}${servedBy}`,
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

/**
 * Validate a test response as JSON using the same extraction production
 * parsing uses (think-tag stripping, fences, balanced-object fallback).
 */
function validateTestJson(text: string): { ok: boolean; preview: string } {
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
  let candidate = stripped;
  const fence = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    candidate = fence[1];
  } else {
    const extracted = extractJsonObject(stripped);
    if (extracted) {
      candidate = extracted;
    }
  }
  try {
    JSON.parse(candidate);
    return { ok: true, preview: '' };
  } catch {
    return { ok: false, preview: stripped.slice(0, 200) || '(empty response)' };
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
