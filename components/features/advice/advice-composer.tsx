'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AdviceComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export type AskComposerProps = AdviceComposerProps;

const MAX_CHARS = 2000;

export function AdviceComposer({ onSend, onStop, isStreaming, disabled }: AdviceComposerProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  // Auto-resize textarea height up to a max
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const remaining = MAX_CHARS - input.length;
  const isOverLimit = remaining < 0;

  return (
    <div className="flex flex-col gap-1.5 p-3 border-t border-border bg-background">
      <div className="relative flex items-end gap-2 bg-muted/20 border border-border/70 rounded-xl px-3 py-2 focus-within:border-border focus-within:bg-muted/30 transition-colors">
        <textarea
          id="advice-composer-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for advice about your spending, net worth, goals, or retirement..."
          disabled={disabled}
          rows={1}
          aria-label="Advice question input"
          style={{ outline: 'none', boxShadow: 'none' }}
          className="flex-1 bg-transparent border-0 resize-none text-xs leading-relaxed text-foreground placeholder:text-muted-foreground min-h-[36px] max-h-[140px] py-1 outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none !outline-none !shadow-none"
        />

        {isStreaming ? (
          <Button
            id="advice-stop-button"
            type="button"
            size="sm"
            variant="destructive"
            onClick={onStop}
            aria-label="Stop generating response"
            className="h-8 px-2.5 rounded-lg flex items-center gap-1 shrink-0 text-xs shadow-2xs"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </Button>
        ) : (
          <Button
            id="advice-send-button"
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || isOverLimit || disabled}
            aria-label="Send question"
            className="h-8 w-8 p-0 rounded-lg shrink-0 flex items-center justify-center shadow-2xs"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {input.length > 1500 && (
        <div className="flex justify-end text-[11px] text-muted-foreground px-1">
          <span className={isOverLimit ? 'text-destructive font-medium' : ''}>
            {remaining} left
          </span>
        </div>
      )}
    </div>
  );
}

export const AskComposer = AdviceComposer;
