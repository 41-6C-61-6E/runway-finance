import { z } from 'zod';
import type { EnginePlan, EngineEvent, SimulationOutput } from '@/lib/services/retirement-engine';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { formatDollar } from './redact';

export const ScenarioOverrides = z
  .object({
    retirementAge: z.number().int().min(30).max(80).optional(),
    spouseRetirementAge: z.number().int().min(30).max(80).optional(),
    annualSpendingChangePct: z.number().min(-50).max(100).optional(), // scales living_expense events
    annualSpendingChangeAbs: z.number().min(-200000).max(200000).optional(),
    salaryChangePct: z.number().min(-100).max(200).optional(),
    lumpSum: z
      .object({
        amount: z.number().min(-5e6).max(5e6),
        age: z.number().int().min(18).max(110),
      })
      .optional(), // +income / -expense
    primarySsStartAge: z.number().int().min(62).max(70).optional(),
    spouseSsStartAge: z.number().int().min(62).max(70).optional(),
    withdrawalMethod: z
      .enum(['textbook', 'proportional', 'tax_deferred_first', 'tax_optimized'])
      .optional(),
    enableRothConversions: z.boolean().optional(),
    rothConversionTargetCeiling: z
      .enum(['top_of_10', 'top_of_12', 'top_of_22', 'top_of_24', 'top_of_32', 'irmaa_tier1'])
      .optional(),
    growthRateDeltaPct: z.number().min(-5).max(5).optional(), // added to every account's expectedGrowthRate
    inflationRate: z.number().min(0).max(10).optional(),
    lifeExpectancyAge: z.number().int().min(70).max(110).optional(),
  })
  .strict();

export type ScenarioOverrides = z.infer<typeof ScenarioOverrides>;

/**
 * Applies hypothetical overrides to an EnginePlan, returning a newly allocated deep clone.
 * Does NOT mutate the input plan.
 */
export function applyScenarioOverrides(
  plan: EnginePlan,
  overrides: ScenarioOverrides
): EnginePlan {
  // Pure deep-clone
  const cloned: EnginePlan = JSON.parse(JSON.stringify(plan));

  if (overrides.retirementAge !== undefined) {
    cloned.retirementAge = overrides.retirementAge;
  }

  if (overrides.spouseRetirementAge !== undefined) {
    cloned.spouseRetirementAge = overrides.spouseRetirementAge;
  }

  if (overrides.primarySsStartAge !== undefined) {
    cloned.primarySsStartAge = overrides.primarySsStartAge;
  }

  if (overrides.spouseSsStartAge !== undefined) {
    cloned.spouseSsStartAge = overrides.spouseSsStartAge;
  }

  if (overrides.lifeExpectancyAge !== undefined) {
    cloned.lifeExpectancyAge = overrides.lifeExpectancyAge;
  }

  if (overrides.withdrawalMethod !== undefined) {
    cloned.withdrawalMethod = overrides.withdrawalMethod;
    cloned.settings = {
      fixedInflationRate: 2.5,
      ...cloned.settings,
      withdrawalMethod: overrides.withdrawalMethod,
    };
  }

  if (overrides.enableRothConversions !== undefined) {
    cloned.settings = {
      fixedInflationRate: 2.5,
      ...cloned.settings,
      enableRothConversions: overrides.enableRothConversions,
    };
  }

  if (overrides.rothConversionTargetCeiling !== undefined) {
    cloned.settings = {
      fixedInflationRate: 2.5,
      ...cloned.settings,
      rothConversionTargetCeiling: overrides.rothConversionTargetCeiling,
    };
  }

  if (overrides.inflationRate !== undefined) {
    cloned.settings = {
      ...cloned.settings,
      fixedInflationRate: overrides.inflationRate,
    };
  }

  if (overrides.salaryChangePct !== undefined) {
    const mult = 1 + overrides.salaryChangePct / 100;
    if (cloned.primarySalary !== undefined) {
      cloned.primarySalary = Math.round(cloned.primarySalary * mult);
    }
    if (cloned.spouseSalary !== undefined) {
      cloned.spouseSalary = Math.round(cloned.spouseSalary * mult);
    }
  }

  if (overrides.growthRateDeltaPct !== undefined) {
    for (const acc of cloned.accounts || []) {
      acc.expectedGrowthRate = (acc.expectedGrowthRate || 0) + overrides.growthRateDeltaPct;
    }
  }

  // Handle spending overrides (percentage and/or absolute)
  if (
    overrides.annualSpendingChangePct !== undefined ||
    overrides.annualSpendingChangeAbs !== undefined
  ) {
    const pct = overrides.annualSpendingChangePct ?? 0;
    const abs = overrides.annualSpendingChangeAbs ?? 0;
    const livingExpenseEvents = (cloned.events || []).filter(
      (e) => e.type === 'living_expense' || e.category === 'expense'
    );

    if (livingExpenseEvents.length > 0) {
      for (const ev of livingExpenseEvents) {
        let amount = ev.amount;
        if (pct !== 0) {
          amount = amount * (1 + pct / 100);
        }
        if (abs !== 0) {
          amount = amount + abs / livingExpenseEvents.length;
        }
        ev.amount = Math.max(0, Math.round(amount));
      }
    } else {
      // Create synthetic expense event if none existed
      const baseAmount = 60000;
      let amount = baseAmount;
      if (pct !== 0) {
        amount = amount * (1 + pct / 100);
      }
      if (abs !== 0) {
        amount = amount + abs;
      }
      const synthetic: EngineEvent = {
        id: 'synthetic_living_expense',
        name: 'Living Expenses (Hypothetical)',
        category: 'expense',
        type: 'living_expense',
        owner: 'primary',
        amount: Math.max(0, Math.round(amount)),
        frequency: 'yearly',
        growthRate: 0,
        adjustForInflation: true,
        startTriggerType: 'now',
        endTriggerType: 'end_of_plan',
      };
      cloned.events = [...(cloned.events || []), synthetic];
    }
  }

  // Handle lump sum
  if (overrides.lumpSum) {
    const { amount, age } = overrides.lumpSum;
    const isIncome = amount >= 0;
    const lumpEvent: EngineEvent = {
      id: `hypothetical_lump_${age}`,
      name: `Hypothetical Lump Sum (${isIncome ? 'Inflow' : 'Outflow'})`,
      category: isIncome ? 'income' : 'expense',
      type: 'lump_sum',
      owner: 'primary',
      amount: Math.abs(amount),
      frequency: 'yearly',
      growthRate: 0,
      adjustForInflation: false,
      startTriggerType: 'age',
      startTriggerValue: String(age),
      endTriggerType: 'age',
      endTriggerValue: String(age),
    };
    cloned.events = [...(cloned.events || []), lumpEvent];
  }

  return cloned;
}

