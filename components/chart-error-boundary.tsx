'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ChartErrorBoundary] ${this.props.name} crashed:`, error, errorInfo);
    try {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorName: `ChartError: ${this.props.name}`,
          errorMessage: error?.message || 'Chart rendering failure',
          errorStack: error?.stack || errorInfo?.componentStack,
          url: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
      }).catch(() => {});
    } catch {
      // Ignored
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">{this.props.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            This chart encountered an error. Try refreshing the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
