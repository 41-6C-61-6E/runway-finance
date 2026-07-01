describe('wealth-flow service', () => {
  const mockDek = new Uint8Array(32);

  beforeEach(() => {
    mockAccounts = [];
    mockSnapshots = [];
    mockTransactions = [];
    mockUserSettings = [{ showImportedData: { global: true, cashFlowProjections: true }, paystubEnabled: true, currency: 'USD' }];
  });

  it('correctly calculates positive net worth change with balanced reconciliation', async () => {
    mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'brokerage-1', userId: 'user_1', name: 'Brokerage', type: 'brokerage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'mortgage-1', userId: 'user_1', name: 'Mortgage', type: 'mortgage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];

    mockSnapshots = [
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-05-31', balance: '5000.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '2000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-06-30', balance: '6500.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-06-30', balance: '-199000.00' },
    ];

    mockTransactions = [
      { id: 't1', accountId: 'checking-1', amount: '5000.00', date: '2026-06-05', categoryId: 'c-income', categoryName: 'Salary', categoryType: 'standard', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Employer' },
      { id: 't2', accountId: 'checking-1', amount: '-2000.00', date: '2026-06-10', categoryId: 'c-expense', categoryName: 'Rent', categoryType: 'standard', isIncome: false, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Landlord' },
      { id: 't3', accountId: 'checking-1', amount: '-1000.00', date: '2026-06-15', categoryId: 'c-transfer', categoryName: 'Transfer', categoryType: 'transfer', isIncome: false, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Transfer Out' },
      { id: 't3b', accountId: 'brokerage-1', amount: '1000.00', date: '2026-06-15', categoryId: 'c-transfer', categoryName: 'Transfer', categoryType: 'transfer', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Transfer In' },
      { id: 't4', accountId: 'brokerage-1', amount: '100.00', date: '2026-06-25', categoryId: 'c-interest', categoryName: 'Interest & Dividends', categoryType: 'standard', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Dividend' },
    ];

    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);

    // Net worth calculations
    expect(result.summary.beginningNetWorth).toBe(-194000);
    expect(result.summary.endingNetWorth).toBe(-190500);
    expect(result.summary.netWorthChange).toBe(3500);

    // Income
    const incIncome = result.nodes.find(n => n.id === 'inc_c-income');
    expect(incIncome).toBeDefined();
    expect(incIncome!.value).toBe(5000);

    // Expenses
    const expExpenses = result.nodes.find(n => n.id === 'exp_c-expense');
    expect(expExpenses).toBeDefined();
    expect(expExpenses!.value).toBe(2000);

    // Bridge node (value = snapshot NW change)
    const nwIncrease = result.nodes.find(n => n.id === 'use_net_wealth_generated');
    expect(nwIncrease).toBeDefined();
    expect(nwIncrease!.value).toBe(3500);

    // Market Gains
    // Brokerage: Beg 5000, End 6500. Delta = 1500. Tx = 1000 (transfer) + 100 (interest) = 1100.
    // Gap (Growth) = 400.
    const marketGains = result.nodes.find(n => n.id === 'inc_market_gains');
    expect(marketGains).toBeDefined();
    expect(marketGains!.value).toBe(400);

    // Mortgage: Beg -200000, End -199000. Delta = +1000. Tx = 0.
    // Gap = 1000. Not an investment account, so Uncategorized Inflow.
    const uncatInflow = result.nodes.find(n => n.id === 'inc_uncategorized_flow');
    expect(uncatInflow).toBeDefined();
    expect(uncatInflow!.value).toBe(1000);

    // Verify Transfers hub
    const transfersNode = result.nodes.find(n => n.id === 'hub_transfers');
    expect(transfersNode).toBeDefined();
    expect(transfersNode!.value).toBe(1000); // 1000 in, 1000 out
  });

  it('uses base currency from user settings', async () => {
    mockUserSettings = [{ currency: 'EUR' }];
    mockAccounts = [
      { id: 'acc-1', userId: 'user_1', name: 'Euro Checking', type: 'checking', currency: 'EUR', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockSnapshots = [
      { accountId: 'acc-1', snapshotDate: '2026-05-31', balance: '100.00' },
      { accountId: 'acc-1', snapshotDate: '2026-06-30', balance: '200.00' },
    ];
    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);
    expect(result.summary.baseCurrency).toBe('EUR');
    expect(result.summary.netWorthChange).toBe(100);
  });
});
