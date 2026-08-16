import { vi } from 'vitest';

export const DEK_ERRORS = {
  unauth: new Error('No encryption key available — user may not be authenticated'),
  noKeyRow: (id: string) => new Error(`No encryption keys found for user: ${id}`),
  corruptWrap: new Error('Decryption failed: invalid ciphertext or tampered data'),
  missingServerKey: new Error('ENCRYPTION_KEY is missing or invalid'),
};

export const defaultDEK = new Uint8Array(32).fill(0xaa);

export const mockGetSessionDEK = vi.fn().mockResolvedValue(defaultDEK);
export const mockGetServerDEK = vi.fn().mockResolvedValue(defaultDEK);
export const mockInvalidateUserDEKCache = vi.fn();

export const getSessionDEK = mockGetSessionDEK;
export const getServerDEK = mockGetServerDEK;
export const invalidateUserDEKCache = mockInvalidateUserDEKCache;
