export type QueueAppearanceReactionTracePayload = {
  source: string;
  telegramUserId?: string | null;
  prevQueueLen?: number;
  nextQueueLen?: number;
  prevPendingLen?: number;
  nextPendingLen?: number;
  prevHasAttention?: boolean;
  nextHasAttention?: boolean;
  lobbyBansNeedAttention?: boolean;
  indicatorVisible?: boolean;
  lobbyOpen?: boolean;
  showLobby?: boolean;
  notificationSessionActive?: boolean;
  notificationChainTransitioning?: boolean;
  activeKind?: string | null;
  queueHeadKind?: string | null;
  willAutoStartDrain?: boolean;
  willStartOnClick?: boolean;
  skipReason?: string | null;
};

export function logQueueAppearanceReactionTrace(
  payload: QueueAppearanceReactionTracePayload,
): void {
  console.log('QUEUE_APPEARANCE_REACTION_TRACE', payload);
}
