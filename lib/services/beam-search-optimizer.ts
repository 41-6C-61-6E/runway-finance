import { EnginePlan, runRetirementSimulation, SimulationOutput } from './retirement-engine';

export type OptimizationObjective = 'taxes' | 'legacy' | 'networth' | 'etr' | 'rmds' | 'irmaa';
export type OptimizationIntensity = 'quick' | 'standard' | 'deep' | 'extreme';

export interface OptimizationRecommendation {
  year: number;
  age: number;
  withdrawalOrder: string;
  rothConversionAmount: number;
  estimatedTaxSavings: number;
  notes: string;
}

export interface OptimizationOutput {
  planId: string;
  objective: OptimizationObjective;
  intensity: OptimizationIntensity;
  baseline: {
    lifetimeTaxes: number;
    netLegacy: number;
    endingNetWorth: number;
    effectiveTaxRate: number;
  };
  optimized: {
    lifetimeTaxes: number;
    netLegacy: number;
    endingNetWorth: number;
    effectiveTaxRate: number;
  };
  savings: {
    taxesSaved: number;
    legacyIncrease: number;
  };
  recommendations: OptimizationRecommendation[];
}

export function runBeamSearchOptimization(
  basePlan: EnginePlan,
  objective: OptimizationObjective = 'legacy',
  intensity: OptimizationIntensity = 'standard'
): OptimizationOutput {
  // Baseline simulation
  const baselineSim = runRetirementSimulation(basePlan);
  const baselineTaxes = baselineSim.yearlyResults.reduce((sum, y) => sum + y.taxesPaid, 0);

  const beamWidth = intensity === 'quick' ? 2 : intensity === 'standard' ? 5 : intensity === 'deep' ? 10 : 25;
  const conversionSteps = [0, 10000, 25000, 45000];

  let bestSim: SimulationOutput = baselineSim;
  let bestPlan: EnginePlan = basePlan;
  let bestScore = scoreSimulation(baselineSim, objective);

  // Test candidate withdrawal and conversion strategies
  const strategies = ['textbook', 'proportional', 'tax_optimized'];
  const conversionTargetCeilings = ['none', 'top_of_10', 'top_of_12', 'top_of_22'];

  for (const strat of strategies) {
    for (const ceiling of conversionTargetCeilings) {
      const candidatePlan: EnginePlan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.withdrawalMethod = strat;

      if (!candidatePlan.settings) {
        candidatePlan.settings = { ...basePlan.settings };
      }

      if (ceiling !== 'none') {
        candidatePlan.settings.enableRothConversions = true;
        candidatePlan.settings.rothConversionTargetCeiling = ceiling;
      } else {
        candidatePlan.settings.enableRothConversions = false;
      }

      const candSim = runRetirementSimulation(candidatePlan);
      const candScore = scoreSimulation(candSim, objective);

      if (candScore > bestScore) {
        bestScore = candScore;
        bestSim = candSim;
        bestPlan = candidatePlan;
      }
    }
  }

  const optimizedTaxes = bestSim.yearlyResults.reduce((sum, y) => sum + y.taxesPaid, 0);
  const taxesSaved = Math.max(0, baselineTaxes - optimizedTaxes);
  const legacyIncrease = Math.max(0, bestSim.netLegacy - baselineSim.netLegacy);

  const recommendations: OptimizationRecommendation[] = bestSim.yearlyResults.map((y) => {
    let orderDesc = 'Textbook Sequence (Cash -> Taxable -> Traditional -> Roth)';
    if (bestPlan.withdrawalMethod === 'proportional') orderDesc = 'Proportional Draw';
    else if (bestPlan.withdrawalMethod === 'tax_optimized') orderDesc = 'Tax-Optimized Bracket Filling';

    return {
      year: y.year,
      age: y.primaryAge,
      withdrawalOrder: orderDesc,
      rothConversionAmount: y.rothConversionAmount || 0,
      estimatedTaxSavings: taxesSaved > 0 ? Math.round(taxesSaved / bestSim.yearlyResults.length) : 0,
      notes: y.rothConversionAmount > 0
        ? `Converted $${Math.round(y.rothConversionAmount).toLocaleString()} from Traditional to Roth in target bracket prior to RMD age`
        : 'Standard drawdown sequence',
    };
  });

  const baselineETR = baselineSim.yearlyResults.length > 0 ? baselineSim.yearlyResults.reduce((s, y) => s + y.effectiveTaxRate, 0) / baselineSim.yearlyResults.length : 0;
  const optimizedETR = bestSim.yearlyResults.length > 0 ? bestSim.yearlyResults.reduce((s, y) => s + y.effectiveTaxRate, 0) / bestSim.yearlyResults.length : 0;

  return {
    planId: basePlan.id,
    objective,
    intensity,
    baseline: {
      lifetimeTaxes: baselineTaxes,
      netLegacy: baselineSim.netLegacy,
      endingNetWorth: baselineSim.endingNetWorth,
      effectiveTaxRate: baselineETR,
    },
    optimized: {
      lifetimeTaxes: optimizedTaxes,
      netLegacy: bestSim.netLegacy,
      endingNetWorth: bestSim.endingNetWorth,
      effectiveTaxRate: optimizedETR,
    },
    savings: {
      taxesSaved,
      legacyIncrease,
    },
    recommendations,
  };
}

function scoreSimulation(sim: SimulationOutput, objective: OptimizationObjective): number {
  if (!sim.success) return -1000000000;
  const totalTaxes = sim.yearlyResults.reduce((s, y) => s + y.taxesPaid, 0);

  switch (objective) {
    case 'taxes':
      return -totalTaxes;
    case 'legacy':
      return sim.netLegacy;
    case 'networth':
      return sim.endingNetWorth;
    case 'etr':
      return -totalTaxes;
    case 'rmds':
      return sim.netLegacy;
    case 'irmaa':
      return -totalTaxes;
    default:
      return sim.netLegacy;
  }
}
