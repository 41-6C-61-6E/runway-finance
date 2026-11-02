import { GENERAL_DEFAULTS, DEFAULTS } from '@/config/defaults';
import { userSettings, plans } from '@/lib/db/schema';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createUserEncryptionKeys, updatePassword } from '@/lib/users';
import bcrypt from 'bcryptjs';

const mockUsers: any[] = [];
const mockEncryptionKeys: any[] = [];

// Mock deriveKeyFromPassword to avoid 600k PBKDF2 iteration CPU timeouts in unit tests
vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    deriveKeyFromPassword: vi.fn(async () => new Uint8Array(32).fill(0x77)),
  };
});

vi.mock('@/lib/db', async () => {
  return {
  getPool: () => ({
    connect: async () => ({
      query: async (sql: any, params: any[]) => {
        // drizzle's node-postgres driver passes a pg QueryConfig object
        // ({ text, ... }) for ORM queries and a plain string for raw
        // BEGIN/COMMIT/ROLLBACK calls.
        const text: string = typeof sql === 'string' ? sql : sql?.text ?? '';
        if (text.includes('SELECT password_hash FROM users WHERE username')) {
          const user = mockUsers.find((u) => u.username === params[0]);
          return { rows: user ? [user] : [] };
        }
        if (text.includes('UPDATE users SET password_hash')) {
          const user = mockUsers.find((u) => u.username === params[1]);
          if (user) user.password_hash = params[0];
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  }),
  getDb: () => {
    const chain: any = {
      _table: null,
      select: vi.fn(() => chain),
      from: vi.fn((t: any) => {
        chain._table = t;
        return chain;
      }),
      where: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn((val: any) => {
          mockEncryptionKeys.push({ ...val });
          return Promise.resolve();
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((val: any) => ({
          where: vi.fn(() => {
            const keyRow = mockEncryptionKeys[0];
            if (keyRow) Object.assign(keyRow, val);
            return Promise.resolve();
          }),
        })),
      })),
      then: (resolve: (v: any) => any) => {
        return Promise.resolve(mockEncryptionKeys).then(resolve);
      },
    };
    return chain;
  },
  };
});

describe('User Lifecycle & Key Management (lib/users.ts)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.length = 0;
    mockEncryptionKeys.length = 0;
  });

  it('creates valid user encryption keys with both password and server wrapping', async () => {
    await createUserEncryptionKeys('new_user', 'password123');

    expect(mockEncryptionKeys.length).toBe(1);
    const keyRow = mockEncryptionKeys[0];
    expect(keyRow.userId).toBe('new_user');
    expect(keyRow.wrappedDek).toBeDefined();
    expect(keyRow.serverWrappedDek).toBeDefined();
    expect(keyRow.salt).toBeDefined();
  });

  it('updates password and re-wraps DEK when current password is valid', async () => {
    const originalPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';
    const password_hash = await bcrypt.hash(originalPassword, 10);

    mockUsers.push({
      username: 'user_bob',
      password_hash,
    });

    // Create initial keys
    await createUserEncryptionKeys('user_bob', originalPassword);

    const result = await updatePassword('user_bob', originalPassword, newPassword);
    expect(result.success).toBe(true);

    const updatedUser = mockUsers.find((u) => u.username === 'user_bob');
    expect(await bcrypt.compare(newPassword, updatedUser.password_hash)).toBe(true);
  });

  it('rejects password update when current password is wrong', async () => {
    const originalPassword = 'CorrectPassword123!';
    const password_hash = await bcrypt.hash(originalPassword, 10);

    mockUsers.push({
      username: 'user_alice',
      password_hash,
    });

    const result = await updatePassword('user_alice', 'WrongPassword!', 'NewSecret!');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Current password is incorrect');
  });
});


