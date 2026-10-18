// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskSheet } from '@/components/features/ask/AskSheet';
import { AskProvider, useAsk } from '@/components/features/ask/AskProvider';

vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

global.fetch = vi.fn().mockImplementation(async (url: string) => {
  if (url.includes('/api/ai/ask/status')) {
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
  const { openAsk } = useAsk();
  return (
    <div>
      <button onClick={() => openAsk()}>Open Sheet</button>
      <AskSheet />
    </div>
  );
}

describe('AskSheet Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Ask panel header and empty state disclosures without read-only notices', async () => {
    render(
      <AskProvider>
        <TestHarness />
      </AskProvider>
    );

    // Click open
    fireEvent.click(screen.getByText('Open Sheet'));

    // 1. Header title renders
    expect(await screen.findByRole('heading', { name: 'Ask' })).not.toBeNull();

    // 2. Read-only badge and footer notice should not be present
    expect(screen.queryByText('Read-only')).toBeNull();
    expect(
      screen.queryByText(/Read-only · Not saved · Summaries only, no individual transactions./i)
    ).toBeNull();

    // 3. Empty state copy
    expect(screen.getByText(/Ask is/i)).not.toBeNull();
    expect(screen.getByText(/Conversations are not saved/i)).not.toBeNull();
  });

  it('does not persist conversation state on unmount / remount (memory-only state)', async () => {
    const { unmount } = render(
      <AskProvider>
        <TestHarness />
      </AskProvider>
    );

    unmount();

    // Remounting a fresh provider has clean state with 0 messages
    render(
      <AskProvider>
        <TestHarness />
      </AskProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Open Sheet'));
    });

    expect(await screen.findByPlaceholderText(/Ask a question about your spending/i)).not.toBeNull();
  });
});

