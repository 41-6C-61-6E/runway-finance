import { z } from 'zod';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const FirePlanParams = z.object({
  planId: z.string().optional(),
}).default({});

export type FirePlanParams = z.infer<typeof FirePlanParams>;

export const firePlanPack: AskPack<FirePlanParams> = {
  id: 'fire_plan',
  label: 'Retirement Plan',
  href: (p) => (p.planId ? `/plans?planId=${p.planId}` : '/plans'),
  paramsSchema: FirePlanParams,
  describe: 'Detailed retirement and FIRE plan projections, milestones, checkpoints, and drawdown analysis',
  maxTokens: 1000,
  async build(ctx: FinanceContext, params: FirePlanParams) {
    const loaded = await loadEnginePlan(ctx, params?.planId, { persistMigration: false });
    if (!loaded?.enginePlan) {
      return { text: 'No retirement or FIRE plan found.' };
    }

    const { planMeta, enginePlan } = loaded;
    const sim = runRetirementSimulation(enginePlan);

    const currentYear = ctx.now.getFullYear();
    const primaryAgeNow = currentYear - (enginePlan.primaryBirthYear || 1985);
    const plannedAnnualExpenses =
      sim.yearlyResults[0]?.livingExpenses || 60000;
    const fiMultiplier = planMeta.fiTargetMultiplier || 25;
    const fiNumber = fiMultiplier * plannedAnnualExpenses;

    let projectedFiAge: number | null = null;
    let lifetimeTaxes = 0;
    let retirementTaxes = 0;
    let retirementGrossIncome = 0;
    let irmaaCount = 0;
    let firstIrmaaAge: number | null = null;
    let shortfallYearsCount = 0;
    const earlyWarnings: string[] = [];

    for (const yr of sim.yearlyResults) {
      if (projectedFiAge === null && yr.liquidNetWorth >= fiNumber) {
        projectedFiAge = yr.primaryAge;
      }
      lifetimeTaxes += yr.taxesPaid || 0;
      if (yr.primaryAge >= enginePlan.retirementAge) {
        retirementTaxes += yr.taxesPaid || 0;
        retirementGrossIncome += yr.grossIncome || 0;
      }
      if (yr.irmaaTier && yr.irmaaTier > 0) {
        irmaaCount++;
        if (firstIrmaaAge === null) firstIrmaaAge = yr.primaryAge;
      }
      if (yr.shortfall && yr.shortfall > 0) {
        shortfallYearsCount++;
      }
      if (yr.earlyWithdrawalWarnings && yr.earlyWithdrawalWarnings.length > 0 && earlyWarnings.length < 3) {
        for (const w of yr.earlyWithdrawalWarnings) {
          if (!earlyWarnings.includes(w) && earlyWarnings.length < 3) {
            earlyWarnings.push(`Age ${yr.primaryAge}: ${w}`);
          }
        }
      }
    }

    const avgRetirementTaxRate =
      retirementGrossIncome > 0 ? (retirementTaxes / retirementGrossIncome) * 100 : 0;

    const lines: string[] = [];
    lines.push(`### Retirement Plan: ${planMeta.name || 'Default Plan'}`);
    lines.push(
      `- **Key Demographics:** Age ${primaryAgeNow} now, Planned Retirement Age: ${enginePlan.retirementAge}, Life Expectancy: Age ${enginePlan.lifeExpectancyAge || 100}`
    );
    lines.push(
      `- **Assumptions:** Filing status: ${enginePlan.filingStatus}, Withdrawal Method: ${enginePlan.withdrawalMethod || 'textbook'}, Inflation: ${enginePlan.settings?.fixedInflationRate ?? 2.5}%`
    );
    lines.push(
      `- **FI Target:** ${formatDollar(fiNumber)} (${fiMultiplier}x annual living expenses of ${formatDollar(plannedAnnualExpenses)})`
    );
    lines.push(`- **Projected FI Age:** ${projectedFiAge ? `Age ${projectedFiAge}` : 'Not reached prior to retirement'}`);
    lines.push(
      `- **Simulation Outcome:** ${sim.success ? 'Success (no portfolio depletion)' : 'Shortfall Detected'}`
    );
    if (sim.depletionAge) {
      lines.push(`  - ⚠️ Portfolio depleted at age ${sim.depletionAge}`);
    }
    lines.push(`- **Ending Net Worth (at Age ${enginePlan.lifeExpectancyAge || 100}):** ${formatDollar(sim.endingNetWorth)}`);
    lines.push(`- **Lifetime Taxes:** ${formatDollar(lifetimeTaxes)} (Avg retirement tax rate: ${formatPercent(avgRetirementTaxRate)})`);

    // Checkpoint rows: now, retirement year, every 10 years after, and depletion year
    const checkpointAges = new Set<number>();
    checkpointAges.add(primaryAgeNow);
    checkpointAges.add(enginePlan.retirementAge);
    if (sim.depletionAge) checkpointAges.add(sim.depletionAge);

    for (let age = enginePlan.retirementAge + 10; age <= (enginePlan.lifeExpectancyAge || 100); age += 10) {
      checkpointAges.add(age);
    }

    const checkpointRows = sim.yearlyResults
      .filter((yr) => checkpointAges.has(yr.primaryAge))
      .sort((a, b) => a.primaryAge - b.primaryAge);

    lines.push('\n**Plan Checkpoints:**');
    lines.push('| Age | Year | Net Worth | Liquid NW | Income | Expenses | Taxes | Drawdown (Trad/Roth/Taxable) |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const r of checkpointRows) {
      const dd = r.drawdownsByType
        ? `${formatDollar(r.drawdownsByType.traditional)} / ${formatDollar(r.drawdownsByType.roth)} / ${formatDollar(r.drawdownsByType.taxable)}`
        : '-';
      lines.push(
        `| ${r.primaryAge} | ${r.year} | ${formatDollar(r.netWorth)} | ${formatDollar(r.liquidNetWorth)} | ${formatDollar(r.grossIncome)} | ${formatDollar(r.totalExpenses)} | ${formatDollar(r.taxesPaid)} | ${dd} |`
      );
    }

    // Notable flags
    const flags: string[] = [];
    if (irmaaCount > 0) {
      flags.push(`Medicare IRMAA surcharges apply in ${irmaaCount} years (first starts at age ${firstIrmaaAge})`);
    }
    if (shortfallYearsCount > 0) {
      flags.push(`Shortfall / underfunded expenses occur in ${shortfallYearsCount} years`);
    }
    for (const w of earlyWarnings) {
      flags.push(`Early withdrawal notice: ${w}`);
    }

    if (flags.length > 0) {
      lines.push('\n**Notable Plan Alerts & Observations:**');
      for (const flag of flags) {
        lines.push(`- ${flag}`);
      }
    }

    return { text: lines.join('\n') };
  },
};
