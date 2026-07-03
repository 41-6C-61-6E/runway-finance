import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock auth before importing manual-accounts to prevent loading next-auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(),
}));

vi.mock('@/lib/db/seed-categories', () => {
  return {
    ensureSystemCategories: vi.fn(async () => 'cat_123'),
    ensureCompoundCategories: vi.fn(async () => {}),
    ensureEmployerContributions: vi.fn(async () => {}),
  };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { fetchRentcastValue } from '@/lib/services/manual-accounts';

describe('RentCast fetchRentcastValue', () => {
  const mockApiKey = 'test-api-key';
  const apiConfig = {
    rentcastApiKey: mockApiKey,
    rentcastApiUrl: 'https://api.rentcast.io/v1/avm/value',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly uses the price field for normal/default valuationMethod', async () => {
    const mockResponse = {
      price: 350000,
      priceRangeLow: 320000,
      priceRangeHigh: 380000,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const price = await fetchRentcastValue(
      { address: '123 Main St', valuationMethod: 'normal' },
      apiConfig
    );

    expect(price).toBe(350000);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('address=123+Main+St'),
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'X-Api-Key': mockApiKey,
        },
      })
    );
  });

  it('correctly uses the priceRangeLow field for conservative valuationMethod', async () => {
    const mockResponse = {
      price: 350000,
      priceRangeLow: 320000,
      priceRangeHigh: 380000,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const price = await fetchRentcastValue(
      { address: '123 Main St', valuationMethod: 'conservative' },
      apiConfig
    );

    expect(price).toBe(335000);
  });

  it('correctly uses the priceRangeHigh field for optimistic valuationMethod', async () => {
    const mockResponse = {
      price: 350000,
      priceRangeLow: 320000,
      priceRangeHigh: 380000,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const price = await fetchRentcastValue(
      { address: '123 Main St', valuationMethod: 'optimistic' },
      apiConfig
    );

    expect(price).toBe(365000);
  });

  it('falls back to price if priceRangeLow is missing for conservative method', async () => {
    const mockResponse = {
      price: 350000,
      priceRangeHigh: 380000,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const price = await fetchRentcastValue(
      { address: '123 Main St', valuationMethod: 'conservative' },
      apiConfig
    );

    expect(price).toBe(350000);
  });

  it('falls back to price if priceRangeHigh is missing for optimistic method', async () => {
    const mockResponse = {
      price: 350000,
      priceRangeLow: 320000,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const price = await fetchRentcastValue(
      { address: '123 Main St', valuationMethod: 'optimistic' },
      apiConfig
    );

    expect(price).toBe(350000);
  });

  it('throws an error if no valid price field is found', async () => {
    const mockResponse = {};

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await expect(
      fetchRentcastValue({ address: '123 Main St' }, apiConfig)
    ).rejects.toThrow('No valid valuation field returned in response.');
  });
});
