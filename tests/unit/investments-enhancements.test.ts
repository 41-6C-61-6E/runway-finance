import { vi, describe, it, expect } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn().mockImplementation((_table, rows) => Promise.resolve(rows)),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  }),
}));

import { classifyTransaction } from '@/app/api/investments/income/route';

describe('Investment Income Classification', () => {
  it('classifies dividend transactions with various broker descriptions', () => {
    expect(classifyTransaction('QUALIFIED DIVIDEND VOO', null, 42.5)).toBe('dividend');
    expect(classifyTransaction('ORDINARY DIV APPLE INC', null, 15.2)).toBe('dividend');
    expect(classifyTransaction('CAP GAIN DST FIDELITY 500', null, 120.0)).toBe('dividend');
    expect(classifyTransaction('DIVIDEND RECEIVED', 'VANGUARD', 88.1)).toBe('dividend');
  });

  it('classifies interest and money market yields', () => {
    expect(classifyTransaction('INTEREST PAYMENT', null, 1.25)).toBe('interest');
    expect(classifyTransaction('FED MMKT / SEC YIELD', null, 55.4)).toBe('interest');
    expect(classifyTransaction('CREDIT INTEREST', 'SCHWAB BANK', 14.8)).toBe('interest');
  });

  it('classifies trades and capital flows', () => {
    expect(classifyTransaction('YOU BOUGHT 10 SHARES SPY', null, -5200)).toBe('buy');
    expect(classifyTransaction('YOU SOLD 5 SHARES TSLA', null, 1250)).toBe('sell');
    expect(classifyTransaction('AUTOMATIC REINVESTMENT', null, 45.0)).toBe('reinvestment');
    expect(classifyTransaction('MANAGEMENT FEE Q3', null, -25.0)).toBe('fee');
    expect(classifyTransaction('DIRECT DEPOSIT BROKERAGE', null, 1000)).toBe('deposit');
  });
});
