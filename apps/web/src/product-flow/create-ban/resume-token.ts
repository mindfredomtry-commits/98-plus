/**
 * Opaque reply suspension identity for CreateBan reply context.
 * CreateBan-owned — not an ApplicationOwner token.
 */
declare const resumeTokenBrand: unique symbol;

export type ResumeToken = string & {
  readonly [resumeTokenBrand]: 'ResumeToken';
};

export interface ResumeTokenFactory {
  create(): ResumeToken;
}

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

export function parseResumeToken(value: string): ResumeToken | null {
  const normalized = value.trim();
  return normalized ? (normalized as ResumeToken) : null;
}
