'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Check, X, Zap } from 'lucide-react';

type StageName = 'config' | 'connecting' | 'sending' | 'receiving';

type Stage = {
  key: StageName;
  label: string;
  description: string;
};

const STAGES: Stage[] = [
  { key: 'config', label: 'Configuration', description: 'Resolving provider endpoint, model, and API key' },
  { key: 'connecting', label: 'Connecting', description: 'Establishing connection to the API endpoint' },
  { key: 'sending', label: 'Sending prompt', description: 'Sending a lightweight test message to the model' },
  { key: 'receiving', label: 'Receiving response', description: 'Waiting for the model to respond' },
];

type StageStatus = 'pending' | 'active' | 'done' | 'error';

type TestResult = {
  ok: boolean;
  message: string;
  response?: string;
};

export default function AiTestProgress({
  title,
  testFn,
  onClose,
}: {
  title: string;
  testFn: (signal: AbortSignal) => Promise<TestResult>;
  onClose: () => void;
}) {
  const [stageStatus, setStageStatus] = useState<Record<StageName, StageStatus>>({
    config: 'done',
    connecting: 'active',
    sending: 'pending',
    receiving: 'pending',
  });
  const [result, setResult] = useState<TestResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stageTimings, setStageTimings] = useState<Record<StageName, number>>({} as any);
  const startRef = useRef(Date.now());
  const stageStartRef = useRef<Record<StageName, number>>({} as any);
  const abortRef = useRef<AbortController>(new AbortController());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const testFnRef = useRef(testFn);
  testFnRef.current = testFn;

  const handleCancel = useCallback(() => {
    abortRef.current.abort();
    onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    stageStartRef.current = { config: Date.now(), connecting: Date.now(), sending: 0, receiving: 0 };

    timerRef.current = setInterval(() => {
      if (cancelled) return;
      setElapsed(Date.now() - startRef.current);
    }, 100);

    const stageTimer = setTimeout(() => {
      if (cancelled) return;
      setStageStatus(prev => ({ ...prev, config: 'done', connecting: 'done', sending: 'active' }));
      stageStartRef.current.sending = Date.now();
    }, 400);

    const stageTimer2 = setTimeout(() => {
      if (cancelled) return;
      setStageStatus(prev => ({ ...prev, sending: 'done', receiving: 'active' }));
      stageStartRef.current.receiving = Date.now();
    }, 900);

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    testFnRef.current(ctrl.signal).then((res) => {
      if (cancelled) return;
      stopTimer();
      const now = Date.now();
      setElapsed(now - startRef.current);
      
      // Ensure receiving shows 'active' briefly before 'done' to avoid the "flash" issue
      // where it goes from pending -> done without showing active
      const prevReceiving = stageStatus.receiving;
      setStageStatus(prev => ({
        ...prev,
        connecting: 'done',
        sending: 'done',
        receiving: prevReceiving === 'pending' ? 'active' : (res.ok ? 'done' : 'error'),
      }));
      
      // If we just set receiving to 'active', transition to 'done' after a short delay
      if (prevReceiving === 'pending') {
        setTimeout(() => {
          if (!cancelled) {
            setStageStatus(prev => ({
              ...prev,
              receiving: res.ok ? 'done' : 'error',
            }));
          }
        }, 300);
      }
      
      setStageTimings({
        config: (stageStartRef.current.connecting || now) - (stageStartRef.current.config || now),
        connecting: (stageStartRef.current.sending || now) - (stageStartRef.current.connecting || now),
        sending: (stageStartRef.current.receiving || now) - (stageStartRef.current.sending || now),
        receiving: now - (stageStartRef.current.receiving || now),
      });
      setResult(res);
    }).catch((err) => {
      if (cancelled || err?.name === 'AbortError') return;
      stopTimer();
      const now = Date.now();
      setElapsed(now - startRef.current);
      setStageStatus(prev => ({
        ...prev,
        receiving: 'error',
      }));
      setStageTimings({
        config: (stageStartRef.current.connecting || now) - (stageStartRef.current.config || now),
        connecting: (stageStartRef.current.sending || now) - (stageStartRef.current.connecting || now),
        sending: (stageStartRef.current.receiving || now) - (stageStartRef.current.sending || now),
        receiving: now - (stageStartRef.current.receiving || now),
      });
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    });

    return () => {
      cancelled = true;
      clearTimeout(stageTimer);
      clearTimeout(stageTimer2);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const statusIcon = (status: StageStatus) => {
    switch (status) {
      case 'pending':
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
      case 'active':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'done':
        return <Check className="h-4 w-4 text-chart-2" />;
      case 'error':
        return <X className="h-4 w-4 text-destructive" />;
    }
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-card border border-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {!result && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Elapsed: {formatTime(elapsed)}
              </p>
            )}
          </div>
          {result && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Stage progression */}
        <div className="space-y-3 mb-5">
          {STAGES.map((stage) => {
            const status = stageStatus[stage.key];
            const timing = stageTimings[stage.key];
            return (
              <div
                key={stage.key}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  status === 'active' ? 'bg-primary/5 border border-primary/20' :
                  status === 'done' ? 'bg-chart-2/5' :
                  status === 'error' ? 'bg-destructive/5' :
                  'opacity-40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {statusIcon(status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      status === 'error' ? 'text-destructive' : 'text-foreground'
                    }`}>
                      {stage.label}
                    </span>
                    {timing !== undefined && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatTime(timing)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cancel button while running */}
        {!result && (
          <button
            onClick={handleCancel}
            className="w-full px-3 py-2 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-all"
          >
            Cancel Test
          </button>
        )}

        {/* Result */}
        {result && (
          <>
            <div className={`p-4 rounded-lg border ${
              result.ok
                ? 'bg-chart-2/10 border-chart-2/30'
                : 'bg-destructive/10 border-destructive/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {result.ok ? (
                  <Zap className="h-4 w-4 text-chart-2" />
                ) : (
                  <X className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-sm font-semibold ${
                  result.ok ? 'text-chart-2' : 'text-destructive'
                }`}>
                  {result.ok ? 'Connected' : 'Connection Failed'}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                  {formatTime(elapsed)} total
                </span>
              </div>
              <p className={`text-xs mt-1 ${
                result.ok ? 'text-chart-2/80' : 'text-destructive/80'
              }`}>
                {result.message}
              </p>
              {result.ok && result.response && (
                <div className="mt-2 bg-muted rounded-lg p-2">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Model response:</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap font-mono">{result.response}</p>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full px-3 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-all"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
