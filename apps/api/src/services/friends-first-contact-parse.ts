/** Pure first-contact username parse (no Redis/Prisma). */

/** Telegram public @username: 5–32 chars, starts with a letter. */
export const TELEGRAM_USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;

export const FIRST_CONTACT_RATE_LIMIT_PER_MINUTE = 20;

export type FirstContactErrorCode =
  | 'invalid_username'
  | 'self'
  | 'rate_limited';

export class FirstContactError extends Error {
  readonly code: FirstContactErrorCode;
  readonly status: number;

  constructor(code: FirstContactErrorCode, message: string, status: number) {
    super(message);
    this.name = 'FirstContactError';
    this.code = code;
    this.status = status;
  }
}

function normalizeUsernameLocal(raw: string): string {
  return raw.replace(/^@+/, '').replace(/@/g, '').trim().toLowerCase();
}

/**
 * Normalize + validate Telegram @username for first-contact lookup.
 * Exact match only — no prefix search.
 */
export function parseFirstContactUsername(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new FirstContactError(
      'invalid_username',
      'username required',
      400,
    );
  }
  const username = normalizeUsernameLocal(raw);
  if (!username || !TELEGRAM_USERNAME_RE.test(username)) {
    throw new FirstContactError(
      'invalid_username',
      'invalid Telegram username',
      400,
    );
  }
  return username;
}
