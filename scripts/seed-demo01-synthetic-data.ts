import { getDb } from '@/lib/db';
import { getServerDEK } from '@/lib/crypto-context';
import {
  accounts,
  accountSnapshots,
  aiProposals,
  budgets,
  categories,
  financialGoals,
  goalAllocationHistory,
  holdings,
  holdingSnapshots,
  monthlyCashFlow,
  netWorthSnapshots,
  paystubs,
  paystubLineItems,
  paystubFieldMappings,
  plans,
  planAccounts,
  planEvents,
  planFlows,
  planLiabilities,
  planSettings,
  recurringTransactions,
  tags,
  transactions,
  transactionTags,
  userNotifications,
  userSettings,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { encryptRow, encryptField } from '@/lib/crypto';
import {
  recalculateNetWorthSnapshots,
  formatToCents,
  roundToCents,
} from '@/lib/services/account-history';
import {
  updateMonthlyCashFlowSummaries,
  updateCategorySpendingSummaries,
  updateCategoryIncomeSummaries,
} from '@/lib/services/sync';

const USER_ID = 'demo01';

async function seed() {
  console.log(`Starting synthetic data generation for user: ${USER_ID}...`);
  const db = getDb();
  const dek = await getServerDEK(USER_ID);
  console.log('Retrieved user DEK successfully.');

  // ── 1. Clean Slate for demo01 ──────────────────────────────────────────────
  console.log('Cleaning existing demo01 test data...');
  await db.delete(aiProposals).where(eq(aiProposals.userId, USER_ID));
  await db.delete(userNotifications).where(eq(userNotifications.userId, USER_ID));
  await db.delete(transactionTags).where(
    inArray(
      transactionTags.transactionId,
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.userId, USER_ID))
    )
  );
  await db.delete(transactions).where(eq(transactions.userId, USER_ID));
  await db.delete(holdingSnapshots).where(eq(holdingSnapshots.userId, USER_ID));
  await db.delete(holdings).where(eq(holdings.userId, USER_ID));
  await db.delete(accountSnapshots).where(eq(accountSnapshots.userId, USER_ID));
  await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, USER_ID));
  await db.delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, USER_ID));
  await db.delete(budgets).where(eq(budgets.userId, USER_ID));
  await db.delete(goalAllocationHistory).where(eq(goalAllocationHistory.userId, USER_ID));
  await db.delete(financialGoals).where(eq(financialGoals.userId, USER_ID));
  await db.delete(recurringTransactions).where(eq(recurringTransactions.userId, USER_ID));
  await db.delete(paystubLineItems).where(eq(paystubLineItems.userId, USER_ID));
  await db.delete(paystubs).where(eq(paystubs.userId, USER_ID));
  await db.delete(paystubFieldMappings).where(eq(paystubFieldMappings.userId, USER_ID));
  await db.delete(planFlows).where(eq(planFlows.userId, USER_ID));
  await db.delete(planEvents).where(eq(planEvents.userId, USER_ID));
  await db.delete(planLiabilities).where(eq(planLiabilities.userId, USER_ID));
  await db.delete(planAccounts).where(eq(planAccounts.userId, USER_ID));
  await db.delete(planSettings).where(eq(planSettings.userId, USER_ID));
  await db.delete(plans).where(eq(plans.userId, USER_ID));
  await db.delete(tags).where(eq(tags.userId, USER_ID));
  await db.delete(accounts).where(eq(accounts.userId, USER_ID));

  // ── 2. Update User Settings ────────────────────────────────────────────────
  console.log('Updating user settings (Age 30, born 1996, Pacific Time)...');
  await db
    .update(userSettings)
    .set({
      birthYear: 1996,
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
      theme: 'moonlight',
      accentColor: 'teal',
      forecastMode: 'hybrid',
      defaultChartTimeRange: '1y',
      showSyntheticData: {
        global: true,
        netWorth: true,
        investments: true,
        realEstate: true,
        cashFlowProjections: true,
      },
      showImportedData: {
        global: true,
        netWorth: true,
        investments: true,
        realEstate: true,
        cashFlowProjections: true,
      },
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, USER_ID));

  // ── 3. Fetch Existing Categories ───────────────────────────────────────────
  console.log('Loading existing category map...');
  const existingCategories = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId, isIncome: categories.isIncome })
    .from(categories)
    .where(eq(categories.userId, USER_ID));

  const catMap = new Map<string, string>();
  for (const c of existingCategories) {
    catMap.set(c.name.toLowerCase().trim(), c.id);
  }

  const getCat = (name: string, fallback?: string): string => {
    const found = catMap.get(name.toLowerCase().trim());
    if (found) return found;
    if (fallback) {
      const fb = catMap.get(fallback.toLowerCase().trim());
      if (fb) return fb;
    }
    // Return first expense category if not found
    return existingCategories[0]?.id || '';
  };

  // Add custom surfer subcategory if missing
  let surfCategoryId = catMap.get('surfing & ocean gear');
  if (!surfCategoryId) {
    const sportsParentId = getCat('Sports & Recreation');
    const [newCat] = await db
      .insert(categories)
      .values({
        userId: USER_ID,
        parentId: sportsParentId || null,
        name: 'Surfing & Ocean Gear',
        color: '#06b6d4',
        icon: 'waves',
        isIncome: false,
        categoryType: 'standard',
        isDiscretionary: true,
      })
      .returning();
    surfCategoryId = newCat.id;
    catMap.set('surfing & ocean gear', surfCategoryId);
  }

  // ── 4. Create Tags ─────────────────────────────────────────────────────────
  console.log('Creating tags...');
  const tagDefs = [
    { name: 'Surfing', color: '#06b6d4', description: 'Surf gear, wax, wetsuits, and trips' },
    { name: 'Groceries', color: '#22c55e', description: 'Weekly meal prep and home cooking' },
    { name: 'Thrifty DIY', color: '#eab308', description: 'DIY ding repairs and home maintenance' },
    { name: 'Baja Surf Trip', color: '#f97316', description: 'Annual camping and surf trip to Baja' },
    { name: 'Tacoma Truck', color: '#64748b', description: 'Surf rig maintenance and gas' },
    { name: 'Fixed Living Costs', color: '#8b5cf6', description: 'Essential recurring housing and utility costs' },
  ];

  const tagMap = new Map<string, string>();
  for (const t of tagDefs) {
    const enc = await encryptRow('tags', { userId: USER_ID, ...t }, dek);
    const [row] = await db.insert(tags).values(enc).returning();
    tagMap.set(t.name, row.id);
  }

  // ── 5. Create Accounts ─────────────────────────────────────────────────────
  console.log('Creating financial accounts...');
  // Account balances targeted for ~1.03M Net Worth:
  // Assets:
  // - Real estate: $785,000
  // - Tacoma: $26,000
  // - Cash/Checking/Savings: $8,420.50 + $45,000 + $12,500 = $65,920.50
  // - Investments/Retirement: $265,400 + $212,850 + $65,200 + $51,300 + $22,450 = $617,200
  // Total Assets = $1,494,120.50
  // Liabilities:
  // - Mortgage: $452,800
  // - Credit Cards: $2,150.40 + $890.25 = $3,040.65
  // Total Liabilities = $455,840.65
  // Net Worth = $1,494,120.50 - $455,840.65 = $1,038,279.85 (~$1.04M)

  // First create mortgage account ID placeholder so condo can link to it
  const tempMortgageId = crypto.randomUUID();
  const tempCondoId = crypto.randomUUID();

  const accountDefs = [
    {
      id: crypto.randomUUID(),
      name: 'Chase Total Checking (Everyday & Surf Cash)',
      type: 'checking',
      balance: '8420.50',
      institution: 'Chase',
      externalId: 'man-checking-01',
      displayOrder: 1,
    },
    {
      id: crypto.randomUUID(),
      name: 'Ally High Yield Savings (Emergency Reserve)',
      type: 'savings',
      balance: '45000.00',
      institution: 'Ally Bank',
      externalId: 'man-savings-01',
      displayOrder: 2,
    },
    {
      id: crypto.randomUUID(),
      name: 'Ally Savings (Surf Quiver & Van Camper)',
      type: 'savings',
      balance: '12500.00',
      institution: 'Ally Bank',
      externalId: 'man-savings-02',
      displayOrder: 3,
    },
    {
      id: crypto.randomUUID(),
      name: 'Vanguard Taxable Brokerage',
      type: 'brokerage',
      balance: '265400.00',
      institution: 'Vanguard',
      externalId: 'man-brokerage-01',
      displayOrder: 4,
    },
    {
      id: crypto.randomUUID(),
      name: 'Fidelity 401(k) - Pacific Cloud Labs',
      type: '401k',
      balance: '212850.00',
      institution: 'Fidelity',
      externalId: 'man-401k-01',
      displayOrder: 5,
    },
    {
      id: crypto.randomUUID(),
      name: 'Vanguard Roth IRA - Dylan',
      type: 'rothira',
      balance: '65200.00',
      institution: 'Vanguard',
      externalId: 'man-roth-dylan',
      displayOrder: 6,
    },
    {
      id: crypto.randomUUID(),
      name: 'Vanguard Roth IRA - Maya',
      type: 'rothira',
      balance: '51300.00',
      institution: 'Vanguard',
      externalId: 'man-roth-maya',
      displayOrder: 7,
    },
    {
      id: crypto.randomUUID(),
      name: 'Fidelity Health Savings Account (HSA)',
      type: 'hsa',
      balance: '22450.00',
      institution: 'Fidelity',
      externalId: 'man-hsa-01',
      displayOrder: 8,
    },
    {
      id: tempCondoId,
      name: 'Pleasure Point Beach Condo (Santa Cruz)',
      type: 'condo',
      balance: '785000.00',
      institution: 'Santa Cruz Real Estate',
      externalId: 'man-condo-01',
      displayOrder: 9,
      metadata: JSON.stringify({
        propertyType: 'condo',
        address: '41st Ave, Santa Cruz, CA 95062',
        zipCode: '95062',
        purchasePrice: 625000,
        purchaseDate: '2021-10-15',
        manualValue: 785000,
        mortgageAccountIds: [tempMortgageId],
        sellerClosingCostPercent: 6.0,
      }),
    },
    {
      id: tempMortgageId,
      name: 'Chase Home Lending 30Y Fixed 3.125%',
      type: 'mortgage',
      balance: '-452800.00',
      institution: 'Chase',
      externalId: 'man-mortgage-01',
      displayOrder: 10,
      metadata: JSON.stringify({
        linkedPropertyId: tempCondoId,
        originalLoanAmount: 500000,
        interestRate: 3.125,
        monthlyPayment: 2141.6,
        originationDate: '2021-10-15',
        purchaseDate: '2021-10-15',
        termMonths: 360,
        extraPrincipal: 100,
        escrow: 420,
      }),
    },
    {
      id: crypto.randomUUID(),
      name: '2018 Toyota Tacoma TRD Off-Road (Surf Rig)',
      type: 'vehicle',
      balance: '26000.00',
      institution: 'Toyota',
      externalId: 'man-tacoma-01',
      displayOrder: 11,
      metadata: JSON.stringify({
        make: 'Toyota',
        model: 'Tacoma TRD Off-Road 4x4',
        year: 2018,
        purchasePrice: 34000,
        purchaseDate: '2021-10-01',
        manualValue: 26000,
      }),
    },
    {
      id: crypto.randomUUID(),
      name: 'Chase Sapphire Reserve',
      type: 'credit',
      balance: '-2150.40',
      institution: 'Chase',
      externalId: 'man-credit-csr',
      displayOrder: 12,
    },
    {
      id: crypto.randomUUID(),
      name: 'Costco Anywhere Visa by Citi',
      type: 'credit',
      balance: '-890.25',
      institution: 'Citi',
      externalId: 'man-credit-costco',
      displayOrder: 13,
    },
  ];

  const accMap = new Map<string, string>();
  for (const a of accountDefs) {
    const row = {
      id: a.id,
      userId: USER_ID,
      connectionId: null,
      plaidConnectionId: null,
      externalId: a.externalId,
      name: a.name,
      currency: 'USD',
      balance: a.balance,
      balanceDate: new Date(),
      type: a.type,
      metadata: a.metadata ?? null,
      institution: a.institution ?? null,
      isHidden: false,
      isExcludedFromNetWorth: false,
      sensitive: false,
      displayOrder: a.displayOrder,
    };
    const enc = await encryptRow('accounts', row, dek);
    await db.insert(accounts).values(enc);
    accMap.set(a.externalId, a.id);
  }

  const checkingId = accMap.get('man-checking-01')!;
  const emergencySavingsId = accMap.get('man-savings-01')!;
  const quiverSavingsId = accMap.get('man-savings-02')!;
  const brokerageId = accMap.get('man-brokerage-01')!;
  const k401Id = accMap.get('man-401k-01')!;
  const rothDylanId = accMap.get('man-roth-dylan')!;
  const rothMayaId = accMap.get('man-roth-maya')!;
  const hsaId = accMap.get('man-hsa-01')!;
  const condoId = tempCondoId;
  const mortgageId = tempMortgageId;
  const tacomaId = accMap.get('man-tacoma-01')!;
  const csrId = accMap.get('man-credit-csr')!;
  const costcoCreditId = accMap.get('man-credit-costco')!;

  // ── 6. Create Holdings ─────────────────────────────────────────────────────
  console.log('Inserting stock & ETF holdings...');
  const holdingDefs = [
    // Vanguard Taxable Brokerage ($265,400)
    {
      accountId: brokerageId,
      securityId: 'sec-vti-01',
      ticker: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      quantity: '550.00',
      price: '305.20',
      costBasis: '125000.00',
      value: '167860.00',
    },
    {
      accountId: brokerageId,
      securityId: 'sec-vxus-01',
      ticker: 'VXUS',
      name: 'Vanguard Total International Stock ETF',
      quantity: '720.00',
      price: '64.80',
      costBasis: '40000.00',
      value: '46656.00',
    },
    {
      accountId: brokerageId,
      securityId: 'sec-bnd-01',
      ticker: 'BND',
      name: 'Vanguard Total Bond Market ETF',
      quantity: '690.00',
      price: '73.75',
      costBasis: '51500.00',
      value: '50884.00',
    },
    // Fidelity 401(k) ($212,850)
    {
      accountId: k401Id,
      securityId: 'sec-fxaix-01',
      ticker: 'FXAIX',
      name: 'Fidelity 500 Index Fund',
      quantity: '720.00',
      price: '204.50',
      costBasis: '108000.00',
      value: '147240.00',
    },
    {
      accountId: k401Id,
      securityId: 'sec-ftihx-01',
      ticker: 'FTIHX',
      name: 'Fidelity Total International Index',
      quantity: '2150.00',
      price: '16.90',
      costBasis: '31000.00',
      value: '36335.00',
    },
    {
      accountId: k401Id,
      securityId: 'sec-fxnax-01',
      ticker: 'FXNAX',
      name: 'Fidelity U.S. Bond Index Fund',
      quantity: '2650.00',
      price: '11.05',
      costBasis: '30000.00',
      value: '29275.00',
    },
    // Vanguard Roth IRA - Dylan ($65,200)
    {
      accountId: rothDylanId,
      securityId: 'sec-voo-01',
      ticker: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      quantity: '110.00',
      price: '532.00',
      costBasis: '42000.00',
      value: '58520.00',
    },
    {
      accountId: rothDylanId,
      securityId: 'sec-vt-01',
      ticker: 'VT',
      name: 'Vanguard Total World Stock ETF',
      quantity: '58.00',
      price: '115.17',
      costBasis: '5200.00',
      value: '6680.00',
    },
    // Vanguard Roth IRA - Maya ($51,300)
    {
      accountId: rothMayaId,
      securityId: 'sec-vti-maya',
      ticker: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      quantity: '168.00',
      price: '305.20',
      costBasis: '38000.00',
      value: '51273.60',
    },
    // Fidelity HSA ($22,450)
    {
      accountId: hsaId,
      securityId: 'sec-itot-01',
      ticker: 'ITOT',
      name: 'iShares Core S&P Total U.S. Stock ETF',
      quantity: '184.00',
      price: '122.00',
      costBasis: '16500.00',
      value: '22448.00',
    },
  ];

  for (const h of holdingDefs) {
    const row = {
      userId: USER_ID,
      accountId: h.accountId,
      securityId: h.securityId,
      ticker: h.ticker,
      name: h.name,
      quantity: h.quantity,
      price: h.price,
      costBasis: h.costBasis,
      value: h.value,
      currency: 'USD',
    };
    const enc = await encryptRow('holdings', row, dek);
    await db.insert(holdings).values(enc);
  }

  // ── 7. Generate 5 Years of Transactions (2021-10 to 2026-10) ───────────────
  console.log('Generating 5 years of transactions (surfer lifestyle, thrifty bills, bi-weekly salary)...');
  const txRows: any[] = [];

  const startDate = new Date('2021-10-01T12:00:00Z');
  const endDate = new Date('2026-10-08T12:00:00Z');

  // Categories helper
  const cSalary = getCat('Salary & Wages', 'Income');
  const cFreelance = getCat('Freelance / 1099', 'Income');
  const cMortgage = getCat('Rent / Mortgage', 'Housing');
  const cHOA = getCat('HOA Fees', 'Housing');
  const cElectric = getCat('Electricity', 'Utilities');
  const cGasUtility = getCat('Gas', 'Utilities');
  const cWater = getCat('Water & Sewer', 'Utilities');
  const cInternet = getCat('Internet', 'Utilities');
  const cPhone = getCat('Phone & Cellular', 'Utilities');
  const cGroceries = getCat('Groceries', 'Food & Dining');
  const cDining = getCat('Restaurants & Dining Out', 'Food & Dining');
  const cGasFuel = getCat('Gas & Fuel', 'Transportation');
  const cAutoMaint = getCat('Auto Maintenance', 'Transportation');
  const cAutoIns = getCat('Auto Insurance', 'Transportation');
  const cSurf = surfCategoryId;
  const cMusic = getCat('Music & Streaming', 'Entertainment');
  const cTravel = getCat('Travel Experiences', 'Travel');
  const cHomeMaint = getCat('Home Maintenance & Repairs', 'Housing');
  const cShopping = getCat('Online Shopping', 'Shopping');
  const cClothing = getCat('Clothing & Apparel', 'Shopping');
  const cTransfers = getCat('Transfers & Adjustments', 'Financial');
  const cDividends = getCat('Interest & Dividends', 'Income');

  // Iterate day by day over 5 years
  const cur = new Date(startDate);
  let paycheckCounter = 0;

  while (cur <= endDate) {
    const dStr = cur.toISOString().split('T')[0];
    const dayOfMonth = cur.getUTCDate();
    const dayOfWeek = cur.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const month = cur.getUTCMonth(); // 0-11
    const year = cur.getUTCFullYear();

    // 1. Bi-weekly Friday Salary Paycheck
    if (dayOfWeek === 5) {
      paycheckCounter++;
      if (paycheckCounter % 2 === 0) {
        // Bi-weekly net deposit to checking: ~$4,750
        txRows.push({
          userId: USER_ID,
          accountId: checkingId,
          externalId: `tx-sal-${dStr}`,
          date: dStr,
          amount: '4750.00',
          description: 'Pacific Cloud Labs Inc - Direct Deposit Paycheck',
          payee: 'Pacific Cloud Labs Inc',
          categoryId: cSalary,
          source: 'bank',
        });

        // Automated transfer to 401(k) / investments
        txRows.push({
          userId: USER_ID,
          accountId: checkingId,
          externalId: `tx-inv-vanguard-${dStr}`,
          date: dStr,
          amount: '-750.00',
          description: 'Transfer to Vanguard Taxable Brokerage (VTI & VXUS)',
          payee: 'Vanguard',
          categoryId: cTransfers,
          source: 'bank',
        });
      }
    }

    // 2. February Annual Tech Performance Bonus (Pacific Cloud Labs)
    if (month === 1 && dayOfMonth === 14) {
      const bonusMap: Record<number, number> = {
        2022: 6500,
        2023: 7200,
        2024: 8000,
        2025: 8500,
        2026: 9200,
      };
      const bAmt = bonusMap[year] || 7500;
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-bonus-${year}`,
        date: dStr,
        amount: bAmt.toFixed(2),
        description: 'Pacific Cloud Labs Inc - Annual Performance & Equity Bonus',
        payee: 'Pacific Cloud Labs Inc',
        categoryId: cSalary,
        source: 'bank',
      });

      // Bonus sweep to Vanguard Taxable Brokerage
      const sweepAmt = Math.round(bAmt * 0.55);
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-bonus-sweep-${year}`,
        date: dStr,
        amount: `-${sweepAmt}.00`,
        description: 'Vanguard Taxable Brokerage - Annual Bonus Investment Sweep',
        payee: 'Vanguard',
        categoryId: cTransfers,
        source: 'bank',
      });
    }

    // 3. Maya Freelance Design Deposit (around the 18th - realistic variability!)
    if (dayOfMonth === 18) {
      // Freelance revenue varies realistically: slow winter/late summer months vs big quarter-end deliveries
      const freelanceAmounts = [1200, 850, 2400, 1600, 2800, 1400, 950, 1800, 3100, 1500, 1100, 2600];
      const baseFreelance = freelanceAmounts[month] || 1500;
      const variation = ((year * 13 + month * 7) % 350) - 175;
      const freelanceAmt = (baseFreelance + variation).toFixed(2);

      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-free-${dStr}`,
        date: dStr,
        amount: freelanceAmt,
        description: 'Maya Studio Design - Client Branding & UI Retainer',
        payee: 'Client Direct Deposit',
        categoryId: cFreelance,
        source: 'bank',
      });
    }

    // 3. Monthly 1st of Month Housing Costs
    if (dayOfMonth === 1) {
      // Mortgage
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-mort-${dStr}`,
        date: dStr,
        amount: '-2141.60',
        description: 'Chase Home Lending - P&I and Escrow AutoPay',
        payee: 'Chase Home Lending',
        categoryId: cMortgage,
        source: 'bank',
      });
      // HOA
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-hoa-${dStr}`,
        date: dStr,
        amount: '-320.00',
        description: 'Pleasure Point HOA Monthly Assessment',
        payee: 'Pleasure Point HOA',
        categoryId: cHOA,
        source: 'bank',
      });
      // Transfer to Roth IRA
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-roth-trans-${dStr}`,
        date: dStr,
        amount: '-550.00',
        description: 'Monthly Roth IRA Contribution Auto-Transfer',
        payee: 'Vanguard',
        categoryId: cTransfers,
        source: 'bank',
      });
      // Transfer to Ally Quiver & Van Fund
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-ally-quiver-${dStr}`,
        date: dStr,
        amount: '-250.00',
        description: 'Transfer to Ally Savings - Surf Quiver & Camper Fund',
        payee: 'Ally Bank',
        categoryId: cTransfers,
        source: 'bank',
      });
    }

    // 4. Monthly Utilities (staggered)
    if (dayOfMonth === 5) {
      // Sonic Fiber Internet
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-sonic-${dStr}`,
        date: dStr,
        amount: '-49.99',
        description: 'Sonic Telecom Fiber Gigabit Internet',
        payee: 'Sonic Telecom',
        categoryId: cInternet,
        source: 'bank',
      });
    }

    if (dayOfMonth === 9) {
      // Mint Mobile (thrifty 2 lines!)
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-mint-${dStr}`,
        date: dStr,
        amount: '-30.00',
        description: 'Mint Mobile 15GB 2-Line Family Plan',
        payee: 'Mint Mobile',
        categoryId: cPhone,
        source: 'bank',
      });
    }

    if (dayOfMonth === 14) {
      // PG&E (higher in winter months)
      const isWinter = month === 11 || month === 0 || month === 1 || month === 2;
      const pgeAmt = isWinter ? (185 + (dayOfMonth * 3) % 40).toFixed(2) : (135 + (dayOfMonth * 2) % 30).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-pge-${dStr}`,
        date: dStr,
        amount: `-${pgeAmt}`,
        description: 'Pacific Gas & Electric (PG&E) Electric & Gas Bill',
        payee: 'PG&E',
        categoryId: cElectric,
        source: 'bank',
      });
    }

    if (dayOfMonth === 22) {
      // City of Santa Cruz Water & Sewer
      const waterAmt = (62 + (month * 2) % 15).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-water-${dStr}`,
        date: dStr,
        amount: `-${waterAmt}`,
        description: 'City of Santa Cruz Municipal Utilities (Water/Sewer/Refuse)',
        payee: 'City of Santa Cruz',
        categoryId: cWater,
        source: 'bank',
      });
    }

    // 5. Thrifty Subscriptions
    if (dayOfMonth === 8) {
      // Surfline
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-surfline-${dStr}`,
        date: dStr,
        amount: '-9.99',
        description: 'Surfline Premium Cam & Surf Forecast Subscription',
        payee: 'Surfline / Wavetrak Inc',
        categoryId: cSurf,
        source: 'bank',
      });
    }

    if (dayOfMonth === 12) {
      // Spotify
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-spotify-${dStr}`,
        date: dStr,
        amount: '-19.99',
        description: 'Spotify Family Plan Premium',
        payee: 'Spotify USA',
        categoryId: cMusic,
        source: 'bank',
      });
    }

    // 6. Groceries (2x / week on CSR or Costco Visa)
    // Tuesdays: Trader Joe's Capitola / Pacific Ave
    if (dayOfWeek === 2) {
      const tjAmt = (92 + (dayOfMonth * 4) % 45).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-tj-${dStr}`,
        date: dStr,
        amount: `-${tjAmt}`,
        description: 'Trader Joe’s #128 Capitola CA - Organic Produce & Sourdough',
        payee: 'Trader Joe’s',
        categoryId: cGroceries,
        source: 'bank',
      });
    }
    // Saturdays: Westside Farmers Market or New Leaf
    if (dayOfWeek === 6 && (dayOfMonth % 2 === 0)) {
      const nlAmt = (45 + (dayOfMonth * 2) % 30).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-newleaf-${dStr}`,
        date: dStr,
        amount: `-${nlAmt}`,
        description: 'New Leaf Community Markets - Fresh Local Fish & Produce',
        payee: 'New Leaf Community Markets',
        categoryId: cGroceries,
        source: 'bank',
      });
    }

    // 7. Surfer Grub & Coffee (Thrifty but delicious Bay Area spots!)
    // Verve Coffee Roasters or Cat & Cloud on Wednesdays and Sundays
    if (dayOfWeek === 0 || dayOfWeek === 3) {
      const coffeeAmt = (7.5 + (dayOfMonth % 5) * 1.5).toFixed(2);
      const coffeeShop = dayOfWeek === 0 ? 'Cat & Cloud Coffee Portola Dr' : 'Verve Coffee Roasters 41st Ave';
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-coffee-${dStr}`,
        date: dStr,
        amount: `-${coffeeAmt}`,
        description: `${coffeeShop} - Cold Brew & Oat Milk Cappuccino`,
        payee: coffeeShop.split(' ')[0] + ' Coffee',
        categoryId: cDining,
        source: 'bank',
      });
    }

    // Taqueria Vallarta / Los Pericos / Pleasure Pizza on Friday / Saturday
    if (dayOfWeek === 5 || (dayOfWeek === 6 && dayOfMonth % 2 === 1)) {
      const tacoAmt = (21 + (dayOfMonth * 3) % 18).toFixed(2);
      const isPizza = dayOfWeek === 5 && dayOfMonth > 15;
      const grubName = isPizza ? 'Pleasure Pizza East Cliff Dr' : 'Taqueria Vallarta 41st Ave';
      const grubDesc = isPizza ? 'Slice of Surfer Special & Garlic Knots' : 'Super Fish Burrito & Carne Asada Tacos';
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-grub-${dStr}`,
        date: dStr,
        amount: `-${tacoAmt}`,
        description: `${grubName} - ${grubDesc}`,
        payee: grubName,
        categoryId: cDining,
        source: 'bank',
      });
    }

    // Humble Sea Brewing (Swift St Westside) once every two weeks
    if (dayOfWeek === 6 && dayOfMonth % 4 === 1) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-humblesea-${dStr}`,
        date: dStr,
        amount: '-32.00',
        description: 'Humble Sea Brewing Co - 4-Pack Foggy IPA Cans & Pint',
        payee: 'Humble Sea Brewing Co',
        categoryId: cDining,
        source: 'bank',
      });
    }

    // 8. Fuel & Tacoma Truck Maintenance (Costco Anywhere Visa)
    if (dayOfWeek === 4 && (dayOfMonth >= 10 && dayOfMonth <= 16)) {
      const gasAmt = (52 + (dayOfMonth * 2) % 16).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: `tx-gas-${dStr}`,
        date: dStr,
        amount: `-${gasAmt}`,
        description: 'Costco Wholesale Gasoline #1012 Santa Cruz CA',
        payee: 'Costco Gasoline',
        categoryId: cGasFuel,
        source: 'bank',
      });
    }

    // Fastrak Bridge Tolls when heading north to Ocean Beach SF
    if (dayOfWeek === 6 && month % 3 === 0 && dayOfMonth < 8) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: `tx-fastrak-${dStr}`,
        date: dStr,
        amount: '-7.00',
        description: 'BATA Fastrak Electronic Toll - Golden Gate / Bay Bridge',
        payee: 'Bay Area Toll Authority',
        categoryId: cGasFuel,
        source: 'bank',
      });
    }

    // Tacoma regular maintenance (every ~6 months)
    if ((month === 4 || month === 10) && dayOfMonth === 15) {
      const maintAmt = (85 + (month === 4 ? 35 : 0)).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: `tx-tacoma-maint-${dStr}`,
        date: dStr,
        amount: `-${maintAmt}`,
        description: 'Santa Cruz Tire & Automotive - Synthetic Oil & Filter Service',
        payee: 'Santa Cruz Tire & Auto',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }

    // Major Tacoma Truck Upgrades & Repairs (Spikes!)
    if (year === 2022 && month === 4 && dayOfMonth === 18) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: 'tx-tires-2022',
        date: dStr,
        amount: '-1180.00',
        description: 'Costco Tire Center - 4x BFGoodrich All-Terrain T/A KO2 Tires (Tacoma)',
        payee: 'Costco Tire Center',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }
    if (year === 2023 && month === 2 && dayOfMonth === 22) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: 'tx-brakes-2023',
        date: dStr,
        amount: '-685.00',
        description: 'Santa Cruz Tire & Automotive - Front/Rear Brake Rotors & Ceramic Pads',
        payee: 'Santa Cruz Tire & Auto',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 5 && dayOfMonth === 12) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: 'tx-suspension-2024',
        date: dStr,
        amount: '-960.00',
        description: 'Off-Road Warehouse - Bilstein 5100 Shock Absorber Upgrade & Suspension Alignment',
        payee: 'Off-Road Warehouse',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 1 && dayOfMonth === 20) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: 'tx-alternator-2025',
        date: dStr,
        amount: '-540.00',
        description: 'Toyota Auto Clinic - Denso OEM Alternator & Serpentine Belt Replacement',
        payee: 'Toyota Auto Clinic',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }
    if (year === 2026 && month === 3 && dayOfMonth === 15) {
      txRows.push({
        userId: USER_ID,
        accountId: costcoCreditId,
        externalId: 'tx-service90k-2026',
        date: dStr,
        amount: '-480.00',
        description: 'Santa Cruz Tire & Auto - 90k Major Fluid & Spark Plug Tune-Up',
        payee: 'Santa Cruz Tire & Auto',
        categoryId: cAutoMaint,
        source: 'bank',
      });
    }

    // Condo Maintenance & Emergency Repairs (Spikes!)
    if (year === 2022 && month === 0 && dayOfMonth === 14) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-gutter-2022',
        date: dStr,
        amount: '-480.00',
        description: 'Coastal Rain Gutter & Roofing - Winter Storm Cleanup & Gutter Guard Repair',
        payee: 'Coastal Roofing Services',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }
    if (year === 2022 && month === 10 && dayOfMonth === 8) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-waterheater-2022',
        date: dStr,
        amount: '-1420.00',
        description: 'Pleasure Point Plumbing - Rheem Tankless Water Heater Emergency Install',
        payee: 'Pleasure Point Plumbing',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }
    if (year === 2023 && month === 7 && dayOfMonth === 16) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-bath-2023',
        date: dStr,
        amount: '-640.00',
        description: 'Santa Cruz Tileworks - Master Shower Re-grout & Silicone Marine Seal',
        payee: 'Santa Cruz Tileworks',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 0 && dayOfMonth === 22) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-storm-2024',
        date: dStr,
        amount: '-780.00',
        description: 'Capitola Glass & Window - Atmospheric River Coastal Window Weatherproofing',
        payee: 'Capitola Glass Co',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 4 && dayOfMonth === 19) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-balcony-2025',
        date: dStr,
        amount: '-860.00',
        description: 'Pacific Deck & Balcony - Teak Marine Sealant & Stainless Hardware Anti-Corrosion',
        payee: 'Pacific Deck Works',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }
    if (year === 2026 && month === 2 && dayOfMonth === 24) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-faucet-2026',
        date: dStr,
        amount: '-410.00',
        description: 'The Home Depot Capitola - Grohe Kitchen Faucet & InSinkErator Disposal',
        payee: 'The Home Depot',
        categoryId: cHomeMaint,
        source: 'bank',
      });
    }

    // Health & Dental out-of-pocket costs
    if (year === 2023 && month === 5 && dayOfMonth === 8) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-dental-2023',
        date: dStr,
        amount: '-620.00',
        description: 'Santa Cruz Dental Care - Porcelain Molar Crown & Night Guard',
        payee: 'Santa Cruz Dental Care',
        categoryId: cShopping,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 8 && dayOfMonth === 12) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: 'tx-pt-2025',
        date: dStr,
        amount: '-340.00',
        description: 'Precision Physical Therapy - Surfer Rotator Cuff Rehab & Shoulder Care',
        payee: 'Precision Physical Therapy',
        categoryId: cShopping,
        source: 'bank',
      });
    }

    // 9. Surfing & Outdoor Gear (Occasional authentic purchases)
    // Spring wetsuit / booties in April
    if (month === 3 && dayOfMonth === 20) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-oneill-${dStr}`,
        date: dStr,
        amount: '-380.00',
        description: 'O’Neill Surf Shop 41st Ave - Hyperfreak 4/3+ Chest Zip Wetsuit',
        payee: 'O’Neill Surf Shop',
        categoryId: cSurf,
        source: 'bank',
      });
    }

    // Wax, leash, solar ding repair resin at Freeline Surf Shop
    if ((month === 1 || month === 7 || month === 10) && dayOfMonth === 11) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-freeline-${dStr}`,
        date: dStr,
        amount: '-34.50',
        description: 'Freeline Surf Shop - Sticky Bumps Cold Water Wax & Pro Leash',
        payee: 'Freeline Surf Shop',
        categoryId: cSurf,
        source: 'bank',
      });
    }

    // Custom Channel Islands Surfboard in May 2022 and June 2024
    if (year === 2022 && month === 4 && dayOfMonth === 25) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-ci-surfboard-2022`,
        date: dStr,
        amount: '-820.00',
        description: 'Channel Islands Surfboards - Custom CI Fish 5’8 Spine-Tek EPS',
        payee: 'Channel Islands Surfboards',
        categoryId: cSurf,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 5 && dayOfMonth === 14) {
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-ci-surfboard-2024`,
        date: dStr,
        amount: '-865.00',
        description: 'Channel Islands Surfboards - Custom Happy Everyday 6’0 Step-Up',
        payee: 'Channel Islands Surfboards',
        categoryId: cSurf,
        source: 'bank',
      });
    }

    // Patagonia Outlet Santa Cruz (Worn Wear / fleece)
    if (month === 9 && dayOfMonth === 28) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-patagonia-${dStr}`,
        date: dStr,
        amount: '-79.00',
        description: 'Patagonia Outlet River St Santa Cruz - Worn Wear Synchilla Snap-T',
        payee: 'Patagonia Santa Cruz',
        categoryId: cClothing,
        source: 'bank',
      });
    }

    // California State Parks annual Golden Poppy surf vehicle pass in May
    if (month === 4 && dayOfMonth === 2) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-castateparks-${dStr}`,
        date: dStr,
        amount: '-195.00',
        description: 'California State Parks - Golden Poppy Annual Vehicle Day Use Pass',
        payee: 'CA Department of Parks & Rec',
        categoryId: cSurf,
        source: 'bank',
      });
    }

    // 10. Travel & Surf Road Trips (High-variability real life!)
    if (year === 2021 && month === 10 && dayOfMonth === 23) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-thanksgiving-2021',
        date: dStr,
        amount: '-680.00',
        description: 'Alaska Airlines - Seattle Thanksgiving Family Flights',
        payee: 'Alaska Airlines',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (month === 10 && dayOfMonth === 16) {
      // Annual November Baja road trip
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-baja-camp-${dStr}`,
        date: dStr,
        amount: '-450.00',
        description: 'Baja Norte Beachside Eco-Camp & Palapa Rental (Punta Baja / San Quintin)',
        payee: 'Baja Surf Expeditions',
        categoryId: cTravel,
        source: 'bank',
      });
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-baja-tacos-${dStr}`,
        date: dStr,
        amount: '-185.00',
        description: 'Baja Fish Tacos & Mexican Auto Travel Insurance (Lewis & Lewis)',
        payee: 'Baja Travel Services',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2022 && month === 6 && dayOfMonth === 15) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-oregon-2022',
        date: dStr,
        amount: '-740.00',
        description: 'Pacific City Oregon Surf Road Trip - Cape Kiwanda Camping & Local Dungeness Crab',
        payee: 'Oregon State Parks',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2022 && month === 11 && dayOfMonth === 20) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-holidays-2022',
        date: dStr,
        amount: '-1180.00',
        description: 'Alaska Airlines + Holiday Gifts - PNW Family Christmas',
        payee: 'Alaska Airlines',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2023 && month === 2 && dayOfMonth === 10) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-costarica-2023`,
        date: dStr,
        amount: '-2250.00',
        description: 'United Airlines + Santa Teresa Costa Rica Eco Lodge Surf Trip',
        payee: 'United Airlines / Santa Teresa Lodge',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2023 && month === 9 && dayOfMonth === 14) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-bigsur-2023',
        date: dStr,
        amount: '-460.00',
        description: 'Ventana Campground Big Sur - Coastal Redwoods Camping & Deetjen’s Dinner',
        payee: 'Ventana Big Sur',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2023 && month === 11 && dayOfMonth === 18) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-holidays-2023',
        date: dStr,
        amount: '-1280.00',
        description: 'Alaska Airlines + Holiday Shopping & Family Travel',
        payee: 'Alaska Airlines',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 3 && dayOfMonth === 18) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-socal-2024',
        date: dStr,
        amount: '-690.00',
        description: 'San Onofre & Encinitas Surf Camp - San Elijo State Beach & Tacos El Gordo',
        payee: 'San Onofre Parks',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 7 && dayOfMonth === 8) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-tofino-2024',
        date: dStr,
        amount: '-1880.00',
        description: 'BC Ferries & Long Beach Tofino Surf Lodge - Vancouver Island Expedition',
        payee: 'Tofino Surf Resort',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2024 && month === 11 && dayOfMonth === 21) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-holidays-2024',
        date: dStr,
        amount: '-1150.00',
        description: 'Delta Air Lines - Holiday Season Flights & Family Reunion',
        payee: 'Delta Air Lines',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 2 && dayOfMonth === 14) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: `tx-oaxaca-2025`,
        date: dStr,
        amount: '-1980.00',
        description: 'Aeromexico Flights + Puerto Escondido & Salina Cruz Point Break Guide',
        payee: 'Oaxaca Surf Tours',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 6 && dayOfMonth === 18) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-tahoe-2025',
        date: dStr,
        amount: '-640.00',
        description: 'Emerald Bay Lake Tahoe - Mountain Bike Rentals & State Park Cabin',
        payee: 'Lake Tahoe Parks',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2025 && month === 11 && dayOfMonth === 19) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-holidays-2025',
        date: dStr,
        amount: '-1320.00',
        description: 'Alaska Airlines - Winter Holiday Flights & Family Gifts',
        payee: 'Alaska Airlines',
        categoryId: cTravel,
        source: 'bank',
      });
    }
    if (year === 2026 && month === 5 && dayOfMonth === 10) {
      txRows.push({
        userId: USER_ID,
        accountId: csrId,
        externalId: 'tx-kauai-2026',
        date: dStr,
        amount: '-2650.00',
        description: 'Hawaiian Airlines + Hanalei Bay Beach Cottage 5-Year Anniversary Surf Trip',
        payee: 'Hawaiian Airlines',
        categoryId: cTravel,
        source: 'bank',
      });
    }

    // 12. Quarterly Dividends in Vanguard Taxable Brokerage
    if ((month === 2 || month === 5 || month === 8 || month === 11) && dayOfMonth === 28) {
      const divAmt = (310 + (year - 2021) * 65 + (month % 3) * 20).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: brokerageId,
        externalId: `tx-div-${dStr}`,
        date: dStr,
        amount: divAmt,
        description: 'Vanguard Total Stock Market (VTI) - Quarterly Reinvested Dividend',
        payee: 'Vanguard Funds',
        categoryId: cDividends,
        source: 'bank',
      });
    }

    // 13. Monthly Credit Card Payoff from Checking (around 24th of each month)
    if (dayOfMonth === 24) {
      const csrPayoff = (1950 + (dayOfMonth * 7) % 300).toFixed(2);
      const costcoPayoff = (650 + (dayOfMonth * 5) % 180).toFixed(2);
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-csr-payoff-${dStr}`,
        date: dStr,
        amount: `-${csrPayoff}`,
        description: 'Chase Credit Card AutoPay - Statement Full Balance',
        payee: 'Chase Card Services',
        categoryId: cTransfers,
        source: 'bank',
      });
      txRows.push({
        userId: USER_ID,
        accountId: checkingId,
        externalId: `tx-costco-payoff-${dStr}`,
        date: dStr,
        amount: `-${costcoPayoff}`,
        description: 'Citi Cards AutoPay - Costco Anywhere Visa Statement Balance',
        payee: 'Citi Card Services',
        categoryId: cTransfers,
        source: 'bank',
      });
    }

    // Advance 1 day
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  console.log(`Generated ${txRows.length} transactions across 5 years.`);

  // Insert transactions in batches of 100 for speed and memory efficiency
  console.log('Encrypting and inserting transactions into database...');
  const BATCH_SIZE = 100;
  for (let i = 0; i < txRows.length; i += BATCH_SIZE) {
    const batch = txRows.slice(i, i + BATCH_SIZE);
    const encryptedBatch = await Promise.all(
      batch.map((t) =>
        encryptRow(
          'transactions',
          {
            ...t,
            postedDate: t.date,
            memo: null,
            notes: null,
            pending: false,
            reviewed: true,
            categorizedByAi: false,
            ignored: false,
            deleted: false,
            isImported: false,
          },
          dek
        )
      )
    );
    await db.insert(transactions).values(encryptedBatch);
  }
  console.log('Finished inserting all transactions.');

  // ── 8. Historical Account Snapshots & Net Worth Snapshots (5 Years) ─────────
  console.log('Creating high-resolution historical account snapshots with real-world macro & real-estate cycles...');

  // Generate dense, realistic timeline: every Sunday (weekly), plus 1st and 15th of each month, plus today!
  const snapshotDates: string[] = [];
  const snapCur = new Date('2021-10-01T12:00:00Z');
  while (snapCur <= endDate) {
    const dStr = snapCur.toISOString().split('T')[0];
    const dayOfWeek = snapCur.getUTCDay();
    const dayOfMonth = snapCur.getUTCDate();
    if (dayOfWeek === 0 || dayOfMonth === 1 || dayOfMonth === 15) {
      if (!snapshotDates.includes(dStr)) {
        snapshotDates.push(dStr);
      }
    }
    snapCur.setUTCDate(snapCur.getUTCDate() + 1);
  }
  const todayStr = '2026-10-08';
  if (!snapshotDates.includes(todayStr)) {
    snapshotDates.push(todayStr);
  }
  snapshotDates.sort();

  // Macro Real-World Market Anchor Points (Oct 2021 to Oct 2026)
  // Reflecting real S&P / Total Market cycles:
  // - 2021 Q4 euphoria peak
  // - 2022 bear market (-25% drop to Oct 2022 bottom)
  // - 2023 SVB banking shock & AI boom
  // - 2023 Autumn 10% pullback
  // - 2024 Breakout past 5,000, April dip, August Yen carry-trade flash drop & recovery
  // - 2025-2026 Expansion & compounding to present day
  interface MacroAnchor {
    date: string;
    marketMult: number; // relative to Oct 2021 baseline
    realEstateVal: number; // Santa Cruz condo with rate shock cycle
  }

  const macroAnchors: MacroAnchor[] = [
    { date: '2021-10-01', marketMult: 1.000, realEstateVal: 625000 },
    { date: '2021-11-15', marketMult: 1.045, realEstateVal: 638000 },
    { date: '2021-12-31', marketMult: 1.052, realEstateVal: 648000 },
    { date: '2022-01-28', marketMult: 0.968, realEstateVal: 662000 },
    { date: '2022-02-25', marketMult: 0.932, realEstateVal: 678000 },
    { date: '2022-03-31', marketMult: 0.980, realEstateVal: 698000 },
    { date: '2022-04-29', marketMult: 0.885, realEstateVal: 712000 },
    { date: '2022-05-20', marketMult: 0.840, realEstateVal: 724000 }, // Peak low-rate coastal frenzy
    { date: '2022-06-17', marketMult: 0.770, realEstateVal: 718000 }, // June bear market plunge
    { date: '2022-08-15', marketMult: 0.885, realEstateVal: 708000 }, // Summer bear rally
    { date: '2022-09-30', marketMult: 0.760, realEstateVal: 692000 },
    { date: '2022-10-14', marketMult: 0.738, realEstateVal: 680000 }, // Bear market cycle low!
    { date: '2022-11-30', marketMult: 0.842, realEstateVal: 668000 },
    { date: '2022-12-30', marketMult: 0.792, realEstateVal: 660000 },
    { date: '2023-01-31', marketMult: 0.858, realEstateVal: 654000 },
    { date: '2023-02-28', marketMult: 0.832, realEstateVal: 652000 }, // Coastal housing trough (7% rates)
    { date: '2023-03-10', marketMult: 0.808, realEstateVal: 655000 }, // SVB banking crisis panic
    { date: '2023-03-31', marketMult: 0.865, realEstateVal: 660000 },
    { date: '2023-05-31', marketMult: 0.895, realEstateVal: 675000 },
    { date: '2023-07-31', marketMult: 0.995, realEstateVal: 695000 }, // Generative AI summer peak
    { date: '2023-10-27', marketMult: 0.895, realEstateVal: 708000 }, // Autumn 10% pullback (10Y yield hits 5%)
    { date: '2023-12-29', marketMult: 1.035, realEstateVal: 718000 }, // Year-end explosive breakout
    { date: '2024-03-28', marketMult: 1.145, realEstateVal: 732000 }, // S&P 5,200+
    { date: '2024-04-19', marketMult: 1.085, realEstateVal: 740000 }, // Tax season / inflation dip
    { date: '2024-07-16', marketMult: 1.235, realEstateVal: 752000 }, // Mid-summer peak
    { date: '2024-08-05', marketMult: 1.130, realEstateVal: 749000 }, // Yen carry trade flash panic!
    { date: '2024-08-30', marketMult: 1.230, realEstateVal: 753000 }, // V-shaped recovery
    { date: '2024-10-01', marketMult: 1.265, realEstateVal: 755000 }, // Fed 50bps rate cut
    { date: '2024-12-06', marketMult: 1.320, realEstateVal: 752000 }, // Post-election surge
    { date: '2025-02-15', marketMult: 1.285, realEstateVal: 750000 },
    { date: '2025-04-30', marketMult: 1.350, realEstateVal: 765000 },
    { date: '2025-08-20', marketMult: 1.405, realEstateVal: 772000 },
    { date: '2025-10-31', marketMult: 1.435, realEstateVal: 768000 },
    { date: '2026-02-15', marketMult: 1.425, realEstateVal: 765000 },
    { date: '2026-05-31', marketMult: 1.490, realEstateVal: 782000 },
    { date: '2026-08-15', marketMult: 1.515, realEstateVal: 784000 },
    { date: '2026-09-15', marketMult: 1.485, realEstateVal: 783000 },
    { date: '2026-10-08', marketMult: 1.505, realEstateVal: 785000 }, // Today's target!
  ];

  function getMacroState(dStr: string) {
    if (dStr <= macroAnchors[0].date) {
      return { marketMult: macroAnchors[0].marketMult, realEstateVal: macroAnchors[0].realEstateVal };
    }
    const last = macroAnchors[macroAnchors.length - 1];
    if (dStr >= last.date) {
      return { marketMult: last.marketMult, realEstateVal: last.realEstateVal };
    }
    for (let i = 0; i < macroAnchors.length - 1; i++) {
      const a = macroAnchors[i];
      const b = macroAnchors[i + 1];
      if (dStr >= a.date && dStr <= b.date) {
        const tA = new Date(a.date).getTime();
        const tB = new Date(b.date).getTime();
        const tCur = new Date(dStr).getTime();
        const ratio = (tCur - tA) / (tB - tA);
        const marketMult = a.marketMult + (b.marketMult - a.marketMult) * ratio;
        const realEstateVal = a.realEstateVal + (b.realEstateVal - a.realEstateVal) * ratio;
        return { marketMult, realEstateVal };
      }
    }
    return { marketMult: 1.0, realEstateVal: 625000 };
  }

  // Pre-calculate realistic trajectory parameters
  const totalSnapshots = snapshotDates.length;
  console.log(`Populating ${totalSnapshots} weekly & semi-monthly snapshots across all accounts...`);

  const allSnapRows: any[] = [];

  for (let idx = 0; idx < totalSnapshots; idx++) {
    const sDate = snapshotDates[idx];
    const isToday = sDate === todayStr || idx === totalSnapshots - 1;
    const progress = idx / (totalSnapshots - 1); // 0.0 to 1.0

    const { marketMult: rawMarket, realEstateVal: baseCondo } = getMacroState(sDate);

    // Realistic weekly trading noise (+/- 0.8% to 1.4%)
    const weeklyJitter = isToday ? 0 : Math.sin(idx * 17.3 + 11) * 0.012;
    const marketFactor = rawMarket * (1 + weeklyJitter);

    // Condo value: base valuation + seasonal spring/winter fluctuation
    const seasonalCondoNoise = isToday ? 0 : Math.sin(idx * 0.5) * 1800;
    const condoVal = roundToCents(isToday ? 785000 : baseCondo + seasonalCondoNoise);

    // Mortgage amortization (30Y fixed at 3.125%): -$500,000 to -$452,800
    const mortgageBal = roundToCents(isToday ? -452800 : -(500000 - (500000 - 452800) * progress));

    // Tacoma TRD Off-Road: starts at peak supply shortage $34,500 in late 2021, depreciates to $26,000
    // with realistic small bumps when new KO2 tires ($1.2k) or Bilstein suspension ($1k) were installed
    let tacomaVal = 34500 - (34500 - 26000) * progress;
    if (sDate >= '2022-05-18') tacomaVal += 400; // Tire equity bump
    if (sDate >= '2024-06-12') tacomaVal += 350; // Suspension equity bump
    tacomaVal = roundToCents(isToday ? 26000 : Math.max(26000, tacomaVal));

    // Emergency Fund ($45,000):
    // Grew from $32,000 with 4% interest, but had a $3,000 emergency drawdown in Nov 2022 (water heater failure), replenished by March 2023!
    let emergVal = 32000 + (45000 - 32000) * progress;
    if (sDate >= '2022-11-08' && sDate <= '2023-03-01') {
      emergVal -= 2800; // Water heater emergency drawdown!
    }
    emergVal = roundToCents(isToday ? 45000 : emergVal);

    // Quiver & Van Fund ($12,500):
    // Grew from $2,500, with dips when custom boards ($820 in 2022, $865 in 2024) and camper shell deposit ($3,500 in April 2025) occurred!
    let quiverVal = 2500 + (12500 - 2500) * progress;
    if (sDate >= '2022-05-01' && sDate <= '2022-08-01') quiverVal -= 820;
    if (sDate >= '2024-05-20' && sDate <= '2024-09-01') quiverVal -= 865;
    if (sDate >= '2025-04-01' && sDate <= '2025-08-01') quiverVal -= 2500;
    quiverVal = roundToCents(isToday ? 12500 : Math.max(2000, quiverVal));

    // Checking Account ($8,420.50):
    // Dynamic balance reflecting real payroll, bonuses, and travel expenses!
    // Spikes in February (bonuses), dips after big surf trips or holiday travel
    let checkingVal = 7500 + Math.sin(idx * 0.9) * 1400;
    const snapMonth = new Date(sDate).getUTCMonth();
    if (snapMonth === 1) checkingVal += 3500; // February bonus cash!
    if (snapMonth === 11 || snapMonth === 6) checkingVal -= 1800; // Holidays / summer trips
    checkingVal = roundToCents(isToday ? 8420.5 : Math.max(4200, checkingVal));

    // Investment Accounts:
    // Compounding from baseline + ongoing dollar-cost averaging * market factor
    // Normalized to exact target current values on today's date!

    // Brokerage: $50,000 in 2021 -> $265,400 today
    // Bear market of 2022 pulled it down to ~$41,000 despite monthly contributions!
    const baseBrokContributed = 50000 + (185000 - 50000) * progress;
    const brokRaw = (baseBrokContributed * marketFactor) / 1.505;
    const brokScale = 265400 / ((185000 * 1.505) / 1.505);
    const brokVal = roundToCents(isToday ? 265400 : Math.max(38000, brokRaw * brokScale));

    // Fidelity 401(k): $78,000 in 2021 -> $212,850 today
    const base401kContributed = 78000 + (155000 - 78000) * progress;
    const kRaw = (base401kContributed * marketFactor) / 1.505;
    const kScale = 212850 / ((155000 * 1.505) / 1.505);
    const kVal = roundToCents(isToday ? 212850 : Math.max(68000, kRaw * kScale));

    // Dylan Roth IRA: $25,000 in 2021 -> $65,200 today
    const baseRothDContributed = 25000 + (48000 - 25000) * progress;
    const rothDRaw = (baseRothDContributed * marketFactor) / 1.505;
    const rothDScale = 65200 / ((48000 * 1.505) / 1.505);
    const rothDVal = roundToCents(isToday ? 65200 : Math.max(21000, rothDRaw * rothDScale));

    // Maya Roth IRA: $16,000 in 2021 -> $51,300 today
    const baseRothMContributed = 16000 + (39000 - 16000) * progress;
    const rothMRaw = (baseRothMContributed * marketFactor) / 1.505;
    const rothMScale = 51300 / ((39000 * 1.505) / 1.505);
    const rothMVal = roundToCents(isToday ? 51300 : Math.max(13500, rothMRaw * rothMScale));

    // HSA: $5,500 in 2021 -> $22,450 today
    const baseHsaContributed = 5500 + (17000 - 5500) * progress;
    const hsaRaw = (baseHsaContributed * marketFactor) / 1.505;
    const hsaScale = 22450 / ((17000 * 1.505) / 1.505);
    const hsaVal = roundToCents(isToday ? 22450 : Math.max(4800, hsaRaw * hsaScale));

    // Floating Credit Cards balances (responsive to current spending):
    const csrBal = roundToCents(isToday ? -2150.40 : -(1200 + Math.abs(Math.sin(idx * 2.1)) * 1400));
    const costcoBal = roundToCents(isToday ? -890.25 : -(450 + Math.abs(Math.cos(idx * 1.7)) * 600));

    const snapsToInsert = [
      { accountId: checkingId, balance: formatToCents(checkingVal) },
      { accountId: emergencySavingsId, balance: formatToCents(emergVal) },
      { accountId: quiverSavingsId, balance: formatToCents(quiverVal) },
      { accountId: brokerageId, balance: formatToCents(brokVal) },
      { accountId: k401Id, balance: formatToCents(kVal) },
      { accountId: rothDylanId, balance: formatToCents(rothDVal) },
      { accountId: rothMayaId, balance: formatToCents(rothMVal) },
      { accountId: hsaId, balance: formatToCents(hsaVal) },
      { accountId: condoId, balance: formatToCents(condoVal) },
      { accountId: mortgageId, balance: formatToCents(mortgageBal) },
      { accountId: tacomaId, balance: formatToCents(tacomaVal) },
      { accountId: csrId, balance: formatToCents(csrBal) },
      { accountId: costcoCreditId, balance: formatToCents(costcoBal) },
    ];

    for (const snap of snapsToInsert) {
      allSnapRows.push({
        userId: USER_ID,
        accountId: snap.accountId,
        snapshotDate: sDate,
        balance: snap.balance,
        isSynthetic: false,
        isImported: false,
      });
    }
  }

  // Insert account snapshots in batches
  console.log(`Encrypting and inserting ${allSnapRows.length} account snapshots...`);
  const SNAP_BATCH_SIZE = 150;
  for (let i = 0; i < allSnapRows.length; i += SNAP_BATCH_SIZE) {
    const batch = allSnapRows.slice(i, i + SNAP_BATCH_SIZE);
    const encryptedBatch = await Promise.all(
      batch.map((s) => encryptRow('account_snapshots', s, dek))
    );
    await db.insert(accountSnapshots).values(encryptedBatch);
  }

  console.log('Recalculating net worth snapshots across full 5-year timeline...');
  await recalculateNetWorthSnapshots(USER_ID, dek);

  // ── 9. Setup Budgets ───────────────────────────────────────────────────────
  console.log('Creating active monthly & annual budgets...');
  const budgetDefs = [
    { categoryId: cGroceries, periodType: 'monthly', amount: '650.00', notes: 'Trader Joe’s & Local Farmers Market' },
    { categoryId: cDining, periodType: 'monthly', amount: '350.00', notes: 'Taquerias, coffee, Humble Sea Foggy IPAs' },
    { categoryId: cSurf, periodType: 'monthly', amount: '200.00', notes: 'Surf wax, leashes, ding repairs' },
    { categoryId: cMortgage, periodType: 'monthly', amount: '2141.60', notes: 'Primary 30Y Fixed Mortgage & Escrow' },
    { categoryId: cHOA, periodType: 'monthly', amount: '320.00', notes: 'Pleasure Point HOA dues' },
    { categoryId: cElectric, periodType: 'monthly', amount: '165.00', notes: 'PG&E Electric & Gas' },
    { categoryId: cWater, periodType: 'monthly', amount: '70.00', notes: 'City of Santa Cruz Municipal Water' },
    { categoryId: cInternet, periodType: 'monthly', amount: '50.00', notes: 'Sonic Fiber Internet' },
    { categoryId: cGasFuel, periodType: 'monthly', amount: '160.00', notes: 'Costco Gas for Tacoma surf truck' },
    { categoryId: cTravel, periodType: 'yearly', amount: '4000.00', notes: 'Envelope budget: Baja road trip & Central America surf trips' },
    { categoryId: cHomeMaint, periodType: 'yearly', amount: '2500.00', notes: 'Annual condo maintenance & appliance reserve' },
  ];

  for (const b of budgetDefs) {
    const row = {
      userId: USER_ID,
      categoryId: b.categoryId,
      periodType: b.periodType,
      yearMonth: b.periodType === 'monthly' ? '2026-10' : '2026',
      periodKey: b.periodType === 'monthly' ? '2026-10' : '2026',
      amount: b.amount,
      isRecurring: true,
      notes: b.notes,
      rollover: false,
    };
    const enc = await encryptRow('budgets', row, dek);
    await db.insert(budgets).values(enc);
  }

  // ── 10. Financial Goals ────────────────────────────────────────────────────
  console.log('Creating financial goals...');
  const goalDefs = [
    {
      name: 'Custom Surfboard Quiver (Twin Fish & Step-up)',
      description: 'Shaped by Channel Islands Santa Barbara for Pleasure Point & Steamer Lane',
      type: 'savings',
      targetAmount: '2500.00',
      currentAmount: '2500.00',
      targetDate: '2026-06-01',
      status: 'completed',
      linkedAccountId: quiverSavingsId,
      percentage: '100',
      reserve: '0',
      sortOrder: 1,
    },
    {
      name: 'Toyota Tacoma Pop-up Camper Shell (GoFastCampers)',
      description: 'Lightweight wedge camper for Baja road trips and Big Sur weekends',
      type: 'savings',
      targetAmount: '15000.00',
      currentAmount: '12500.00',
      targetDate: '2027-06-01',
      status: 'active',
      linkedAccountId: quiverSavingsId,
      percentage: '83',
      reserve: '0',
      sortOrder: 2,
    },
    {
      name: '6-Month Emergency Surf Reserve',
      description: 'High yield savings cushion covering 6 months of essential living costs',
      type: 'savings',
      targetAmount: '45000.00',
      currentAmount: '45000.00',
      targetDate: '2025-12-31',
      status: 'active',
      linkedAccountId: emergencySavingsId,
      percentage: '100',
      reserve: '0',
      sortOrder: 3,
    },
    {
      name: 'FIRE Bridge Fund (Taxable Brokerage to Age 50)',
      description: 'Bridge capital to fund living expenses between age 50 FIRE and age 59.5 retirement accounts',
      type: 'investment',
      targetAmount: '500000.00',
      currentAmount: '265400.00',
      targetDate: '2046-06-01',
      status: 'active',
      linkedAccountId: brokerageId,
      percentage: '53',
      reserve: '0',
      sortOrder: 4,
    },
  ];

  for (const g of goalDefs) {
    const enc = await encryptRow('financial_goals', { userId: USER_ID, ...g }, dek);
    const [goalRow] = await db.insert(financialGoals).values(enc).returning();

    // Insert allocation history snapshot (unencrypted numeric fields in DB)
    await db.insert(goalAllocationHistory).values({
      userId: USER_ID,
      goalId: goalRow.id,
      accountId: g.linkedAccountId,
      snapshotDate: '2026-10-01',
      accountBalance: g.currentAmount as any,
      allocatedAmount: g.currentAmount as any,
      desiredAmount: g.targetAmount as any,
      remainingOnAccount: '0' as any,
      percentage: g.percentage,
      sortOrder: g.sortOrder,
      isUnderfunded: false,
    });
  }

  // ── 11. Retirement Planning (FIRE Plan) ────────────────────────────────────
  console.log('Configuring Pacific Coast Early FIRE Plan (Age 30, Retiring at 50)...');
  const [firePlan] = await db
    .insert(plans)
    .values({
      userId: USER_ID,
      name: 'Pacific Coast FIRE Plan (Age 50)',
      description: 'Retire at 50 in Santa Cruz to surf Pleasure Point every morning, living off taxable brokerage bridge + Roth/401k withdrawals.',
      isDefault: true,
      hasSpouse: true,
      primaryBirthYear: 1996,
      primaryBirthMonth: 6,
      spouseBirthYear: 1996,
      spouseBirthMonth: 9,
      spouseName: 'Maya',
      spouseRetirementAge: 50,
      spouseLifeExpectancyAge: 95,
      primarySsMonthlyAmount: '2800',
      primarySsStartAge: 67,
      spouseSsMonthlyAmount: '2100',
      spouseSsStartAge: 67,
      enableSpousalSsBenefit: true,
      country: 'US',
      stateProvince: 'CA',
      filingStatus: 'married_joint',
      retirementAge: 50,
      lifeExpectancyAge: 95,
      fiTargetMultiplier: 25,
      withdrawalMethod: 'textbook',
      primarySalary: '190000',
      spouseSalary: '72000',
      primarySalaryYear: 2026,
      primarySalaryRaisePct: '3.0',
      spouseSalaryYear: 2026,
      spouseSalaryRaisePct: '2.5',
    })
    .returning();

  // Plan Settings
  await db.insert(planSettings).values({
    planId: firePlan.id,
    userId: USER_ID,
    ratesMode: 'fixed',
    fixedInflationRate: '2.8',
    fixedBenefitCola: '2.0',
    withholdingDeferred: '15.0',
    withholdingTaxable: '10.0',
    incomeTaxModifier: '0.0',
    capGainsTaxModifier: '0.0',
    spendingMortgagePrincipal: true,
    spendingDebtPrincipal: true,
    heirFlatIncomeTaxRate: '20.0',
    stepUpBasis: true,
    realEstateLiquidationRate: '6.0',
    administrativeCostRate: '0.5',
    charitableGiving: '0.0',
  });

  // Plan Accounts (Investable Holdings)
  const planAccDefs = [
    {
      name: 'Fidelity 401(k) - Pacific Cloud Labs',
      owner: 'primary',
      type: 'traditional_401k',
      balance: '212850',
      costBasis: '169000',
      expectedGrowthRate: '7.5',
      dividendYield: '1.8',
      contributionMode: 'maximize',
      companyMatchRate: '1.0',
      companyMatchLimit: '5.0',
      isIncluded: true,
    },
    {
      name: 'Vanguard Taxable Brokerage',
      owner: 'joint',
      type: 'taxable',
      balance: '265400',
      costBasis: '216500',
      expectedGrowthRate: '7.0',
      dividendYield: '2.0',
      qualifiedDividendRatio: '0.9',
      contributionMode: 'none',
      isSurplusDestination: true,
      isIncluded: true,
    },
    {
      name: 'Vanguard Roth IRA - Dylan',
      owner: 'primary',
      type: 'roth_ira',
      balance: '65200',
      costBasis: '47200',
      expectedGrowthRate: '7.5',
      dividendYield: '1.5',
      contributionMode: 'maximize',
      isIncluded: true,
    },
    {
      name: 'Vanguard Roth IRA - Maya',
      owner: 'spouse',
      type: 'roth_ira',
      balance: '51300',
      costBasis: '38000',
      expectedGrowthRate: '7.5',
      dividendYield: '1.5',
      contributionMode: 'maximize',
      isIncluded: true,
    },
    {
      name: 'Fidelity HSA',
      owner: 'primary',
      type: 'hsa',
      balance: '22450',
      costBasis: '16500',
      expectedGrowthRate: '7.0',
      dividendYield: '1.5',
      contributionMode: 'maximize',
      isIncluded: true,
    },
  ];

  for (const pa of planAccDefs) {
    const enc = await encryptRow('plan_accounts', { planId: firePlan.id, userId: USER_ID, ...pa }, dek);
    await db.insert(planAccounts).values(enc);
  }

  // Plan Liabilities (Mortgage)
  const encLiab = await encryptRow(
    'plan_liabilities',
    {
      planId: firePlan.id,
      userId: USER_ID,
      name: 'Primary Mortgage (Santa Cruz Condo)',
      owner: 'joint',
      balance: '452800',
      interestRate: '3.125',
      monthlyPayment: '2141.60',
      yearsRemaining: '25',
    },
    dek
  );
  await db.insert(planLiabilities).values(encLiab);

  // Plan Events (Post-FIRE living expenses & healthcare)
  const eventDefs = [
    {
      name: 'Annual Post-FIRE Living Expenses (Thrifty Surfer Lifestyle)',
      category: 'expense',
      type: 'living_expense',
      owner: 'primary',
      amount: '62000',
      frequency: 'yearly',
      growthRate: '0.0',
      adjustForInflation: true,
      startTriggerType: 'age',
      startTriggerValue: '50',
      endTriggerType: 'end_of_plan',
    },
    {
      name: 'Healthcare Bridge (Pre-Medicare ACA / HSA)',
      category: 'expense',
      type: 'healthcare',
      owner: 'primary',
      amount: '14000',
      frequency: 'yearly',
      growthRate: '1.5',
      adjustForInflation: true,
      startTriggerType: 'age',
      startTriggerValue: '50',
      endTriggerType: 'age',
      endTriggerValue: '65',
    },
  ];

  for (const pe of eventDefs) {
    const enc = await encryptRow('plan_events', { planId: firePlan.id, userId: USER_ID, ...pe }, dek);
    await db.insert(planEvents).values(enc);
  }

  // ── 12. Recurring Transactions ─────────────────────────────────────────────
  console.log('Inserting recurring subscriptions & bills...');
  const recurringDefs = [
    {
      merchantName: 'Surfline',
      matchPattern: 'surfline',
      categoryId: cSurf,
      accountId: csrId,
      frequency: 'monthly',
      averageAmount: '-9.99',
      lastAmount: '-9.99',
      lastDate: '2026-10-08',
      nextExpectedDate: '2026-11-08',
      customName: 'Surfline Premium Cam & Forecast',
      notes: 'Essential daily ocean & swell forecast',
      confidence: 100,
    },
    {
      merchantName: 'Spotify',
      matchPattern: 'spotify',
      categoryId: cMusic,
      accountId: csrId,
      frequency: 'monthly',
      averageAmount: '-19.99',
      lastAmount: '-19.99',
      lastDate: '2026-09-12',
      nextExpectedDate: '2026-10-12',
      customName: 'Spotify Family Subscription',
      confidence: 98,
    },
    {
      merchantName: 'Sonic Telecom',
      matchPattern: 'sonic',
      categoryId: cInternet,
      accountId: checkingId,
      frequency: 'monthly',
      averageAmount: '-49.99',
      lastAmount: '-49.99',
      lastDate: '2026-10-05',
      nextExpectedDate: '2026-11-05',
      customName: 'Sonic Fiber Gigabit Internet',
      confidence: 96,
    },
    {
      merchantName: 'Mint Mobile',
      matchPattern: 'mint mobile',
      categoryId: cPhone,
      accountId: checkingId,
      frequency: 'monthly',
      averageAmount: '-30.00',
      lastAmount: '-30.00',
      lastDate: '2026-09-09',
      nextExpectedDate: '2026-10-09',
      customName: 'Mint Mobile 2-Line Phone Plan',
      confidence: 95,
    },
    {
      merchantName: 'Chase Home Lending',
      matchPattern: 'chase home lending',
      categoryId: cMortgage,
      accountId: checkingId,
      frequency: 'monthly',
      averageAmount: '-2141.60',
      lastAmount: '-2141.60',
      lastDate: '2026-10-01',
      nextExpectedDate: '2026-11-01',
      customName: 'Primary Mortgage AutoPay',
      confidence: 100,
    },
    {
      merchantName: 'Pleasure Point HOA',
      matchPattern: 'pleasure point hoa',
      categoryId: cHOA,
      accountId: checkingId,
      frequency: 'monthly',
      averageAmount: '-320.00',
      lastAmount: '-320.00',
      lastDate: '2026-10-01',
      nextExpectedDate: '2026-11-01',
      customName: 'Pleasure Point HOA Dues',
      confidence: 100,
    },
    {
      merchantName: 'PG&E',
      matchPattern: 'pacific gas',
      categoryId: cElectric,
      accountId: checkingId,
      frequency: 'monthly',
      averageAmount: '-165.00',
      lastAmount: '-148.50',
      lastDate: '2026-09-14',
      nextExpectedDate: '2026-10-14',
      customName: 'PG&E Electric & Gas',
      confidence: 92,
    },
  ];

  for (const r of recurringDefs) {
    const enc = await encryptRow(
      'recurring_transactions',
      {
        userId: USER_ID,
        flowType: 'expense',
        isConfirmed: true,
        isDismissed: false,
        isPaused: false,
        occurrenceCount: 36,
        ...r,
      },
      dek
    );
    await db.insert(recurringTransactions).values(enc);
  }

  // ── 13. Paystubs & Auto-Generate Mappings ───────────────────────────────────
  console.log('Inserting salary paystubs and tax withholding records...');
  const [fieldMapping] = await db
    .insert(paystubFieldMappings)
    .values({
      userId: USER_ID,
      name: 'Pacific Cloud Labs Paystub Template',
      employerName: 'Pacific Cloud Labs Inc',
      isDefault: true,
      accountId: checkingId,
      mappings: {
        'Regular Salary': { categoryId: cSalary, action: 'import' },
        'Federal Income Tax': { action: 'ignore' },
        'CA State Income Tax': { action: 'ignore' },
        '401(k) Pre-Tax': { action: 'ignore' },
        'HSA Pre-Tax': { action: 'ignore' },
      },
    })
    .returning();

  const stubDates = [
    { start: '2026-08-16', end: '2026-08-29', check: '2026-09-04', adv: 'ADV-2026-18' },
    { start: '2026-08-30', end: '2026-09-12', check: '2026-09-18', adv: 'ADV-2026-19' },
    { start: '2026-09-13', end: '2026-09-26', check: '2026-10-02', adv: 'ADV-2026-20' },
  ];

  for (const sd of stubDates) {
    const [stub] = await db
      .insert(paystubs)
      .values({
        userId: USER_ID,
        employerName: 'Pacific Cloud Labs Inc',
        employeeName: 'Dylan "Kai" Vance',
        payPeriodStart: sd.start,
        payPeriodEnd: sd.end,
        checkDate: sd.check,
        adviceNumber: sd.adv,
        grossCurrent: '7307.69',
        taxesCurrent: '2085.11',
        deductionsCurrent: '1344.70',
        netCurrent: '3877.88',
        grossYtd: '138846.11',
        taxesYtd: '39617.09',
        deductionsYtd: '25549.30',
        tiesOut: true,
        source: 'manual',
        mappingId: fieldMapping.id,
      })
      .returning();

    // Line items
    const lineItems = [
      { section: 'earnings', description: 'Regular Salary (Senior Infrastructure Engineer)', amount: '7307.69', categoryId: cSalary },
      { section: 'taxes', description: 'Federal Income Tax Withholding', amount: '-1080.00' },
      { section: 'taxes', description: 'CA State Income Tax Withholding', amount: '-480.00' },
      { section: 'taxes', description: 'Social Security (OASDI)', amount: '-453.08' },
      { section: 'taxes', description: 'Medicare Tax', amount: '-105.96' },
      { section: 'taxes', description: 'CA State Disability Insurance (SDI)', amount: '-65.77' },
      { section: 'before_tax_deductions', description: '401(k) Employee Pre-Tax Contribution', amount: '-865.00' },
      { section: 'before_tax_deductions', description: 'Health Savings Account (HSA) Employee Contribution', amount: '-160.00' },
      { section: 'before_tax_deductions', description: 'Medical Insurance Premium (Kaiser HDHP)', amount: '-185.00' },
      { section: 'before_tax_deductions', description: 'Dental & Vision Insurance Premium', amount: '-35.00' },
    ];

    for (const li of lineItems) {
      await db.insert(paystubLineItems).values({
        paystubId: stub.id,
        userId: USER_ID,
        section: li.section,
        description: li.description,
        amount: li.amount,
        mappingAction: 'import',
        categoryId: li.categoryId || null,
      });
    }
  }

  // ── 14. AI Proposals ───────────────────────────────────────────────────────
  console.log('Adding AI categorization proposals...');
  await db.insert(aiProposals).values([
    {
      userId: USER_ID,
      type: 'categorize',
      status: 'pending',
      confidence: '0.96',
      payload: {
        type: 'categorize',
        transactionId: crypto.randomUUID(),
        transactionDescription: 'Freeline Surf Shop - Wax & Leash',
        proposedCategoryId: surfCategoryId,
        proposedCategoryName: 'Surfing & Ocean Gear',
      },
      explanation: 'Merchant name matches local surf shop keywords and past transactions in Santa Cruz.',
    },
    {
      userId: USER_ID,
      type: 'categorize',
      status: 'pending',
      confidence: '0.98',
      payload: {
        type: 'categorize',
        transactionId: crypto.randomUUID(),
        transactionDescription: 'Steamer Lane Supply - Breakfast Burrito',
        proposedCategoryId: cDining,
        proposedCategoryName: 'Restaurants & Dining Out',
      },
      explanation: 'Steamer Lane Supply is a well-known surf cafe and breakfast takeout at West Cliff Dr.',
    },
  ]);

  // ── 15. User Notifications ─────────────────────────────────────────────────
  console.log('Inserting milestone & budget notifications...');
  await db.insert(userNotifications).values([
    {
      userId: USER_ID,
      title: 'Net Worth Milestone Reached! 🎉',
      body: 'Stoked! Your net worth crossed the $1,000,000 milestone! Total assets now stand at $1.49M with steady debt paydown.',
      urlPath: '/',
      type: 'generic',
      isRead: false,
    },
    {
      userId: USER_ID,
      title: 'Savings Goal Completed: Custom Surfboard Quiver',
      body: 'Your goal "Custom Surfboard Quiver" reached 100% funding ($2,500.00). Ready for your next swell!',
      urlPath: '/goals',
      type: 'generic',
      isRead: true,
      readAt: new Date(),
    },
    {
      userId: USER_ID,
      title: 'Monthly Budget Update: Groceries',
      body: 'Groceries budget is at 74% with 22 days elapsed in October. Looking thrifty and on track!',
      urlPath: '/budgets',
      type: 'budget_alert',
      isRead: false,
    },
  ]);

  // ── 16. Coalesced Rebuild of All Summary Tables ─────────────────────────────
  console.log('Executing full rebuild of cash flow & spending summaries...');
  await updateMonthlyCashFlowSummaries(USER_ID, dek);
  await updateCategorySpendingSummaries(USER_ID, dek);
  await updateCategoryIncomeSummaries(USER_ID, dek);

  console.log('\n============================================================');
  console.log('SUCCESS! Synthetic data set for demo01 successfully created.');
  console.log('User Profile:');
  console.log('- Username: demo01');
  console.log('- Age: 30 (Born 1996, Retiring at age 50)');
  console.log('- Persona: Bay Area Surfer Dude in Santa Cruz, CA');
  console.log('- Net Worth: ~$1,038,000 ($1.49M Assets, $455k Liabilities)');
  console.log('- 5 Years of History: October 2021 to October 2026');
  console.log('- Dense Transactions, Snapshots, Real Estate, Investments,');
  console.log('  FIRE Plan, Goals, Budgets, Subscriptions, and Paystubs populated!');
  console.log('============================================================\n');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exit(1);
  });
