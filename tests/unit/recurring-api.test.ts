import { describe, it, expect } from 'vitest';
import {
  RecurringFilterSchema,
  RecurringCreateSchema,
  RecurringPatchSchema,
  RecurringBulkPatchSchema,
  RecurringUpcomingSchema,
  RecurringMergeSchema,
  RecurringBulkActionSchema,
} from '@/lib/validations/recurring';

describe('Recurring Validations', () => {
  describe('RecurringFilterSchema', () => {
    it('parses valid filter params with defaults', () => {
      const parsed = RecurringFilterSchema.parse({});
      expect(parsed.flowType).toBe('all');
      expect(parsed.status).toBe('active');
    });

    it('parses custom filters', () => {
      const parsed = RecurringFilterSchema.parse({
        flowType: 'expense',
        status: 'paused',
        search: 'netflix',
        includeDismissed: 'true',
      });
      expect(parsed.flowType).toBe('expense');
      expect(parsed.status).toBe('paused');
      expect(parsed.search).toBe('netflix');
      expect(parsed.includeDismissed).toBe(true);
    });
  });

  describe('RecurringCreateSchema', () => {
    it('validates manual recurring item payload', () => {
      const parsed = RecurringCreateSchema.parse({
        merchantName: 'Spotify',
        amount: '11.99',
        frequency: 'monthly',
        lastDate: '2026-08-01',
        flowType: 'expense',
      });
      expect(parsed.merchantName).toBe('Spotify');
      expect(parsed.amount).toBe(11.99);
      expect(parsed.frequency).toBe('monthly');
      expect(parsed.isConfirmed).toBe(true);
    });

    it('fails on invalid date format', () => {
      expect(() =>
        RecurringCreateSchema.parse({
          merchantName: 'Spotify',
          amount: 11.99,
          lastDate: 'invalid-date',
        })
      ).toThrow();
    });
  });

  describe('RecurringPatchSchema & BulkPatch', () => {
    it('validates single patch payload with extended fields', () => {
      const parsed = RecurringPatchSchema.parse({
        merchantName: 'Spotify USA',
        matchPattern: 'spotify|spotify usa',
        customName: 'Netflix Premium',
        isPaused: true,
        frequency: 'monthly',
        averageAmount: 14.99,
        lastAmount: 14.99,
        lastDate: '2026-08-01',
        nextExpectedDate: '2026-09-01',
        flowType: 'expense',
      });
      expect(parsed.merchantName).toBe('Spotify USA');
      expect(parsed.matchPattern).toBe('spotify|spotify usa');
      expect(parsed.customName).toBe('Netflix Premium');
      expect(parsed.isPaused).toBe(true);
      expect(parsed.averageAmount).toBe(14.99);
      expect(parsed.flowType).toBe('expense');
    });

    it('validates bulk patch items', () => {
      const parsed = RecurringBulkPatchSchema.parse({
        items: [
          { id: 'a1111111-1111-4111-8111-111111111111', isConfirmed: true },
          { id: 'b2222222-2222-4222-8222-222222222222', isDismissed: true },
        ],
      });
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].isConfirmed).toBe(true);
    });
  });

  describe('RecurringUpcomingSchema', () => {
    it('parses upcoming horizon days with default', () => {
      const parsed = RecurringUpcomingSchema.parse({});
      expect(parsed.days).toBe(30);
      expect(parsed.flowType).toBe('all');
    });

    it('accepts custom days horizon', () => {
      const parsed = RecurringUpcomingSchema.parse({ days: '60', flowType: 'expense' });
      expect(parsed.days).toBe(60);
      expect(parsed.flowType).toBe('expense');
    });
  });

  describe('RecurringMergeSchema', () => {
    it('validates merge payload with target and source IDs', () => {
      const parsed = RecurringMergeSchema.parse({
        targetId: 'a1111111-1111-4111-8111-111111111111',
        sourceIds: ['b2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333'],
        customName: 'Consolidated Netflix',
      });
      expect(parsed.targetId).toBe('a1111111-1111-4111-8111-111111111111');
      expect(parsed.sourceIds).toHaveLength(2);
      expect(parsed.customName).toBe('Consolidated Netflix');
    });

    it('fails when sourceIds is empty', () => {
      expect(() =>
        RecurringMergeSchema.parse({
          targetId: 'a1111111-1111-4111-8111-111111111111',
          sourceIds: [],
        })
      ).toThrow();
    });
  });

  describe('RecurringBulkActionSchema', () => {
    it('validates batch confirm and dismiss actions', () => {
      const confirmAction = RecurringBulkActionSchema.parse({
        action: 'confirm',
        ids: ['a1111111-1111-4111-8111-111111111111'],
      });
      expect(confirmAction.action).toBe('confirm');

      const dismissAll = RecurringBulkActionSchema.parse({
        action: 'dismiss_all_pending',
      });
      expect(dismissAll.action).toBe('dismiss_all_pending');
    });
  });
});
