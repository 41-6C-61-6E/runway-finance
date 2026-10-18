'use client';

import React from 'react';
import Link from 'next/link';
import { Bot, Trash2, ShieldAlert, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAsk } from './AskProvider';
import { AskMessageList } from './AskMessageList';
import { AskComposer } from './AskComposer';
import { AskConsentDialog } from './AskConsentDialog';

export function AskSheet() {
  const {
    isOpen,
    setIsOpen,
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
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col h-full bg-card border-l border-border shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between shrink-0 space-y-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <SheetTitle className="text-sm font-semibold tracking-tight text-foreground">
                Ask
              </SheetTitle>

              {/* Read-Only Badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-secondary-foreground border border-border/60 cursor-help select-none">
                    Read-only
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
                  Ask can view summaries of your finances but can&apos;t change anything.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-1.5 mr-6">
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
            </div>
          </SheetHeader>

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
        </SheetContent>
      </Sheet>

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
