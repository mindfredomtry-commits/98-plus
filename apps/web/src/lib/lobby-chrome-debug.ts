'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logLobbyChromeVisible(data: Record<string, unknown>): void {
  emit('[LOBBY CHROME VISIBLE]', data);
}

export function logLobbyChromeHidden(data: Record<string, unknown>): void {
  emit('[LOBBY CHROME HIDDEN]', data);
}

export function logLobbyChromeHiddenBug(data: Record<string, unknown>): void {
  emit('[LOBBY CHROME HIDDEN BUG]', data);
}

export function logLobbyIndicatorState(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR STATE]', data);
}

export function logResultPollDoesNotHideLobby(
  data: Record<string, unknown>,
): void {
  emit('[RESULT POLL DOES NOT HIDE LOBBY]', data);
}

export function logCheckDeeplinkSkipNoUiChange(
  data: Record<string, unknown>,
): void {
  emit('[CHECK DEEPLINK SKIP NO UI CHANGE]', data);
}

export function logCheckOverlayQueueBanIdResolution(
  data: Record<string, unknown>,
): void {
  emit('CHECK_OVERLAY_QUEUE_BANID_RESOLUTION', data);
}
