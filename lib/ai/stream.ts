/**
 * Streaming response parsing and text cleaning helpers.
 */

/**
 * Pull answer text out of one parsed SSE `data:` payload. Handles two
 * dialects:
 * - Chat Completions: `{choices:[{delta:{content}}]}`
 * - Responses API (e.g. Open WebUI proxies): `event: response.created`
 *   snapshots shaped `{response:{...}}` plus `output_text.delta` events shaped
 *   `{delta:"..."}` or `{type:"response.output_text.delta",delta:"..."}`.
 * Returns incremental text plus any full-text snapshot (from a completed
 * event) for use as a fallback when no deltas arrived.
 */
export function extractStreamChunk(chunk: any): { text: string; reasoning: boolean; completedText: string } {
  if (!chunk || typeof chunk !== 'object') {
    return { text: '', reasoning: false, completedText: '' };
  }
  const delta = chunk.choices?.[0]?.delta;
  if (typeof delta?.content === 'string' && delta.content) {
    return { text: delta.content, reasoning: false, completedText: '' };
  }
  if (typeof chunk.delta === 'string' && chunk.delta) {
    return { text: chunk.delta, reasoning: false, completedText: '' };
  }

  let completedText = '';
  const outputs = chunk.response?.output ?? chunk.output;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      const parts = item?.content;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part?.text === 'string') {
            completedText += part.text;
          }
        }
      }
    }
  }

  const reasoning = !!(delta?.reasoning_content || delta?.reasoning || chunk.reasoning);
  return { text: '', reasoning, completedText };
}

/**
 * Creates a stateful stream processor that strips `<think>...</think>` and
 * `<thinking>...</thinking>` blocks, correctly handling tags and content split
 * across arbitrary chunk boundaries.
 */
export function createThinkStripper() {
  let inThink = false;
  let buffer = '';

  const OPEN_TAGS = ['<think>', '<thinking>'];
  const CLOSE_TAGS = ['</think>', '</thinking>'];

  // Maximum length of any tag prefix we might need to buffer
  const MAX_TAG_LEN = Math.max(...OPEN_TAGS.map((t) => t.length), ...CLOSE_TAGS.map((t) => t.length));

  function processChunk(chunk: string): string {
    buffer += chunk;
    let output = '';

    while (buffer.length > 0) {
      if (!inThink) {
        // Look for the start of an open tag: '<'
        const tagStartIdx = buffer.indexOf('<');
        if (tagStartIdx === -1) {
          // No tag start found; entire buffer is normal text
          output += buffer;
          buffer = '';
          break;
        }

        // Emit text before the '<'
        if (tagStartIdx > 0) {
          output += buffer.slice(0, tagStartIdx);
          buffer = buffer.slice(tagStartIdx);
        }

        // Check if buffer starts with any complete open tag
        let matchedOpen = false;
        let isPotentialPrefix = false;

        for (const tag of OPEN_TAGS) {
          const bufLower = buffer.toLowerCase();
          if (bufLower.startsWith(tag)) {
            // Found complete open tag
            inThink = true;
            buffer = buffer.slice(tag.length);
            matchedOpen = true;
            break;
          } else if (tag.startsWith(bufLower) || bufLower.length < tag.length && tag.startsWith(bufLower)) {
            // Buffer is a prefix of an open tag (e.g. '<th')
            isPotentialPrefix = true;
          }
        }

        if (matchedOpen) {
          continue;
        }

        if (isPotentialPrefix && buffer.length < MAX_TAG_LEN) {
          // Needs more chunks to determine if it's an open tag
          break;
        }

        // Not an open tag, emit the '<' as normal text and continue
        output += buffer[0];
        buffer = buffer.slice(1);
      } else {
        // We are inside a think block; look for '</'
        const closeIdx = buffer.indexOf('</');
        if (closeIdx === -1) {
          // Check if buffer ends with '<' which might be the start of '</'
          if (buffer.endsWith('<')) {
            buffer = '<';
          } else {
            buffer = '';
          }
          break;
        }

        // Discard everything before '</'
        buffer = buffer.slice(closeIdx);

        let matchedClose = false;
        let isPotentialPrefix = false;

        for (const tag of CLOSE_TAGS) {
          const bufLower = buffer.toLowerCase();
          if (bufLower.startsWith(tag)) {
            // Found complete close tag
            inThink = false;
            buffer = buffer.slice(tag.length);
            matchedClose = true;
            break;
          } else if (tag.startsWith(bufLower) && bufLower.length < tag.length) {
            isPotentialPrefix = true;
          }
        }

        if (matchedClose) {
          continue;
        }

        if (isPotentialPrefix && buffer.length < MAX_TAG_LEN) {
          // Need more chunks to complete the closing tag
          break;
        }

        // Not a close tag, discard the '<' and continue searching in think mode
        buffer = buffer.slice(1);
      }
    }

    return output;
  }

  function flush(): string {
    const remaining = buffer;
    buffer = '';
    if (!inThink) {
      return remaining;
    }
    // If stream ended while inside think block, discard remaining
    return '';
  }

  return { process: processChunk, flush };
}