export interface ScenarioDiffMetric {
  metric: string;
  baseline: string;
  scenario: string;
  delta: string;
}

export interface ScenarioComparison {
  overridesApplied: string[];
  metrics: ScenarioDiffMetric[];
  markdown: string;
}

function extractSimSummary(sim: SimulationOutput, plan: EnginePlan) {
  const fiNumber =
    (plan.fiTargetMultiplier || 25) *
    (sim.yearlyResults[0]?.livingExpenses || 60000);

  let projectedFiAge: number | null = null;
  let nwAtRetirement: number | null = null;
  let lifetimeTaxes = 0;

  for (const yr of sim.yearlyResults) {
    if (projectedFiAge === null && yr.liquidNetWorth >= fiNumber) {
      projectedFiAge = yr.primaryAge;
    }
    if (yr.primaryAge === plan.retirementAge) {
      nwAtRetirement = yr.netWorth;
    }
    lifetimeTaxes += yr.taxesPaid || 0;
  }

  return {
    success: sim.success,
    projectedFiAge,
    depletionAge: sim.depletionAge ?? null,
    endingNetWorth: sim.endingNetWorth,
    lifetimeTaxes,
    nwAtRetirement: nwAtRetirement ?? sim.yearlyResults[0]?.netWorth ?? 0,
  };
}

/**
 * Runs baseline and scenario simulations and produces comparison metrics and markdown diff table.
 */
