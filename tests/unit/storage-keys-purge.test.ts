// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllClientCaches } from '@/lib/query-client';

describe('Storage Keys Purge (clearAllClientCaches)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('purges all finance:, finance-, pf_, cf-chart:, and runway- keys on logout', async () => {
    localStorage.setItem('finance:transactions:compactView', 'true');
    localStorage.setItem('finance:budgets:periodType', 'monthly');
    localStorage.setItem('finance-accent', 'emerald');
    localStorage.setItem('pf_installed_build', '2026.11');
    localStorage.setItem('cf-chart:timeframe', '1y');
    localStorage.setItem('runway-settings', 'true');
    localStorage.setItem('unrelated-key', 'keep-me');

    await clearAllClientCaches();

    expect(localStorage.getItem('finance:transactions:compactView')).toBeNull();
    expect(localStorage.getItem('finance:budgets:periodType')).toBeNull();
    expect(localStorage.getItem('finance-accent')).toBeNull();
    expect(localStorage.getItem('pf_installed_build')).toBeNull();
    expect(localStorage.getItem('cf-chart:timeframe')).toBeNull();
    expect(localStorage.getItem('runway-settings')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
  });
});
