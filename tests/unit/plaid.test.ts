import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPlaidConfig, getPlaidClient } from '@/lib/plaid';
import { PlaidApi } from 'plaid';

// Mock DB module
vi.mock('@/lib/db', () => {
  const selectMock = vi.fn().mockReturnThis();
  const fromMock = vi.fn().mockReturnThis();
  const whereMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn();

  return {
    getDb: vi.fn(() => ({
      select: selectMock,
      from: fromMock,
      where: whereMock,
      limit: limitMock,
    })),
  };
});

// Mock crypto module
vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(),
}));

import { getDb } from '@/lib/db';
import { decryptField } from '@/lib/crypto';

describe('Plaid Client Helper', () => {
  const mockUserId = 'user_123';
  const mockDek = new Uint8Array([1, 2, 3]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlaidConfig', () => {
    it('returns configuration when keys are correctly configured and decrypted', async () => {
      const mockApiKeys = JSON.stringify({
        plaidClientId: 'client_id_test',
        plaidSecret: 'secret_test',
        plaidEnvironment: 'sandbox',
      });

      const db = getDb() as any;
      db.limit.mockResolvedValue([{ apiKeys: 'encrypted_api_keys' }]);
      (decryptField as any).mockResolvedValue(mockApiKeys);

      const config = await getPlaidConfig(mockUserId, mockDek);

      expect(config).toEqual({
        clientId: 'client_id_test',
        secret: 'secret_test',
        env: 'sandbox',
      });
      expect(decryptField).toHaveBeenCalledWith('encrypted_api_keys', mockDek);
    });

    it('throws error when settings are not found in database', async () => {
      const db = getDb() as any;
      db.limit.mockResolvedValue([]);

      await expect(getPlaidConfig(mockUserId, mockDek)).rejects.toThrow(
        'Plaid API credentials not configured. Please add them in Settings -> Advanced tab.'
      );
    });

    it('throws error when decryption fails', async () => {
      const db = getDb() as any;
      db.limit.mockResolvedValue([{ apiKeys: 'encrypted_api_keys' }]);
      (decryptField as any).mockResolvedValue(null);

      await expect(getPlaidConfig(mockUserId, mockDek)).rejects.toThrow(
        'Plaid API credentials decryption failed.'
      );
    });

    it('throws error when client ID or secret is missing', async () => {
      const mockApiKeys = JSON.stringify({
        plaidClientId: '',
        plaidSecret: 'secret_test',
        plaidEnvironment: 'sandbox',
      });

      const db = getDb() as any;
      db.limit.mockResolvedValue([{ apiKeys: 'encrypted_api_keys' }]);
      (decryptField as any).mockResolvedValue(mockApiKeys);

      await expect(getPlaidConfig(mockUserId, mockDek)).rejects.toThrow(
        'Plaid Client ID or Secret is missing. Please add them in Settings -> Advanced tab.'
      );
    });
  });

  describe('getPlaidClient', () => {
    it('returns a configured PlaidApi instance', async () => {
      const mockApiKeys = JSON.stringify({
        plaidClientId: 'client_id_test',
        plaidSecret: 'secret_test',
        plaidEnvironment: 'sandbox',
      });

      const db = getDb() as any;
      db.limit.mockResolvedValue([{ apiKeys: 'encrypted_api_keys' }]);
      (decryptField as any).mockResolvedValue(mockApiKeys);

      const client = await getPlaidClient(mockUserId, mockDek);

      expect(client).toBeInstanceOf(PlaidApi);
      expect((client as any).configuration.baseOptions.headers['PLAID-CLIENT-ID']).toBe('client_id_test');
      expect((client as any).configuration.baseOptions.headers['PLAID-SECRET']).toBe('secret_test');
    });
  });
});
