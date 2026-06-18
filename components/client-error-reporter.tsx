'use client';

import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Terminal, Trash2, Send, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ReactErrorBoundary from './ReactErrorBoundary';

interface ClientError {
  id: string;
  name: string;
  message: string;
  stack?: string;
  url: string;
  reported: boolean;
  reporting: boolean;
  date: string;
}

export function ClientErrorReporter({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isBoundaryActive, setIsBoundaryActive] = useState(false);
  const reportedErrorsRef = useRef<Set<string>>(new Set());

  const autoReportError = async (payload: { name: string; message: string; stack?: string; url: string }, id: string) => {
    try {
      const response = await fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorName: payload.name,
          errorMessage: payload.message,
          errorStack: payload.stack,
          url: payload.url,
        }),
      });
      if (response.ok) {
        setErrors((prev) =>
          prev.map((e) => (e.id === id ? { ...e, reported: true } : e))
        );
      }
    } catch {
      // Ignored to prevent feedback loop
    }
  };

  const addError = (payload: { name: string; message: string; stack?: string; url: string }) => {
    const errorKey = `${payload.message}::${payload.stack || ''}`;
    if (reportedErrorsRef.current.has(errorKey)) {
      return;
    }
    reportedErrorsRef.current.add(errorKey);

    const newId = Math.random().toString(36).substring(7);
    const newErr: ClientError = {
      id: newId,
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
      url: payload.url,
      reported: false,
      reporting: false,
      date: new Date().toISOString(),
    };

    setErrors((prev) => [...prev, newErr]);
    autoReportError(payload, newId);
  };

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      const err = event.error || { name: 'Error', message: event.message };
      addError({
        name: err.name || 'Error',
        message: err.message || event.message || 'Unknown runtime error',
        stack: err.stack,
        url: window.location.href,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let name = 'PromiseRejection';
      let message = 'Unhandled Promise Rejection';
      let stack = undefined;

      if (reason instanceof Error) {
        name = reason.name;
        message = reason.message;
        stack = reason.stack;
      } else if (reason) {
        try {
          message = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
        } catch {
          message = String(reason);
        }
      }

      addError({
        name,
        message,
        stack,
        url: window.location.href,
      });
    };

    // Intercept console.error calls (e.g. React key warnings, hydration errors)
    let isReportingError = false;
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);

      if (isReportingError) return;

      const message = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message;
          if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch { return String(arg); }
          }
          return String(arg);
        })
        .join(' ');

      // Bypass internal logs and benign next-auth errors to avoid infinite loop or false positive alerts
      if (
        message.includes('[logger]') || 
        message.includes('[client-error]') ||
        message.includes('NextRouter') ||
        message.toLowerCase().includes('clientfetcherror') ||
        message.includes('errors.authjs.dev') ||
        message.includes('next-auth')
      ) {
        return;
      }

      isReportingError = true;
      try {
        addError({
          name: 'ConsoleError',
          message: message || 'console.error called',
          stack: new Error().stack,
          url: window.location.href,
        });
      } catch {
        // Ignored
      } finally {
        isReportingError = false;
      }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      console.error = originalConsoleError;
    };
  }, []);

  const reportError = async (id: string) => {
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, reporting: true } : e))
    );

    const errorToReport = errors.find((e) => e.id === id);
    if (!errorToReport) return;

    try {
      const response = await fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorName: errorToReport.name,
          errorMessage: errorToReport.message,
          errorStack: errorToReport.stack,
          url: errorToReport.url,
        }),
      });

      if (response.ok) {
        setErrors((prev) =>
          prev.map((e) => (e.id === id ? { ...e, reported: true, reporting: false } : e))
        );
      } else {
        throw new Error('Failed to submit logs');
      }
    } catch (err) {
      setErrors((prev) =>
        prev.map((e) => (e.id === id ? { ...e, reporting: false } : e))
      );
    }
  };

  const reportAll = async () => {
    const unreported = errors.filter((e) => !e.reported && !e.reporting);
    for (const err of unreported) {
      await reportError(err.id);
    }
  };

  return (
    <ReactErrorBoundary onError={(err) => {
      setIsBoundaryActive(true);
      addError({ name: err.name, message: err.message, stack: err.stack, url: typeof window !== 'undefined' ? window.location.href : '' });
    }}>
      {children}

      {/* Floating warning badge */}
      {errors.length > 0 && !isBoundaryActive && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-destructive/10 backdrop-blur-md border border-destructive/30 hover:border-destructive/50 transition-all rounded-lg p-3 shadow-lg flex items-center gap-3 text-xs max-w-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/20 text-destructive animate-pulse flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Client-side error captured</p>
              <p className="text-muted-foreground truncate">{errors[errors.length - 1].message}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => setIsOpen(true)}>
                View Details
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={() => setErrors([])}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog to inspect details and report errors */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-destructive" />
              Captured Client Errors ({errors.length})
            </DialogTitle>
            <DialogDescription>
              Review frontend exceptions that occurred in the browser. You can report them to log them on the server.
            </DialogDescription>
          </DialogHeader>

          {/* List of errors */}
          <div className="flex-1 overflow-y-auto space-y-4 my-4 pr-1">
            {errors.map((err) => (
              <div key={err.id} className="border border-border rounded-lg bg-muted/30 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-destructive font-mono uppercase bg-destructive/10 px-2 py-0.5 rounded">
                    {err.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(err.date).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-semibold text-foreground font-mono bg-background/50 p-2 rounded border border-border/40 select-text">
                  {err.message}
                </p>
                {err.stack && (
                  <details className="group">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground select-none flex items-center gap-0.5 font-semibold hover:text-foreground">
                      <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                      View Stack Trace
                    </summary>
                    <pre className="mt-2 p-2 bg-black/45 text-destructive-foreground/90 font-mono text-[10px] leading-relaxed rounded border border-border/30 overflow-x-auto whitespace-pre select-text max-h-40">
                      {err.stack}
                    </pre>
                  </details>
                )}
                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                  <span className="truncate max-w-[65%] font-mono">URL: {err.url}</span>
                  <Button
                    size="sm"
                    variant={err.reported ? 'secondary' : 'default'}
                    disabled={err.reported || err.reporting}
                    onClick={() => reportError(err.id)}
                    className="h-6 text-[10px] px-2 flex items-center gap-1.5"
                  >
                    {err.reported ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Reported
                      </>
                    ) : err.reporting ? (
                      'Reporting...'
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        Report Error
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setErrors([]);
                setIsOpen(false);
              }}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear All Logs
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                Close
              </Button>
              {errors.some((e) => !e.reported) && (
                <Button variant="default" size="sm" onClick={reportAll}>
                  <Send className="w-4 h-4 mr-2" /> Report All Unreported
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReactErrorBoundary>
  );
}