export function buildScenarioComparison(
  baselinePlan: EnginePlan,
  overrides: ScenarioOverrides
): ScenarioComparison {
  const scenarioPlan = applyScenarioOverrides(baselinePlan, overrides);

  const baselineSim = runRetirementSimulation(baselinePlan);
  const scenarioSim = runRetirementSimulation(scenarioPlan);

  const base = extractSimSummary(baselineSim, baselinePlan);
  const scen = extractSimSummary(scenarioSim, scenarioPlan);

  const overrideDescriptions: string[] = [];
  if (overrides.retirementAge !== undefined) {
    overrideDescriptions.push(`Retirement Age: ${baselinePlan.retirementAge} → ${overrides.retirementAge}`);
  }
  if (overrides.spouseRetirementAge !== undefined) {
    overrideDescriptions.push(`Spouse Retirement Age: ${overrides.spouseRetirementAge}`);
  }
  if (overrides.annualSpendingChangePct !== undefined) {
    overrideDescriptions.push(`Annual Spending: ${overrides.annualSpendingChangePct > 0 ? '+' : ''}${overrides.annualSpendingChangePct}%`);
  }
  if (overrides.annualSpendingChangeAbs !== undefined) {
    overrideDescriptions.push(`Annual Spending: ${formatDollar(overrides.annualSpendingChangeAbs)}`);
  }
  if (overrides.salaryChangePct !== undefined) {
    overrideDescriptions.push(`Salary: ${overrides.salaryChangePct > 0 ? '+' : ''}${overrides.salaryChangePct}%`);
  }
  if (overrides.lumpSum) {
    overrideDescriptions.push(
      `Lump sum of ${formatDollar(overrides.lumpSum.amount)} at age ${overrides.lumpSum.age}`
    );
  }
  if (overrides.primarySsStartAge !== undefined) {
    overrideDescriptions.push(`Social Security Start Age: ${overrides.primarySsStartAge}`);
  }
  if (overrides.withdrawalMethod !== undefined) {
    overrideDescriptions.push(`Withdrawal Method: ${overrides.withdrawalMethod}`);
  }
  if (overrides.enableRothConversions !== undefined) {
    overrideDescriptions.push(`Roth Conversions: ${overrides.enableRothConversions ? 'Enabled' : 'Disabled'}`);
  }
  if (overrides.growthRateDeltaPct !== undefined) {
    overrideDescriptions.push(`Account Growth: ${overrides.growthRateDeltaPct > 0 ? '+' : ''}${overrides.growthRateDeltaPct}%`);
  }
  if (overrides.inflationRate !== undefined) {
    overrideDescriptions.push(`Inflation Rate: ${overrides.inflationRate}%`);
  }
  if (overrides.lifeExpectancyAge !== undefined) {
    overrideDescriptions.push(`Life Expectancy: ${overrides.lifeExpectancyAge}`);
  }

  const metrics: ScenarioDiffMetric[] = [
    {
      metric: 'Plan Success',
      baseline: base.success ? 'Success' : 'Shortfall',
      scenario: scen.success ? 'Success' : 'Shortfall',
      delta: base.success === scen.success ? 'No change' : scen.success ? 'Improved' : 'Worsened',
    },
    {
      metric: 'Projected FI Age',
      baseline: base.projectedFiAge !== null ? `Age ${base.projectedFiAge}` : 'Never',
      scenario: scen.projectedFiAge !== null ? `Age ${scen.projectedFiAge}` : 'Never',
      delta:
        base.projectedFiAge !== null && scen.projectedFiAge !== null
          ? `${scen.projectedFiAge - base.projectedFiAge >= 0 ? '+' : ''}${scen.projectedFiAge - base.projectedFiAge} yrs`
          : 'N/A',
    },
    {
      metric: 'Depletion Age',
      baseline: base.depletionAge !== null ? `Age ${base.depletionAge}` : 'None',
      scenario: scen.depletionAge !== null ? `Age ${scen.depletionAge}` : 'None',
      delta:
        base.depletionAge !== null && scen.depletionAge !== null
          ? `${scen.depletionAge - base.depletionAge >= 0 ? '+' : ''}${scen.depletionAge - base.depletionAge} yrs`
          : scen.depletionAge === null && base.depletionAge !== null
          ? 'Depletion Avoided'
          : 'No depletion',
    },
    {
      metric: 'Net Worth at Retirement',
      baseline: formatDollar(base.nwAtRetirement),
      scenario: formatDollar(scen.nwAtRetirement),
      delta: formatDollar(scen.nwAtRetirement - base.nwAtRetirement),
    },
    {
      metric: 'Ending Net Worth',
      baseline: formatDollar(base.endingNetWorth),
      scenario: formatDollar(scen.endingNetWorth),
      delta: formatDollar(scen.endingNetWorth - base.endingNetWorth),
    },
    {
      metric: 'Lifetime Taxes Paid',
      baseline: formatDollar(base.lifetimeTaxes),
      scenario: formatDollar(scen.lifetimeTaxes),
      delta: formatDollar(scen.lifetimeTaxes - base.lifetimeTaxes),
    },
  ];

  const lines: string[] = [];
  lines.push('### What-If Scenario Analysis');
  lines.push('**Note: Hypothetical — not saved.**\n');
  if (overrideDescriptions.length > 0) {
    lines.push(`- **Overrides Applied:** ${overrideDescriptions.join('; ')}`);
  }
  lines.push('\n| Metric | Baseline | Scenario | Difference |');
  lines.push('|---|---|---|---|');
  for (const m of metrics) {
    lines.push(`| ${m.metric} | ${m.baseline} | ${m.scenario} | ${m.delta} |`);
  }

  return {
    overridesApplied: overrideDescriptions,
    metrics,
    markdown: lines.join('\n'),
  };
}
