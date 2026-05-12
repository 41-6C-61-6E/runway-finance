export interface RetirementPlan {
  id?: string;
  name: string;
  fireScenarioId?: string | null;
  retirementAge: number;
  lifeExpectancy: number;
  portfolioAtRetirement: number;
  expectedReturnRate: number;
  inflationRate: number;
  annualWithdrawal: number;
  ssStartAge: number;
  ssAnnual: number;
  pensionStartAge: number;
  pensionAnnual: number;
  partTimeIncome: number;
  partTimeEndAge: number;
  rentalIncomeAnnual: number;
  healthcareAnnual: number;
  legacyGoal: number;
}

export interface YearDetail {
  age: number;
  startBalance: number;
  investmentReturn: number;
  withdrawal: number;
  ssIncome: number;
  pensionIncome: number;
  partTimeIncome: number;
  rentalIncome: number;
  healthcare: number;
  netCashFlow: number;
  endBalance: number;
}

export interface ProjectionResult {
  years: YearDetail[];
  yearsOfRunway: number;
  endBalance: number;
  success: boolean;
  peakPortfolio: number;
  totalWithdrawn: number;
  totalIncome: number;
}

export interface MonteCarloResult {
  successRate: number;
  medianPath: { age: number; balance: number }[];
  p10Path: { age: number; balance: number }[];
  p90Path: { age: number; balance: number }[];
  simulations: number;
}

export function calculateDecumulation(plan: RetirementPlan): ProjectionResult {
  const {
    retirementAge,
    lifeExpectancy,
    portfolioAtRetirement,
    expectedReturnRate,
    inflationRate,
    annualWithdrawal,
    ssStartAge,
    ssAnnual,
    pensionStartAge,
    pensionAnnual,
    partTimeIncome,
    partTimeEndAge,
    rentalIncomeAnnual,
    healthcareAnnual,
    legacyGoal,
  } = plan;

  const years: YearDetail[] = [];
  let balance = portfolioAtRetirement;
  let peak = portfolioAtRetirement;
  let totalWithdrawn = 0;
  let totalIncome = 0;
  let yearsOfRunway = 0;
  let success = true;

  for (let age = retirementAge; age <= lifeExpectancy; age++) {
    const yearsIntoRetirement = age - retirementAge;
    const inflationFactor = Math.pow(1 + inflationRate, yearsIntoRetirement);

    const withdrawal = annualWithdrawal * inflationFactor;
    const healthcare = healthcareAnnual * inflationFactor;

    const ssIncome = age >= ssStartAge ? ssAnnual * inflationFactor : 0;
    const pensionIncome = age >= pensionStartAge ? pensionAnnual * inflationFactor : 0;
    const ptIncome = partTimeEndAge > 0 && age <= partTimeEndAge ? partTimeIncome * inflationFactor : 0;
    const rentalIncome = rentalIncomeAnnual * inflationFactor;

    const totalAnnualIncome = ssIncome + pensionIncome + ptIncome + rentalIncome;
    const netCashFlow = totalAnnualIncome - withdrawal - healthcare;

    const investmentReturn = balance * expectedReturnRate;

    const startBalance = balance;
    balance = balance + investmentReturn + netCashFlow;

    if (balance > peak) peak = balance;
    totalWithdrawn += withdrawal + healthcare;
    totalIncome += totalAnnualIncome;

    years.push({
      age,
      startBalance: Math.round(startBalance),
      investmentReturn: Math.round(investmentReturn),
      withdrawal: Math.round(withdrawal),
      ssIncome: Math.round(ssIncome),
      pensionIncome: Math.round(pensionIncome),
      partTimeIncome: Math.round(ptIncome),
      rentalIncome: Math.round(rentalIncome),
      healthcare: Math.round(healthcare),
      netCashFlow: Math.round(netCashFlow),
      endBalance: Math.round(Math.max(balance, 0)),
    });

    if (balance <= 0) {
      if (yearsOfRunway === 0) yearsOfRunway = years.length;
      success = false;
      balance = 0;
    }
  }

  if (yearsOfRunway === 0) yearsOfRunway = lifeExpectancy - retirementAge + 1;

  const endBalance = balance >= legacyGoal ? balance : 0;
  success = success && balance >= legacyGoal;

  return {
    years,
    yearsOfRunway,
    endBalance: Math.round(endBalance),
    success,
    peakPortfolio: Math.round(peak),
    totalWithdrawn: Math.round(totalWithdrawn),
    totalIncome: Math.round(totalIncome),
  };
}

