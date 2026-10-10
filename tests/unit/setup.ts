import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, vi } from 'vitest';

const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  config({ path: envTestPath });
}

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as any).ontouchstart;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
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

// jsdom has no window.matchMedia
if (typeof window !== 'undefined') {
  if (typeof window.innerWidth === 'undefined' || window.innerWidth === 0) {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
}
