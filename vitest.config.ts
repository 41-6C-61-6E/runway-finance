import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 10000,
    env: {
      ENCRYPTION_KEY: 'a'.repeat(64), // 64-char hex for tests only
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: '***REMOVED-VAPID_PUBLIC_KEY***',
      VAPID_PRIVATE_KEY: '***REMOVED-VAPID_PRIVATE_KEY***',
      VAPID_SUBJECT: 'mailto:admin@example.com',
      TZ: 'America/New_York',
    },
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'app/api/**'],
      exclude: ['node_modules/**', 'tests/**', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'auth': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
      'next-auth/providers/credentials': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
      'next-auth': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
    },
  },
});
