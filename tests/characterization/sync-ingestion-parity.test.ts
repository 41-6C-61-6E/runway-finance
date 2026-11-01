import { describe, it, expect } from 'vitest';
import { SimplefinAdapter } from '@/lib/integrations/adapters/simplefin-adapter';
import { PlaidAdapter } from '@/lib/integrations/adapters/plaid-adapter';

describe('Characterization: Provider Adapters Parity', () => {
  it('instantiates SimplefinAdapter with correct provider name', () => {
    const adapter = new SimplefinAdapter();
    expect(adapter.provider).toBe('simplefin');
  });

  it('instantiates PlaidAdapter with correct provider name', () => {
    const adapter = new PlaidAdapter();
    expect(adapter.provider).toBe('plaid');
  });
});

