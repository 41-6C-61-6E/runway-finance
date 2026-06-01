import { addFrequencyInterval, getFrequencyDays, parseDate, normalizeBackendInput } from '@/lib/utils/paystub';

describe('Paystubs Helpers', () => {
  describe('parseDate', () => {
    it('parses MM/DD/YYYY dates to YYYY-MM-DD', () => {
      expect(parseDate('05/29/2026')).toBe('2026-05-29');
      expect(parseDate('12/01/2022')).toBe('2022-12-01');
      expect(parseDate('01/05/2024')).toBe('2024-01-05');
    });

    it('returns original string if not in MM/DD/YYYY format', () => {
      expect(parseDate('2026-05-29')).toBe('2026-05-29');
      expect(parseDate('invalid-date')).toBe('invalid-date');
    });
  });

  describe('addFrequencyInterval', () => {
    it('handles weekly frequency (+7 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'weekly')).toBe('2026-06-05');
      expect(addFrequencyInterval('2026-12-28', 'weekly')).toBe('2027-01-04');
    });

    it('handles biweekly frequency (+14 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'biweekly')).toBe('2026-06-12');
      expect(addFrequencyInterval('2026-12-20', 'biweekly')).toBe('2027-01-03');
    });

    it('handles semimonthly frequency (+15 days)', () => {
      expect(addFrequencyInterval('2026-05-29', 'semimonthly')).toBe('2026-06-13');
      expect(addFrequencyInterval('2026-12-20', 'semimonthly')).toBe('2027-01-04');
    });

    it('handles monthly frequency (+1 month)', () => {
      expect(addFrequencyInterval('2026-05-29', 'monthly')).toBe('2026-06-29');
      expect(addFrequencyInterval('2026-12-29', 'monthly')).toBe('2027-01-29');
      // Leap year check: Feb 2024 has 29 days
      expect(addFrequencyInterval('2024-01-31', 'monthly')).toBe('2024-02-29');
    });

    it('defaults to biweekly for unknown frequency', () => {
      expect(addFrequencyInterval('2026-05-29', 'unknown')).toBe('2026-06-12');
    });
  });

  describe('getFrequencyDays', () => {
    it('returns correct days for each frequency', () => {
      expect(getFrequencyDays('weekly')).toBe(7);
      expect(getFrequencyDays('biweekly')).toBe(14);
      expect(getFrequencyDays('semimonthly')).toBe(15);
      expect(getFrequencyDays('monthly')).toBe(30);
      expect(getFrequencyDays('unknown')).toBe(14);
    });
  });

  describe('normalizeBackendInput', () => {
    const alternativeFormat = {
      employee: {
        name: "Alice Smith",
        bemsid: "987654",
        company: "Boeing"
      },
      paychecks: [
        {
          checkNumber: "CHK12345",
          checkDate: "05/29/2026",
          totals: {
            earningsHours: 80,
            earningsAmount: 4000.00,
            deductionsAmount: 500.00,
            taxesAmount: 800.00
          },
          earnings: [
            {
              description: "Regular Pay",
              hours: 80,
              amount: 4000.00,
              payPeriodEndDate: "05/28/2026",
              beginDate: "05/15/2026",
              endDate: "05/28/2026"
            }
          ],
          deductions: [
            {
              description: "Savings-SSP/401k",
              amount: 400.00
            },
            {
              description: "Medical",
              amount: 100.00
            }
          ],
          taxes: [
            {
              description: "Fed Withholding",
              amount: 600.00
            },
            {
              description: "OASDI/SS",
              amount: 200.00
            }
          ]
        }
      ]
    };

    it('normalizes alternative paychecks format directly', () => {
      const normalized = normalizeBackendInput(alternativeFormat);
      expect(normalized.length).toBe(1);
      expect(normalized[0]).toEqual({
        employeeName: "Alice Smith",
        payPeriodStart: "05/15/2026",
        payPeriodEnd: "05/28/2026",
        checkDate: "05/29/2026",
        adviceNumber: "CHK12345",
        grossCurrent: "4000",
        taxesCurrent: "800",
        deductionsCurrent: "500",
        netCurrent: "2700",
        hoursAndEarnings: [
          { description: "Regular Pay", hours: 80, amount: 4000 }
        ],
        taxes: [
          { description: "Fed Withholding", amount: 600 },
          { description: "OASDI/SS", amount: 200 }
        ],
        beforeTaxDeductions: [
          { description: "Savings-SSP/401k", amount: 400 },
          { description: "Medical", amount: 100 }
        ],
        afterTaxDeductions: []
      });
    });

    it('normalizes alternative paychecks format when wrapped in an array', () => {
      const normalized = normalizeBackendInput([alternativeFormat]);
      expect(normalized.length).toBe(1);
      expect(normalized[0].employeeName).toBe("Alice Smith");
    });

    it('passes through already standard format arrays unchanged', () => {
      const standardFormat = [
        {
          employeeName: "John Doe",
          payPeriodStart: "05/15/2026",
          payPeriodEnd: "05/28/2026",
          checkDate: "05/29/2026",
          grossCurrent: "3721.15"
        }
      ];
      const normalized = normalizeBackendInput(standardFormat);
      expect(normalized).toBe(standardFormat);
    });

    it('returns empty array for invalid/empty inputs', () => {
      expect(normalizeBackendInput(null)).toEqual([]);
      expect(normalizeBackendInput(undefined)).toEqual([]);
      expect(normalizeBackendInput({})).toEqual([]);
    });
  });
});
