'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAdviceStream, type AdviceMessage, type AdvicePhase, type AskMessage, type AskPhase } from './useAdviceStream';
import type { PageContext } from '@/lib/advice/router';
import { ADVICE_CONFIG } from '@/lib/advice/config';

export interface AdviceStatusResponse {
  available: boolean;
  reason?: 'disabled' | 'not_configured' | 'member';
  providerHost?: string;
  model?: string;
  isOpenRouter?: boolean;
  isFreeModel?: boolean;
  consentRequired?: boolean;
  readOnly: boolean;
  includeAccountNames: boolean;
}

export type AskStatusResponse = AdviceStatusResponse;

export interface AdviceContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openAdvice: (
    page?: PageContext,
    initialQuestion?: string,
    packs?: Array<{ id: string; params?: unknown }>
  ) => void;
  closeAdvice: () => void;
  openAsk: (
    page?: PageContext,
    initialQuestion?: string,
    packs?: Array<{ id: string; params?: unknown }>
  ) => void;
  closeAsk: () => void;
  pageContext: PageContext | undefined;
  setPageContext: (page: PageContext | undefined) => void;
  messages: AdviceMessage[];
  status: AdvicePhase;
  isStreaming: boolean;
  sendMessage: (
    text: string,
    options?: { page?: PageContext; packs?: Array<{ id: string; params?: unknown }> }
  ) => Promise<void>;
  stopStream: () => void;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  adviceStatus: AdviceStatusResponse | null;
  askStatus: AdviceStatusResponse | null;
  refreshStatus: () => Promise<void>;
  consentOpen: boolean;
  setConsentOpen: (open: boolean) => void;
  acceptConsent: () => Promise<void>;
}

export type AskContextType = AdviceContextType;

const AdviceContext = createContext<AdviceContextType | null>(null);

export function AdviceProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | undefined>(undefined);
  const [adviceStatus, setAdviceStatus] = useState<AdviceStatusResponse | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    text: string;
    packs?: Array<{ id: string; params?: unknown }>;
  } | null>(null);

  const pathname = usePathname();
  const stream = useAdviceStream();

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/advice/status');
      if (res.ok) {
        const data = await res.json();
        setAdviceStatus(data);
      }
    } catch {
      // Ignore network errors on status fetch
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Sync pageContext path when navigation occurs, safely guarding against non-allowlisted routes
  useEffect(() => {
    if (pathname) {
      const cleanPath = pathname.split('?')[0];
      const isAllowed = (ADVICE_CONFIG.ALLOWLISTED_PATHS as readonly string[]).includes(cleanPath);
      setPageContext((prev) => ({
        ...prev,
        path: isAllowed ? pathname : undefined,
      }));
    }
  }, [pathname]);

  const acceptConsent = useCallback(async () => {
    if (!adviceStatus?.providerHost) return;
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiAdviceConsentHost: adviceStatus.providerHost,
          aiAdviceConsentAt: new Date().toISOString(),
          aiAskConsentHost: adviceStatus.providerHost,
          aiAskConsentAt: new Date().toISOString(),
        }),
      });
      await refreshStatus();
      setConsentOpen(false);

      // If there was a pending question waiting for consent, fire it
      if (pendingQuestion) {
        const { text, packs } = pendingQuestion;
        setPendingQuestion(null);
        await stream.sendMessage(text, { page: pageContext, packs });
      }
    } catch {
      // Ignore error
    }
  }, [adviceStatus?.providerHost, refreshStatus, pendingQuestion, stream, pageContext]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { page?: PageContext; packs?: Array<{ id: string; params?: unknown }> }
    ) => {
      // Check if consent is needed
      if (adviceStatus?.consentRequired) {
        setPendingQuestion({ text, packs: options?.packs });
        setConsentOpen(true);
        return;
      }
      await stream.sendMessage(text, {
        page: options?.page || pageContext,
        packs: options?.packs,
      });
    },
    [adviceStatus?.consentRequired, stream, pageContext]
  );

  const openAdvice = useCallback(
    (
      page?: PageContext,
      initialQuestion?: string,
      packs?: Array<{ id: string; params?: unknown }>
    ) => {
      if (page) {
        setPageContext(page);
      } else if (pathname) {
        setPageContext({ path: pathname });
      }
      setIsOpen(true);

      if (initialQuestion) {
        sendMessage(initialQuestion, { page, packs });
      }
    },
    [pathname, sendMessage]
  );

  const closeAdvice = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value: AdviceContextType = {
    isOpen,
    setIsOpen,
    openAdvice,
    closeAdvice,
    openAsk: openAdvice,
    closeAsk: closeAdvice,
    pageContext,
    setPageContext,
    messages: stream.messages,
    status: stream.status,
    isStreaming: stream.isStreaming,
    sendMessage,
    stopStream: stream.stopStream,
    clearMessages: stream.clearMessages,
    retryLastMessage: stream.retryLastMessage,
    adviceStatus,
    askStatus: adviceStatus,
    refreshStatus,
    consentOpen,
    setConsentOpen,
    acceptConsent,
  };

  return <AdviceContext.Provider value={value}>{children}</AdviceContext.Provider>;
}

export function useAdvice(): AdviceContextType {
  const ctx = useContext(AdviceContext);
  if (!ctx) {
    throw new Error('useAdvice must be used within an AdviceProvider');
  }
  return ctx;
}

export const AskProvider = AdviceProvider;
export const useAsk = useAdvice;
