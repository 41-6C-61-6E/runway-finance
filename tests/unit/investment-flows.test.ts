import { describe, it, expect } from 'vitest';
import {
  classifyTransaction,
  bucketCashFlow,
  yearMonthOf,
  addMonthsClamped,
  monthsBetween,
  buildMonthlyFlows,
  formatSignedPct,
  isNeutralType,
  isIncomeType,
} from '@/lib/utils/investment-flows';

describe('classifyTransaction', () => {
  it('classifies dividends (incl. capital gain distributions)', () => {
    expect(classifyTransaction('QUALIFIED DIVIDEND - AAPL', 'Apple Inc.', 25)).toBe('dividend');
    expect(classifyTransaction('SHORT TERM CAP GAIN DST', 'Vanguard', 10)).toBe('dividend');
    expect(classifyTransaction('CAP GAIN DST', 'VTI', 5)).toBe('dividend');
    expect(classifyTransaction('Capital Gain Distribution', 'VTI', 5)).toBe('dividend');
  });

  it('classifies interest', () => {
    expect(classifyTransaction('Interest Payment', 'Money Market', 3.21)).toBe('interest');
    expect(classifyTransaction('Accrued Interest', 'Vanguard', 1.1)).toBe('interest');
  });

  it('classifies reinvested dividend purchases as reinvestment, NOT dividend/buy', () => {
    expect(classifyTransaction('AUTOMATIC REINVESTMENT — BOUGHT 0.4 SH VOO', 'Vanguard', -32)).toBe('reinvestment');
    expect(classifyTransaction('DRIP - QUALIFIED DIVIDEND 1.20 SH', 'SCHD', -12)).toBe('reinvestment');
  });

  it('classifies buys and sells', () => {
    expect(classifyTransaction('Market Buy 10 XLF', 'Schwab', -500)).toBe('buy');
    expect(classifyTransaction('Limit Sell Order 5 AAPL', 'Fidelity', 620)).toBe('sell');
    expect(classifyTransaction('Proceeds - 0.5 SH VOO', 'Vanguard', 210)).toBe('sell');
  });

    it('classifies broker trade lines even when they look like deposits', () => {
      // Regression: "Investment buy" (401k auto-investment) was matched by the
      // old loose "buy " heuristic chain and bucketed as a contribution.
      expect(classifyTransaction('Investment buy', 'Vanguard', -33)).toBe('buy');
      expect(classifyTransaction('Investment purchase', 'Vanguard', -45)).toBe('buy');
      expect(classifyTransaction('Purchase: VMFSX', 'Fidelity', -1200)).toBe('buy');
      expect(classifyTransaction('Investment Sale', 'Vanguard', 310)).toBe('sell');
    });

    it('treats reversals as withdrawal-type (signed amount decides bucket)', () => {
      expect(classifyTransaction('Contribution Reversal', 'Schwab', -1500)).toBe('withdrawal');
      expect(classifyTransaction('FEE REVERSAL', 'Schwab', 0.5)).toBe('fee');
    });

    it('does not mistake "capital gains distribution" for a withdrawal', () => {
      expect(classifyTransaction('CAPITAL GAINS DISTRIBUTION', 'VTI', 120)).toBe('dividend');
      expect(classifyTransaction('IRA DISTRIBUTION TO checking', 'Vanguard', -5000)).toBe('withdrawal');
    });

  it('classifies contributions and withdrawals', () => {
    expect(classifyTransaction('ACH Deposit - Contribution', 'Schwab', 1500)).toBe('deposit');
    expect(classifyTransaction('Rollover In from 401k', 'Vanguard', 42000)).toBe('deposit');
    expect(classifyTransaction('ACH Withdrawal', 'Schwab', -1000)).toBe('withdrawal');
    expect(classifyTransaction('Rollover To Roth IRA', 'Fidelity', -5000)).toBe('withdrawal');
  });

  it('classifies fees (incl. margin interest & withholding)', () => {
    expect(classifyTransaction('Margin Interest', 'Schwab', -12)).toBe('fee');
    expect(classifyTransaction('SEC Fee', 'Fidelity', -0.5)).toBe('fee');
    expect(classifyTransaction('Backup Withholding 24%', 'Vanguard', -36)).toBe('fee');
  });

  it('falls back to other', () => {
    expect(classifyTransaction('Adjusted Cost Basis', 'Schwab', 0)).toBe('other');
  });
});

describe('bucketCashFlow', () => {
  it('buckets deposits as contributions (in)', () => {
    expect(bucketCashFlow('deposit', 1500)).toEqual({ bucket: 'contributions', mag: 1500 });
  });

  it('treats a negative "deposit" (reversal) as a withdrawal', () => {
    expect(bucketCashFlow('deposit', -250)).toEqual({ bucket: 'withdrawals', mag: 250 });
  });

  it('buckets withdrawals as outflows by magnitude (sign-agnostic)', () => {
    expect(bucketCashFlow('withdrawal', -1000)).toEqual({ bucket: 'withdrawals', mag: 1000 });
    // Corrections arrive as separate "reversal" rows, so a mis-signed row
    // still lands in the outflow bucket as its magnitude.
    expect(bucketCashFlow('withdrawal', 100)).toEqual({ bucket: 'withdrawals', mag: 100 });
  });

  it('uses whole-word keyword matching (no partial-word false hits)', () => {
    // "Interest Payment" must be interest even though "int" is also a keyword
    expect(classifyTransaction('Interest Payment', 'Schwab', 1.25)).toBe('interest');
    // "int" alone (truncated broker line) is still treated as interest
    expect(classifyTransaction('INT', 'Schwab', 0.75)).toBe('interest');
  });

  it('buckets income by magnitude (sign-agnostic)', () => {
    expect(bucketCashFlow('dividend', 25)).toEqual({ bucket: 'income', mag: 25 });
    expect(bucketCashFlow('interest', 3.2)).toEqual({ bucket: 'income', mag: 3.2 });
  });

  it('returns null for internal/neutral flows', () => {
    expect(bucketCashFlow('buy', -500)).toBeNull();
    expect(bucketCashFlow('sell', 620)).toBeNull();
    expect(bucketCashFlow('reinvestment', -32)).toBeNull();
    expect(bucketCashFlow('transfer', -10)).toBeNull();
    expect(bucketCashFlow('other', 500)).toBeNull();
    expect(bucketCashFlow('dividend', 0)).toBeNull();
  });
});

