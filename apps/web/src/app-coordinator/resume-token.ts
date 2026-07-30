import type { ResumeToken } from './app-coordinator.types';

export interface ResumeTokenFactory {
  create(): ResumeToken;
}

/**
 * Framework-independent monotonic token factory.
 *
 * A factory instance is injected into the integration owner; no global token
 * state is shared between coordinator instances.
 */
export function createSequentialResumeTokenFactory(
  prefix = 'reply',
): ResumeTokenFactory {
  let sequence = 0;
  return {
    create() {
      sequence += 1;
      return `${prefix}:${sequence}` as ResumeToken;
    },
  };
}

/**
 * Boundary parser for persisted/external opaque tokens. Empty values are
 * rejected instead of being branded.
 */
export function parseResumeToken(value: string): ResumeToken | null {
  const normalized = value.trim();
  return normalized ? (normalized as ResumeToken) : null;
}
