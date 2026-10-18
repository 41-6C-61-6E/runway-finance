'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAskStream, type AskMessage, type AskPhase } from './useAskStream';
import type { PageContext } from '@/lib/ask/router';

export interface AskStatusResponse {
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

export interface AskContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openAsk: (
    page?: PageContext,
    initialQuestion?: string,
    packs?: Array<{ id: string; params?: unknown }>
  ) => void;
  closeAsk: () => void;
  pageContext: PageContext | undefined;
  setPageContext: (page: PageContext | undefined) => void;
  messages: AskMessage[];
  status: AskPhase;
  isStreaming: boolean;
  sendMessage: (
    text: string,
    options?: { page?: PageContext; packs?: Array<{ id: string; params?: unknown }> }
  ) => Promise<void>;
  stopStream: () => void;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  askStatus: AskStatusResponse | null;
  refreshStatus: () => Promise<void>;
  consentOpen: boolean;
  setConsentOpen: (open: boolean) => void;
  acceptConsent: () => Promise<void>;
}

const AskContext = createContext<AskContextType | null>(null);

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | undefined>(undefined);
  const [askStatus, setAskStatus] = useState<AskStatusResponse | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    text: string;
    packs?: Array<{ id: string; params?: unknown }>;
  } | null>(null);

  const pathname = usePathname();
  const stream = useAskStream();

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/ask/status');
      if (res.ok) {
        const data = await res.json();
        setAskStatus(data);
      }
    } catch {
      // Ignore network errors on status fetch
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Sync pageContext path when navigation occurs
  useEffect(() => {
    if (pathname) {
      setPageContext((prev) => ({
        ...prev,
        path: pathname,
      }));
    }
  }, [pathname]);

  const acceptConsent = useCallback(async () => {
    if (!askStatus?.providerHost) return;
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiAskConsentHost: askStatus.providerHost,
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
  }, [askStatus?.providerHost, refreshStatus, pendingQuestion, stream, pageContext]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { page?: PageContext; packs?: Array<{ id: string; params?: unknown }> }
    ) => {
      // Check if consent is needed
      if (askStatus?.consentRequired) {
        setPendingQuestion({ text, packs: options?.packs });
        setConsentOpen(true);
        return;
      }
      await stream.sendMessage(text, {
        page: options?.page || pageContext,
        packs: options?.packs,
      });
    },
    [askStatus?.consentRequired, stream, pageContext]
  );

  const openAsk = useCallback(
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

  const closeAsk = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value: AskContextType = {
    isOpen,
    setIsOpen,
    openAsk,
    closeAsk,
    pageContext,
    setPageContext,
    messages: stream.messages,
    status: stream.status,
    isStreaming: stream.isStreaming,
    sendMessage,
    stopStream: stream.stopStream,
    clearMessages: stream.clearMessages,
    retryLastMessage: stream.retryLastMessage,
    askStatus,
    refreshStatus,
    consentOpen,
    setConsentOpen,
    acceptConsent,
  };

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk(): AskContextType {
  const ctx = useContext(AskContext);
  if (!ctx) {
    throw new Error('useAsk must be used within an AskProvider');
  }
  return ctx;
}
