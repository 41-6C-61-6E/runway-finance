import { describe, expect, it } from 'vitest';
import {
  supportsAvailableBalance,
  parseProviderBalance,
  resolveEffectiveBalance,
  isBalanceSource,
  AVAILABLE_BALANCE_ELIGIBLE_TYPES,
} from '@/lib/utils/balance-source';

describe('balance-source utils', () => {
  describe('isBalanceSource', () => {
    it('accepts current and available', () => {
      expect(isBalanceSource('current')).toBe(true);
      expect(isBalanceSource('available')).toBe(true);
    });

    it('rejects invalid strings or non-strings', () => {
      expect(isBalanceSource('other')).toBe(false);
      expect(isBalanceSource('')).toBe(false);
      expect(isBalanceSource(null)).toBe(false);
      expect(isBalanceSource(undefined)).toBe(false);
      expect(isBalanceSource(123)).toBe(false);
    });
  });

  describe('supportsAvailableBalance', () => {
    it('returns true for checking, savings, and hsachecking', () => {
      expect(supportsAvailableBalance('checking')).toBe(true);
      expect(supportsAvailableBalance('savings')).toBe(true);
      expect(supportsAvailableBalance('hsachecking')).toBe(true);
      expect(supportsAvailableBalance('CHECKING')).toBe(true);
    });

    it('returns false for credit cards, loans, investments, mortgages', () => {
      expect(supportsAvailableBalance('credit')).toBe(false);
      expect(supportsAvailableBalance('loan')).toBe(false);
      expect(supportsAvailableBalance('mortgage')).toBe(false);
      expect(supportsAvailableBalance('investment')).toBe(false);
      expect(supportsAvailableBalance('brokerage')).toBe(false);
      expect(supportsAvailableBalance('other')).toBe(false);
      expect(supportsAvailableBalance(null)).toBe(false);
      expect(supportsAvailableBalance(undefined)).toBe(false);
    });
  });

  describe('parseProviderBalance', () => {
    it('parses valid numeric strings and numbers', () => {
      expect(parseProviderBalance('123.45')).toBe(123.45);
      expect(parseProviderBalance('-50.00')).toBe(-50.0);
      expect(parseProviderBalance('0')).toBe(0);
      expect(parseProviderBalance(100.5)).toBe(100.5);
    });

    it('returns null for empty, null, undefined, or non-finite values', () => {
      expect(parseProviderBalance(null)).toBeNull();
      expect(parseProviderBalance(undefined)).toBeNull();
      expect(parseProviderBalance('')).toBeNull();
      expect(parseProviderBalance('abc')).toBeNull();
      expect(parseProviderBalance(NaN)).toBeNull();
    });
  });

  describe('resolveEffectiveBalance', () => {
    it('uses available balance when source is "available", account is eligible, and available balance is provided', () => {
      const result = resolveEffectiveBalance({
        current: 1000,
        available: 950,
        accountType: 'checking',
        source: 'available',
      });
      expect(result).toEqual({ value: 950, usedAvailable: true });
    });

    it('falls back to current balance when source is "current"', () => {
      const result = resolveEffectiveBalance({
        current: 1000,
        available: 950,
        accountType: 'checking',
        source: 'current',
      });
      expect(result).toEqual({ value: 1000, usedAvailable: false });
    });

    it('falls back to current balance for ineligible accounts even when source is "available"', () => {
      const result = resolveEffectiveBalance({
        current: -500,
        available: 4500, // available credit on a credit card
        accountType: 'credit',
        source: 'available',
      });
      expect(result).toEqual({ value: -500, usedAvailable: false });
    });

    it('falls back to current balance when available balance is null / omitted by provider', () => {
      const result = resolveEffectiveBalance({
        current: 1200,
        available: null,
        accountType: 'savings',
        source: 'available',
      });
      expect(result).toEqual({ value: 1200, usedAvailable: false });
    });
  });
});
