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

// jsdom/node have no ResizeObserver (used by components/ui/scroll-fade.tsx,
// components/ui/overflow-aware.tsx, etc.). Provide a no-op stub so components
// that observe element sizes render in the test environment.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no Element.prototype.scrollIntoView (used by components/ui/app-tabs.tsx).
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
