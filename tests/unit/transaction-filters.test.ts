import { describe, it, expect } from 'vitest';
import { getAccountGroupTypes, getAccountGroupKey } from '@/lib/constants/account-types';

describe('Transaction Account Groups and Type Mapping', () => {
  it('correctly maps BANKING to constituent account types', () => {
    const types = getAccountGroupTypes('BANKING');
    expect(types).toContain('checking');
    expect(types).toContain('savings');
    expect(types).toContain('cash');
  });

  it('correctly maps INVESTMENTS to constituent account types', () => {
    const types = getAccountGroupTypes('INVESTMENTS');
    expect(types).toContain('investment');
    expect(types).toContain('brokerage');
    expect(types).toContain('retirement');
    expect(types).toContain('401k');
  });

  it('correctly maps CREDIT to constituent account types', () => {
    const types = getAccountGroupTypes('CREDIT');
    expect(types).toContain('credit');
    expect(types).toContain('loan');
    expect(types).toContain('mortgage');
  });

  it('correctly maps ASSETS to constituent account types', () => {
    const types = getAccountGroupTypes('ASSETS');
    expect(types).toContain('vehicle');
    expect(types).toContain('crypto');
    expect(types).toContain('realestate');
  });

  it('correctly resolves account group keys for badge styling', () => {
    expect(getAccountGroupKey('checking')).toBe('BANKING');
    expect(getAccountGroupKey('savings')).toBe('BANKING');
    expect(getAccountGroupKey('brokerage')).toBe('INVESTMENTS');
    expect(getAccountGroupKey('401k')).toBe('INVESTMENTS');
    expect(getAccountGroupKey('credit')).toBe('CREDIT');
    expect(getAccountGroupKey('mortgage')).toBe('CREDIT');
    expect(getAccountGroupKey('realestate')).toBe('ASSETS');
    expect(getAccountGroupKey('vehicle')).toBe('ASSETS');
  });
});
