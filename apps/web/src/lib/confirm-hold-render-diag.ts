'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

const sigByEvent = new Map<string, string>();

function emitDeduped(event: string, data: Record<string, unknown>): void {
  const sig = JSON.stringify(data);
  if (sigByEvent.get(event) === sig) return;
  sigByEvent.set(event, sig);
  emit(event, data);
}

export type ConfirmRenderStateInput = {
  source: string;
  phase: string;
  screen: string;
  sendComposePhase: string | null;
  confirmActive: boolean;
  orbCompressActive: boolean;
  composeDismissing: boolean;
  selectedReceiverId: string | null;
  selectedReceiverLabel: string | null;
  selectedBanText: string;
  customTextLen: number;
  durationMinutes: number;
  sendStarted: boolean;
  sending: boolean;
  success: boolean;
  error: string | null;
  lowEnergyRedirecting: boolean;
  lowEnergyBlockedSignal: number;
  energyLoaded: boolean;
  influencePercent: number;
  canLobbySendBan: boolean;
  replyComposeActive: boolean;
  replySending: boolean;
  inFlight: boolean;
  sharing: boolean;
  banSentSuccess: boolean;
  lobbyBootIntroPrimed: boolean;
  lobbyOrbVisible: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  shouldRenderConfirmHoldOrb: boolean;
  queueClaimsNotificationScreen: boolean;
  overlayQueueLength: number;
  queueLen: number;
  pendingLen: number;
  statusLabel: string | null;
  enterPhase: string;
  holdPhase: string;
  enterComplete: boolean;
  holdButtonDisabled: boolean;
  renderOrbBlockers: string[];
  orbMountBlockedReason: string | null;
};

export function logConfirmRenderState(input: ConfirmRenderStateInput): void {
  emitDeduped('[CONFIRM RENDER STATE]', input);
}

export type ConfirmHoldButtonDecisionInput = {
  source: string;
  willRenderLobbyOrbWrap: boolean;
  willRenderConfirmHoldOrb: boolean;
  willRenderBootOrbWrap: boolean;
  willRenderArenaLobbyOrb: boolean;
  willRenderHoldStrip: boolean;
  willRenderHoldTextZazhmi: boolean;
  holdOrbMountBranch: 'confirm' | 'showLobbyOrb' | 'showBootOrb' | 'none';
  lobbyOrbVisible: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  lobbyBootIntroPrimed: boolean;
  queueClaimsNotificationScreen: boolean;
  renderOrbBlockers: string[];
  orbMountBlockedReason: string | null;
  confirmActive: boolean;
  persistentLogoVisible: boolean;
  confirmLayoutActive: boolean;
  orbOverlayDim: boolean;
  enterPhase: string;
  holdDisabled: boolean;
  holdBlockReason: string | null;
};

export function logConfirmHoldButtonDecision(
  input: ConfirmHoldButtonDecisionInput,
): void {
  emitDeduped('[CONFIRM HOLD BUTTON DECISION]', input);
}

export function logConfirmHoldComponentReturnNull(input: {
  source: string;
  reason: string;
  component: string;
  confirmActive: boolean;
  phase: string;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  lobbyOrbVisible: boolean;
  renderOrbBlockers: string[];
  orbMountBlockedReason: string | null;
  statusLabel: string | null;
}): void {
  emitDeduped('[CONFIRM HOLD COMPONENT RETURN NULL]', input);
}

export function logConfirmHoldComponentMounted(input: {
  source: string;
  component: string;
  confirmActive: boolean;
  sendPhase: string;
  enterPhase: string;
  holdPhase: string;
  showOrbFace: boolean;
  buttonDisabled: boolean;
  orbDebugId: string | null;
}): void {
  emit('[CONFIRM HOLD COMPONENT MOUNTED]', input);
}

export type ElementMeasure = {
  selector: string;
  found: boolean;
  width: number;
  height: number;
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
  inDom: boolean;
};

function measureEl(el: Element | null, selector: string): ElementMeasure {
  if (!el || typeof window === 'undefined') {
    return {
      selector,
      found: false,
      width: 0,
      height: 0,
      display: 'n/a',
      visibility: 'n/a',
      opacity: 'n/a',
      pointerEvents: 'n/a',
      inDom: false,
    };
  }
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return {
    selector,
    found: true,
    width: rect.width,
    height: rect.height,
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
    inDom: document.body.contains(el),
  };
}

export function logConfirmOrbContainerMeasure(input: {
  source: string;
  confirmActive: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  lobbyOrbMountRefAttached: boolean;
  measures: ElementMeasure[];
  title98PlusCount: number;
  zeroSizeTitle98Count: number;
}): void {
  emitDeduped('[CONFIRM ORB CONTAINER MEASURE]', input);
}

export function collectConfirmOrbContainerMeasures(
  lobbyOrbMountEl: HTMLElement | null,
): {
  measures: ElementMeasure[];
  title98PlusCount: number;
  zeroSizeTitle98Count: number;
} {
  if (typeof document === 'undefined') {
    return { measures: [], title98PlusCount: 0, zeroSizeTitle98Count: 0 };
  }

  const selectors = [
    { sel: 'lobbyOrbMountRef', el: lobbyOrbMountEl },
    {
      sel: '[data-arena-lobby-orb]',
      el: document.querySelector('[data-arena-lobby-orb]'),
    },
    {
      sel: '.instant-ban-confirm-hold-strip',
      el: document.querySelector('.instant-ban-confirm-hold-strip'),
    },
    {
      sel: '.instant-ban-arena-send__confirm-layer',
      el: document.querySelector('.instant-ban-arena-send__confirm-layer'),
    },
    {
      sel: '.lobby-screen__orb-wrap--confirm',
      el: document.querySelector('.lobby-screen__orb-wrap--confirm'),
    },
    {
      sel: '[data-persistent-lobby-logo-active]',
      el: document.querySelector('[data-persistent-lobby-logo-active]'),
    },
    {
      sel: '.lobby-persistent-logo-slot',
      el: document.querySelector('.lobby-persistent-logo-slot'),
    },
  ];

  const measures = selectors.map(({ sel, el }) =>
    measureEl(el, sel),
  );

  const titleNodes = Array.from(
    document.querySelectorAll('.lobby-screen__title'),
  );
  let zeroSizeTitle98Count = 0;
  for (const node of titleNodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) zeroSizeTitle98Count += 1;
    measures.push(measureEl(node, `.lobby-screen__title:${node.textContent?.trim() ?? ''}`));
  }

  return {
    measures,
    title98PlusCount: titleNodes.length,
    zeroSizeTitle98Count,
  };
}
