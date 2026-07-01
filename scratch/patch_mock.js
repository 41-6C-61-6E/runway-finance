const fs = require('fs');
const f = '/Users/alanracek/ownCloud/Personal/vscode/runway-finance/tests/unit/wealth-flow.test.ts';
let content = fs.readFileSync(f, 'utf8');

// replace MockDbQueryBuilder class
const replacement = `
class MockDbQueryBuilder {
  private _table: any;
  private _groupBy = false;
  private _isJoin = false;
  static callCount = 0;

  select(...args: any[]) { return this; }
  from(table: any) { this._table = table; return this; }
  innerJoin(...args: any[]) { this._isJoin = true; return this; }
  leftJoin(...args: any[]) { this._isJoin = true; return this; }
  where(...args: any[]) { return this; }
  inArray(...args: any[]) { return this; }
  groupBy(...args: any[]) { this._groupBy = true; return this; }
  limit(...args: any[]) { return this; }

  async then(onfulfilled?: (value: any) => any) {
    let result: any = [];
    if (this._table === accounts) {
      result = mockAccounts;
    } else if (this._table === accountSnapshots) {
      MockDbQueryBuilder.callCount++;
      const targetDate = (MockDbQueryBuilder.callCount === 1 || MockDbQueryBuilder.callCount === 2) ? '2026-05-31' : '2026-06-30';
      
      if (this._groupBy) {
        const uniqueAccts = Array.from(new Set(mockSnapshots.map(s => s.accountId)));
        result = uniqueAccts.map(accId => {
          const acctSnaps = mockSnapshots.filter(s => s.accountId === accId && s.snapshotDate <= targetDate);
          if (acctSnaps.length === 0) return null;
          const maxDate = acctSnaps.reduce((max, s) => s.snapshotDate > max ? s.snapshotDate : max, '');
          return { accountId: accId, maxDate };
        }).filter(Boolean);
      } else {
        const uniqueAccts = Array.from(new Set(mockSnapshots.map(s => s.accountId)));
        result = uniqueAccts.map(accId => {
          const acctSnaps = mockSnapshots.filter(s => s.accountId === accId && s.snapshotDate <= targetDate);
          if (acctSnaps.length === 0) return null;
          const maxDate = acctSnaps.reduce((max, s) => s.snapshotDate > max ? s.snapshotDate : max, '');
          return acctSnaps.find(s => s.snapshotDate === maxDate);
        }).filter(Boolean);
      }
    } else if (this._table === transactions || this._isJoin) {
      result = mockTransactions;
    } else if (this._table === userSettings) {
      result = mockUserSettings;
    }
    return Promise.resolve(result).then(onfulfilled);
  }
}
`;

content = content.replace(/class MockDbQueryBuilder \{[\s\S]*?\}\n\nvi.mock/, replacement + '\nvi.mock');
// We must also reset callCount in beforeEach
content = content.replace('mockUserSettings = [{ showImportedData: { global: true, cashFlowProjections: true }, paystubEnabled: true, currency: \'USD\' }];', 'mockUserSettings = [{ showImportedData: { global: true, cashFlowProjections: true }, paystubEnabled: true, currency: \'USD\' }];\n    MockDbQueryBuilder.callCount = 0;');

fs.writeFileSync(f, content);
