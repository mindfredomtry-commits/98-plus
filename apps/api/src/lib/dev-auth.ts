/** Dev-only auth — never enabled in production unless explicitly flagged. */
export function isDevAuthEnabled(): boolean {
  if (process.env.DEV_AUTH_ENABLED === 'true') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}
