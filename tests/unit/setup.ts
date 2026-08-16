import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { afterEach, vi } from 'vitest';

const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  config({ path: envTestPath });
}

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
