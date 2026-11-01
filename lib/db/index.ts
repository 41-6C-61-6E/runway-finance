import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool {
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) {
    logger.error('DATABASE_URL is not set. PostgreSQL features will not work.');
    return null as unknown as Pool;
  }
  if (!globalForDb.pgPool) {
    const max = env.DB_POOL_MAX;
    const idleTimeoutMillis = env.DB_POOL_IDLE_TIMEOUT_MS;
    const connectionTimeoutMillis = env.DB_POOL_CONNECTION_TIMEOUT_MS;
    const statementTimeout = env.DB_STATEMENT_TIMEOUT_MS;

    const newPool = new Pool({
      connectionString: DATABASE_URL,
      max,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      statement_timeout: statementTimeout,
    });

    newPool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    newPool.on('connect', () => {
      logger.debug('New database client connected to the pool');
    });

    globalForDb.pgPool = newPool;
  }
  return globalForDb.pgPool;
}

export function getDb() {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database pool is not available. Ensure DATABASE_URL is set.');
  }
  return drizzle(pool, { schema });
}

export type DbClient = ReturnType<typeof getDb>;
export type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];
export type DbOrTx = DbClient | DbTransaction;

