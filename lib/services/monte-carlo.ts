import { EnginePlan, EngineAccount, runRetirementSimulation } from './retirement-engine';
import { HISTORICAL_RETURNS_DATA } from '@/lib/constants/retirement-defaults';

export interface MonteCarloOptions {
  model: 'historical_bootstrap' | 'normal_distribution' | 'constant';
  numberOfTrials: number; // e.g. 250
  meanAnnualReturn: number; // e.g. 0.07 (7%)
  returnStdDev: number; // e.g. 0.12 (12%)
  inflationMean: number; // e.g. 0.03
  inflationStdDev: number; // e.g. 0.015
}

export interface MonteCarloTrialResult {
  trialIndex: number;
  yearlyNetWorth: number[];
  endingNetWorth: number;
  success: boolean;
  depletionAge?: number;
}

export interface MonteCarloOutput {
  successRate: number; // 0 to 100
  totalTrials: number;
  successCount: number;
  failureCount: number;
  medianLegacy: number;
  averageLegacy: number;
  worstCaseLegacy: number;
  bestCaseLegacy: number;
  medianDepletionAge?: number;
  percentiles: {
    years: number[];
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
}

export function runMonteCarloSimulation(
  basePlan: EnginePlan,
  options: Partial<MonteCarloOptions> = {}
): MonteCarloOutput {
  const trialsCount = options.numberOfTrials ?? 250;
  const model = options.model ?? 'historical_bootstrap';
  const meanReturn = options.meanAnnualReturn ?? 0.07;
  const stdDev = options.returnStdDev ?? 0.12;

  const trials: MonteCarloTrialResult[] = [];

  for (let t = 0; t < trialsCount; t++) {
    const trialPlan: EnginePlan = JSON.parse(JSON.stringify(basePlan));

    // Generate random yearly return sequence for this trial
    const totalYears = Math.max(1, (basePlan.lifeExpectancyAge || 100) - ((new Date().getFullYear()) - (basePlan.primaryBirthYear || 1985)));
    
    // Sample a random historical year per yearOffset or normal return per yearOffset
    const yearlyMarketData: Array<{ growth: number; dividend: number }> = [];
    for (let y = 0; y < totalYears; y++) {
      if (model === 'normal_distribution') {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const randomReturn = meanReturn + stdDev * z;
        yearlyMarketData.push({ growth: Math.max(-0.35, Math.min(0.45, randomReturn)), dividend: 0.015 });
      } else {
        const randomIndex = Math.floor(Math.random() * HISTORICAL_RETURNS_DATA.length);
        const histData = HISTORICAL_RETURNS_DATA[randomIndex];
        yearlyMarketData.push({ growth: histData.stocksGrowth, dividend: histData.stocksYield });
      }
    }

    const yearGrowthFn = (yearOffset: number, acc: EngineAccount) => {
      const isMarketAsset = acc.type === 'taxable' || acc.type === 'crypto' || acc.type.includes('ira') || acc.type.includes('401k');
      if (isMarketAsset) {
        const m = yearlyMarketData[yearOffset % yearlyMarketData.length] || { growth: 0.07, dividend: 0.02 };
        return { growth: m.growth, dividend: m.dividend };
      }
      return { growth: (acc.expectedGrowthRate || 2.0) / 100, dividend: (acc.dividendYield || 0.0) / 100 };
    };

    const simRes = runRetirementSimulation(trialPlan, yearGrowthFn);
    trials.push({
      trialIndex: t,
      yearlyNetWorth: simRes.yearlyResults.map((y) => y.netWorth),
      endingNetWorth: simRes.endingNetWorth,
      success: simRes.success,
      depletionAge: simRes.depletionAge,
    });
  }

  const successCount = trials.filter((t) => t.success).length;
  const failureCount = trialsCount - successCount;
  const successRate = (successCount / trialsCount) * 100;

  const endingNetWorths = trials.map((t) => t.endingNetWorth).sort((a, b) => a - b);
  const medianLegacy = endingNetWorths[Math.floor(trialsCount * 0.5)] ?? 0;
  const averageLegacy = endingNetWorths.reduce((a, b) => a + b, 0) / trialsCount;
  const worstCaseLegacy = endingNetWorths[Math.floor(trialsCount * 0.1)] ?? 0;
  const bestCaseLegacy = endingNetWorths[Math.floor(trialsCount * 0.9)] ?? 0;

  const depletionAges = trials.map((t) => t.depletionAge).filter((a): a is number => a !== undefined).sort((a, b) => a - b);
  const medianDepletionAge = depletionAges.length > 0 ? depletionAges[Math.floor(depletionAges.length / 2)] : undefined;

  const numYears = trials[0]?.yearlyNetWorth.length ?? 0;
  const years = Array.from({ length: numYears }, (_, i) => (basePlan.primaryBirthYear + (new Date().getFullYear() - basePlan.primaryBirthYear) + i));

  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];

  for (let y = 0; y < numYears; y++) {
    const yearValues = trials.map((t) => t.yearlyNetWorth[y] ?? 0).sort((a, b) => a - b);
    p10.push(yearValues[Math.floor(trialsCount * 0.10)] ?? 0);
    p25.push(yearValues[Math.floor(trialsCount * 0.25)] ?? 0);
    p50.push(yearValues[Math.floor(trialsCount * 0.50)] ?? 0);
    p75.push(yearValues[Math.floor(trialsCount * 0.75)] ?? 0);
    p90.push(yearValues[Math.floor(trialsCount * 0.90)] ?? 0);
  }

  return {
    successRate,
    totalTrials: trialsCount,
    successCount,
    failureCount,
    medianLegacy,
    averageLegacy,
    worstCaseLegacy,
    bestCaseLegacy,
    medianDepletionAge,
    percentiles: {
      years,
      p10,
      p25,
      p50,
      p75,
      p90,
    },
  };
}
