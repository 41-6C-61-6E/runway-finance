import { describe, it, expect } from 'vitest';
import { extractJsonObject, isJsonFormatRejection } from '@/lib/services/ai-categorizer';

describe('extractJsonObject', () => {
  it('extracts the first balanced JSON object from text', () => {
    const text = 'Some prose before { "key": "value" } some prose after';
    const result = extractJsonObject(text);
    expect(result).toBe('{ "key": "value" }');
  });

  it('returns null when no JSON object found', () => {
    const text = 'Just some text without JSON';
    const result = extractJsonObject(text);
    expect(result).toBeNull();
  });

  it('handles nested JSON objects', () => {
    const text = 'Before { "outer": { "inner": "value" } } after';
    const result = extractJsonObject(text);
    expect(result).toBe('{ "outer": { "inner": "value" } }');
  });
});

describe('isJsonFormatRejection', () => {
  it('detects response_format rejection', () => {
    expect(isJsonFormatRejection('response_format rejected')).toBe(true);
  });

  it('detects json_object rejection', () => {
    expect(isJsonFormatRejection('json_object not supported')).toBe(true);
  });

  it('detects response format rejection', () => {
    expect(isJsonFormatRejection('response format error')).toBe(true);
  });

  it('detects grammar rejection', () => {
    expect(isJsonFormatRejection('grammar error')).toBe(true);
  });

  it('returns false for non-rejection messages', () => {
    expect(isJsonFormatRejection('success')).toBe(false);
    expect(isJsonFormatRejection('network error')).toBe(false);
  });
});