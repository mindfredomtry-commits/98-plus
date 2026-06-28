export type OwnerDisplayWriteTraceContext = {
  clickedResultBanId: string | null;
  resultBanId: string | null;
  activeBanId: string | null;
  targetTab: string | null;
  bansOverlayOpen: boolean | null;
  notificationSessionActive: boolean | null;
};

const EMPTY_OWNER_DISPLAY_WRITE_TRACE_CONTEXT: OwnerDisplayWriteTraceContext =
  {
    clickedResultBanId: null,
    resultBanId: null,
    activeBanId: null,
    targetTab: null,
    bansOverlayOpen: null,
    notificationSessionActive: null,
  };

let ownerDisplayWriteTraceContext: OwnerDisplayWriteTraceContext = {
  ...EMPTY_OWNER_DISPLAY_WRITE_TRACE_CONTEXT,
};

export function patchOwnerDisplayWriteTraceContext(
  patch: Partial<OwnerDisplayWriteTraceContext>,
): OwnerDisplayWriteTraceContext {
  ownerDisplayWriteTraceContext = {
    ...ownerDisplayWriteTraceContext,
    ...patch,
  };
  return ownerDisplayWriteTraceContext;
}

export function getOwnerDisplayWriteTraceContext(): OwnerDisplayWriteTraceContext {
  return ownerDisplayWriteTraceContext;
}

export function resetOwnerDisplayWriteTraceContext(): void {
  ownerDisplayWriteTraceContext = {
    ...EMPTY_OWNER_DISPLAY_WRITE_TRACE_CONTEXT,
  };
}
