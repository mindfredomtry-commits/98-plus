'use client';

import { Component, type ReactNode } from 'react';
import { challengeLog } from '@/lib/challenge-log';

interface Props {
  name: string;
  children: ReactNode;
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
}

export class ChallengeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    challengeLog('boundary:crash', {
      layer: this.props.name,
      message: error.message,
    });
    this.props.onRecover?.();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
