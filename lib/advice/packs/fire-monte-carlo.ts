import { z } from 'zod';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { ScenarioOverrides, applyScenarioOverrides } from '../fire-scenario';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const FireMonteCarloParams = z.object({
  planId: z.string().optional(),
  overrides: ScenarioOverrides.optional(),
}).default({});

export type FireMonteCarloParams = z.infer<typeof FireMonteCarloParams>;

export const fireMonteCarloPack: AskPack<FireMonteCarloParams> = {
  id: 'fire_monte_carlo',
  label: 'Monte Carlo Stress Test',
  href: (p) => (p.planId ? `/plans?planId=${p.planId}` : '/plans'),
  paramsSchema: FireMonteCarloParams,
  describe: 'Monte Carlo probability analysis across 200 market return sequences',
  maxTokens: 400,
  async build(ctx: FinanceContext, params: FireMonteCarloParams) {
    const loaded = await loadEnginePlan(ctx, params?.planId, { persistMigration: false });
    if (!loaded?.enginePlan) {
      return { text: 'No retirement plan found for Monte Carlo simulation.' };
    }

    let plan = loaded.enginePlan;
    if (params.overrides) {
      plan = applyScenarioOverrides(plan, params.overrides);
    }

    const mc = runMonteCarloSimulation(plan, { numberOfTrials: 200 });

    const lines: string[] = [];
    lines.push('### Monte Carlo Stress Test (200 Randomized Trials)');
    lines.push(`- **Plan Success Rate:** **${formatPercent(mc.successRate)}** (${mc.successCount} of 200 trials succeeded)`);
    lines.push(`- **Median Ending Legacy:** ${formatDollar(mc.medianLegacy)}`);
    lines.push(`- **Worst-Case Ending Legacy (10th percentile):** ${formatDollar(mc.worstCaseLegacy)}`);
    lines.push(`- **Best-Case Ending Legacy (90th percentile):** ${formatDollar(mc.bestCaseLegacy)}`);
    if (mc.medianDepletionAge) {
      lines.push(`- **Median Depletion Age (Failed Trials):** Age ${mc.medianDepletionAge}`);
    }

    const p = mc.percentiles;
    if (p.years.length > 0) {
      lines.push('\n**Ending Portfolio Percentiles:**');
      const lastIdx = p.years.length - 1;
      lines.push(`- 10th percentile (unfavorable markets): ${formatDollar(p.p10[lastIdx] ?? 0)}`);
      lines.push(`- 50th percentile (median outcome): ${formatDollar(p.p50[lastIdx] ?? 0)}`);
      lines.push(`- 90th percentile (favorable markets): ${formatDollar(p.p90[lastIdx] ?? 0)}`);
    }

    return { text: lines.join('\n') };
  },
};
