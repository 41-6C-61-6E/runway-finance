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
      // Synthetic test-only VAPID key pair (base64url). A real VAPID private
      // key was previously committed here and leaked to git history; a live
      // key must never be a test fallback.
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BCGVfLo5j-NPm0eNw-hhA0-5H6oYr54TQzpNa_DfPjLnXVkWA5BBebunfv0P-xhdX-8O7F5TOtDgX6NiP_7UeUA',
      VAPID_PRIVATE_KEY: 'mwySNwP3KP-mSPiM-gP40lXm5V1KIT_NYi-GkfWcjRg',
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
