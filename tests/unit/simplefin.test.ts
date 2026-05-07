import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SimpleFINError, claimAccessUrl, fetchAccounts } from '@/lib/simplefin';

describe('SimpleFIN', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('claimAccessUrl', () => {
    it('claims access URL from valid base64 setup token', async () => {
      const mockUrl = 'https://simplefin.example.com/claim';
      const setupToken = Buffer.from(mockUrl).toString('base64');
      const mockResponse = { access_url: 'https://simplefin.example.com/access/abc123' };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('https://simplefin.example.com/access/abc123'),
      });

      const result = await claimAccessUrl(setupToken);
      expect(result).toBe('https://simplefin.example.com/access/abc123');
      expect(global.fetch).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws SimpleFINError on non-2xx response', async () => {
      const setupToken = Buffer.from('https://simplefin.example.com/claim').toString('base64');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const error = await claimAccessUrl(setupToken).catch(e => e);
      expect(error).toBeInstanceOf(SimpleFINError);
      expect(error.code).toBe('claim_failed');
    });

    it('throws SimpleFINError on invalid base64 token', async () => {
      const error = await claimAccessUrl('not-valid-base64!!!').catch(e => e);
      expect(error).toBeInstanceOf(SimpleFINError);
      expect(error.code).toBe('invalid_token');
    });
  });

  describe('fetchAccounts', () => {
    it('fetches accounts with correct date params', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const mockAccounts = { accounts: [{ id: '1', name: 'Checking', currency: 'USD', balance: '1000', 'balance-date': Date.now() / 1000, org: { name: 'Bank' } }] };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAccounts),
      });

      const result = await fetchAccounts('https://simplefin.example.com/access/abc123', startDate, endDate);
      expect(result.accounts).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start-date=1704067200'),
        expect.any(Object)
      );
    });

    it('strips credentials from SimpleFIN access URL before fetch', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const mockAccounts = { accounts: [{ id: '1', name: 'Checking', currency: 'USD', balance: '1000', 'balance-date': Date.now() / 1000, org: { name: 'Bank' } }] };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAccounts),
      });

      const credentialUrl = 'https://user:pass@simplefin.example.com/access/abc123';
      const result = await fetchAccounts(credentialUrl, startDate, endDate);

      expect(result.accounts).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.not.stringContaining('user:pass@'),
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect((global.fetch as any).mock.calls[0][1].headers.Authorization).toContain('Basic ');
    });

    it('throws SimpleFINError on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        fetchAccounts('https://simplefin.example.com/access/abc123', new Date(), new Date())
      ).rejects.toThrow(SimpleFINError);
    });

    it('throws SimpleFINError on fetch abort (timeout)', async () => {
      const controller = new AbortController();
      // Simulate timeout by aborting immediately
      setTimeout(() => controller.abort(), 0);

      global.fetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

      await expect(
        fetchAccounts('https://simplefin.example.com/access/abc123', new Date(), new Date())
      ).rejects.toThrow(SimpleFINError);
    });
  });
});
