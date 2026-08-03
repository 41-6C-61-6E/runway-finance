// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PWARegister } from '@/components/pwa-register';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

describe('PWARegister Component', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // @ts-ignore
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('triggers update toast with only delta commits when installed build hash is matched in history', async () => {
    localStorage.setItem('pf_installed_hash', 'hash-v1');

    const mockRegistration = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'updatefound') {
          const installingWorker = {
            state: 'installing',
            addEventListener: vi.fn((stateEvent, stateCallback) => {
              if (stateEvent === 'statechange') {
                // @ts-ignore
                installingWorker.state = 'installed';
                stateCallback();
              }
            }),
          };

          // Simulate updatefound with installing worker
          // @ts-ignore
          mockRegistration.installing = installingWorker;
          callback();
        }
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-ignore
    navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue(mockRegistration),
      controller: {},
    };

    const versionData = {
      buildNumber: '26.08.100',
      hash: 'hash-v3',
      commits: ['feat: v3 feature', 'fix: v2 bug', 'feat: v1 initial'],
      history: [
        { hash: 'hash-v3', message: 'feat: v3 feature' },
        { hash: 'hash-v2', message: 'fix: v2 bug' },
        { hash: 'hash-v1', message: 'feat: v1 initial' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionData,
    } as Response);

    render(<PWARegister />);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });

    const toastCall = (toast.info as any).mock.calls[0];
    expect(toastCall[0]).toBe('A new version of Personal Finance is available!');
    
    // Render the toast description component to verify deltaCommits
    const descriptionElement = toastCall[1].description;
    const { getByText, queryByText } = render(descriptionElement);

    expect(getByText('New changes (2):')).not.toBeNull();
    expect(getByText('feat: v3 feature')).not.toBeNull();
    expect(getByText('fix: v2 bug')).not.toBeNull();
    expect(queryByText('feat: v1 initial')).toBeNull();
  });

  it('falls back to 1 commit message when installed build is not found in history', async () => {
    localStorage.setItem('pf_installed_hash', 'unknown-old-hash');

    const mockRegistration = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'updatefound') {
          const installingWorker = {
            state: 'installing',
            addEventListener: vi.fn((stateEvent, stateCallback) => {
              if (stateEvent === 'statechange') {
                // @ts-ignore
                installingWorker.state = 'installed';
                stateCallback();
              }
            }),
          };

          // @ts-ignore
          mockRegistration.installing = installingWorker;
          callback();
        }
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-ignore
    navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue(mockRegistration),
      controller: {},
    };

    const versionData = {
      buildNumber: '26.08.100',
      hash: 'hash-v3',
      commits: ['feat: v3 feature', 'fix: v2 bug', 'feat: v1 initial'],
      history: [
        { hash: 'hash-v3', message: 'feat: v3 feature' },
        { hash: 'hash-v2', message: 'fix: v2 bug' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionData,
    } as Response);

    render(<PWARegister />);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });

    const toastCall = (toast.info as any).mock.calls[0];
    const descriptionElement = toastCall[1].description;
    const { getByText, queryByText } = render(descriptionElement);

    expect(getByText('New changes (1):')).not.toBeNull();
    expect(getByText('feat: v3 feature')).not.toBeNull();
    expect(queryByText('fix: v2 bug')).toBeNull();
  });

  it('displays top commit message when matchedIndex is 0', async () => {
    localStorage.setItem('pf_installed_hash', 'hash-v3');

    const mockRegistration = {
      addEventListener: vi.fn((event, callback) => {
        if (event === 'updatefound') {
          const installingWorker = {
            state: 'installing',
            addEventListener: vi.fn((stateEvent, stateCallback) => {
              if (stateEvent === 'statechange') {
                // @ts-ignore
                installingWorker.state = 'installed';
                stateCallback();
              }
            }),
          };

          // @ts-ignore
          mockRegistration.installing = installingWorker;
          callback();
        }
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-ignore
    navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue(mockRegistration),
      controller: {},
    };

    const versionData = {
      buildNumber: '26.08.100',
      hash: 'hash-v3',
      commits: ['feat: v3 feature', 'fix: v2 bug'],
      history: [
        { hash: 'hash-v3', message: 'feat: v3 feature' },
        { hash: 'hash-v2', message: 'fix: v2 bug' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => versionData,
    } as Response);

    render(<PWARegister />);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });

    const toastCall = (toast.info as any).mock.calls[0];
    const descriptionElement = toastCall[1].description;
    const { getByText, queryByText } = render(descriptionElement);

    expect(getByText('New changes (1):')).not.toBeNull();
    expect(getByText('feat: v3 feature')).not.toBeNull();
    expect(queryByText('fix: v2 bug')).toBeNull();
  });
});
