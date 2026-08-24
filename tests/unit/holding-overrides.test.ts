import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

let setSpy: any;
let returningSpy: any;

const updateResult: unknown[] = [{ id: 'row-1' }];

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    update: () => ({
      set: (payload: unknown) => {
        setSpy(payload);
        return {
          where: () => ({
            returning: (cols: unknown) => returningSpy(cols),
          }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/crypto', () => ({
  encryptField: async (value: string) => `enc:${value}`,
  decryptField: vi.fn().mockResolvedValue(''),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

import {
  isValidIdentifier,
  updateHoldingOverrides,
  resolveDisplayTicker,
} from '@/app/api/investments/helpers/holding-overrides';

beforeEach(() => {
  setSpy = vi.fn();
  returningSpy = vi.fn().mockResolvedValue(updateResult);
});

describe('isValidIdentifier', () => {
  it('accepts standard 1–12 char tickers with suffix characters', () => {
    expect(isValidIdentifier('VOO')).toBe(true);
    expect(isValidIdentifier('BRK.A')).toBe(true);
    expect(isValidIdentifier('SPY-ETF')).toBe(true);
    expect(isValidIdentifier('A')).toBe(true);
    expect(isValidIdentifier('123456789012')).toBe(true);
  });

  it('rejects empty, oversized, and malformed values', () => {
    expect(isValidIdentifier('')).toBe(false);
    expect(isValidIdentifier('   ')).toBe(false);
    expect(isValidIdentifier('1234567890123')).toBe(false); // 13 chars
    expect(isValidIdentifier('SP Y')).toBe(false);
    expect(isValidIdentifier('BRK/A')).toBe(false);
    expect(isValidIdentifier('ABC$')).toBe(false);
  });
});

describe('resolveDisplayTicker', () => {
  it('prefers a valid override, then raw ticker, then equivalent', () => {
    expect(resolveDisplayTicker(null, 'LARGECAP', 'VOO')).toBe('LARGECAP');
    expect(resolveDisplayTicker('LMSMPH', null, 'IWM')).toBe('LMSMPH');
    expect(resolveDisplayTicker(null, null, 'VOO')).toBe('VOO');
  });

  it('skips invalid overrides and equivalents', () => {
    expect(resolveDisplayTicker('LMSMPH', 'BAD TICKER', null)).toBe('LMSMPH');
    expect(resolveDisplayTicker(null, null, 'TOO LONG TICKER AB')).toBe(null);
    expect(resolveDisplayTicker(null, ' ', 'VOO')).toBe('VOO');
  });

  it('returns null when nothing is resolvable', () => {
    expect(resolveDisplayTicker(null, null, null)).toBe(null);
  });
});

describe('updateHoldingOverrides (three-state semantics)', () => {
  const securityId = 'sec-1';
  const userId = 'user-1';

  function capturedSet(): Record<string, unknown> {
    return setSpy.mock.calls[0][0];
  }

  it('writes encrypted values for provided non-empty fields', async () => {
    await updateHoldingOverrides(securityId, userId, 'VOO', 'VOO');
    expect(setSpy).toHaveBeenCalledTimes(1);
    const set = capturedSet();
    expect(set.tickerOverride).toBe('enc:VOO');
    expect(set.publicEquivalent).toBe('enc:VOO');
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('writes NULL to explicitly clear a field (not undefined)', async () => {
    await updateHoldingOverrides(securityId, userId, '', 'VOO');
    const set = capturedSet();
    expect(set.tickerOverride).toBeNull();
    expect(set.publicEquivalent).toBe('enc:VOO');
  });

  it('leaves the column untouched when the field was not sent', async () => {
    await updateHoldingOverrides(securityId, userId, 'LARGECAP', undefined);
    const set = capturedSet();
    expect(set.tickerOverride).toBe('enc:LARGECAP');
    expect(set.publicEquivalent).toBeUndefined(); // omitted from UPDATE
  });

  it('normalizes case and whitespace before encrypting', async () => {
    await updateHoldingOverrides(securityId, userId, ' voo ', undefined);
    const set = capturedSet();
    expect(set.tickerOverride).toBe('enc:VOO');
  });

  it('throws holding_not_found when no rows match', async () => {
    returningSpy.mockResolvedValueOnce([]);
    await expect(
      updateHoldingOverrides(securityId, userId, 'VOO', undefined)
    ).rejects.toThrow('holding_not_found');
  });
});
