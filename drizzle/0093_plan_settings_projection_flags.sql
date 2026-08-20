-- Migration generated for T-2 + T-5 (scratch/TAX_PAYROLL_REVIEW.md §6.5)
--
-- T-2: `projection_mode` — 'inflationEscalated' (default; bit-identical legacy
--      behavior) or 'statutory' (use per-year published rule rows for 2024/2025
--      when the simulation spans those years; later years stay escalated).
-- T-5: `enable_amt` — opt-in AMT in the tax engine (2026 base: $85,800 S /
--      $139,000 MFJ exemption, 26% rate, 25%-of-base-income floor, 4%
--      phaseout above $1,399,000). Default false.

ALTER TABLE "plan_settings" ADD COLUMN "projection_mode" text NOT NULL DEFAULT 'inflationEscalated';
--> statement-breakpoint
ALTER TABLE "plan_settings" ADD COLUMN "enable_amt" boolean NOT NULL DEFAULT false;
