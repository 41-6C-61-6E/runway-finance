import { EnginePlan, EngineAccount, runRetirementSimulation } from './retirement-engine';
import { HISTORICAL_RETURNS_DATA } from '@/lib/constants/retirement-defaults';

export interface MonteCarloOptions {
  model: 'historical_bootstrap' | 'normal_distribution' | 'constant';
  numberOfTrials: number; // e.g. 250
  meanAnnualReturn: number; // e.g. 0.07 (7%)
  returnStdDev: number; // e.g. 0.12 (12%)
  equityAllocation: number; // e.g. 80 for 80% Stocks / 20% Bonds
  adjustForInflation: boolean; // true = Real Today's Dollars, false = Nominal
  fixedInflationRate?: number; // e.g. 3.0 for 3%
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
  isRealDollars: boolean;
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
  const equityPct = Math.max(0, Math.min(100, options.equityAllocation ?? 80));
  const equityRatio = equityPct / 100;
  const bondRatio = 1 - equityRatio;
  const adjustForInflation = options.adjustForInflation ?? true;
  const inflationRate = ((options.fixedInflationRate ?? basePlan.settings?.fixedInflationRate ?? 3.0)) / 100;

  const trials: MonteCarloTrialResult[] = [];
  const currentYear = new Date().getFullYear();
  const primaryBirthYear = basePlan.primaryBirthYear || 1985;
  const totalYears = Math.max(1, (basePlan.lifeExpectancyAge || 100) - (currentYear - primaryBirthYear));

  for (let t = 0; t < trialsCount; t++) {
    const trialPlan: EnginePlan = JSON.parse(JSON.stringify(basePlan));

    // Generate yearly return sequence for this trial
    const yearlyMarketData: Array<{ growth: number; dividend: number }> = [];
    for (let y = 0; y < totalYears; y++) {
      if (model === 'normal_distribution') {
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random() || 0.0001;
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const randomReturn = meanReturn + stdDev * z;
        const boundedReturn = Math.max(-0.35, Math.min(0.45, randomReturn));
        
        // 1.5% dividend yield, price growth = boundedReturn - 1.5% (Total Return = boundedReturn)
        const divYield = Math.min(0.015, Math.max(0, boundedReturn));
        const priceGrowth = boundedReturn - divYield;
        yearlyMarketData.push({ growth: priceGrowth, dividend: divYield });
      } else {
        const randomIndex = Math.floor(Math.random() * HISTORICAL_RETURNS_DATA.length);
        const histData = HISTORICAL_RETURNS_DATA[randomIndex];

        // Stock Total Return = histData.stocksGrowth (price + dividend)
        // Bond Total Return = histData.bondsGrowth + histData.bondsYield
        const stockPriceGrowth = histData.stocksGrowth - histData.stocksYield;
        const stockDivYield = histData.stocksYield;

        const bondPriceGrowth = histData.bondsGrowth;
        const bondYield = histData.bondsYield;

        const blendedPriceGrowth = equityRatio * stockPriceGrowth + bondRatio * bondPriceGrowth;
        const blendedDivYield = equityRatio * stockDivYield + bondRatio * bondYield;

        yearlyMarketData.push({ growth: blendedPriceGrowth, dividend: blendedDivYield });
      }
    }

    const yearGrowthFn = (yearOffset: number, acc: EngineAccount) => {
      const isMarketAsset = acc.type === 'taxable' || acc.type === 'crypto' || acc.type.includes('ira') || acc.type.includes('401k') || acc.type === 'hsa';
      if (isMarketAsset) {
        const m = yearlyMarketData[yearOffset % yearlyMarketData.length] || { growth: 0.05, dividend: 0.02 };
        return { growth: m.growth, dividend: m.dividend };
      }
      return { growth: (acc.expectedGrowthRate || 2.0) / 100, dividend: (acc.dividendYield || 0.0) / 100 };
    };

    const simRes = runRetirementSimulation(trialPlan, yearGrowthFn);

    const yearlyNetWorthProcessed = simRes.yearlyResults.map((y, idx) => {
      if (adjustForInflation) {
        const discountFactor = Math.pow(1 + inflationRate, idx);
        return y.netWorth / discountFactor;
      }
      return y.netWorth;
    });

    const endingNW = yearlyNetWorthProcessed[yearlyNetWorthProcessed.length - 1] ?? 0;

    trials.push({
      trialIndex: t,
      yearlyNetWorth: yearlyNetWorthProcessed,
      endingNetWorth: endingNW,
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
  const startAge = currentYear - primaryBirthYear;
  const years = Array.from({ length: numYears }, (_, i) => primaryBirthYear + startAge + i);

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
    isRealDollars: adjustForInflation,
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
