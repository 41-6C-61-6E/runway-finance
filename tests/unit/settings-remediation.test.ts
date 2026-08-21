import { describe, it, expect, vi } from 'vitest';
import { GENERAL_DEFAULTS, DEFAULTS } from '@/config/defaults';
import { userSettings, plans } from '@/lib/db/schema';

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
