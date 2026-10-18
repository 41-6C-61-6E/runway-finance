import { describe, it, expect } from 'vitest';
import { buildAccountLabel, formatDollar, formatPercent } from '@/lib/ask/redact';

describe('Ask Redaction and Label Sanitization', () => {
  const accountWithSentinels = {
    id: 'acc-test-1',
    type: 'checking',
    name: 'SENTINEL_ACCT_NAME_CHASE_CHECKING',
    owner: 'primary',
  };

  const spouseAccountWithSentinels = {
    id: 'acc-test-2',
    type: '401k',
    name: 'SENTINEL_ACCT_NAME_FIDELITY_401K',
    owner: 'spouse',
  };

  it('redacts account names by default and produces generic numbered labels', () => {
    const typeIndexMap = new Map<string, number>();

    const label1 = buildAccountLabel(accountWithSentinels, false, typeIndexMap);
    expect(label1).toBe('Checking #1');
    expect(label1).not.toContain('SENTINEL_ACCT_NAME');

    const label2 = buildAccountLabel(spouseAccountWithSentinels, false, typeIndexMap);
    expect(label2).toBe('401(k) (spouse) #1');
    expect(label2).not.toContain('SENTINEL_ACCT_NAME');

    // Subsequent account of same type gets incremented index
    const label3 = buildAccountLabel(
      { id: 'acc-test-3', type: 'checking', name: 'SENTINEL_ACCT_NAME_OTHER', owner: 'primary' },
      false,
      typeIndexMap
    );
    expect(label3).toBe('Checking #2');
    expect(label3).not.toContain('SENTINEL_ACCT_NAME');
  });

  it('reveals real account names ONLY when includeAccountNames is true', () => {
    const labelWithNames = buildAccountLabel(accountWithSentinels, true);
    expect(labelWithNames).toBe('SENTINEL_ACCT_NAME_CHASE_CHECKING');

    const labelWithoutNames = buildAccountLabel(accountWithSentinels, false);
    expect(labelWithoutNames).toBe('Checking #1');
  });

  it('formats whole dollar amounts and percentages correctly', () => {
    expect(formatDollar(12345.67)).toBe('$12,346');
    expect(formatDollar(-1200.25)).toBe('-$1,200');
    expect(formatDollar(0)).toBe('$0');

    expect(formatPercent(15.24)).toBe('15.2%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});
