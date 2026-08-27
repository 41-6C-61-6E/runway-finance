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
      // L-13 (2026-08-27 security review): the local test-DB password is no
      // longer a hardcoded fallback. Integration tests REQUIRE DATABASE_URL in
      // the environment (see README "Integration tests" for the expected shape
      // and a way to stand up a throwaway test DB).
      DATABASE_URL: process.env.DATABASE_URL || '',
      // Synthetic test-only key. NEVER a live value — the real ENCRYPTION_KEY
      // must come from the environment (see .env / scripts/test-integration.sh).
      // A real key was previously committed here and leaked to git history;
      // do not reintroduce a live key as a fallback.
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
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
