import { vi } from 'vitest';

export interface MockDbQueryBuilder<T = any> {
  select: (...args: any[]) => MockDbQueryBuilder<T>;
  from: (...args: any[]) => MockDbQueryBuilder<T>;
  where: (...args: any[]) => MockDbQueryBuilder<T>;
  orderBy: (...args: any[]) => MockDbQueryBuilder<T>;
  limit: (...args: any[]) => MockDbQueryBuilder<T>;
  offset: (...args: any[]) => MockDbQueryBuilder<T>;
  innerJoin: (...args: any[]) => MockDbQueryBuilder<T>;
  leftJoin: (...args: any[]) => MockDbQueryBuilder<T>;
  groupBy: (...args: any[]) => MockDbQueryBuilder<T>;
  having: (...args: any[]) => MockDbQueryBuilder<T>;
  insert: (...args: any[]) => MockDbQueryBuilder<T>;
  values: (...args: any[]) => MockDbQueryBuilder<T>;
  update: (...args: any[]) => MockDbQueryBuilder<T>;
  set: (...args: any[]) => MockDbQueryBuilder<T>;
  delete: (...args: any[]) => MockDbQueryBuilder<T>;
  returning: (...args: any[]) => MockDbQueryBuilder<T>;
  onConflictDoUpdate: (...args: any[]) => MockDbQueryBuilder<T>;
  onConflictDoNothing: (...args: any[]) => MockDbQueryBuilder<T>;
  execute: () => Promise<T>;
  then: <TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  $mockResolve: (data: any) => void;
  $mockReject: (err: any) => void;
}

export function createMockDb<T = any>(initialData: any = []): MockDbQueryBuilder<T> & Record<string, any> {
  let resolvedData: any = initialData;
  let rejectedError: any = null;

  const builder: any = {
    select: vi.fn().mockImplementation(() => builder),
    from: vi.fn().mockImplementation(() => builder),
    where: vi.fn().mockImplementation(() => builder),
    orderBy: vi.fn().mockImplementation(() => builder),
    limit: vi.fn().mockImplementation(() => builder),
    offset: vi.fn().mockImplementation(() => builder),
    innerJoin: vi.fn().mockImplementation(() => builder),
    leftJoin: vi.fn().mockImplementation(() => builder),
    groupBy: vi.fn().mockImplementation(() => builder),
    having: vi.fn().mockImplementation(() => builder),
    insert: vi.fn().mockImplementation(() => builder),
    values: vi.fn().mockImplementation(() => builder),
    update: vi.fn().mockImplementation(() => builder),
    set: vi.fn().mockImplementation(() => builder),
    delete: vi.fn().mockImplementation(() => builder),
    returning: vi.fn().mockImplementation(() => builder),
    onConflictDoUpdate: vi.fn().mockImplementation(() => builder),
    onConflictDoNothing: vi.fn().mockImplementation(() => builder),
    transaction: vi.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(builder)),
    execute: vi.fn().mockImplementation(() => {
      if (rejectedError) return Promise.reject(rejectedError);
      return Promise.resolve(resolvedData);
    }),
    then(onfulfilled?: any, onrejected?: any) {
      if (rejectedError) {
        return onrejected ? Promise.resolve(onrejected(rejectedError)) : Promise.reject(rejectedError);
      }
      return Promise.resolve(resolvedData).then(onfulfilled, onrejected);
    },
    $mockResolve(data: any) {
      resolvedData = data;
      rejectedError = null;
    },
    $mockReject(err: any) {
      rejectedError = err;
    },
  };

  return builder;
}

export function setMockSession(user: Partial<{ id: string; email: string; name: string }> | null = { id: 'usr_mock_123', email: 'test@example.com', name: 'Test User' }) {
  if (!user) {
    return null;
  }
  return {
    user: {
      id: user.id ?? 'usr_mock_123',
      email: user.email ?? 'test@example.com',
      name: user.name ?? 'Test User',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

export const mockCrypto = {
  encryptField: vi.fn().mockImplementation((val: string) => Promise.resolve(`enc:${val}`)),
  decryptField: vi.fn().mockImplementation((val: string) => Promise.resolve(val.replace(/^enc:/, ''))),
  encryptRows: vi.fn().mockImplementation((rows: any[]) => Promise.resolve(rows)),
  decryptRows: vi.fn().mockImplementation((rows: any[]) => Promise.resolve(rows)),
};

export const mockNavigation = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

