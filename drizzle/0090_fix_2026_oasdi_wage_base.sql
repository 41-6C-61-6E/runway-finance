-- T-1 (scratch/TAX_PAYROLL_REVIEW.md): SSA confirmed the 2026 OASDI taxable
-- maximum is $184,500 (ssa.gov/OACT/COLA/cbb.html). Rows seeded earlier in
-- 2026 carry the 2025 cap ($176,100) inside `fica_rules`; bump only those.
UPDATE "system_tax_rules"
SET "fica_rules" = jsonb_set("fica_rules", '{ssWageBaseCap}', '184500'),
    "updated_at" = now()
WHERE "tax_year" = 2026
  AND COALESCE(("fica_rules" ->> 'ssWageBaseCap')::numeric, 0) = 176100;
--> statement-breakpoint
-- Historical years get their own statutory caps (2024: $168,600) the first
-- time they are requested — see lib/constants/historical-tax-rules.ts.
