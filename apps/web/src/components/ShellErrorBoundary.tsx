'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { challengeLog } from '@/lib/challenge-log';
import { resetScrollLock } from '@/lib/scroll-lock';

interface Props {
  name: string;
  children: ReactNode;
  /** When set, render this instead of default mini fallback (use null to hide). */
  fallback?: ReactNode;
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ShellErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[98+ ShellErrorBoundary]', {
      layer: this.props.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    challengeLog('shell:crash', {
      layer: this.props.name,
      message: error.message,
    });
    resetScrollLock();
    this.props.onRecover?.();
  }

  private retry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <div className="shell-fallback p-6 text-center space-y-3">
        <p className="text-2xl font-black text-glow">98+</p>
        <p className="text-muted text-sm">
          Раздел «{this.props.name}» временно недоступен
        </p>
        {this.state.message ? (
          <p className="text-[10px] text-muted/60 break-all max-w-xs mx-auto">
            {this.state.message}
          </p>
        ) : null}
        <button
          type="button"
          className="text-accent text-sm underline"
          onClick={this.retry}
        >
          Повторить
        </button>
      </div>
    );
  }
}
