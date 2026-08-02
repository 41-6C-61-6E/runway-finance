import { describe, it, expect } from 'vitest';
import { extractZipCodeFromAddress } from '@/components/real-estate/real-estate-form';
import { isRealEstateType, REAL_ESTATE_SUBTYPES, parseAccountMetadata } from '@/lib/constants/account-types';

describe('Real Estate Helpers & Auto-ZIP Extraction', () => {
  it('extracts 5-digit ZIP codes from standard street addresses', () => {
    expect(extractZipCodeFromAddress('123 Main St, San Francisco, CA 94105')).toBe('94105');
    expect(extractZipCodeFromAddress('456 Market Street, Seattle, WA 98101-1234')).toBe('98101');
    expect(extractZipCodeFromAddress('No zip code here')).toBeNull();
    expect(extractZipCodeFromAddress('')).toBeNull();
  });

  it('correctly identifies real estate account types', () => {
    expect(isRealEstateType('realestate')).toBe(true);
    expect(isRealEstateType('primaryhome')).toBe(true);
    expect(isRealEstateType('condo')).toBe(true);
    expect(isRealEstateType('checking')).toBe(false);
    expect(isRealEstateType('mortgage')).toBe(false);
    expect(isRealEstateType(null)).toBe(false);
  });

  it('safely parses account metadata JSON', () => {
    expect(parseAccountMetadata('{"address":"123 Main St","zipCode":"94105"}')).toEqual({
      address: '123 Main St',
      zipCode: '94105',
    });
    expect(parseAccountMetadata({ address: '123 Main St' })).toEqual({ address: '123 Main St' });
    expect(parseAccountMetadata(null)).toEqual({});
    expect(parseAccountMetadata('invalid json')).toEqual({});
  });
});
