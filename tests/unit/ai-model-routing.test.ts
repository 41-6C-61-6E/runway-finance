import { describe, it, expect } from 'vitest';
import {
  sanitizeFallbacks,
  parseStoredFallbacks,
  buildModelParams,
  MAX_FALLBACK_MODELS,
  isOpenRouterEndpoint,
} from '@/lib/ai/endpoints';

describe('OpenRouter model routing helpers', () => {
  describe('sanitizeFallbacks', () => {
    it('trims, drops empties, drops the primary, dedupes, and caps', () => {
      expect(
        sanitizeFallbacks('a/b', [' c/d ', '', 'a/b', 'c/d', 'e/f', 'g/h', 'i/j'])
      ).toEqual(['c/d', 'e/f', 'g/h']);
      expect(MAX_FALLBACK_MODELS).toBe(3);
    });

    it('accepts comma-separated strings and non-lists', () => {
      expect(sanitizeFallbacks('a/b', 'c/d, e/f')).toEqual(['c/d', 'e/f']);
      expect(sanitizeFallbacks('a/b', undefined)).toEqual([]);
      expect(sanitizeFallbacks('a/b', null)).toEqual([]);
      expect(sanitizeFallbacks('a/b', '')).toEqual([]);
    });
  });

  describe('parseStoredFallbacks', () => {
    it('parses JSON array strings and tolerates legacy shapes', () => {
      expect(parseStoredFallbacks(null)).toEqual([]);
      expect(parseStoredFallbacks('')).toEqual([]);
      expect(parseStoredFallbacks('["a/b", "c/d"]')).toEqual(['a/b', 'c/d']);
      expect(parseStoredFallbacks('a/b, c/d')).toEqual(['a/b', 'c/d']);
      expect(parseStoredFallbacks(['a/b', ' c/d '])).toEqual(['a/b', 'c/d']);
      expect(parseStoredFallbacks('not json {{{')).toEqual(['not json {{{']);
    });
  });

  describe('buildModelParams', () => {
    it('sends model + models on OpenRouter with fallbacks', () => {
      expect(
        buildModelParams('https://openrouter.ai/api/v1', 'nvidia/nemotron-3.5-lightning:free', [
          'nvidia/nemotron-3.5-lightning:free',
          'vendor/backup:free',
        ])
      ).toEqual({
        model: 'nvidia/nemotron-3.5-lightning:free',
        models: ['nvidia/nemotron-3.5-lightning:free', 'vendor/backup:free'],
      });
    });

    it('sends plain model without fallbacks or off OpenRouter', () => {
      expect(buildModelParams('https://openrouter.ai/api/v1', 'a/b', [])).toEqual({ model: 'a/b' });
      expect(
        buildModelParams('https://antithropic.app/api', 'a/b', ['c/d'])
      ).toEqual({ model: 'a/b' });
      expect(isOpenRouterEndpoint('https://openrouter.ai/api/v1')).toBe(true);
      expect(isOpenRouterEndpoint('https://antithropic.app/api')).toBe(false);
    });
  });
});
