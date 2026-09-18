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

import { fetchRedfinValue, fetchRedfinValuationDetails, extractRedfinPropertyId, normalizeRedfinApiUrl } from '@/lib/services/manual-accounts';

describe('Redfin fetchRedfinValue (property-ID only)', () => {
  const apiConfig = {
    redfinApiUrl: 'https://www.redfin.com/stingray',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockAvm(payload: Record<string, unknown>, status = 200) {
    const mockAvmText = '{}&&' + JSON.stringify({ payload });
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes('/api/home/details/avm')) {
        if (status !== 200) return { ok: false, status } as Response;
        return { ok: true, status: 200, text: async () => mockAvmText } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });
  }

  it('fetches the AVM directly by property ID for normal valuationMethod', async () => {
    mockAvm({ predictedValue: 850000, priceRangeLow: 800000, priceRangeHigh: 900000 });

    const price = await fetchRedfinValue(
      { propertyId: '123456', valuationMethod: 'normal' },
      apiConfig
    );

    expect(price).toBe(850000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://www.redfin.com/stingray/api/home/details/avm?propertyId=123456&accessLevel=1'
    );
  });

  it('correctly calculates conservative valuationMethod', async () => {
    mockAvm({ predictedValue: 500000, priceRangeLow: 460000, priceRangeHigh: 540000 });

    const price = await fetchRedfinValue(
      { propertyId: '654321', valuationMethod: 'conservative' },
      apiConfig
    );

    // average of 460000 and 500000 = 480000
    expect(price).toBe(480000);
  });

  it('correctly calculates optimistic valuationMethod', async () => {
    mockAvm({ predictedValue: 500000, priceRangeLow: 460000, priceRangeHigh: 540000 });

    const price = await fetchRedfinValue(
      { propertyId: '123456', valuationMethod: 'optimistic' },
      apiConfig
    );

    // average of 540000 and 500000 = 520000
    expect(price).toBe(520000);
  });

  it('accepts a pasted Redfin link via the legacy address field', async () => {
    mockAvm({ predictedValue: 1067552 });

    const details = await fetchRedfinValuationDetails(
      { address: 'https://www.redfin.com/WA/Carnation/1618-290th-Ave-NE-98014/home/446533' },
      apiConfig
    );

    expect(details.propertyId).toBe('446533');
    expect(details.normal).toBe(1067552);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a bare numeric ID via the legacy address field', async () => {
    mockAvm({ predictedValue: 600000 });

    const price = await fetchRedfinValue({ address: '157939' }, apiConfig);

    expect(price).toBe(600000);
  });

  it('throws a helpful error when no property ID is provided', async () => {
    global.fetch = vi.fn();

    await expect(
      fetchRedfinValue({ address: '1618 290TH AVE NE, CARNATION, WA, 98014' }, apiConfig)
    ).rejects.toThrow('No Redfin property ID provided');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws a helpful error when nothing is provided at all', async () => {
    global.fetch = vi.fn();

    await expect(fetchRedfinValue({}, apiConfig)).rejects.toThrow('No Redfin property ID provided');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws a rate limit error if AVM returns 403', async () => {
    mockAvm({}, 403);

    await expect(
      fetchRedfinValue({ propertyId: '446533' }, apiConfig)
    ).rejects.toThrow('Redfin rate limit reached for property 446533');
  });

  it('throws an unavailable error if AVM returns 404 (bad ID)', async () => {
    mockAvm({}, 404);

    await expect(
      fetchRedfinValue({ propertyId: '000000' }, apiConfig)
    ).rejects.toThrow('Redfin estimate unavailable for property 000000');
  });

  it('throws an unavailable error when AVM returns no estimate', async () => {
    mockAvm({});

    await expect(
      fetchRedfinValue({ propertyId: '446533' }, apiConfig)
    ).rejects.toThrow('Redfin returned no estimate for property 446533');
  });

  it('normalizes misconfigured redfinApiUrl to include /stingray', () => {
    expect(normalizeRedfinApiUrl('https://www.redfin.com/what-is-my-home-worth')).toBe('https://www.redfin.com/stingray');
    expect(normalizeRedfinApiUrl('https://www.redfin.com/what-is-my-home-worth/')).toBe('https://www.redfin.com/stingray');
    expect(normalizeRedfinApiUrl('https://www.redfin.com')).toBe('https://www.redfin.com/stingray');
    expect(normalizeRedfinApiUrl('https://www.redfin.com/stingray')).toBe('https://www.redfin.com/stingray');
    expect(normalizeRedfinApiUrl(undefined)).toBe('https://www.redfin.com/stingray');
  });

  it('correctly uses normalized URL when fetching AVM with misconfigured redfinApiUrl', async () => {
    const mockAvmText = '{}&&' + JSON.stringify({
      payload: { predictedValue: 600000 },
    });

    let requestedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      const parsed = new URL(url);
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return { ok: true, text: async () => mockAvmText } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const price = await fetchRedfinValue(
      { propertyId: '157939' },
      { redfinApiUrl: 'https://www.redfin.com/what-is-my-home-worth' }
    );

    expect(price).toBe(600000);
    expect(requestedUrl).toBe('https://www.redfin.com/stingray/api/home/details/avm?propertyId=157939&accessLevel=1');
  });

  it('extractRedfinPropertyId parses links, bare IDs, and rejects plain addresses', () => {
    expect(extractRedfinPropertyId('https://www.redfin.com/WA/Carnation/1618-290th-Ave-NE-98014/home/446533')).toBe('446533');
    expect(extractRedfinPropertyId('www.redfin.com/WA/Carnation/x/home/446533')).toBe('446533');
    expect(extractRedfinPropertyId('446533')).toBe('446533');
    expect(extractRedfinPropertyId('  446533  ')).toBe('446533');
    expect(extractRedfinPropertyId('1618 290TH AVE NE, CARNATION, WA, 98014')).toBeUndefined();
    expect(extractRedfinPropertyId(undefined)).toBeUndefined();
    expect(extractRedfinPropertyId('')).toBeUndefined();
  });
});
