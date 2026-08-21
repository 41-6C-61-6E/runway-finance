import { describe, it, expect } from 'vitest';

describe('Investments Time-Weighted Return (TWR) Logic', () => {
  it('calculates 0% TWR for flat balance with no cash flows', () => {
    const balances = [10000, 10000, 10000];
    const cashFlows = [0, 0, 0];

    let cumulativeFactor = 1.0;
    for (let i = 1; i < balances.length; i++) {
      const prev = balances[i - 1];
      const curr = balances[i];
      const cf = cashFlows[i];
      const r_t = (curr - cf) / prev - 1;
      cumulativeFactor *= (1 + r_t);
    }

    const twrPct = (cumulativeFactor - 1) * 100;
    expect(twrPct).toBe(0);
  });

  it('isolates organic investment return when a large deposit occurs', () => {
    // Day 0: $10,000
    // Day 1: Market goes up 10% -> $11,000, plus user deposits $5,000 -> balance becomes $16,000
    // Simple % return would say ($16,000 - $10,000) / $10,000 = 60%
    // True TWR should only reflect the 10% market gain: ($16,000 - $5,000) / $10,000 - 1 = 10%
    const balances = [10000, 16000];
    const cashFlows = [0, 5000];

    let cumulativeFactor = 1.0;
    for (let i = 1; i < balances.length; i++) {
      const prev = balances[i - 1];
      const curr = balances[i];
      const cf = cashFlows[i];
      const r_t = (curr - cf) / prev - 1;
      cumulativeFactor *= (1 + r_t);
    }

    const twrPct = Math.round((cumulativeFactor - 1) * 10000) / 100;
    expect(twrPct).toBe(10);
  });

  it('isolates organic investment return when a withdrawal occurs', () => {
    // Day 0: $10,000
    // Day 1: Market drops 5% -> $9,500, and user withdraws $2,000 -> balance becomes $7,500
    // Simple % return would say -25%
    // True TWR should only reflect the -5% market return: ($7,500 - (-$2,000)) / $10,000 - 1 = -5%
    const balances = [10000, 7500];
    const cashFlows = [0, -2000];

    let cumulativeFactor = 1.0;
    for (let i = 1; i < balances.length; i++) {
      const prev = balances[i - 1];
      const curr = balances[i];
      const cf = cashFlows[i];
      const r_t = (curr - cf) / prev - 1;
      cumulativeFactor *= (1 + r_t);
    }

    const twrPct = Math.round((cumulativeFactor - 1) * 10000) / 100;
    expect(twrPct).toBe(-5);
  });

  it('compounds multi-period TWR accurately across multiple cash flow events', () => {
    // Period 1: $10,000 -> +10% -> $11,000 (+ $1,000 deposit) => $12,000
    // Period 2: $12,000 -> -10% -> $10,800 (no deposit) => $10,800
    // Compound return = (1 + 0.10) * (1 - 0.10) - 1 = 0.99 - 1 = -1%
    const balances = [10000, 12000, 10800];
    const cashFlows = [0, 1000, 0];

    let cumulativeFactor = 1.0;
    for (let i = 1; i < balances.length; i++) {
      const prev = balances[i - 1];
      const curr = balances[i];
      const cf = cashFlows[i];
      const r_t = (curr - cf) / prev - 1;
      cumulativeFactor *= (1 + r_t);
    }

    const twrPct = Math.round((cumulativeFactor - 1) * 10000) / 100;
    expect(twrPct).toBe(-1);
  });
});
