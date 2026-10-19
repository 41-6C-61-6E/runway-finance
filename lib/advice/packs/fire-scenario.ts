import { z } from 'zod';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import { ScenarioOverrides, buildScenarioComparison } from '../fire-scenario';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const FireScenarioParams = z.object({
  planId: z.string().optional(),
  overrides: ScenarioOverrides,
});

export type FireScenarioParams = z.infer<typeof FireScenarioParams>;

export const fireScenarioPack: AskPack<FireScenarioParams> = {
  id: 'fire_scenario',
  label: 'Hypothetical Scenario',
  href: (p) => (p.planId ? `/plans?planId=${p.planId}` : '/plans'),
  paramsSchema: FireScenarioParams,
  describe: 'Hypothetical what-if simulation comparing overrides to baseline retirement plan',
  maxTokens: 700,
  async build(ctx: FinanceContext, params: FireScenarioParams) {
    const loaded = await loadEnginePlan(ctx, params?.planId, { persistMigration: false });
    if (!loaded?.enginePlan) {
      return { text: 'No baseline retirement plan found to simulate what-if scenarios.' };
    }

    const comparison = buildScenarioComparison(loaded.enginePlan, params.overrides);
    return { text: comparison.markdown };
  },
};
