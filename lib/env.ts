import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default(
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development'
  ),
  DATABASE_URL: z.string().optional().default(''),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  ENCRYPTION_KEY: z.string().optional().default(''),
  AUTH_SECRET: z.string().optional().default(''),
  NEXTAUTH_SECRET: z.string().optional().default(''),
  NEXTAUTH_URL: z.string().optional().default(''),
  TEST_DEK_HEX: z.string().optional(),
  FRED_API_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default(''),
  ALLOW_REGISTRATION: z.string().optional().default('false'),
  REGISTRATION_PIN: z.string().optional().default(''),
  BUG_REPORTING: z.string().optional().default('true'),
  DATA_EXPLORER: z.string().optional().default('true'),
  DEV_MODE: z.string().optional().default('false'),
  PORT: z.coerce.number().int().default(3001),
});

export const env = serverEnvSchema.parse(process.env);

