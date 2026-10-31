import { describe, it, expect } from 'vitest';
import {
  normalizeVestingSchedule,
  generateVestingEvents,
  computeGrantMetrics,
  buildPortfolioVestingTimeline,
  type EquityGrantInput,
} from '@/lib/utils/vesting';

const BASE_STOKE_GRANT: EquityGrantInput = {
  id: 'grant-stoke-1',
  accountId: 'acct-equity-1',
  companyName: 'Stoke Space',
  grantName: '2024 Initial ISO Grant',
  grantType: 'iso',
  grantDate: '2024-01-15',
  vestingStartDate: '2024-01-15',
  expirationDate: '2034-01-15',
  totalShares: 10000,
  exercisedShares: 0,
  soldShares: 0,
  strikePrice: 1.5,
  currentFmv: 6.5,
  preferredPrice: 12.0,
  valuationMode: 'fmv',
  earlyExerciseAllowed: false,
  filed83b: false,
  vestingSchedule: {
    totalMonths: 48,
    cliffMonths: 12,
    cliffPercent: 25,
    frequency: 'monthly',
  },
};

describe('lib/utils/vesting', () => {
  describe('normalizeVestingSchedule', () => {
    it('returns default 48m / 12m cliff schedule when empty or invalid', () => {
      const s = normalizeVestingSchedule(null);
      expect(s.totalMonths).toBe(48);
      expect(s.cliffMonths).toBe(12);
      expect(s.cliffPercent).toBe(25);
      expect(s.frequency).toBe('monthly');
    });

    it('parses JSON strings and clamps values safely', () => {
      const s = normalizeVestingSchedule(
        JSON.stringify({
          totalMonths: 36,
          cliffMonths: 6,
          cliffPercent: 16.67,
          frequency: 'quarterly',
        })
      );
      expect(s.totalMonths).toBe(36);
      expect(s.cliffMonths).toBe(6);
      expect(s.frequency).toBe('quarterly');
    });
  });

  describe('generateVestingEvents', () => {
    it('generates 1 cliff event + 36 monthly events for standard 48m/12m schedule', () => {
      const events = generateVestingEvents(
        BASE_STOKE_GRANT.vestingStartDate,
        BASE_STOKE_GRANT.totalShares,
        BASE_STOKE_GRANT.vestingSchedule
      );
      // 1 cliff (month 12) + 36 monthly events (months 13..48) = 37 events
      expect(events).toHaveLength(37);
      expect(events[0].date).toBe('2025-01-15');
      expect(events[0].sharesVestedOnDate).toBe(2500);
      expect(events[0].cumulativeVestedShares).toBe(2500);
      expect(events[0].isCliff).toBe(true);

      // Final event at 2028-01-15 sums exactly to 10,000 shares
      const last = events[events.length - 1];
      expect(last.date).toBe('2028-01-15');
      expect(last.cumulativeVestedShares).toBe(10000);
      expect(last.unvestedShares).toBe(0);
    });

    it('supports immediate vesting schedule', () => {
      const events = generateVestingEvents('2024-01-15', 10000, {
        totalMonths: 0,
        cliffMonths: 0,
        cliffPercent: 100,
        frequency: 'immediate',
      });
      expect(events).toHaveLength(1);
      expect(events[0].sharesVestedOnDate).toBe(10000);
      expect(events[0].cumulativeVestedShares).toBe(10000);
    });

    it('supports custom tranche schedule', () => {
      const events = generateVestingEvents('2024-01-15', 10000, {
        totalMonths: 24,
        cliffMonths: 0,
        cliffPercent: 0,
        frequency: 'custom',
        customTranches: [
          { date: '2024-07-15', shares: 3000 },
          { date: '2025-07-15', shares: 7000 },
        ],
      });
      expect(events).toHaveLength(2);
      expect(events[0].cumulativeVestedShares).toBe(3000);
      expect(events[1].cumulativeVestedShares).toBe(10000);
    });
  });

  describe('computeGrantMetrics', () => {
    it('calculates 0 vested shares before cliff date', () => {
      const m = computeGrantMetrics(BASE_STOKE_GRANT, '2024-11-01');
      expect(m.vestedShares).toBe(0);
      expect(m.unvestedShares).toBe(10000);
      expect(m.vestedIntrinsicValue).toBe(0);
      expect(m.unvestedIntrinsicValue).toBe(50000); // 10000 * ($6.50 - $1.50)
      expect(m.nextVestDate).toBe('2025-01-15');
      expect(m.nextVestShares).toBe(2500);
    });

    it('calculates exact cliff and monthly vesting post-cliff under 409A FMV', () => {
      // At 2025-01-15 (exact 12m cliff): 2,500 shares vested
      const atCliff = computeGrantMetrics(BASE_STOKE_GRANT, '2025-01-15');
      expect(atCliff.vestedShares).toBe(2500);
      expect(atCliff.spreadPerShare).toBe(5); // $6.50 - $1.50
      expect(atCliff.vestedIntrinsicValue).toBe(12500); // 2500 * $5.00
      expect(atCliff.cashToExerciseVested).toBe(3750); // 2500 * $1.50
      expect(atCliff.isoAmtBargainElement).toBe(12500);
      expect(atCliff.estimatedTaxOnVestedExercise).toBe(3250); // 12500 * 0.26
    });

    it('uses preferredPrice when valuationMode is preferred', () => {
      const preferredGrant: EquityGrantInput = {
        ...BASE_STOKE_GRANT,
        valuationMode: 'preferred',
      };
      const m = computeGrantMetrics(preferredGrant, '2025-01-15');
      expect(m.effectiveSharePrice).toBe(12.0);
      expect(m.spreadPerShare).toBe(10.5); // $12.00 - $1.50
      expect(m.vestedIntrinsicValue).toBe(26250); // 2500 * $10.50
    });

    it('accounts for exercised and sold shares properly', () => {
      const exercisedGrant: EquityGrantInput = {
        ...BASE_STOKE_GRANT,
        exercisedShares: 1000,
        soldShares: 200,
      };
      const m = computeGrantMetrics(exercisedGrant, '2025-01-15');
      // Vested = 2500. Exercised = 1000 (of which 200 sold -> 800 held).
      // Vested unexercised = 2500 - 1000 = 1500.
      expect(m.unexercisedVestedShares).toBe(1500);
      expect(m.heldExercisedShares).toBe(800);
      // Intrinsic value = 1500 * ($6.50 - $1.50) + 800 * $6.50 = 7500 + 5200 = 12700
      expect(m.vestedIntrinsicValue).toBe(12700);
      expect(m.exercisedCostBasis).toBe(1200); // 800 held * $1.50
    });

    it('handles underwater options gracefully (spread clamped to 0)', () => {
      const underwater: EquityGrantInput = {
        ...BASE_STOKE_GRANT,
        strikePrice: 10.0,
        currentFmv: 6.5,
      };
      const m = computeGrantMetrics(underwater, '2025-01-15');
      expect(m.spreadPerShare).toBe(0);
      expect(m.vestedIntrinsicValue).toBe(0);
    });

    it('zeroes out unexercised option value if grant is expired', () => {
      const expired: EquityGrantInput = {
        ...BASE_STOKE_GRANT,
        expirationDate: '2025-01-01',
      };
      const m = computeGrantMetrics(expired, '2026-01-15');
      expect(m.isExpired).toBe(true);
      expect(m.unexercisedVestedShares).toBe(0);
      expect(m.vestedIntrinsicValue).toBe(0);
    });
  });

  describe('buildPortfolioVestingTimeline', () => {
    it('builds monthly timeline points across the grant lifecycle', () => {
      const timeline = buildPortfolioVestingTimeline([BASE_STOKE_GRANT], '2025-06-15');
      expect(timeline.length).toBeGreaterThanOrEqual(48);
      expect(timeline[0].vestedShares).toBe(0);
      const finalPoint = timeline[timeline.length - 1];
      expect(finalPoint.vestedShares).toBe(10000);
      expect(finalPoint.vestedValueEffective).toBe(50000);
    });
  });
});
