/**
 * Pure endpoint/model-routing helpers. Dependency-free on purpose:
 * imported by both `lib/ai/openai-compat.ts` and
 * `lib/services/ai-categorizer.ts` (which openai-compat already imports
 * from), so this module must not import either of them.
 */

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

/** True for hosts whose OpenAI-compatible API canonically lives under `/v1` (OpenRouter, OpenAI). */
export function usesV1BasePath(endpoint: string): boolean {
  try {
    const host = new URL(normalizeEndpoint(endpoint)).hostname.toLowerCase();
    return host.endsWith('openrouter.ai') || host.endsWith('openai.com');
  } catch {
    return false;
  }
}

/** True for OpenRouter, which supports the `reasoning` and `models` request parameters. */
export function isOpenRouterEndpoint(endpoint: string): boolean {
  try {
    return new URL(normalizeEndpoint(endpoint)).hostname.toLowerCase().endsWith('openrouter.ai');
  } catch {
    return false;
  }
}

export const MAX_FALLBACK_MODELS = 3;

/**
 * Clean a fallback-model list: trim, drop empties, drop the primary itself,
 * dedupe, cap at MAX_FALLBACK_MODELS. Accepts an array or comma-separated string.
 */
export function sanitizeFallbacks(primary: string, raw: unknown, max: number = MAX_FALLBACK_MODELS): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const primaryNorm = (primary ?? '').trim();
  const out: string[] = [];
  for (const item of list) {
    const m = String(item ?? '').trim();
    if (!m || m === primaryNorm || out.includes(m)) continue;
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

/** Parse the stored `fallback_models` DB value (JSON array string) back to a list. */
export function parseStoredFallbacks(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((m) => String(m ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => String(m ?? '').trim()).filter(Boolean);
      }
    } catch {
      /* not JSON — fall through to comma-split */
    }
    return trimmed.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Build the model portion of a chat-completions body. On OpenRouter with
 * fallbacks configured this sends `model` (primary) plus
 * `models: [primary, ...fallbacks]` so OpenRouter fails over in order;
 * every other backend gets plain `{model}` and ignores fallbacks.
 */
export function buildModelParams(endpoint: string, primary: string, fallbacks: unknown): Record<string, unknown> {
  const clean = sanitizeFallbacks(primary, fallbacks);
  if (isOpenRouterEndpoint(endpoint) && clean.length > 0) {
    return { model: primary, models: [primary.trim(), ...clean] };
  }
  return { model: primary };
}
