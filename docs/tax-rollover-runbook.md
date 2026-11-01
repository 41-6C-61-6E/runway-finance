# Annual Statutory Tax Year Rollover Runbook

This runbook outlines the operational steps required when the calendar advances to a new tax year (e.g., from 2026 to 2027).

---

## 1. Statutory Changes Overview
Each year, the IRS releases inflation-adjusted parameters for:
- Standard Deductions (Single, Married Filing Jointly, Head of Household)
- Federal Income Tax Brackets & Marginal Rates
- Capital Gains Brackets (0%, 15%, 20%)
- Retirement Contribution Limits (401(k), IRA, HSA, Catch-up limits)
- Social Security Maximum Taxable Wage Base
- Medicare IRMAA (Income-Related Monthly Adjustment Amount) Tiers & Surcharges
- IRS Uniform Lifetime Table (RMD divisors)

---

## 2. Codebase Files to Update

### A. Historical Rules Inventory
Add the new tax year configuration object to `lib/constants/historical-tax-rules.ts`:
```typescript
export const DEFAULT_2027_RULES: SystemTaxRules = {
  taxYear: 2027,
  singleStandardDeduction: 16100, // example updated number
  mfjStandardDeduction: 32200,
  hohStandardDeduction: 24150,
  k401Limit: 24000,
  k401Catchup: 8000,
  iraLimit: 7500,
  iraCatchup: 1000,
  hsaLimitSingle: 4400,
  hsaLimitFamily: 8750,
  // ... updated brackets and tiers
};
```
Add `2027: DEFAULT_2027_RULES` to `HISTORICAL_RULES_BY_YEAR`.

### B. Default Tax Rules Pointer
In `lib/constants/retirement-defaults.ts`:
1. Export `DEFAULT_RULES` referencing the newest year's rule set.
2. Update `DEFAULT_2026_RULES` alias if backward compatibility is required.

### C. System Tax Rules Service
In `lib/services/system-tax-rules-service.ts`:
1. Verify `getSystemTaxRules(taxYear)` falls back cleanly to the latest seeded rule set if an unseeded future year is requested.
2. Run database seeding migration or seed script:
   `pnpm tsx scripts/seed-tax-rules.ts` (if applicable) or trigger `initSystemTaxRules(newTaxYear)`.

### D. User Interface & Confirmation Prompts
- The UI in `components/plans/settings-tab.tsx` dynamically derives the display tax year via `rules?.taxYear || CURRENT_TAX_YEAR`.
- Verify that clicking "Reset to IRS defaults" populates the new year's numbers.

---

## 3. Verification & Testing Gate
After adding the new year's rule set:
1. Run `pnpm vitest run tests/unit/system-tax-rules.test.ts`
2. Run `pnpm vitest run tests/unit/retirement-engine.test.ts`
3. Verify that tax bracket calculations and Social Security PIA deductions correctly reflect the statutory parameters.

