import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, and, or, sql, asc, desc, inArray, like, gte, lte, gt, lt, not, isNull, isNotNull, ne } from 'drizzle-orm';
import { DataExplorerQuerySchema, DataExplorerFilterSchema } from '@/lib/validations/data-explorer';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { ENCRYPTED_FIELDS, decryptRows } from '@/lib/crypto';

type PgTable = any;
type ColumnMeta = {
  field: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable: boolean;
};

const DRIZZLE_COLUMNS = Symbol.for('drizzle:Columns');

function getTableColumns(table: PgTable): Record<string, any> {
  return table[DRIZZLE_COLUMNS] ?? {};
}

type TableConfig = {
  table: PgTable;
  label: string;
  group: string;
  defaultSort: string;
  defaultSortOrder: 'asc' | 'desc';
  searchColumns: string[];
  columnOverrides: Partial<Record<string, { label?: string; type?: ColumnMeta['type']; hidden?: boolean }>>;
};

const TABLE_REGISTRY: Record<string, TableConfig> = {
  accounts: {
    table: schema.accounts,
    label: 'Accounts',
    group: 'Accounts',
    defaultSort: 'name',
    defaultSortOrder: 'asc',
    searchColumns: ['name', 'institution'],
    columnOverrides: {
      userId: { hidden: true },
      metadata: { type: 'json' },
      balance: { type: 'number' },
    },
  },
  account_snapshots: {
    table: schema.accountSnapshots,
    label: 'Account Snapshots',
    group: 'Accounts',
    defaultSort: 'snapshot_date',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
      balance: { type: 'number' },
    },
  },
  net_worth_snapshots: {
    table: schema.netWorthSnapshots,
    label: 'Net Worth Snapshots',
    group: 'Accounts',
    defaultSort: 'snapshot_date',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
      breakdown: { type: 'json' },
      total_assets: { type: 'number', label: 'Total Assets' },
      total_liabilities: { type: 'number', label: 'Total Liabilities' },
      net_worth: { type: 'number', label: 'Net Worth' },
    },
  },
  transactions: {
    table: schema.transactions,
    label: 'Transactions',
    group: 'Transactions',
    defaultSort: 'date',
    defaultSortOrder: 'desc',
    searchColumns: ['description', 'payee', 'notes', 'memo'],
    columnOverrides: {
      userId: { hidden: true },
      amount: { type: 'number' },
    },
  },
  categories: {
    table: schema.categories,
    label: 'Categories',
    group: 'Transactions',
    defaultSort: 'name',
    defaultSortOrder: 'asc',
    searchColumns: ['name'],
    columnOverrides: {
      userId: { hidden: true },
    },
  },
  category_rules: {
    table: schema.categoryRules,
    label: 'Category Rules',
    group: 'Transactions',
    defaultSort: 'priority',
    defaultSortOrder: 'asc',
    searchColumns: ['name', 'condition_value'],
    columnOverrides: {
      userId: { hidden: true },
    },
  },
  monthly_cash_flow: {
    table: schema.monthlyCashFlow,
    label: 'Monthly Cash Flow',
    group: 'Cash Flow',
    defaultSort: 'year_month',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
      total_income: { type: 'number', label: 'Total Income' },
      total_expenses: { type: 'number', label: 'Total Expenses' },
      net_cash_flow: { type: 'number', label: 'Net Cash Flow' },
    },
  },
  category_spending_summary: {
    table: schema.categorySpendingSummary,
    label: 'Category Spending',
    group: 'Cash Flow',
    defaultSort: 'year_month',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
      amount: { type: 'number' },
    },
  },
  category_income_summary: {
    table: schema.categoryIncomeSummary,
    label: 'Category Income',
    group: 'Cash Flow',
    defaultSort: 'year_month',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
      amount: { type: 'number' },
    },
  },
  budgets: {
    table: schema.budgets,
    label: 'Budgets',
    group: 'Budgets',
    defaultSort: 'year_month',
    defaultSortOrder: 'desc',
    searchColumns: ['notes'],
    columnOverrides: {
      userId: { hidden: true },
      amount: { type: 'number' },
    },
  },
  financial_goals: {
    table: schema.financialGoals,
    label: 'Financial Goals',
    group: 'Budgets',
    defaultSort: 'priority',
    defaultSortOrder: 'desc',
    searchColumns: ['name', 'description'],
    columnOverrides: {
      userId: { hidden: true },
      target_amount: { type: 'number', label: 'Target Amount' },
      current_amount: { type: 'number', label: 'Current Amount' },
    },
  },
  fire_scenarios: {
    table: schema.fireScenarios,
    label: 'FIRE Scenarios',
    group: 'FIRE',
    defaultSort: 'name',
    defaultSortOrder: 'asc',
    searchColumns: ['name'],
    columnOverrides: {
      userId: { hidden: true },
    },
  },
  retirement_projections: {
    table: schema.retirementProjections,
    label: 'Retirement Projections',
    group: 'FIRE',
    defaultSort: 'name',
    defaultSortOrder: 'asc',
    searchColumns: ['name'],
    columnOverrides: {
      userId: { hidden: true },
    },
  },
  sync_logs: {
    table: schema.syncLogs,
    label: 'Sync Logs',
    group: 'System',
    defaultSort: 'started_at',
    defaultSortOrder: 'desc',
    searchColumns: ['error_message'],
    columnOverrides: {
      userId: { hidden: true },
      error_message: { label: 'Error Message' },
    },
  },
  simplefin_connections: {
    table: schema.simplifinConnections,
    label: 'SimpleFIN Connections',
    group: 'System',
    defaultSort: 'created_at',
    defaultSortOrder: 'desc',
    searchColumns: ['label'],
    columnOverrides: {
      userId: { hidden: true },
      access_url_encrypted: { hidden: true, label: 'Access URL' },
      access_url_iv: { hidden: true },
      access_url_tag: { hidden: true },
      last_sync_error: { label: 'Last Sync Error' },
    },
  },
  user_settings: {
    table: schema.userSettings,
    label: 'User Settings',
    group: 'System',
    defaultSort: 'created_at',
    defaultSortOrder: 'desc',
    searchColumns: [],
    columnOverrides: {
      userId: { hidden: true },
    },
  },
};

