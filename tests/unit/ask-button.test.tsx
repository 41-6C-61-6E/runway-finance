// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskButton } from '@/components/features/ask/AskButton';
import * as AskProviderModule from '@/components/features/ask/AskProvider';

vi.mock('@/components/features/ask/AskProvider', () => ({
  useAsk: vi.fn(),
}));

describe('AskButton Component', () => {
  const mockOpenAsk = vi.fn();
  const mockCloseAsk = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AskProviderModule.useAsk).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      openAsk: mockOpenAsk,
      closeAsk: mockCloseAsk,
      pageContext: undefined,
      setPageContext: vi.fn(),
      messages: [],
      status: 'idle',
      isStreaming: false,
      sendMessage: vi.fn(),
      stopStream: vi.fn(),
      clearMessages: vi.fn(),
      retryLastMessage: vi.fn(),
      consentOpen: false,
      setConsentOpen: vi.fn(),
      acceptConsent: vi.fn(),
      askStatus: {
        available: true,
        providerHost: 'openrouter.ai',
        model: 'test-model',
        isOpenRouter: true,
        isFreeModel: true,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
      refreshStatus: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders expanded button with "Ask", "AI" badge, and subtitle', () => {
    render(<AskButton collapsed={false} />);

    expect(screen.getByText('Ask')).not.toBeNull();
    expect(screen.getByText('AI')).not.toBeNull();
    expect(screen.getByText('Financial assistant')).not.toBeNull();

    const button = screen.getByRole('button', { name: /ask/i });
    fireEvent.click(button);
    expect(mockOpenAsk).toHaveBeenCalledTimes(1);
    expect(mockCloseAsk).not.toHaveBeenCalled();
  });

  it('renders collapsed icon button and triggers openAsk on click', () => {
    render(<AskButton collapsed={true} />);

    const button = screen.getByRole('button', { name: /ask/i });
    expect(button).not.toBeNull();

    fireEvent.click(button);
    expect(mockOpenAsk).toHaveBeenCalledTimes(1);
  });

  it('toggles Ask closed when already open', () => {
    vi.mocked(AskProviderModule.useAsk).mockReturnValue({
      isOpen: true,
      setIsOpen: vi.fn(),
      openAsk: mockOpenAsk,
      closeAsk: mockCloseAsk,
      pageContext: undefined,
      setPageContext: vi.fn(),
      messages: [],
      status: 'idle',
      isStreaming: false,
      sendMessage: vi.fn(),
      stopStream: vi.fn(),
      clearMessages: vi.fn(),
      retryLastMessage: vi.fn(),
      consentOpen: false,
      setConsentOpen: vi.fn(),
      acceptConsent: vi.fn(),
      askStatus: {
        available: true,
        providerHost: 'openrouter.ai',
        model: 'test-model',
        isOpenRouter: true,
        isFreeModel: true,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
      refreshStatus: vi.fn().mockResolvedValue(undefined),
    });

    render(<AskButton collapsed={false} />);

    const button = screen.getByRole('button', { name: /ask/i });
    fireEvent.click(button);
    expect(mockCloseAsk).toHaveBeenCalledTimes(1);
    expect(mockOpenAsk).not.toHaveBeenCalled();
  });

  it('renders null when askStatus is disabled or member', () => {
    vi.mocked(AskProviderModule.useAsk).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      openAsk: mockOpenAsk,
      closeAsk: mockCloseAsk,
      pageContext: undefined,
      setPageContext: vi.fn(),
      messages: [],
      status: 'idle',
      isStreaming: false,
      sendMessage: vi.fn(),
      stopStream: vi.fn(),
      clearMessages: vi.fn(),
      retryLastMessage: vi.fn(),
      consentOpen: false,
      setConsentOpen: vi.fn(),
      acceptConsent: vi.fn(),
      askStatus: {
        available: false,
        reason: 'disabled',
        providerHost: null,
        model: null,
        isOpenRouter: false,
        isFreeModel: false,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
      refreshStatus: vi.fn().mockResolvedValue(undefined),
    });

    const { container } = render(<AskButton collapsed={false} />);
    expect(container.firstChild).toBeNull();
  });
});
