import { vi } from 'vitest';

export interface MockDbCall {
  method: string;
  args: any[];
}

export interface MockDbState<T extends Record<string, any[]> = Record<string, any[]>> {
  tables: T;
  calls: MockDbCall[];
}

export function createMockDb<T extends Record<string, any[]>>(initialTables: T = {} as T) {
  let tables = JSON.parse(JSON.stringify(initialTables));
  const calls: MockDbCall[] = [];

  const recordCall = (method: string, args: any[]) => {
    calls.push({ method, args });
  };

  const createQueryChain = (currentTable?: any, queryType = 'select', payload?: any): any => {
    const chain: any = {
      _currentTable: currentTable,
      _queryType: queryType,
      _payload: payload,
      _whereClauses: [] as any[],

      select: vi.fn((...args: any[]) => {
        recordCall('select', args);
        return createQueryChain(undefined, 'select');
      }),
      from: vi.fn((table: any) => {
        recordCall('from', [table]);
        chain._currentTable = table;
        return chain;
      }),
      where: vi.fn((...args: any[]) => {
        recordCall('where', args);
        chain._whereClauses.push(...args);
        return chain;
      }),
      orderBy: vi.fn((...args: any[]) => {
        recordCall('orderBy', args);
        return chain;
      }),
      limit: vi.fn((limitVal: number) => {
        recordCall('limit', [limitVal]);
        chain._limit = limitVal;
        return chain;
      }),
      offset: vi.fn((offsetVal: number) => {
        recordCall('offset', [offsetVal]);
        return chain;
      }),
      groupBy: vi.fn((...args: any[]) => {
        recordCall('groupBy', args);
        return chain;
      }),
      innerJoin: vi.fn((...args: any[]) => {
        recordCall('innerJoin', args);
        return chain;
      }),
      leftJoin: vi.fn((...args: any[]) => {
        recordCall('leftJoin', args);
        return chain;
      }),
      insert: vi.fn((table: any) => {
        recordCall('insert', [table]);
        return createQueryChain(table, 'insert');
      }),
      values: vi.fn((valuesPayload: any) => {
        recordCall('values', [valuesPayload]);
        chain._payload = valuesPayload;
        return chain;
      }),
      onConflictDoUpdate: vi.fn((...args: any[]) => {
        recordCall('onConflictDoUpdate', args);
        return chain;
      }),
      onConflictDoNothing: vi.fn((...args: any[]) => {
        recordCall('onConflictDoNothing', args);
        return chain;
      }),
      update: vi.fn((table: any) => {
        recordCall('update', [table]);
        return createQueryChain(table, 'update');
      }),
      set: vi.fn((setPayload: any) => {
        recordCall('set', [setPayload]);
        chain._payload = setPayload;
        return chain;
      }),
      delete: vi.fn((table: any) => {
        recordCall('delete', [table]);
        return createQueryChain(table, 'delete');
      }),
      returning: vi.fn((...args: any[]) => {
        recordCall('returning', args);
        return chain;
      }),
      $dynamic: vi.fn(() => chain),

      // Resolve query result
      then: (resolve: (val: any) => any, reject?: (reason: any) => any) => {
        try {
          const tableName =
            typeof chain._currentTable === 'string'
              ? chain._currentTable
              : chain._currentTable?._?.name ||
                chain._currentTable?.name ||
                'default';

          const rows = tables[tableName] ?? [];
          let result: any = Array.isArray(rows) ? [...rows] : [];

          if (chain._limit !== undefined && Array.isArray(result)) {
            result = result.slice(0, chain._limit);
          }

          if (chain._queryType === 'insert') {
            const inserted = Array.isArray(chain._payload) ? chain._payload : [chain._payload || {}];
            if (!tables[tableName]) tables[tableName] = [];
            tables[tableName].push(...inserted);
            result = inserted;
          }

          return Promise.resolve(result).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      },
    };

    return chain;
  };

  const db: any = createQueryChain();

  db.transaction = vi.fn(async (callback: (tx: any) => Promise<any>) => {
    recordCall('transaction', []);
    const snapshot = JSON.parse(JSON.stringify(tables));
    try {
      const tx = createQueryChain();
      tx.transaction = db.transaction;
      const res = await callback(tx);
      return res;
    } catch (error) {
      // Roll back on error
      tables = snapshot;
      throw error;
    }
  });

  return {
    db,
    getDb: () => db,
    calls,
    getTables: () => tables,
    setTables: (newTables: T) => {
      tables = JSON.parse(JSON.stringify(newTables));
    },
    clearCalls: () => {
      calls.length = 0;
    },
  };
}
