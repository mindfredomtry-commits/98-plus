/**
 * Send-flow full-screen exclusivity — pure predicates.
 * WHO / WHAT / CONFIRM / SUCCESS are mutually exclusive; at most one may render.
 */

export type SendFlowOwnerKind =
  | 'BOOT'
  | 'LOBBY'
  | 'WHO'
  | 'WHAT'
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
   * Owner is macro authority; phase gate keeps WHAT non-renderable during
   * atomic WHAT→WHO flushSync (phase selectingTarget before OPEN_WHO).
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
   * CONFIRM while legacy owns confirming and owner is not WHO/WHAT/BOOT.
   * LEGACY_FLOW (or LOBBY mid-edge) may host confirm until CONFIRM ownership.
   */
  const confirm =
    input.phase === 'confirming' &&
    input.ownerKind !== 'WHO' &&
    input.ownerKind !== 'WHAT' &&
    input.ownerKind !== 'BOOT';

  const active = [who, what, confirm, success].filter(Boolean).length;
  return {
    who,
    what,
    confirm,
    success,
    overlap: active > 1,
  };
}
