'use client';

import React from 'react';
import Link from 'next/link';
import { Bot, Trash2, ShieldAlert, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAsk } from './AskProvider';
import { AskMessageList } from './AskMessageList';
import { AskComposer } from './AskComposer';
import { AskConsentDialog } from './AskConsentDialog';

export function AskSheet() {
  const {
    isOpen,
    setIsOpen,
    closeAsk,
    pageContext,
    messages,
    status,
    isStreaming,
    sendMessage,
    stopStream,
    clearMessages,
    retryLastMessage,
    askStatus,
    consentOpen,
    setConsentOpen,
    acceptConsent,
  } = useAsk();

  const isNotConfigured = askStatus && !askStatus.available && askStatus.reason === 'not_configured';

  return (
    <>
      <aside
        id="ask-dock-panel"
        aria-label="Ask Financial Assistant"
        aria-hidden={!isOpen}
        className={cn(
          'fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] flex flex-col h-full bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-in-out overflow-hidden',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        )}
      >
        <svg
          width="0"
          height="0"
          className="absolute pointer-events-none opacity-0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="sparkles-purple-blue-grad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex flex-row items-center justify-between shrink-0 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles
                className="w-4 h-4"
                color="url(#sparkles-purple-blue-grad)"
                stroke="url(#sparkles-purple-blue-grad)"
              />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Ask
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <Button
                id="ask-clear-button"
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                disabled={isStreaming}
                aria-label="Clear chat"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </Button>
            )}

            <button
              id="ask-close-button"
              type="button"
              onClick={closeAsk}
              aria-label="Close Ask"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {isNotConfigured ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">AI Provider Required</h3>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              To ask questions about your finances, set up an AI provider with an API key (e.g. OpenRouter free models).
            </p>
            <Button asChild size="sm" className="mt-2 text-xs">
              <Link href="/settings" onClick={() => setIsOpen(false)}>
                Set up an AI provider
              </Link>
            </Button>
          </div>
        ) : (
          <AskMessageList
            messages={messages}
            status={status}
            page={pageContext}
            onSendSuggestion={(q, p) => sendMessage(q, { page: pageContext, packs: p })}
            onRetry={retryLastMessage}
          />
        )}

        {/* Composer */}
        {!isNotConfigured && (
          <AskComposer
            onSend={(text) => sendMessage(text, { page: pageContext })}
            onStop={stopStream}
            isStreaming={isStreaming}
            disabled={Boolean(askStatus && !askStatus.available)}
          />
        )}
      </aside>

      {/* Consent Dialog */}
      {askStatus && (
        <AskConsentDialog
          open={consentOpen}
          providerHost={askStatus.providerHost || ''}
          model={askStatus.model || ''}
          isOpenRouter={Boolean(askStatus.isOpenRouter)}
          isFreeModel={Boolean(askStatus.isFreeModel)}
          onAccept={acceptConsent}
          onCancel={() => setConsentOpen(false)}
        />
      )}
    </>
  );
}
