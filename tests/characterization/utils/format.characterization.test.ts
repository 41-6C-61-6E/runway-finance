import { describe, it, expect } from 'vitest';
import {
  formatBalance,
  formatAmount,
  formatProjected,
  formatCurrency,
  formatCompactCurrency,
  formatPercent,
  formatPlainPercent,
  roundToCents,
  formatFileSize,
  formatMultiplier,
  formatDurationYears,
} from '@/lib/utils/format';

describe('Format Utilities Characterization Matrix', () => {
  const numericInputs = [
    0,
    -0,
    1,
    -1,
    0.05,
    -0.05,
    1234.56,
    -1234.56,
    999999.99,
    1000000,
    -1000000,
    123456789,
    0.0001,
    NaN,
    Infinity,
    -Infinity,
    null as unknown as number,
    undefined as unknown as number,
  ];

  it('characterizes formatBalance edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatBalance(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatAmount edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatAmount(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatCurrency edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatCurrency(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatCompactCurrency edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatCompactCurrency(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatPercent edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatPercent(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatPlainPercent edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      output: formatPlainPercent(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes roundToCents edge cases', () => {
    const results = numericInputs.map((val) => ({
      input: String(val),
      cents: roundToCents(val),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes formatMultiplier and formatDurationYears', () => {
    const multipliers = [0, 0.5, 1, 1.25, 2.5, 10];
    const results = multipliers.map((val) => ({
      input: val,
      multiplier: formatMultiplier(val),
      duration: formatDurationYears(val),
    }));
    expect(results).toMatchSnapshot();
  });
});

