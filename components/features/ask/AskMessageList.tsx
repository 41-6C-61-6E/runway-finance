'use client';

import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle, RotateCcw, User, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AskMarkdown } from './AskMarkdown';
import { AskSources } from './AskSources';
import { AskSuggestions } from './AskSuggestions';
import type { AskMessage, AskPhase } from './useAskStream';
import type { PageContext } from '@/lib/ask/router';

interface AskMessageListProps {
  messages: AskMessage[];
  status: AskPhase;
  page?: PageContext;
  onSendSuggestion: (text: string, packs?: Array<{ id: string; params?: unknown }>) => void;
  onRetry: () => void;
}

function getStatusLabel(status: AskPhase): string | null {
  switch (status) {
    case 'gathering':
      return 'Gathering financial summaries…';
    case 'thinking':
      return 'Thinking…';
    case 'fetching_more':
      return 'Fetching more data…';
    default:
      return null;
  }
}

function getErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case 'rate_limited':
      return "You've asked a lot of questions recently. Try again in a few minutes.";
    case 'provider_rate_limited':
      return 'The free model is rate-limited right now (OpenRouter free tier ≈ 20/min, 50/day). Wait a minute, add fallback models in Settings → AI, or use a paid model.';
    case 'provider_auth':
      return 'Your AI provider rejected the API key. Check Settings → AI.';
    case 'consent_required':
      return 'You must accept the data disclosure consent before asking questions.';
    case 'not_configured':
      return 'No AI provider is configured. Please configure an AI provider in Settings → AI.';
    default:
      return fallback || 'An unexpected error occurred. Please try again.';
  }
}

export function AskMessageList({
  messages,
  status,
  page,
  onSendSuggestion,
  onRetry,
}: AskMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Auto-scroll to bottom unless the user has manually scrolled up
  useEffect(() => {
    const el = containerRef.current;
    if (!el || userScrolledUp) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status, userScrolledUp]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolledUp(!isAtBottom);
  };

  const statusLabel = getStatusLabel(status);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      aria-live="polite"
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.length === 0 ? (
        <div className="flex flex-col gap-4 py-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <span>Welcome to Ask</span>
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ask questions about your spending, net worth, goals and retirement plan. Ask is{' '}
              <strong className="text-foreground font-medium">read-only</strong>: it cannot edit accounts, budgets, goals, plans, or settings. Conversations are not saved.
            </p>
          </div>

          <AskSuggestions page={page} onSelectSuggestion={onSendSuggestion} />
        </div>
      ) : (
        messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-tr-xs text-xs leading-relaxed font-normal'
                    : 'bg-muted/40 border border-border/50 text-foreground rounded-tl-xs'
                }`}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <>
                    {m.error ? (
                      <div className="flex flex-col gap-2 py-1 text-destructive">
                        <div className="flex items-start gap-2 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{getErrorMessage(m.error.code, m.error.message)}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onRetry}
                          className="w-fit h-7 text-xs flex items-center gap-1.5 mt-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </Button>
                      </div>
                    ) : (
                      <>
                        {m.content ? (
                          <AskMarkdown content={m.content} isStreaming={m.isStreaming} />
                        ) : (
                          statusLabel && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              <span>{statusLabel}</span>
                            </div>
                          )
                        )}
                        {m.sources && m.sources.length > 0 && <AskSources sources={m.sources} />}
                      </>
                    )}
                  </>
                )}
              </div>

              {isUser && (
                <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Floating status indicator when streaming more tokens */}
      {status !== 'idle' && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span>{statusLabel || 'Thinking…'}</span>
        </div>
      )}
    </div>
  );
}
