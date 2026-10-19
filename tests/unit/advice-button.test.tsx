// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdviceButton } from '@/components/features/advice/AdviceButton';
import * as AdviceProviderModule from '@/components/features/advice/AdviceProvider';

vi.mock('@/components/features/advice/AdviceProvider', () => ({
  useAdvice: vi.fn(),
  useAsk: vi.fn(),
}));

describe('AdviceButton Component', () => {
  const mockOpenAdvice = vi.fn();
  const mockCloseAdvice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AdviceProviderModule.useAdvice).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      openAdvice: mockOpenAdvice,
      closeAdvice: mockCloseAdvice,
      openAsk: mockOpenAdvice,
      closeAsk: mockCloseAdvice,
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
      adviceStatus: {
        available: true,
        providerHost: 'openrouter.ai',
        model: 'test-model',
        isOpenRouter: true,
        isFreeModel: true,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
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

  it('renders expanded button with "Advice", "AI" badge, and subtitle', () => {
    render(<AdviceButton collapsed={false} />);

    expect(screen.getByText('Advice')).not.toBeNull();
    expect(screen.getByText('AI')).not.toBeNull();
    expect(screen.getByText('Financial assistant')).not.toBeNull();

    const button = screen.getByRole('button', { name: /advice/i });
    fireEvent.click(button);
    expect(mockOpenAdvice).toHaveBeenCalledTimes(1);
    expect(mockCloseAdvice).not.toHaveBeenCalled();
  });

  it('renders collapsed icon button and triggers openAdvice on click', () => {
    render(<AdviceButton collapsed={true} />);

    const button = screen.getByRole('button', { name: /advice/i });
    expect(button).not.toBeNull();

    fireEvent.click(button);
    expect(mockOpenAdvice).toHaveBeenCalledTimes(1);
  });

  it('toggles Advice closed when already open', () => {
    vi.mocked(AdviceProviderModule.useAdvice).mockReturnValue({
      isOpen: true,
      setIsOpen: vi.fn(),
      openAdvice: mockOpenAdvice,
      closeAdvice: mockCloseAdvice,
      openAsk: mockOpenAdvice,
      closeAsk: mockCloseAdvice,
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
      adviceStatus: {
        available: true,
        providerHost: 'openrouter.ai',
        model: 'test-model',
        isOpenRouter: true,
        isFreeModel: true,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
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

    render(<AdviceButton collapsed={false} />);

    const button = screen.getByRole('button', { name: /advice/i });
    fireEvent.click(button);
    expect(mockCloseAdvice).toHaveBeenCalledTimes(1);
    expect(mockOpenAdvice).not.toHaveBeenCalled();
  });

  it('renders null when adviceStatus is disabled or member', () => {
    vi.mocked(AdviceProviderModule.useAdvice).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      openAdvice: mockOpenAdvice,
      closeAdvice: mockCloseAdvice,
      openAsk: mockOpenAdvice,
      closeAsk: mockCloseAdvice,
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
      adviceStatus: {
        available: false,
        reason: 'disabled',
        providerHost: null as any,
        model: null as any,
        isOpenRouter: false,
        isFreeModel: false,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
      askStatus: {
        available: false,
        reason: 'disabled',
        providerHost: null as any,
        model: null as any,
        isOpenRouter: false,
        isFreeModel: false,
        consentRequired: false,
        readOnly: true,
        includeAccountNames: false,
      },
      refreshStatus: vi.fn().mockResolvedValue(undefined),
    });

    const { container } = render(<AdviceButton collapsed={false} />);
    expect(container.firstChild).toBeNull();
  });
});
