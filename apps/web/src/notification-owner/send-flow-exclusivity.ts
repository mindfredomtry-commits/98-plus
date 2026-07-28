/**
 * Send-flow full-screen exclusivity — pure predicates.
 * WHO / WHAT / CONFIRM / SUCCESS are mutually exclusive; at most one may render.
 */

export type SendFlowOwnerKind =
  | 'BOOT'
  | 'LOBBY'
  | 'WHO'
  | 'WHAT'
  | 'CONFIRM'
  | 'SUCCESS'
  | 'LEGACY_FLOW';

export type SendFlowLegacyPhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type SendFlowSurfaceExclusivity = {
  who: boolean;
  what: boolean;
  confirm: boolean;
  success: boolean;
  /** True when more than one full-screen send surface would render — must stay false. */
  overlap: boolean;
};

export function resolveSendFlowSurfaceExclusivity(input: {
  ownerKind: SendFlowOwnerKind;
  phase: SendFlowLegacyPhase;
  banSentSuccess?: boolean;
}): SendFlowSurfaceExclusivity {
  const success = input.banSentSuccess === true;

  // SUCCESS preempts compose surfaces.
  if (success) {
    return {
      who: false,
      what: false,
      confirm: false,
      success: true,
      overlap: false,
    };
  }

  /**
   * WHAT only when owner is WHAT and legacy phase is still composingBan.
   */
  const what =
    input.ownerKind === 'WHAT' && input.phase === 'composingBan';

  /**
   * WHO only when owner is WHO and legacy is not on WHAT/CONFIRM.
   */
  const who =
    input.ownerKind === 'WHO' &&
    input.phase !== 'composingBan' &&
    input.phase !== 'confirming';

  /**
   * CONFIRM only when owner is CONFIRM and legacy phase is still confirming.
   * Phase gate keeps CONFIRM non-renderable if owner leaves before phase catches up.
   */
  const confirm =
    input.ownerKind === 'CONFIRM' && input.phase === 'confirming';

  const active = [who, what, confirm, success].filter(Boolean).length;
  return {
    who,
    what,
    confirm,
    success,
    overlap: active > 1,
  };
}
