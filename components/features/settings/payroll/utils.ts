import type { FieldMapping } from './types';

export const sectionLabel = (key: string): string => {
  const section = key.split(':')[0];
  switch (section) {
    case 'earnings': return 'Earnings';
    case 'taxes': return 'Taxes';
    case 'before_tax_deductions': return 'Pre-Tax Deductions';
    case 'after_tax_deductions': return 'Post-Tax Deductions';
    default: return section;
  }
};

export const descriptionLabel = (key: string): string => key.split(':').slice(1).join(':');

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const groupedMappingKeys = (fields: Record<string, FieldMapping>): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  for (const key of Object.keys(fields)) {
    const section = key.split(':')[0];
    if (!groups[section]) groups[section] = [];
    groups[section].push(key);
  }
  return groups;
};

export const PAYSTUB_JSON_TEMPLATE = [
  {
    "employeeName": "John Doe",
    "payPeriodStart": "05/15/2026",
    "payPeriodEnd": "05/28/2026",
    "checkDate": "05/29/2026",
    "adviceNumber": "ADVICE12345",
    "grossCurrent": 3721.15,
    "grossYTD": 38400.00,
    "taxesCurrent": 778.42,
    "taxesYTD": 8200.50,
    "deductionsCurrent": 486.20,
    "deductionsYTD": 5100.20,
    "netCurrent": 2456.53,
    "hoursAndEarnings": [
      {
        "description": "Regular Pay",
        "hours": 80,
        "rate": 45.00,
        "amount": 3600.00,
        "ytdHours": 800,
        "ytdAmount": 36000.00
      },
      {
        "description": "Travel Reimbursement",
        "amount": 121.15,
        "ytdAmount": 2400.00
      }
    ],
    "taxes": [
      {
        "description": "Fed Withholding",
        "amount": 449.20,
        "ytdAmount": 4700.00
      },
      {
        "description": "FICA Medicare",
        "amount": 53.94,
        "ytdAmount": 550.00
      },
      {
        "description": "OASDI/SS",
        "amount": 230.71,
        "ytdAmount": 2350.00
      }
    ],
    "beforeTaxDeductions": [
      {
        "description": "Savings-SSP/401k",
        "amount": 372.12,
        "ytdAmount": 3900.00
      },
      {
        "description": "Medical",
        "amount": 91.08,
        "ytdAmount": 950.20
      }
    ],
    "afterTaxDeductions": [
      {
        "description": "Roth SSP",
        "amount": 100.00,
        "ytdAmount": 1000.00
      }
    ]
  }
];