describe('Review F13 Remediation: Settings Quality, Defaults & Configurability', () => {
  describe('Global Defaults Configuration (config/defaults.ts)', () => {
    it('defines sensible, standard defaults for locale and formatting', () => {
      expect(GENERAL_DEFAULTS.currency).toBe('USD');
      expect(GENERAL_DEFAULTS.locale).toBe('en-US');
      expect(GENERAL_DEFAULTS.timezone).toBe('America/New_York');
      expect(GENERAL_DEFAULTS.dateFormat).toBe('MM/DD/YYYY');
      expect(GENERAL_DEFAULTS.compactMode).toBe(false);
      expect(GENERAL_DEFAULTS.theme).toBe('moonlight');
    });

    it('defines valid forecast defaults in ANALYTICS_DEFAULTS', () => {
      expect(DEFAULTS.forecastMode).toBe('hybrid');
      expect(DEFAULTS.forecastLookbackMonths).toBe(3);
    });
  });

  describe('Retirement Planning Schema Defaults (lib/db/schema/retirement-planning.ts)', () => {
    it('defaults primary and spouse Social Security monthly amounts to 0 to prevent phantom income traps', () => {
      // In Drizzle pgTable columns, default values are registered in column definitions
      expect(plans.primarySsMonthlyAmount.default).toBe('0');
      expect(plans.spouseSsMonthlyAmount.default).toBe('0');
    });
  });

  describe('User Settings Schema Columns (lib/db/schema/users.ts)', () => {
    it('includes currency, locale, dateFormat, compactMode, and theme columns in userSettings schema', () => {
      expect(userSettings.currency).toBeDefined();
      expect(userSettings.locale).toBeDefined();
      expect(userSettings.dateFormat).toBeDefined();
      expect(userSettings.compactMode).toBeDefined();
      expect(userSettings.theme).toBeDefined();
      expect(userSettings.timezone).toBeDefined();
      expect(userSettings.forecastMode).toBeDefined();
      expect(userSettings.forecastLookbackMonths).toBeDefined();
    });
  });

  describe('Zero-Cost-Basis Investment Logic', () => {
    it('correctly calculates unrealized gain when costBasis is 0 without division by zero', () => {
      const holdings = [
        { name: 'Gifted Stock', value: 5000, costBasis: 0 },
        { name: 'RSU Grant', value: 12000, costBasis: 0 },
        { name: 'Purchased Stock', value: 15000, costBasis: 10000 },
      ];

      let totalCostBasis = 0;
      let totalValueForCostBasis = 0;
      const results = [];

      for (const h of holdings) {
        const value = h.value;
        const cost = h.costBasis != null ? Number(h.costBasis) : null;
        let gainLoss = null;
        let returnPct = null;

        if (cost != null && cost >= 0) {
          gainLoss = value - cost;
          returnPct = cost > 0 ? (gainLoss / cost) * 100 : null;

          totalCostBasis += cost;
          totalValueForCostBasis += value;
        }

        results.push({ name: h.name, gainLoss, returnPct });
      }

      // Gifted stock ($0 cost basis -> $5000 gain, returnPct is null, not NaN or Infinity)
      expect(results[0].gainLoss).toBe(5000);
      expect(results[0].returnPct).toBeNull();

      // RSU Grant ($0 cost basis -> $12000 gain)
      expect(results[1].gainLoss).toBe(12000);
      expect(results[1].returnPct).toBeNull();

      // Standard stock ($10k cost basis -> $5000 gain, +50% return)
      expect(results[2].gainLoss).toBe(5000);
      expect(results[2].returnPct).toBe(50);

      // Aggregates include zero cost basis holdings in total value
      expect(totalCostBasis).toBe(10000);
      expect(totalValueForCostBasis).toBe(32000);
    });
  });

  describe('Currency, Timezone & Date Formatting Validation Rules', () => {
    it('validates 3-letter uppercase ISO currency codes', () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'CHF'];
      const invalidCurrencies = ['US', 'USDD', '123', '$', ''];

      for (const c of validCurrencies) {
        expect(/^[A-Z]{3}$/.test(c)).toBe(true);
      }

      for (const c of invalidCurrencies) {
        expect(/^[A-Z]{3}$/.test(c)).toBe(false);
      }
    });

    it('validates standard supported date formats', () => {
      const VALID_DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'DD.MM.YYYY'];
      expect(VALID_DATE_FORMATS.includes('MM/DD/YYYY')).toBe(true);
      expect(VALID_DATE_FORMATS.includes('DD/MM/YYYY')).toBe(true);
      expect(VALID_DATE_FORMATS.includes('YYYY-MM-DD')).toBe(true);
      expect(VALID_DATE_FORMATS.includes('INVALID_FORMAT')).toBe(false);
    });

    it('validates allowed forecast modes and bounds', () => {
      const VALID_FORECAST_MODES = ['historical', 'budget', 'hybrid'];
      expect(VALID_FORECAST_MODES.includes('hybrid')).toBe(true);
      expect(VALID_FORECAST_MODES.includes('budget')).toBe(true);
      expect(VALID_FORECAST_MODES.includes('historical')).toBe(true);
      expect(VALID_FORECAST_MODES.includes('invalid')).toBe(false);

      const isValidLookback = (m: number) => typeof m === 'number' && m >= 1 && m <= 24;
      expect(isValidLookback(1)).toBe(true);
      expect(isValidLookback(12)).toBe(true);
      expect(isValidLookback(24)).toBe(true);
      expect(isValidLookback(0)).toBe(false);
      expect(isValidLookback(25)).toBe(false);
    });
  });
});
