import { describe, it, expect } from 'vitest';
import {
  isAssetAccount,
  isLiabilityAccount,
  getSignedNetWorthBalance,
  getTaxWrapper,
  ASSET_ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
} from '@/lib/utils/account-scope';

describe('Account Scope Utilities Characterization Matrix', () => {
  const testAccountTypes = [
    'checking',
    'savings',
    'credit',
    'loan',
    'mortgage',
    'investment',
    'brokerage',
    '401k',
    'rothira',
    'traditionalira',
    'realestate',
    'vehicle',
    'crypto',
    'other',
    'unknown_custom_type',
    '',
  ];

  it('characterizes isAssetAccount across account types', () => {
    const results = testAccountTypes.map((type) => ({
      type,
      isAsset: isAssetAccount(type),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes isLiabilityAccount across account types', () => {
    const results = testAccountTypes.map((type) => ({
      type,
      isLiability: isLiabilityAccount(type),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes getSignedNetWorthBalance across balance and account types', () => {
    const balances = [1000, -1000, 0];
    const results = testAccountTypes.flatMap((type) =>
      balances.map((balance) => ({
        type,
        balance,
        signed: getSignedNetWorthBalance(balance, type),
      }))
    );
    expect(results).toMatchSnapshot();
  });

  it('characterizes getTaxWrapper classification', () => {
    const accounts = [
      { type: '401k', name: 'Company 401(k)' },
      { type: 'rothira', name: 'Roth IRA' },
      { type: 'brokerage', name: 'Taxable Brokerage' },
      { type: 'checking', name: 'Main Checking' },
      { type: 'hsa', name: 'Health Savings' },
    ];
    const results = accounts.map((acc) => ({
      account: acc,
      wrapper: getTaxWrapper(acc),
    }));
    expect(results).toMatchSnapshot();
  });
});

