import { vi, describe, it, expect, beforeAll } from 'vitest';
import { categoryRules } from '@/lib/db/schema';
import { encryptRow, encryptField } from '@/lib/crypto';
import { applyRulesToTransactions, evaluateCondition, findDuplicateRule } from '@/lib/services/rules-engine';

// Mock variables to control query responses
let mockRulesResponse: any[] = [];

// Mock query builder
class MockDbQueryBuilder {
  select() { return this; }
  from(table: any) { return this; }
  where(...args: any[]) { return this; }
  orderBy(...args: any[]) { return this; }
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return Promise.resolve(mockRulesResponse).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
  };
});

describe('Rules Engine', () => {
  let testDek: Uint8Array;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    testDek = new Uint8Array(32);
    crypto.getRandomValues(testDek);
  });

  describe('evaluateCondition', () => {
    it('matches contains case insensitively by default', () => {
      const rule = {
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'amazon',
        conditionCaseSensitive: false,
      } as any;

      const tx = {
        id: 'tx_1',
        description: 'AMAZON.COM*MEMBER',
        payee: null,
        memo: null,
        amount: '-10.00',
        categoryId: null,
      };

      expect(evaluateCondition(rule, tx)).toBe(true);
    });

    it('does not match contains if case sensitive and mismatch', () => {
      const rule = {
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'amazon',
        conditionCaseSensitive: true,
      } as any;

      const tx = {
        id: 'tx_1',
        description: 'AMAZON.COM*MEMBER',
        payee: null,
        memo: null,
        amount: '-10.00',
        categoryId: null,
      };

      expect(evaluateCondition(rule, tx)).toBe(false);
    });

    it('matches equals exactly', () => {
      const rule = {
        conditionField: 'payee',
        conditionOperator: 'equals',
        conditionValue: 'TARGET',
        conditionCaseSensitive: true,
      } as any;

      const txOk = {
        id: 'tx_1',
        description: 'Target Store',
        payee: 'TARGET',
        memo: null,
        amount: '-10.00',
        categoryId: null,
      };

      const txFail = {
        id: 'tx_2',
        description: 'Target Store',
        payee: 'target',
        memo: null,
        amount: '-10.00',
        categoryId: null,
      };

      expect(evaluateCondition(rule, txOk)).toBe(true);
      expect(evaluateCondition(rule, txFail)).toBe(false);
    });

    it('matches regex', () => {
      const rule = {
        conditionField: 'description',
        conditionOperator: 'regex',
        conditionValue: '^uber\\s*(eats)?',
        conditionCaseSensitive: false,
      } as any;

      const tx1 = {
        id: 'tx_1',
        description: 'Uber Eats 1234',
        payee: null,
        memo: null,
        amount: '-25.00',
        categoryId: null,
      };

      const tx2 = {
        id: 'tx_2',
        description: 'UBER TRIP 5678',
        payee: null,
        memo: null,
        amount: '-15.00',
        categoryId: null,
      };

      const txFail = {
        id: 'tx_3',
        description: 'MY UBER TRIP',
        payee: null,
        memo: null,
        amount: '-15.00',
        categoryId: null,
      };

      expect(evaluateCondition(rule, tx1)).toBe(true);
      expect(evaluateCondition(rule, tx2)).toBe(true);
      expect(evaluateCondition(rule, txFail)).toBe(false);
    });
  });

  describe('applyRulesToTransactions', () => {
    it('decrypts rules and applies them successfully', async () => {
      const rawRule1 = {
        id: 'rule_1',
        userId: 'user_1',
        name: 'Amazon Rule',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon',
        setPayee: 'Amazon Services',
        setReviewed: true,
      };

      const rawRule2 = {
        id: 'rule_2',
        userId: 'user_1',
        name: 'Netflix Rule',
        priority: 2,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Netflix',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_entertainment',
        setPayee: 'Netflix Subscription',
        setReviewed: null,
      };

      const encryptedRule1 = await encryptRow('category_rules', rawRule1, testDek);
      const encryptedRule2 = await encryptRow('category_rules', rawRule2, testDek);

      mockRulesResponse = [encryptedRule1, encryptedRule2];

      const txns = [
        {
          id: 'tx_1',
          description: 'AMAZON.COM*MEMBER SERVICES',
          payee: null,
          memo: null,
          amount: '-14.99',
          categoryId: null,
        },
        {
          id: 'tx_2',
          description: 'NETFLIX.COM CARD PURCHASE',
          payee: null,
          memo: null,
          amount: '-19.99',
          categoryId: null,
        },
        {
          id: 'tx_3',
          description: 'GROCERY STORE',
          payee: null,
          memo: null,
          amount: '-85.50',
          categoryId: null,
        },
      ];

      const results = await applyRulesToTransactions(txns, 'user_1', testDek);

      expect(results.size).toBe(2);
      expect(results.get('tx_1')).toEqual({
        categoryId: 'cat_amazon',
        payee: 'Amazon Services',
        reviewed: true,
        setTagId: null,
        overrideExisting: false,
        shouldUpdateTags: false,
        shouldUpdateCategory: true,
      });
      expect(results.get('tx_2')).toEqual({
        categoryId: 'cat_entertainment',
        payee: 'Netflix Subscription',
        reviewed: null,
        setTagId: null,
        overrideExisting: false,
        shouldUpdateTags: false,
        shouldUpdateCategory: true,
      });
      expect(results.get('tx_3')).toBeUndefined();
    });
  });

  describe('findDuplicateRule', () => {
    it('detects duplicate for identical single-condition rules', async () => {
      const rawRule = {
        id: 'rule_duplicate_1',
        userId: 'user_1',
        name: 'Amazon Rule',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon',
        setPayee: 'Amazon Services',
        setReviewed: true,
      };

      const encrypted = await encryptRow('category_rules', rawRule, testDek);
      mockRulesResponse = [encrypted];

      const newRuleMatch = {
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'amazon ', // whitespace trim and lowercased because caseSensitive is false
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon',
        setPayee: 'Amazon Services',
        setReviewed: true,
      };

      const found = await findDuplicateRule('user_1', testDek, newRuleMatch);
      expect(found).not.toBeNull();
      expect(found.id).toBe('rule_duplicate_1');

      // Test mismatch on case sensitivity
      const newRuleCaseMismatch = {
        ...newRuleMatch,
        conditionCaseSensitive: true,
      };
      const notFoundCase = await findDuplicateRule('user_1', testDek, newRuleCaseMismatch);
      expect(notFoundCase).toBeNull();

      // Test mismatch on actions (different category)
      const newRuleActionMismatch = {
        ...newRuleMatch,
        setCategoryId: 'cat_different',
      };
      const notFoundAction = await findDuplicateRule('user_1', testDek, newRuleActionMismatch);
      expect(notFoundAction).toBeNull();
    });

    it('detects duplicate for identical multi-condition rules in different order', async () => {
      const rawRule = {
        id: 'rule_duplicate_2',
        userId: 'user_1',
        name: 'Multi Rule',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        conditions: [
          { field: 'description', operator: 'contains', value: 'amazon', caseSensitive: false },
          { field: 'amount', operator: 'equals', value: '14.99', caseSensitive: false },
        ],
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
      };

      const encrypted = await encryptRow('category_rules', rawRule, testDek);
      mockRulesResponse = [encrypted];

      const newRule = {
        conditions: [
          { field: 'amount', operator: 'equals', value: '14.99', caseSensitive: false },
          { field: 'description', operator: 'contains', value: 'Amazon', caseSensitive: false },
        ],
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
      };

      const found = await findDuplicateRule('user_1', testDek, newRule);
      expect(found).not.toBeNull();
      expect(found.id).toBe('rule_duplicate_2');
    });

    it('matches legacy single-condition rule with equivalent conditions array', async () => {
      const rawRule = {
        id: 'rule_duplicate_3',
        userId: 'user_1',
        name: 'Legacy Rule',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        conditions: null,
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
      };

      const encrypted = await encryptRow('category_rules', rawRule, testDek);
      mockRulesResponse = [encrypted];

      const newRule = {
        conditions: [
          { field: 'description', operator: 'contains', value: 'amazon', caseSensitive: false },
        ],
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
      };

      const found = await findDuplicateRule('user_1', testDek, newRule);
      expect(found).not.toBeNull();
      expect(found.id).toBe('rule_duplicate_3');
    });

    it('distinguishes rules by overrideExisting flag during duplication checks', async () => {
      const rawRule = {
        id: 'rule_duplicate_4',
        userId: 'user_1',
        name: 'Legacy Rule',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
        overrideExisting: true,
      };

      const encrypted = await encryptRow('category_rules', rawRule, testDek);
      mockRulesResponse = [encrypted];

      const newRuleNoOverride = {
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon',
        setPayee: null,
        setReviewed: null,
        overrideExisting: false,
      };

      const foundNoOverride = await findDuplicateRule('user_1', testDek, newRuleNoOverride);
      expect(foundNoOverride).toBeNull();

      const newRuleOverride = {
        ...newRuleNoOverride,
        overrideExisting: true,
      };

      const foundOverride = await findDuplicateRule('user_1', testDek, newRuleOverride);
      expect(foundOverride).not.toBeNull();
      expect(foundOverride.id).toBe('rule_duplicate_4');
    });
  });

  describe('applyRulesToTransactions with overrideExisting', () => {
    it('respects overrideExisting flag when transactions have a category', async () => {
      const rule1 = {
        id: 'rule_1',
        userId: 'user_1',
        name: 'Amazon No Override',
        priority: 1,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Amazon',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_amazon_new',
        setPayee: null,
        setReviewed: null,
        overrideExisting: false,
      };

      const rule2 = {
        id: 'rule_2',
        userId: 'user_1',
        name: 'Netflix With Override',
        priority: 2,
        isActive: true,
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'Netflix',
        conditionCaseSensitive: false,
        setCategoryId: 'cat_entertainment_new',
        setPayee: null,
        setReviewed: null,
        overrideExisting: true,
      };

      const encryptedRule1 = await encryptRow('category_rules', rule1, testDek);
      const encryptedRule2 = await encryptRow('category_rules', rule2, testDek);
      mockRulesResponse = [encryptedRule1, encryptedRule2];

      const txns = [
        {
          id: 'tx_1',
          description: 'AMAZON.COM*MEMBER',
          payee: null,
          memo: null,
          amount: '-14.99',
          categoryId: 'cat_amazon_old', // ALREADY CATEGORIZED
        },
        {
          id: 'tx_2',
          description: 'NETFLIX.COM PURCHASE',
          payee: null,
          memo: null,
          amount: '-19.99',
          categoryId: 'cat_entertainment_old', // ALREADY CATEGORIZED
        },
      ];

      const results = await applyRulesToTransactions(txns, 'user_1', testDek);

      // tx_1 matches rule1 but rule1 has overrideExisting=false, so it should not be override
      expect(results.get('tx_1')).toBeUndefined();

      // tx_2 matches rule2 and rule2 has overrideExisting=true, so it should override
      expect(results.get('tx_2')).toEqual({
        categoryId: 'cat_entertainment_new',
        payee: null,
        reviewed: null,
        setTagId: null,
        overrideExisting: true,
        shouldUpdateTags: false,
        shouldUpdateCategory: true,
      });
    });
  });
});

