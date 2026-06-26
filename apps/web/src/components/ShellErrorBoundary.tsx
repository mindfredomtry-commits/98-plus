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
  name?: string;
  stack?: string;
  errorJson?: string;
  href?: string;
  host?: string;
  baseURI?: string;
  startParam?: string;
  userAgent?: string;
}

function serializeErrorForDiagnostics(error: Error): string {
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
  } catch (serializationError) {
    return JSON.stringify(
      {
        serializationFailed: true,
        message: error.message,
        name: error.name,
        stack: error.stack,
        serializationError:
          serializationError instanceof Error
            ? serializationError.message
            : String(serializationError),
      },
      null,
      2,
    );
  }
}

export class ShellErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const runtime =
      typeof window !== 'undefined'
        ? {
            href: window.location.href,
            host: window.location.host,
            baseURI: document.baseURI,
            startParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
            userAgent: navigator.userAgent,
          }
        : {};

    return {
      hasError: true,
      message: error.message || 'Unknown error',
      name: error.name,
      stack: error.stack,
      errorJson: serializeErrorForDiagnostics(error),
      ...runtime,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[98+ ShellErrorBoundary]', {
      layer: this.props.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    window.__debug98log?.('[98+ ShellErrorBoundary]', {
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
    this.setState({
      hasError: false,
      message: '',
      name: undefined,
      stack: undefined,
      errorJson: undefined,
      href: undefined,
      host: undefined,
      baseURI: undefined,
      startParam: undefined,
      userAgent: undefined,
    });
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
        <div className="text-[10px] text-muted/60 break-all max-w-xs mx-auto text-left space-y-2">
          {this.state.message ? (
            <p>
              <span className="text-muted/80">error.message:</span> {this.state.message}
            </p>
          ) : null}
          {this.state.name ? (
            <p>
              <span className="text-muted/80">error.name:</span> {this.state.name}
            </p>
          ) : null}
          {this.state.stack ? (
            <pre className="whitespace-pre-wrap">
              <span className="text-muted/80">error.stack:</span>
              {'\n'}
              {this.state.stack}
            </pre>
          ) : null}
          {this.state.errorJson ? (
            <pre className="whitespace-pre-wrap">
              <span className="text-muted/80">error (serialized):</span>
              {'\n'}
              {this.state.errorJson}
            </pre>
          ) : null}
          {this.state.href ? (
            <p>
              <span className="text-muted/80">location.href:</span> {this.state.href}
            </p>
          ) : null}
          {this.state.host ? (
            <p>
              <span className="text-muted/80">location.host:</span> {this.state.host}
            </p>
          ) : null}
          {this.state.baseURI ? (
            <p>
              <span className="text-muted/80">document.baseURI:</span> {this.state.baseURI}
            </p>
          ) : null}
          {this.state.startParam !== undefined ? (
            <p>
              <span className="text-muted/80">start_param:</span>{' '}
              {this.state.startParam || '(empty)'}
            </p>
          ) : null}
          {this.state.userAgent ? (
            <p>
              <span className="text-muted/80">navigator.userAgent:</span>{' '}
              {this.state.userAgent}
            </p>
          ) : null}
        </div>
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
