'use client';

import { useState, useRef, useCallback } from 'react';
import type { SourceItem } from './AdviceSources';

export interface AdviceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
  isStreaming?: boolean;
  isStopped?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export type AskMessage = AdviceMessage;

export type AdvicePhase = 'idle' | 'gathering' | 'thinking' | 'fetching_more' | 'answering';
export type AskPhase = AdvicePhase;

export interface UseAdviceStreamResult {
  messages: AdviceMessage[];
  status: AdvicePhase;
  isStreaming: boolean;
  sendMessage: (
    content: string,
    options?: {
      page?: { path: string; planId?: string; month?: string };
      packs?: Array<{ id: string; params?: unknown }>;
    }
  ) => Promise<void>;
  stopStream: () => void;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
}

export type UseAskStreamResult = UseAdviceStreamResult;

export function useAdviceStream(): UseAdviceStreamResult {
  const [messages, setMessages] = useState<AdviceMessage[]>([]);
  const [status, setStatus] = useState<AdvicePhase>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestOptionsRef = useRef<{
    content: string;
    page?: { path: string; planId?: string; month?: string };
    packs?: Array<{ id: string; params?: unknown }>;
  } | null>(null);

  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setStatus('idle');
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('idle');
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            isStreaming: false,
            isStopped: true,
            content: last.content ? `${last.content} (stopped)` : '(stopped)',
          },
        ];
      }
      return prev;
    });
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        page?: { path: string; planId?: string; month?: string };
        packs?: Array<{ id: string; params?: unknown }>;
      }
    ) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      lastRequestOptionsRef.current = { content: trimmed, ...options };

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userMessageId = `u-${Date.now()}`;
      const assistantMessageId = `a-${Date.now()}`;

      const userMsg: AskMessage = {
        id: userMessageId,
        role: 'user',
        content: trimmed,
      };

      const assistantMsg: AskMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus('gathering');

      try {
        // Keep recent 20 messages as a sliding window to prevent exceeding schema or token bounds
        const rawHistory = [...messages, userMsg];
        const payloadMessages = rawHistory.slice(-20).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Extract recently loaded data packs from prior assistant messages for multi-turn memory
        const sessionPacksMap = new Map<string, { id: string }>();
        for (const m of messages) {
          if (m.role === 'assistant' && m.sources && m.sources.length > 0) {
            for (const s of m.sources) {
              if (s.packId && !sessionPacksMap.has(s.packId)) {
                sessionPacksMap.set(s.packId, { id: s.packId });
              }
            }
          }
        }
        const sessionPacks = Array.from(sessionPacksMap.values()).slice(-4);

        const response = await fetch('/api/ai/advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: payloadMessages,
            page: options?.page,
            packs: options?.packs,
            sessionPacks: sessionPacks.length > 0 ? sessionPacks : undefined,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errCode = 'provider_error';
          let errMsg = `Request failed (${response.status})`;
          try {
            const text = await response.text();
            try {
              const json = JSON.parse(text);
              if (json.error) errCode = json.error;
              if (json.message) errMsg = json.message;
            } catch {
              const sseMatch = text.match(/data:\s*(\{.*\})/);
              if (sseMatch) {
                const sseJson = JSON.parse(sseMatch[1]);
                if (sseJson.code) errCode = sseJson.code;
                if (sseJson.message) errMsg = sseJson.message;
              }
            }
          } catch {
            // Ignore parse errors
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    error: { code: errCode, message: errMsg },
                  }
                : m
            )
          );
          setStatus('idle');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response stream body');
        }

        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          // Keep whatever incomplete event line is after the last \n\n
          sseBuffer = events.pop() || '';

          for (const ev of events) {
            const lines = ev.split('\n');
            let eventName = 'message';
            let dataStr = '';

            for (const l of lines) {
              if (l.startsWith('event: ')) {
                eventName = l.substring(7).trim();
              } else if (l.startsWith('data: ')) {
                dataStr = l.substring(6).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (eventName === 'status') {
                setStatus(data.phase || 'thinking');
              } else if (eventName === 'sources') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, sources: data.items }
                      : m
                  )
                );
              } else if (eventName === 'token') {
                setStatus('answering');
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + data.text }
                      : m
                  )
                );
              } else if (eventName === 'done') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, isStreaming: false }
                      : m
                  )
                );
              } else if (eventName === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          isStreaming: false,
                          error: { code: data.code, message: data.message },
                        }
                      : m
                  )
                );
              }
            } catch {
              // Ignore individual malformed SSE line
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  isStreaming: false,
                  error: {
                    code: 'network_error',
                    message: err instanceof Error ? err.message : String(err),
                  },
                }
              : m
          )
        );
      } finally {
        setStatus('idle');
        abortControllerRef.current = null;
      }
    },
    [messages]
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastRequestOptionsRef.current) return;
    const { content, ...opts } = lastRequestOptionsRef.current;
    // Remove the failed assistant message and last user message before resending
    setMessages((prev) => {
      const filtered = [...prev];
      if (filtered.length > 0 && filtered[filtered.length - 1].role === 'assistant') {
        filtered.pop();
      }
      if (filtered.length > 0 && filtered[filtered.length - 1].role === 'user') {
        filtered.pop();
      }
      return filtered;
    });
    await sendMessage(content, opts);
  }, [sendMessage]);

  return {
    messages,
    status,
    isStreaming: status !== 'idle',
    sendMessage,
    stopStream,
    clearMessages,
    retryLastMessage,
  };
}

export const useAskStream = useAdviceStream;
