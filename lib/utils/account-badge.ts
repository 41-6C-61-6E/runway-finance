import { TYPE_HIERARCHY } from '@/lib/constants/account-types';

export function getBadgeClasses(type: string): string {
  const lowerType = type.toLowerCase();
  
  if (lowerType === 'vehicle') return 'badge-pill badge-vehicle';
  if (lowerType === 'metals') return 'badge-pill badge-metals';
  if (lowerType === 'checking' || lowerType === 'savings' || lowerType === 'cash') {
    return 'badge-pill badge-banking';
  }
  if (lowerType === 'credit' || lowerType === 'loan' || lowerType === 'mortgage' || lowerType === 'liability') {
    return 'badge-pill badge-credit';
  }
  
  const hierarchy = TYPE_HIERARCHY[lowerType];
  const group = hierarchy?.group ?? 'Other';
  
  switch (group) {
    case 'Banking':
    case 'Assets':
      return 'badge-pill badge-banking';
    case 'Credit':
    case 'Loans':
    case 'Liabilities':
      return 'badge-pill badge-credit';
    case 'Investments':
      return 'badge-pill badge-investments';
    case 'Real Estate':
      return 'badge-pill badge-realestate';
    default:
      return 'badge-pill badge-other';
  }
}
