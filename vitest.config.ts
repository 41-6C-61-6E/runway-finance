import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    env: {
      ENCRYPTION_KEY: 'a'.repeat(64), // 64-char hex for tests only
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BBmrNX5VoXACcOMhb4LyUy3lfSG10B-kElrhluK1X27W2yRdWirmQfzcyjOkj6wUdSRLmDE-Tpat_GcMps91TQ0',
      VAPID_PRIVATE_KEY: 'dMWpbD8gVJGDYlREc-sqPcQQ2UuDGHOFosaMsbqQ8NU',
      VAPID_SUBJECT: 'mailto:admin@example.com',
    },
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'auth': path.resolve(__dirname, 'tests/unit/mocks/auth.ts'),
    },
  },
});
