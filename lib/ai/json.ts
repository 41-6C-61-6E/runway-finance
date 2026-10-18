/**
 * JSON parsing, extraction, and validation helpers for AI responses.
 */

/**
 * Extract the first balanced {...} JSON object from text that may contain
 * prose before/after it. String- and escape-aware. Returns null if none.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * True when an error indicates the server rejected the constrained-JSON request
 * (`response_format`), as opposed to a transient or auth failure.
 */
export function isJsonFormatRejection(message: string): boolean {
  return /response_format|json_object|response format|json mode|grammar/i.test(message);
}
