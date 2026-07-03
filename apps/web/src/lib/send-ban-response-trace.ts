export type SendBanResponseTracePayload = {
  source: string;
  banText?: string | null;
  targetUserId?: string | null;
  durationMinutes?: number | null;
  httpStatus: number | null;
  ok: boolean;
  responseJson?: Record<string, unknown> | null;
  createdBanId?: string | null;
  incomingNotificationSent?: boolean | null;
  errorName?: string | null;
  errorMessage?: string | null;
  thrownAfterCreate?: boolean;
  successCardWillOpen?: boolean | null;
  failureReason?: string | null;
};

export function readCreatedBanIdFromSendResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  if (typeof root.banId === 'string' && root.banId.trim()) {
    return root.banId.trim();
  }
  const ban = root.ban;
  if (ban && typeof ban === 'object') {
    const banId = (ban as { id?: unknown }).id;
    if (typeof banId === 'string' && banId.trim()) return banId.trim();
  }
  const replyBan = root.replyBan;
  if (replyBan && typeof replyBan === 'object') {
    const banId = (replyBan as { id?: unknown }).id;
    if (typeof banId === 'string' && banId.trim()) return banId.trim();
  }
  return null;
}

export function readIncomingNotificationSentFromSendResponse(
  json: unknown,
): boolean | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const debug = root.notificationDebug;
  if (!debug || typeof debug !== 'object') return null;
  const delivered = (debug as { delivered?: unknown }).delivered;
  if (typeof delivered === 'boolean') return delivered;
  const sent = (debug as { sent?: unknown }).sent;
  if (typeof sent === 'boolean') return sent;
  return null;
}

export function snapshotSendBanResponseJson(
  json: unknown,
): Record<string, unknown> {
  if (!json || typeof json !== 'object') {
    return { rawType: json == null ? 'null' : typeof json };
  }
  const root = json as Record<string, unknown>;
  const ban =
    root.ban && typeof root.ban === 'object'
      ? (root.ban as Record<string, unknown>)
      : null;
  const replyBan =
    root.replyBan && typeof root.replyBan === 'object'
      ? (root.replyBan as Record<string, unknown>)
      : null;
  return {
    topLevelKeys: Object.keys(root),
    banId: readCreatedBanIdFromSendResponse(json),
    banNestedKeys: ban ? Object.keys(ban) : null,
    replyBanNestedKeys: replyBan ? Object.keys(replyBan) : null,
    pending: root.pending ?? null,
    requiresShare: root.requiresShare ?? null,
    energyDelta: root.energyDelta ?? null,
    parentId: root.parentId ?? null,
    notificationDebug: root.notificationDebug ?? null,
  };
}

export function logSendBanResponseTrace(
  payload: SendBanResponseTracePayload,
): void {
  console.log('SEND_BAN_RESPONSE_TRACE', payload);
}
