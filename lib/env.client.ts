import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_COMMIT_HASH: z.string().optional().default(''),
  NEXT_PUBLIC_BUILD_NUMBER: z.string().optional().default(''),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default(
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development'
  ),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_COMMIT_HASH: process.env.NEXT_PUBLIC_COMMIT_HASH,
  NEXT_PUBLIC_BUILD_NUMBER: process.env.NEXT_PUBLIC_BUILD_NUMBER,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NODE_ENV: process.env.NODE_ENV,
});

