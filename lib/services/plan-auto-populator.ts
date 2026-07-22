import { getDb } from '@/lib/db';
import { accounts, paystubs, plans, planAccounts, planEvents, planFlows, planSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encryptRow, decryptRow } from '@/lib/crypto';

export async function populatePlanWithUserFinances(planId: string, dataUserId: string, dek: Uint8Array) {
  const db = getDb();

  // 1. Fetch & decrypt user accounts
  const rawUserAccs = await db.select().from(accounts).where(eq(accounts.userId, dataUserId));
  const userAccs = await Promise.all(rawUserAccs.map((a) => decryptRow('accounts', a, dek)));

  // 2. Fetch & decrypt recent paystubs for salary estimate
  const rawPaystubs = await db.select().from(paystubs).where(eq(paystubs.userId, dataUserId)).limit(5);
  const userPaystubs = await Promise.all(rawPaystubs.map((p) => decryptRow('paystubs', p, dek)));

  let estimatedSalary = 85000; // default benchmark
  if (userPaystubs.length > 0) {
    const latestPaystub = userPaystubs[0];
    const gross = parseFloat(latestPaystub.grossCurrent) || 0;
    if (gross > 0) {
      estimatedSalary = gross * 26; // bi-weekly estimate
    }
  }

  let estimatedExpenses = Math.round(estimatedSalary * 0.5); // 50% default

  // 3. Clear existing plan accounts & mirror active Savings, Investments, and Assets into plan_accounts
  await db.delete(planAccounts).where(eq(planAccounts.planId, planId));

  const createdPlanAccs: Array<{ id: string; type: string }> = [];

  for (const acc of userAccs) {
    const accAny = acc as any;
    const accType = (accAny.type || '').toLowerCase();
    const accSubtype = (accAny.subtype || '').toLowerCase();
    const accCategory = (accAny.category || '').toLowerCase();

    // 1. Banking > Savings
    const isSavings =
      accType === 'savings' ||
      accSubtype === 'savings' ||
      accType === 'cd' ||
      accSubtype === 'cd' ||
      accType === 'money_market' ||
      accSubtype === 'money_market';

    // 2. All types of Investments
    const isInvestment =
      ['investment', 'brokerage', 'taxable', '401k', '403b', 'ira', 'roth_ira', 'rothira', 'traditional_ira', 'traditionalira', 'sepira', 'simpleira', 'retirement', 'hsa', 'crypto', '529', 'pension', 'stock_option'].includes(accType) ||
      ['investment', 'brokerage', 'retirement'].includes(accCategory);

    // 3. All types of Assets
    const isAsset =
      ['asset', 'real_estate', 'realestate', 'primaryhome', 'vehicle', 'valuable', 'metals', 'other_asset'].includes(accType) ||
      accCategory === 'asset';

    // Exclude checking, credit cards, mortgages, loans
    const isExcluded = ['checking', 'credit_card', 'credit', 'mortgage', 'loan', 'car_loan', 'auto_loan', 'student_loan', 'personal_loan', 'liability', 'hsachecking'].includes(accType);

    if (isExcluded || (!isSavings && !isInvestment && !isAsset)) {
      continue; // Skip checking accounts, credit cards, loans, and mortgages
    }

    let type = 'taxable';
    if (isSavings) type = 'cash';
    else if (['rothira', 'roth_ira'].includes(accType)) type = 'roth_ira';
    else if (['traditionalira', '401k', '403b', 'sepira', 'simpleira', 'retirement'].includes(accType)) type = 'traditional_401k';
    else if (accType === 'hsa') type = 'hsa';
    else if (accType === 'crypto') type = 'crypto';
    else if (isAsset || isInvestment) type = 'taxable';

    let rothPct: number | undefined = undefined;
    if (acc.metadata) {
      try {
        const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
        if (typeof meta.rothPercentage === 'number') rothPct = meta.rothPercentage;
      } catch {}
    }

    const balStr = String(parseFloat(acc.balance) || 0);

    let contribMode = 'none';
    let contribVal: string | undefined = undefined;
    let matchRate: string | undefined = undefined;
    let matchLimit: string | undefined = undefined;
    let isSurplusDest = false;

    if (type.includes('401k')) {
      contribMode = 'percentage';
      contribVal = '5.0';
      matchRate = '1.0';
      matchLimit = '5.0';
    } else if (type.includes('roth')) {
      contribMode = 'maximize';
    } else if (type === 'taxable') {
      isSurplusDest = true;
    }

    const encryptedAcc = await encryptRow('plan_accounts', {
      planId,
      userId: dataUserId,
      name: acc.name || 'Account',
      owner: 'primary',
      type,
      balance: balStr,
      costBasis: balStr,
      expectedGrowthRate: type === 'cash' ? '2.0' : '7.0',
      dividendYield: type === 'cash' ? '0.0' : '2.5',
      reinvestDividends: true,
      qualifiedDividendRatio: '1.0',
      rothPercentage: rothPct,
      isIncluded: true,
      contributionMode: contribMode,
      contributionValue: contribVal,
      companyMatchRate: matchRate,
      companyMatchLimit: matchLimit,
      isSurplusDestination: isSurplusDest,
    }, dek);

    const inserted = await db.insert(planAccounts).values(encryptedAcc).returning();
    createdPlanAccs.push({ id: inserted[0].id, type });
  }

  // If no accounts exist, create default starter accounts
  if (createdPlanAccs.length === 0) {
    const defaultAccs = [
      { name: '401(k) / Workplace Plan', type: 'traditional_401k', balance: '25000', contribMode: 'percentage', contribVal: '5.0', matchRate: '1.0', matchLimit: '5.0', isSurplus: false },
      { name: 'Roth IRA', type: 'roth_ira', balance: '15000', contribMode: 'maximize', contribVal: undefined, matchRate: undefined, matchLimit: undefined, isSurplus: false },
      { name: 'Taxable Investment Account', type: 'taxable', balance: '10000', contribMode: 'none', contribVal: undefined, matchRate: undefined, matchLimit: undefined, isSurplus: true },
      { name: 'Emergency Cash Savings', type: 'cash', balance: '10000', contribMode: 'none', contribVal: undefined, matchRate: undefined, matchLimit: undefined, isSurplus: false },
    ];

    for (const dAcc of defaultAccs) {
      const encryptedAcc = await encryptRow('plan_accounts', {
        planId,
        userId: dataUserId,
        name: dAcc.name,
        owner: 'primary',
        type: dAcc.type,
        balance: dAcc.balance,
        costBasis: dAcc.balance,
        expectedGrowthRate: dAcc.type === 'cash' ? '2.0' : '7.0',
        dividendYield: dAcc.type === 'cash' ? '0.0' : '2.5',
        reinvestDividends: true,
        qualifiedDividendRatio: '1.0',
        isIncluded: true,
        contributionMode: dAcc.contribMode,
        contributionValue: dAcc.contribVal,
        companyMatchRate: dAcc.matchRate,
        companyMatchLimit: dAcc.matchLimit,
        isSurplusDestination: dAcc.isSurplus,
      }, dek);

      const inserted = await db.insert(planAccounts).values(encryptedAcc).returning();
      createdPlanAccs.push({ id: inserted[0].id, type: dAcc.type });
    }
  }

  // 4. Auto-populate realistic Events (Income & Expenses)
  // Note: Primary/spouse salary is driven by plan-level fields (primarySalary, spouseSalary),
  // not by salary events. Salary events are only for side jobs / additional income streams.
  const autoEvents = [
    {
      name: 'Base Living Expenses',
      category: 'expense',
      type: 'living_expense',
      amount: String(Math.round(estimatedExpenses)),
      frequency: 'yearly',
      growthRate: '2.5',
      adjustForInflation: true,
      startTriggerType: 'now',
      endTriggerType: 'end_of_plan',
    },
    {
      name: 'Healthcare & Insurance',
      category: 'expense',
      type: 'healthcare',
      amount: '8400',
      frequency: 'yearly',
      growthRate: '4.5',
      adjustForInflation: true,
      startTriggerType: 'now',
      endTriggerType: 'end_of_plan',
    },
    {
      name: 'Estimated Social Security',
      category: 'income',
      type: 'social_security',
      amount: '32000',
      frequency: 'yearly',
      growthRate: '0.0',
      adjustForInflation: true,
      startTriggerType: 'age',
      startTriggerValue: '67',
      endTriggerType: 'end_of_plan',
    },
  ];

  for (const ev of autoEvents) {
    const encryptedEv = await encryptRow('plan_events', {
      planId,
      userId: dataUserId,
      name: ev.name,
      category: ev.category,
      type: ev.type,
      owner: 'primary',
      amount: ev.amount,
      frequency: ev.frequency,
      growthRate: ev.growthRate,
      adjustForInflation: ev.adjustForInflation,
      startTriggerType: ev.startTriggerType,
      startTriggerValue: ev.startTriggerValue,
      endTriggerType: ev.endTriggerType,
    }, dek);

    await db.insert(planEvents).values(encryptedEv);
  }

  // 5. Auto-populate Prioritized Flows
  const k401Acc = createdPlanAccs.find((a) => a.type.includes('401k')) || createdPlanAccs[0];
  const rothAcc = createdPlanAccs.find((a) => a.type.includes('roth')) || createdPlanAccs[0];
  const taxableAcc = createdPlanAccs.find((a) => a.type === 'taxable') || createdPlanAccs[0];

  const autoFlows = [
    {
      name: '401(k) Employer Match (5%)',
      type: 'invest',
      rank: 1,
      targetAccountId: k401Acc.id,
      ruleType: 'percentage',
      ruleValue: '5.0',
      matchRate: '1.0',
      matchLimit: '5.0',
      matchAccountId: k401Acc.id,
    },
    {
      name: 'Max Out Roth IRA',
      type: 'invest',
      rank: 2,
      targetAccountId: rothAcc.id,
      ruleType: 'maximize',
    },
    {
      name: 'Save Leftover Cash to Taxable Brokerage',
      type: 'invest',
      rank: 3,
      targetAccountId: taxableAcc.id,
      ruleType: 'save_leftover',
    },
  ];

  for (const fl of autoFlows) {
    const encryptedFl = await encryptRow('plan_flows', {
      planId,
      userId: dataUserId,
      name: fl.name,
      type: fl.type,
      rank: fl.rank,
      targetAccountId: fl.targetAccountId,
      ruleType: fl.ruleType,
      ruleValue: fl.ruleValue,
      matchRate: fl.matchRate,
      matchLimit: fl.matchLimit,
      matchAccountId: fl.matchAccountId,
      startTriggerType: 'now',
      endTriggerType: 'end_of_plan',
    }, dek);

    await db.insert(planFlows).values(encryptedFl);
  }

  // 6. Create default plan_settings
  const encryptedSettings = await encryptRow('plan_settings', {
    planId,
    userId: dataUserId,
    ratesMode: 'fixed',
    fixedInflationRate: '3.0',
    fixedBenefitCola: '0.0',
    historicalStartYear: 1928,
    historicalLoopbackYear: 1928,
    withholdingDeferred: '20.0',
    withholdingTaxable: '10.0',
    incomeTaxModifier: '0.0',
    capGainsTaxModifier: '0.0',
    etrLocalTax: false,
    etrPropertyTax: false,
    etrReturnOfCapital: false,
    etrNonTaxableSales: false,
    spendingMortgagePrincipal: false,
    spendingDebtPrincipal: true,
    heirFlatIncomeTaxRate: '25.0',
    stepUpBasis: true,
    realEstateLiquidationRate: '6.0',
    administrativeCostRate: '1.0',
    charitableGiving: '0.0',
    charitableAllocationStrategy: 'tax_inefficient_first',
  }, dek);

  // 7. Update plan with estimated salary
  const encryptedPlanSalary = await encryptRow('plans', {
    primarySalary: String(Math.round(estimatedSalary)),
    primarySalaryYear: new Date().getFullYear(),
    userId: dataUserId,
  }, dek);
  delete encryptedPlanSalary.userId;
  await db.update(plans).set(encryptedPlanSalary).where(eq(plans.id, planId));
}