export function runMonteCarlo(
  plan: RetirementPlan,
  simulations = 1000,
): MonteCarloResult {
  const { retirementAge, lifeExpectancy } = plan;
  const numYears = lifeExpectancy - retirementAge + 1;
  const ages = Array.from({ length: numYears }, (_, i) => retirementAge + i);

  const allPaths: number[][] = [];
  let successes = 0;

  for (let sim = 0; sim < simulations; sim++) {
    const path: number[] = [];
    let balance = plan.portfolioAtRetirement;

    for (let age = retirementAge; age <= lifeExpectancy; age++) {
      const yearsIntoRetirement = age - retirementAge;
      const inflationFactor = Math.pow(1 + plan.inflationRate, yearsIntoRetirement);

      const withdrawal = plan.annualWithdrawal * inflationFactor;
      const healthcare = plan.healthcareAnnual * inflationFactor;

      const ssIncome = age >= plan.ssStartAge ? plan.ssAnnual * inflationFactor : 0;
      const pensionIncome = age >= plan.pensionStartAge ? plan.pensionAnnual * inflationFactor : 0;
      const ptIncome = plan.partTimeEndAge > 0 && age <= plan.partTimeEndAge ? plan.partTimeIncome * inflationFactor : 0;
      const rentalIncome = plan.rentalIncomeAnnual * inflationFactor;

      const totalAnnualIncome = ssIncome + pensionIncome + ptIncome + rentalIncome;
      const netCashFlow = totalAnnualIncome - withdrawal - healthcare;

      const annualReturn = randomNormal(plan.expectedReturnRate, 0.10);
      balance = balance * (1 + annualReturn) + netCashFlow;
      if (balance < 0) balance = 0;

      path.push(Math.round(balance));
    }

    allPaths.push(path);
    if (path[path.length - 1] >= plan.legacyGoal) successes++;
  }

  const sortedByFinal = [...allPaths].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const medianIdx = Math.floor(sortedByFinal.length * 0.5);
  const p10Idx = Math.floor(sortedByFinal.length * 0.1);
  const p90Idx = Math.floor(sortedByFinal.length * 0.9);

  return {
    successRate: Math.round((successes / simulations) * 100),
    medianPath: ages.map((age, i) => ({ age, balance: Math.round(sortedByFinal[medianIdx]?.[i] ?? 0) })),
    p10Path: ages.map((age, i) => ({ age, balance: Math.round(sortedByFinal[p10Idx]?.[i] ?? 0) })),
    p90Path: ages.map((age, i) => ({ age, balance: Math.round(sortedByFinal[p90Idx]?.[i] ?? 0) })),
    simulations,
  };
}

function randomNormal(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

const defaultPlan: RetirementPlan = {
  name: 'Primary Plan',
  retirementAge: 65,
  lifeExpectancy: 95,
  portfolioAtRetirement: 1000000,
  expectedReturnRate: 0.05,
  inflationRate: 0.03,
  annualWithdrawal: 40000,
  ssStartAge: 67,
  ssAnnual: 24000,
  pensionStartAge: 65,
  pensionAnnual: 0,
  partTimeIncome: 0,
  partTimeEndAge: 0,
  rentalIncomeAnnual: 0,
  healthcareAnnual: 6000,
  legacyGoal: 0,
};

export function getDefaultRetirementPlan(): RetirementPlan {
  return { ...defaultPlan };
}


