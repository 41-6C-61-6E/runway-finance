'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error, errorInfo: ErrorInfo) => void;
}

export default class ReactErrorBoundary extends Component<
  ErrorBoundaryProps,
  { hasError: boolean; reporting: boolean; reported: boolean; error: Error | null }
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, reporting: false, reported: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError(error, errorInfo);
  }

  async handleReport() {
    if (!this.state.error) return;
    this.setState({ reporting: true });
    try {
      await fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorName: this.state.error.name,
          errorMessage: this.state.error.message,
          errorStack: this.state.error.stack,
          url: window.location.href,
        }),
      });
      this.setState({ reported: true });
    } catch {
      // Ignore
    } finally {
      this.setState({ reporting: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground">
          <div className="max-w-md w-full border border-border bg-card p-6 rounded-xl shadow-lg text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto animate-pulse" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground text-left bg-muted/50 p-3 rounded border border-border/55 max-h-40 overflow-auto font-mono text-xs select-text">
              {this.state.error?.name}: {this.state.error?.message}
            </p>
            <p className="text-xs text-muted-foreground">
              A critical rendering error occurred in the browser. You can report this to the server so it can be investigated in the application logs.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                Reload Application
              </Button>
              <Button
                onClick={() => this.handleReport()}
                variant={this.state.reported ? 'secondary' : 'destructive'}
                disabled={this.state.reporting || this.state.reported}
                size="sm"
                className="flex items-center gap-1.5 cursor-pointer"
              >
                {this.state.reported ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Reported
                  </>
                ) : this.state.reporting ? (
                  'Reporting...'
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Report Error
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
