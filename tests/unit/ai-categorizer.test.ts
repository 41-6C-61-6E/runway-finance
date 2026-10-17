import { describe, it, expect } from 'vitest';
import { extractJsonObject, isJsonFormatRejection, shouldProposeCategory, shouldProposeRule } from '@/lib/services/ai-categorizer';

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

describe('shouldProposeCategory (frequency gate)', () => {
  const existingCategories = [
    { name: 'Groceries' },
    { name: 'Dining Out' },
    { name: 'Utilities' },
  ];

  it('rejects if the category already exists (case-insensitive)', () => {
    const suggestions = [
      { type: 'categorize', categoryName: 'groceries' },
      { type: 'categorize', categoryName: 'Groceries' },
    ];
    expect(shouldProposeCategory('Groceries', existingCategories, suggestions)).toBe(false);
    expect(shouldProposeCategory('groceries', existingCategories, suggestions)).toBe(false);
  });

  it('rejects if fewer than 2 transactions in the batch are assigned to it (Issue 2 gate)', () => {
    const suggestions = [
      { type: 'categorize', categoryName: 'Pet Care' },
      { type: 'categorize', categoryName: 'Dining Out' },
    ];
    // Only 1 transaction mapped to 'Pet Care' -> reject
    expect(shouldProposeCategory('Pet Care', existingCategories, suggestions)).toBe(false);
  });

  it('accepts when at least 2 transactions in the batch are assigned to the new category', () => {
    const suggestions = [
      { type: 'categorize', categoryName: 'Pet Care' },
      { type: 'categorize', categoryName: 'Pet Care' },
      { type: 'categorize', categoryName: 'Pet Care' },
    ];
    expect(shouldProposeCategory('Pet Care', existingCategories, suggestions)).toBe(true);
  });
});

describe('shouldProposeRule (frequency gate)', () => {
  const batchTxns = [
    { id: '1', description: 'Netflix monthly', payee: 'Netflix', amount: '-15.99', memo: null, categoryId: null },
    { id: '2', description: 'Netflix subscription', payee: 'Netflix', amount: '-15.99', memo: null, categoryId: null },
    { id: '3', description: 'Exo Travel Tour', payee: 'Exo Travel', amount: '-240.00', memo: null, categoryId: null },
  ];

  it('rejects a rule when fewer than 2 transactions match in the batch (Issue 2 gate)', () => {
    const ruleForOneOff = {
      conditionField: 'payee',
      conditionOperator: 'contains',
      conditionValue: 'Exo Travel',
    };
    // Only 1 transaction matches 'Exo Travel' -> dropped!
    expect(shouldProposeRule(ruleForOneOff, batchTxns)).toBe(false);
  });

  it('accepts a rule when 2 or more transactions match in the batch', () => {
    const ruleForRecurring = {
      conditionField: 'payee',
      conditionOperator: 'contains',
      conditionValue: 'Netflix',
    };
    // 2 transactions match 'Netflix' -> kept!
    expect(shouldProposeRule(ruleForRecurring, batchTxns)).toBe(true);
  });

  it('rejects if rule fields are missing', () => {
    expect(shouldProposeRule({ conditionField: '', conditionOperator: '', conditionValue: '' }, batchTxns)).toBe(false);
  });
});