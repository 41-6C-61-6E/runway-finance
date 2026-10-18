'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useAsk } from './AskProvider';

interface AskButtonProps {
  className?: string;
}

export function AskButton({ className }: AskButtonProps) {
  const { openAsk, askStatus } = useAsk();

  // Hidden when disabled or for household members (v1)
  if (askStatus && !askStatus.available) {
    if (askStatus.reason === 'disabled' || askStatus.reason === 'member') {
      return null;
    }
  }

  return (
    <IconButton
      id="ask-open-button"
      label="Ask"
      title="Ask about your finances"
      onClick={() => openAsk()}
      className={className}
    >
      <Sparkles className="h-4 w-4 text-primary" />
    </IconButton>
  );
}
