import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('Logger Metadata Redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redacts sensitive keys before passing to console.error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('Authentication failure', {
      username: 'testuser',
      password: 'supersecretpassword',
      dek: '0123456789abcdef',
      token: 'bearer-token-123',
    });

    expect(consoleSpy).toHaveBeenCalled();
    const passedMeta = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(passedMeta.username).toBe('testuser');
    expect(passedMeta.password).toBe('[REDACTED]');
    expect(passedMeta.dek).toBe('[REDACTED]');
    expect(passedMeta.token).toBe('[REDACTED]');

    consoleSpy.mockRestore();
  });
});

