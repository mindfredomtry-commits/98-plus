export type SendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type HideLobbyBootLogoOnlyInput = {
  phase: SendFlowPhase;
  replyComposeActive: boolean;
};

/** Hide only the 98+ lobby boot logo layer — never confirm orb / boot ring. */
export function shouldHideLobbyBootLogoOnly(
  input: HideLobbyBootLogoOnlyInput,
): boolean {
  if (input.phase === 'idle') {
    return input.replyComposeActive;
  }
  return (
    input.phase === 'selectingTarget' ||
    input.phase === 'composingBan' ||
    input.phase === 'confirming' ||
    input.replyComposeActive
  );
}
