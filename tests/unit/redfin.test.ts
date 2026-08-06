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

import { fetchRedfinValue, normalizeRedfinApiUrl } from '@/lib/services/manual-accounts';

describe('Redfin fetchRedfinValue', () => {
  const apiConfig = {
    redfinApiUrl: 'https://www.redfin.com/stingray',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly resolves Property ID via web search and AVM for normal valuationMethod', async () => {
    const mockYahooHtml = '<a href="https://search.yahoo.com/r?RU=https%3A%2F%2Fwww.redfin.com%2FCA%2FSan-Francisco%2F123-Main-St-94105%2Fhome%2F123456/RK=2">Match</a>';
    const mockAvmText = '{}&&' + JSON.stringify({
      payload: {
        predictedValue: 850000,
        priceRangeLow: 800000,
        priceRangeHigh: 900000,
      },
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('search.yahoo.com')) {
        return {
          ok: true,
          text: async () => mockYahooHtml,
        } as Response;
      }
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return {
          ok: true,
          text: async () => mockAvmText,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const price = await fetchRedfinValue(
      { address: '123 Main St', valuationMethod: 'normal' },
      apiConfig
    );

    expect(price).toBe(850000);
  });

  it('correctly calculates conservative valuationMethod', async () => {
    const mockYahooHtml = '<a href="https://search.yahoo.com/r?RU=https%3A%2F%2Fwww.redfin.com%2FCA%2FOakland%2F456-Oak-St-94612%2Fhome%2F654321/RK=2">Match</a>';
    const mockAvmText = '{}&&' + JSON.stringify({
      payload: {
        predictedValue: 500000,
        priceRangeLow: 460000,
        priceRangeHigh: 540000,
      },
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('search.yahoo.com')) {
        return {
          ok: true,
          text: async () => mockYahooHtml,
        } as Response;
      }
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return {
          ok: true,
          text: async () => mockAvmText,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const price = await fetchRedfinValue(
      { address: '456 Oak St', valuationMethod: 'conservative' },
      apiConfig
    );

    // average of 460000 and 500000 = 480000
    expect(price).toBe(480000);
  });

  it('correctly calculates optimistic valuationMethod', async () => {
    const mockYahooHtml = '<a href="https://search.yahoo.com/r?RU=https%3A%2F%2Fwww.redfin.com%2FCA%2FSan-Francisco%2F123-Main-St-94105%2Fhome%2F123456/RK=2">Match</a>';
    const mockAvmText = '{}&&' + JSON.stringify({
      payload: {
        predictedValue: 500000,
        priceRangeLow: 460000,
        priceRangeHigh: 540000,
      },
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('search.yahoo.com')) {
        return {
          ok: true,
          text: async () => mockYahooHtml,
        } as Response;
      }
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return {
          ok: true,
          text: async () => mockAvmText,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const price = await fetchRedfinValue(
      { address: '123 Main St', valuationMethod: 'optimistic' },
      apiConfig
    );

    // average of 540000 and 500000 = 520000
    expect(price).toBe(520000);
  });

  it('falls back to GIS price if AVM fails', async () => {
    const mockCensusRes = {
      result: {
        addressMatches: [
          { coordinates: { x: -122.4194, y: 37.7749 } }
        ]
      }
    };

    const mockGisText = '{}&&' + JSON.stringify({
      payload: {
        homes: [
          { propertyId: 123456, streetLine: { value: '123 Main St' }, price: { value: 750000 } }
        ]
      },
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('search.yahoo.com')) {
        return { ok: false, status: 404 } as Response;
      }
      if (parsed.hostname.endsWith('geocoding.geo.census.gov')) {
        return { ok: true, json: async () => mockCensusRes } as Response;
      }
      if (parsed.pathname.includes('/api/gis')) {
        return { ok: true, text: async () => mockGisText } as Response;
      }
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const price = await fetchRedfinValue(
      { address: '123 Main St', valuationMethod: 'normal' },
      apiConfig
    );

    expect(price).toBe(750000);
  });

  it('throws a rate limit error if AVM returns 403', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('search.yahoo.com')) {
        return {
          ok: true,
          text: async () => '<a href="https://search.yahoo.com/r?RU=https%3A%2F%2Fwww.redfin.com%2Fhome%2F446533">Link</a>',
        } as Response;
      }
      if (parsed.pathname.includes('/api/home/details/avm')) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(
      fetchRedfinValue({ address: '446533' }, apiConfig)
    ).rejects.toThrow('Redfin rate limit reached for "446533". Please chill and wait a few minutes before validating again, or enter the value manually.');
  });

  it('throws an error if estimate is unavailable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(
      fetchRedfinValue({ address: 'Unknown St' }, apiConfig)
    ).rejects.toThrow('Redfin estimate unavailable for address "Unknown St". Please check the address, paste the Redfin property link (e.g. redfin.com/.../home/446533), or enter value manually.');
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
      { address: '157939' },
      { redfinApiUrl: 'https://www.redfin.com/what-is-my-home-worth' }
    );

    expect(price).toBe(600000);
    expect(requestedUrl).toBe('https://www.redfin.com/stingray/api/home/details/avm?propertyId=157939&accessLevel=1');
  });
});