function extractColumns(table: PgTable, overrides: TableConfig['columnOverrides']): ColumnMeta[] {
  const cols = getTableColumns(table);
  return Object.entries(cols)
    .map(([field, col]) => {
      const override = overrides[field];
      if (override?.hidden) return null;
      const colType = col.dataType || 'string';
      let type: ColumnMeta['type'] = 'string';
      if (colType === 'number' || colType === 'bigint') type = 'number';
      else if (colType === 'boolean') type = 'boolean';
      else if (colType === 'date') type = 'date';
      else if (colType === 'json') type = 'json';
      return {
        field,
        label: override?.label ?? field.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        type: override?.type ?? type,
        nullable: !col.notNull,
      };
    })
    .filter(Boolean) as ColumnMeta[];
}

function buildWhereClause(
  table: PgTable,
  userId: string,
  filters: Array<{ field: string; op: string; value: unknown }>,
  search?: string,
  searchColumns?: string[],
) {
  const allCols = getTableColumns(table);
  const userIdCol = allCols['userId'] || (table as any).userId;
  const conditions = userIdCol ? [eq(userIdCol, userId)] : [];

  const tableCols = getTableColumns(table);
  for (const f of filters) {
    const col = tableCols[f.field];
    if (!col) continue;

    switch (f.op) {
      case 'eq':
        conditions.push(eq(col, f.value));
        break;
      case 'neq':
        conditions.push(ne(col, f.value));
        break;
      case 'gt':
        conditions.push(gt(col, f.value));
        break;
      case 'gte':
        conditions.push(gte(col, f.value));
        break;
      case 'lt':
        conditions.push(lt(col, f.value));
        break;
      case 'lte':
        conditions.push(lte(col, f.value));
        break;
      case 'contains':
        conditions.push(like(col, `%${f.value}%`));
        break;
      case 'isNull':
        conditions.push(isNull(col));
        break;
      case 'isNotNull':
        conditions.push(isNotNull(col));
        break;
      case 'in':
        if (Array.isArray(f.value)) {
          conditions.push(inArray(col, f.value));
        }
        break;
    }
  }

  if (search && searchColumns && searchColumns.length > 0) {
    const searchConditions = searchColumns.map((colName) => {
      const col = table._.columns[colName];
      return col ? like(col, `%${search}%`) : null;
    }).filter(Boolean);
    if (searchConditions.length > 0) {
      conditions.push(or(...searchConditions));
    }
  }

  return and(...conditions);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  let parsedFilters: Array<{ field: string; op: string; value: unknown }> = [];
  const filtersRaw = searchParams.get('filters');
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw);
      if (Array.isArray(parsed)) {
        parsedFilters = parsed.filter((f: any) => DataExplorerFilterSchema.safeParse(f).success);
      }
    } catch {
      return NextResponse.json({ error: 'invalid_filters', message: 'Filters must be valid JSON array' }, { status: 400 });
    }
  }

  const parsed = DataExplorerQuerySchema.safeParse({
    table: searchParams.get('table') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });

  if (!parsed.success) {
    const issues = (parsed as any).error.issues;
    logger.warn('Data Explorer validation failed', { issues, input: { table: searchParams.get('table'), limit: searchParams.get('limit'), offset: searchParams.get('offset'), sort: searchParams.get('sort'), order: searchParams.get('order'), search: searchParams.get('search') } });
    return NextResponse.json({ error: 'validation_error', message: 'Invalid query parameters', details: issues }, { status: 400 });
  }

  const { table: tableKey, limit, offset, sort, order, search } = parsed.data;

  const config = TABLE_REGISTRY[tableKey];
  if (!config) {
    return NextResponse.json({ error: 'invalid_table', message: `Unknown table: ${tableKey}` }, { status: 400 });
  }

  const { table } = config;

  try {
    const db = getDb();

    const whereClause = buildWhereClause(table, userId, parsedFilters, search, config.searchColumns);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(whereClause)
      .limit(1);

    const total = totalRow?.count ?? 0;

    const tableColsForSort = getTableColumns(table);
    const effectiveSort = sort || config.defaultSort;
    const sortCol = tableColsForSort[effectiveSort] ?? null;
    const orderFn = order === 'asc' ? asc : desc;

    let dataQuery = db.select().from(table).where(whereClause).limit(limit).offset(offset);
    if (sortCol) {
      dataQuery = dataQuery.orderBy(orderFn(sortCol)) as typeof dataQuery;
    }
    const data = await dataQuery;

    // Decrypt encrypted fields for this table
    const encryptedFields = ENCRYPTED_FIELDS[tableKey];
    const decrypted = encryptedFields ? await decryptRows(tableKey, data, dek) : data;

    const columns = extractColumns(table, config.columnOverrides);

    return NextResponse.json({
      data: decrypted,
      total,
      limit,
      offset,
      columns,
      table: {
        key: tableKey,
        label: config.label,
        group: config.group,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error('Data Explorer query failed', { table: tableKey, error: errMsg, stack: errStack });
    return NextResponse.json({ error: 'query_failed', message: errMsg }, { status: 500 });
  }
}
