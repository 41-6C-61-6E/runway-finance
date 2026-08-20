-- L-1 (scratch/TAX_PAYROLL_REVIEW.md): optional graduated state income-tax
-- table per plan. NULL → the flat incomeTaxModifier keeps applying
-- (legacy behavior for existing plans, bit-identical).
ALTER TABLE "plan_settings" ADD COLUMN "state_tax_table" jsonb;
