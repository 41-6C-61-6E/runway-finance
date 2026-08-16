import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      TZ: 'America/New_York',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:***REMOVED-POSTGRES_PASSWORD***@localhost:5432/runway_finance_test',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '***REMOVED-ENCRYPTION_KEY***',
      NEXTAUTH_SECRET: 'test-secret-test-secret-test-secret',
    },
  },
  resolve: {
    alias: {
      '@/lib/auth': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
      'auth': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
      '@': path.resolve(__dirname),
    },
  },
});
