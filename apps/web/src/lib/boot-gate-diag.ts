/**
 * TEMP production boot-path diagnostics.
 * Enabled only when NEXT_PUBLIC_BOOT_GATE_DIAG=1 (build-time).
 * Never log secrets (initData, JWT, Authorization, tokens).
 */

export type BootGateEvent =
  | 'BOOT_GATE_INIT'
  | 'BOOT_GATE_TELEGRAM_CONTEXT'
  | 'BOOT_GATE_AUTH_START'
  | 'BOOT_GATE_AUTH_SUCCESS'
  | 'BOOT_GATE_AUTH_FAILURE'
  | 'BOOT_GATE_SESSION_START'
  | 'BOOT_GATE_SESSION_SUCCESS'
  | 'BOOT_GATE_SESSION_FAILURE'
  | 'BOOT_GATE_RUNTIME_BOOTSTRAP_START'
  | 'BOOT_GATE_RUNTIME_BOOTSTRAP_SUCCESS'
  | 'BOOT_GATE_RUNTIME_BOOTSTRAP_FAILURE'
  | 'BOOT_GATE_APP_SCREEN_BLOCKED'
  | 'BOOT_GATE_APP_SCREEN_RELEASED'
  | 'BOOT_GATE_LOBBY_BLOCKED'
  | 'BOOT_GATE_LOBBY_RELEASED'
  | 'BOOT_GATE_FATAL_CLIENT_ERROR';

export type BootGateDiagFields = {
  elapsedMs?: number;
  userId?: string | null;
  telegramId?: string | number | null;
  platform?: string | null;
  initDataPresent?: boolean;
  authStatus?: string | null;
  requestName?: string | null;
  httpStatus?: number | null;
  runtimeLifecycle?: string | null;
  bootstrapPhase?: string | null;
  transitionId?: string | null;
  blockingGate?: string | null;
  errorCode?: string | null;
  errorClass?: string | null;
};

const SECRET_KEYS = new Set([
  'initdata',
  'init_data',
  'jwt',
  'authorization',
  'token',
  'password',
  'cookie',
  'bot_token',
  'hash',
]);

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

let bootStartedAt =
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export function isBootGateDiagEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BOOT_GATE_DIAG === '1';
}

export function resetBootGateDiagClock(): void {
  bootStartedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sanitize(fields: BootGateDiagFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSecretKey(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function logBootGate(
  event: BootGateEvent,
  fields: BootGateDiagFields = {},
): void {
  if (!isBootGateDiagEnabled()) return;
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    elapsedMs:
      fields.elapsedMs != null
        ? fields.elapsedMs
        : Math.round(now - bootStartedAt),
    ...sanitize(fields),
  };
  console.info('[BOOT_GATE]', payload);
}

/** Test helper — ensure payload never carries secret-shaped keys/values. */
export function bootGatePayloadIsSafe(
  payload: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(payload)) {
    if (isSecretKey(key)) return false;
  }
  const blob = JSON.stringify(payload);
  if (/Bearer\s+\S+/i.test(blob)) return false;
  if (/"initData"\s*:/i.test(blob)) return false;
  return true;
}
