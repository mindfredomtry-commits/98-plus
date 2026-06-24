'use client';

import { readConfirmOrbDebugSnapshot } from '@/lib/confirm-orb-snapshot-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ZazhmiDomProbeContext = {
  phase: string | null;
  sendComposePhase: string | null;
  confirmActive: boolean;
  showLobbyOrb: boolean;
  lobbyOrbVisible: boolean;
  queueLen: number;
  pendingLen: number;
  overlayQueueLength: number;
  queueClaimsNotificationScreen: boolean;
};

const domProbeContext: ZazhmiDomProbeContext = {
  phase: null,
  sendComposePhase: null,
  confirmActive: false,
  showLobbyOrb: false,
  lobbyOrbVisible: false,
  queueLen: 0,
  pendingLen: 0,
  overlayQueueLength: 0,
  queueClaimsNotificationScreen: false,
};

let domProbeInstalled = false;
let lastDomProbeSig = '';

export function patchZazhmiDomProbeFields(
  patch: Partial<ZazhmiDomProbeContext>,
): void {
  Object.assign(domProbeContext, patch);
}

export function readZazhmiDomProbeContext(): ZazhmiDomProbeContext {
  const orb = readConfirmOrbDebugSnapshot();
  return {
    phase: domProbeContext.phase ?? orb?.phase ?? null,
    sendComposePhase:
      domProbeContext.sendComposePhase ?? orb?.sendComposePhase ?? null,
    confirmActive: domProbeContext.confirmActive || (orb?.confirmActive ?? false),
    showLobbyOrb: domProbeContext.showLobbyOrb || (orb?.showLobbyOrb ?? false),
    lobbyOrbVisible:
      domProbeContext.lobbyOrbVisible || (orb?.lobbyOrbVisible ?? false),
    queueLen: domProbeContext.queueLen,
    pendingLen: domProbeContext.pendingLen,
    overlayQueueLength: domProbeContext.overlayQueueLength,
    queueClaimsNotificationScreen: domProbeContext.queueClaimsNotificationScreen,
  };
}

type ZazhmiDomMatch = {
  node: Text | null;
  matchedText: string | null;
  exact: boolean;
};

function findZazhmiTextNode(): ZazhmiDomMatch {
  if (typeof document === 'undefined' || !document.body) {
    return { node: null, matchedText: null, exact: false };
  }

  const exactWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const raw = node.textContent ?? '';
        if (raw === 'Зажми' || raw.trim() === 'Зажми') {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  const exactNode = exactWalker.nextNode();
  if (exactNode) {
    return {
      node: exactNode as Text,
      matchedText: exactNode.textContent ?? 'Зажми',
      exact: true,
    };
  }

  const containsWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const raw = node.textContent ?? '';
        return raw.includes('Зажми')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );

  const containsNode = containsWalker.nextNode();
  if (containsNode) {
    return {
      node: containsNode as Text,
      matchedText: containsNode.textContent ?? null,
      exact: false,
    };
  }

  return { node: null, matchedText: null, exact: false };
}

function collectNearestDataAttrs(start: Element | null): Record<string, string> {
  const out: Record<string, string> = {};
  let cur: Element | null = start;
  let depth = 0;
  while (cur && depth < 6) {
    for (let i = 0; i < cur.attributes.length; i++) {
      const attr = cur.attributes.item(i);
      if (!attr?.name.startsWith('data-')) continue;
      if (!(attr.name in out)) out[attr.name] = attr.value;
    }
    cur = cur.parentElement;
    depth += 1;
  }
  return out;
}

function runZazhmiDomProbe(): void {
  const bodyText = document.body?.innerText ?? '';
  const bodyTextHasZazhmi = bodyText.includes('Зажми');
  if (!bodyTextHasZazhmi) return;

  const match = findZazhmiTextNode();
  const parent = match.node?.parentElement ?? null;
  const grandParent = parent?.parentElement ?? null;
  const ctx = readZazhmiDomProbeContext();

  const payload = {
    bodyTextHasZazhmi,
    matchedText: match.matchedText,
    exactTextMatch: match.exact,
    elementTag: parent?.tagName.toLowerCase() ?? null,
    elementClassName: parent?.className ?? null,
    parentClassName: grandParent?.className ?? null,
    grandParentClassName: grandParent?.parentElement?.className ?? null,
    nearestDataAttrs: collectNearestDataAttrs(parent),
    textNodeParentOuterHTML: parent?.outerHTML?.slice(0, 280) ?? null,
    phase: ctx.phase,
    sendComposePhase: ctx.sendComposePhase,
    confirmActive: ctx.confirmActive,
    showLobbyOrb: ctx.showLobbyOrb,
    lobbyOrbVisible: ctx.lobbyOrbVisible,
    queueLen: ctx.queueLen,
    pendingLen: ctx.pendingLen,
    overlayQueueLength: ctx.overlayQueueLength,
    queueClaimsNotificationScreen: ctx.queueClaimsNotificationScreen,
  };

  const sig = JSON.stringify(payload);
  if (sig === lastDomProbeSig) return;
  lastDomProbeSig = sig;

  emit('[ZAZHMI DOM PROBE]', payload);
}

export function installZazhmiDomProbe(
  providersPatch?: () => Partial<ZazhmiDomProbeContext>,
): void {
  if (typeof window === 'undefined') return;
  if (domProbeInstalled) return;
  domProbeInstalled = true;

  window.setInterval(() => {
    if (providersPatch) {
      patchZazhmiDomProbeFields(providersPatch());
    }
    runZazhmiDomProbe();
  }, 500);
}
