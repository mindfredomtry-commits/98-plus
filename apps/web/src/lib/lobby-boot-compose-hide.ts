export type SendFlowPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type HideBootVisualForComposeInput = {
  phase: SendFlowPhase;
  replyComposeActive: boolean;
  sendStarted: boolean;
  confirmActive: boolean;
  orbCompressActive: boolean;
};

/** Hide boot logo / ring / fill while send compose flow is active (Who/What/Confirm). */
export function shouldHideBootVisualForCompose(
  input: HideBootVisualForComposeInput,
): boolean {
  return (
    input.phase !== 'idle' ||
    input.replyComposeActive ||
    input.sendStarted ||
    input.confirmActive ||
    input.orbCompressActive
  );
}
