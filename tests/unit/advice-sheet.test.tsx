// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdviceSheet } from '@/components/features/advice/AdviceSheet';
import { AdviceProvider, useAdvice } from '@/components/features/advice/AdviceProvider';

vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

global.fetch = vi.fn().mockImplementation(async (url: string) => {
  if (url.includes('/api/ai/advice/status')) {
    return new Response(
      JSON.stringify({
        available: true,
        providerHost: 'openrouter.ai',
        model: 'test-model',
        isOpenRouter: true,
        isFreeModel: true,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response(JSON.stringify({}), { status: 200 });
});

function TestHarness() {
  const { openAdvice } = useAdvice();
  return (
    <div>
      <button onClick={() => openAdvice()}>Open Sheet</button>
      <AdviceSheet />
    </div>
  );
}

describe('AdviceSheet Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Advice panel header and empty state disclosures without read-only notices', async () => {
    render(
      <AdviceProvider>
        <TestHarness />
      </AdviceProvider>
    );

    // Click open
    fireEvent.click(screen.getByText('Open Sheet'));

    // 1. Header title renders
    expect(await screen.findByRole('heading', { name: 'Advice' })).not.toBeNull();

    // 2. Read-only badge and footer notice should not be present
    expect(screen.queryByText('Read-only')).toBeNull();
    expect(
      screen.queryByText(/Read-only · Not saved · Summaries only, no individual transactions./i)
    ).toBeNull();

    // 3. Empty state copy
    expect(screen.getByText(/Advice is/i)).not.toBeNull();
    expect(screen.getByText(/Conversations are not saved/i)).not.toBeNull();
  });

  it('does not persist conversation state on unmount / remount (memory-only state)', async () => {
    const { unmount } = render(
      <AdviceProvider>
        <TestHarness />
      </AdviceProvider>
    );

    unmount();

    // Remounting a fresh provider has clean state with 0 messages
    render(
      <AdviceProvider>
        <TestHarness />
      </AdviceProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Open Sheet'));
    });

    expect(await screen.findByPlaceholderText(/Ask for advice about your spending/i)).not.toBeNull();
  });
});
