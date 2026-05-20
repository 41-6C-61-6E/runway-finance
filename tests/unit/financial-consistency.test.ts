import { describe, it, expect } from 'vitest';
import { ASSET_ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES, isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { TYPE_HIERARCHY, ACCOUNT_TYPE_LABELS } from '@/lib/constants/account-types';

describe('financial-consistency', () => {
  describe('account-scope vs account-types alignment', () => {
    const hierarchyTypes = Object.keys(TYPE_HIERARCHY);
    const liabilityGroupTypes = hierarchyTypes.filter(
      (t) => TYPE_HIERARCHY[t].group === 'Credit' || TYPE_HIERARCHY[t].group === 'Loans' || TYPE_HIERARCHY[t].group === 'Liabilities'
    );
    const nonLiabilityTypes = hierarchyTypes.filter(
      (t) => !liabilityGroupTypes.includes(t)
    );

    it('all non-liability types from TYPE_HIERARCHY are in ASSET_ACCOUNT_TYPES', () => {
      const missing = nonLiabilityTypes.filter((t) => !ASSET_ACCOUNT_TYPES.includes(t));
      expect(missing).toEqual([]);
    });

    it('all liability types from TYPE_HIERARCHY are in LIABILITY_ACCOUNT_TYPES', () => {
      const missing = liabilityGroupTypes.filter((t) => !LIABILITY_ACCOUNT_TYPES.includes(t));
      expect(missing).toEqual([]);
    });

    it('every ASSET_ACCOUNT_TYPE has a label in ACCOUNT_TYPE_LABELS', () => {
      const missing = ASSET_ACCOUNT_TYPES.filter((t) => !ACCOUNT_TYPE_LABELS[t]);
      expect(missing).toEqual([]);
    });

    it('every LIABILITY_ACCOUNT_TYPE has a label in ACCOUNT_TYPE_LABELS', () => {
      const missing = LIABILITY_ACCOUNT_TYPES.filter((t) => !ACCOUNT_TYPE_LABELS[t]);
      expect(missing).toEqual([]);
    });
  });

  describe('isAssetAccount / isLiabilityAccount coverage', () => {
    it('isAssetAccount returns true for every ASSET_ACCOUNT_TYPE', () => {
      for (const t of ASSET_ACCOUNT_TYPES) {
        expect(isAssetAccount(t), `${t} should be classified as asset`).toBe(true);
      }
    });

    it('isLiabilityAccount returns true for every LIABILITY_ACCOUNT_TYPE', () => {
      for (const t of LIABILITY_ACCOUNT_TYPES) {
        expect(isLiabilityAccount(t), `${t} should be classified as liability`).toBe(true);
      }
    });

    it('no account type is both an asset and a liability', () => {
      const overlap = ASSET_ACCOUNT_TYPES.filter((t) => LIABILITY_ACCOUNT_TYPES.includes(t));
      expect(overlap).toEqual([]);
    });
  });

  describe('special account types present', () => {
    it('includes hsa and health as asset types', () => {
      expect(ASSET_ACCOUNT_TYPES).toContain('hsa');
      expect(ASSET_ACCOUNT_TYPES).toContain('health');
    });
  });
});