describe('month arithmetic', () => {
  it('yearMonthOf extracts YYYY-MM', () => {
    expect(yearMonthOf('2026-07-03')).toBe('2026-07');
    expect(yearMonthOf('2026-02')).toBe('2026-02');
  });

  it('addMonthsClamped clamps day to end of month', () => {
    expect(addMonthsClamped('2026-01', 1)).toBe('2026-02');
    expect(addMonthsClamped('2026-12', 1)).toBe('2027-01');
    expect(addMonthsClamped('2026-03', -1)).toBe('2026-02');
    expect(addMonthsClamped('2026-01', -12)).toBe('2025-01');
  });

  it('monthsBetween is inclusive', () => {
    expect(monthsBetween('2026-05', '2026-07')).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(monthsBetween('2025-11', '2026-01').length).toBe(3);
  });
});

describe('buildMonthlyFlows', () => {
  it('derives growth as the residual of snapshots vs cash flows (positive month)', () => {
    // start 10,000 → end 11,000 (delta +1,000); contributions +500, income +100 → growth +400
    const flows = buildMonthlyFlows(['2026-06'], {
      contributions: { '2026-06': 500 },
      withdrawals: {},
      income: { '2026-06': 100 },
      cashFlows: { '2026-06': 600 },
      deltas: { '2026-06': 1000 },
    });
    expect(flows[0]).toMatchObject({
      month: '2026-06',
      contributions: 500,
      withdrawals: 0,
      income: 100,
      growth: 400,
      losses: 0,
      net: 1000,
      delta: 1000,
    });
  });

  it('derives losses for negative residuals', () => {
    // delta −600, no flows → losses 600
    const flows = buildMonthlyFlows(['2026-06'], {
      contributions: {},
      withdrawals: {},
      income: {},
      cashFlows: {},
      deltas: { '2026-06': -600 },
    });
    expect(flows[0].growth).toBe(0);
    expect(flows[0].losses).toBe(600);
    expect(flows[0].net).toBe(-600);
  });

  it('mixed month: market loss + contribution + income', () => {
    // start 10k, end 9.7k (delta -300); contribution +1000, income +50 → residual -1350 → losses 1350
    const flows = buildMonthlyFlows(['2026-06'], {
      contributions: { '2026-06': 1000 },
      withdrawals: {},
      income: { '2026-06': 50 },
      cashFlows: { '2026-06': 1050 },
      deltas: { '2026-06': -300 },
    });
    expect(flows[0].losses).toBe(1350);
    expect(flows[0].growth).toBe(0);
    expect(flows[0].net).toBe(-300); // = delta
  });

  it('withdrawals & fees land in the same bucket as magnitudes', () => {
    const flows = buildMonthlyFlows(['2026-06'], {
      contributions: {},
      withdrawals: { '2026-06': 400 }, // withdrawal 350 + fee 50
      income: { '2026-06': 200 },
      cashFlows: { '2026-06': -150 },
      deltas: { '2026-06': -250 },
    });
    expect(flows[0].withdrawals).toBe(400);
    expect(flows[0].net).toBe(-250); // = delta
  });

  it('reports zero growth/losses and falls back to cash-flow net when deltas are missing', () => {
    const flows = buildMonthlyFlows(['2026-06'], {
      contributions: { '2026-06': 500 },
      withdrawals: { '2026-06': 100 },
      income: { '2026-06': 80 },
      cashFlows: { '2026-06': 480 },
      deltas: {},
    });
    expect(flows[0]).toMatchObject({ growth: 0, losses: 0, delta: null, net: 480 });
  });

  it('invariant: net always equals contributions − withdrawals + income + growth − losses', () => {
    const months = monthsBetween('2025-01', '2026-07');
    const flows = buildMonthlyFlows(months, {
      contributions: { '2025-03': 1000, '2026-02': 250 },
      withdrawals: { '2025-07': 300 },
      income: { '2025-04': 120, '2025-10': 95, '2026-01': 140 },
      cashFlows: {},
      deltas: { '2025-03': 2000, '2025-07': -4200, '2026-02': 610 },
    });
    for (const f of flows) {
      expect(f.net).toBe(f.contributions - f.withdrawals + f.income + f.growth - f.losses);
    }
  });
});

describe('formatSignedPct', () => {
  it('formats with sign and handling null', () => {
    expect(formatSignedPct(3.4557)).toBe('+3.5%');
    expect(formatSignedPct(-1.2)).toBe('-1.2%');
    expect(formatSignedPct(null)).toBe('—');
  });
});

describe('type predicates', () => {
  it('neutral types are reinvestment/transfer only', () => {
    expect(isNeutralType('reinvestment')).toBe(true);
    expect(isNeutralType('transfer')).toBe(true);
    expect(isNeutralType('buy')).toBe(false);
  });

  it('income types are dividend/interest', () => {
    expect(isIncomeType('dividend')).toBe(true);
    expect(isIncomeType('interest')).toBe(true);
    expect(isIncomeType('reinvestment')).toBe(false);
  });
});
