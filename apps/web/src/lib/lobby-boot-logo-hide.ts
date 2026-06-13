export type SendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type HideLobbyBootLogoOnlyInput = {
  phase: SendFlowPhase;
  replyComposeActive: boolean;
  sendStarted: boolean;
};

/** Hide only the 98+ lobby boot logo layer — never confirm orb / boot ring. */
export function shouldHideLobbyBootLogoOnly(
  input: HideLobbyBootLogoOnlyInput,
): boolean {
  return (
    input.phase === 'composingBan' ||
    input.phase === 'confirming' ||
    input.replyComposeActive ||
    input.sendStarted
  );
}
