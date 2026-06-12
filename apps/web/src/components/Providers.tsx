'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import { flushSync } from 'react-dom';
import type {
  EnergyPopup,
  BanInteraction,
  BanResult,
  SessionState,
  FriendCard,
  ResultOpenMode,
  UserPublic,
} from '@98plus/shared';
import {
  ensureDirectOverboardOptimisticResult,
  isDirectOverboardOpenable,
  isValidBanResultPayload,
  parseStartParam,
  buildBanInteractionFromReplyPreview,
} from '@98plus/shared';
import {
  ANALYTICS_EVENTS,
  coerceFriendList,
  formatSenderDisplayName,
  SYSTEM_VOICE,
} from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { useTelegram } from '@/hooks/useTelegram';
import { isUserDataScoped } from '@/lib/user-data-scope';
import { explainIncomingHidden, logIncomingDebug } from '@/lib/incoming-debug';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useIncomingPoll } from '@/hooks/useIncomingPoll';
import { EnergyPopupStack } from './EnergyPopupStack';
import { IncomingBanOverlay } from './IncomingBanOverlay';
import { CheckOverlay } from './CheckOverlay';
import { ResultOverlay } from './ResultOverlay';
import { GlobalOverlayHost } from './GlobalOverlayHost';
import { NotificationQueueShell } from './NotificationQueueShell';
import { DirectOverboardResultLayer } from './DirectOverboardResultLayer';
import {
  overlayDelayCause,
  overlayDelayMs,
  overlayTs,
} from '@/lib/overlay-timing';
import {
  enqueueWithActiveLock,
  getActiveOverlayKey,
  hasCheckInQueue,
  overlayQueueKey,
  popOverlayHead,
  pruneOverlayQueue,
  removeOverlaysForBan,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { ShellErrorBoundary } from './ShellErrorBoundary';
import { resetScrollLock } from '@/lib/scroll-lock';
import { fetchSession } from '@/lib/session';
import { api, ApiError } from '@/lib/api';
import { challengeLog } from '@/lib/challenge-log';
import {
  logDeepLinkHandlerResult,
  noteDeepLinkHandlerOpened,
  readStartParamRawFromLocation,
} from '@/lib/deep-link-boot-debug';
import {
  armLocalOverboardBypass,
  clearLocalOverboardBypass,
  getLocalOverboardBypassBanId,
  getNotificationQueueLockReason,
  unlockNotificationQueue,
  isLocalOverboardBypassForBan,
  isNotificationQueueLocked,
  lockNotificationQueue,
  logOverlayPriority,
  logResultOpenAttempt,
  readPriorityStartParamRaw,
  registerResultOpenTraceContext,
  runWithExplicitResultUnlock,
  shouldBlockResultOpen,
  tryLockFromStartParam,
} from '@/lib/overlay-priority';
import {
  logOverboardDirectState,
  type OverboardDirectStateSnapshot,
} from '@/lib/overboard-direct-state';
import {
  FORCE_OPEN_OVERBOARD_IMPL_ID,
  logForceOverboard,
  logResultStateCleared,
  probeForceOpenRef,
} from '@/lib/force-overboard-debug';
import { logResultPath } from '@/lib/result-open-trace';
import {
  logReplyFlow,
  logReplyFlowLoopGuard,
  patchReplyHandoffDebug,
} from '@/lib/reply-handoff-debug';
import { logActiveBanDeeplink } from '@/lib/active-ban-deeplink-debug';
import {
  countQueuedOverlaysByKind,
  logQueueDebug,
} from '@/lib/queue-debug';
import {
  armPendingDeepLinkRouteFromStartParam,
  logOpenActiveBanCard,
  resolveActiveDeepLinkRouteBoot,
  resolvePendingDeepLinkRoute,
  dismissActiveBanDeepLinkRoute,
} from '@/lib/deep-link-route-boot';
import {
  incomingShowDecision,
  isValidIncomingOverlayPayload,
  shouldShowIncomingBanModal,
} from '@/lib/incoming-challenge';
import { acknowledgeIncomingFully } from '@/lib/incoming-ack-flow';
import {
  logDirectOverboardStateReset,
  markVisibleOverboardTrace,
  traceOverboardFlow,
  logOverboardResultForce,
  setOverboardEmergencyHint,
  type DirectOverboardGateSnapshot,
} from '@/lib/overboard-flow-debug';
import { postOverboardWithTrace } from '@/lib/overboard-api';
import {
  buildOptimisticOverboardResult,
  getOptimisticOverboardBuildDiagnostics,
  mergeOverboardResultUsers,
} from '@/lib/optimistic-overboard-result';
import type { OptimisticOverboardBuildContext } from '@/lib/optimistic-overboard-result';
import {
  logOverboardPaint,
  logOverboardTiming,
  markOverboardClickStart,
} from '@/lib/overboard-timing-debug';
import { RequestTimeoutError } from '@/lib/request-timeout';
import {
  logResultPresentation,
  logResultUi,
  resolveResultPresentation,
} from '@/lib/result-ui-debug';
import {
  type OptimisticSendWait,
  CHECK_WAITING_UI_TTL_MS,
  createOptimisticSendWait,
  isOptimisticSendWaitActive,
  mergeActiveBansWithOptimistic,
  mergeFriendsWithOptimistic,
  normalizeWaitUsername,
} from '@/lib/waiting-lifecycle';
import { isFirstBanComplete, markFirstBanComplete } from '@/lib/first-ban';
import { writeFriendsCache, readFriendsCache } from '@/lib/friends-cache';
import { readHomeSnapshot, writeHomeSnapshot } from '@/lib/home-snapshot';
import { enrichBanInteraction } from '@/lib/user-public-avatar';
import {
  getAuthReplyPreviewStash,
  subscribeAuthReplyPreviewEarly,
} from '@/lib/auth-reply-preview-stash';
import { mergeFriendsPreservingAvatars } from '@/lib/friend-avatar-merge';
import {
  preloadFriendAvatars,
  setAvatarPreloadCompleteListener,
  syncSeedCachedFriendAvatars,
} from '@/lib/avatar-preload';
import { markAvatarStartup } from '@/lib/avatar-startup-diag';
import { preloadAvatarUrls } from '@/lib/avatar-url';
import { afterKeyboardCollapse, blurActiveInputs } from '@/lib/keyboard-dismiss';
import {
  clearAvatarCaches,
  rememberFriendAvatar,
  rememberUserAvatar,
} from '@/lib/avatar-cache';
import { backfillAcknowledgedIncomingOnce } from '@/lib/incoming-backfill';
import { hydrateAcknowledgedIncomingIds } from '@/lib/acknowledged-incoming';
import {
  evaluateOverlayEnqueue,
  filterOverlayQueueByTtl,
  logOverlayArbiter,
  mergeStartupPendingSingle,
  OVERLAY_SHOW_NEXT_DELAY_MS,
} from '@/lib/overlay-arbiter';
import { installOverlayDismissCacheDevHelper } from '@/lib/overlay-dismiss-cache-dev';
import { logResultNav, logResultReply } from '@/lib/result-reply-debug';
import { resolveResultReplyOpponent } from '@/lib/result-reply-flow';
import {
  hydrateAnsweredCheckIds,
  markCheckAnsweredLocally,
} from '@/lib/answered-checks';
import {
  checkShowDecision,
  pickCheckForOverlay,
  shouldShowCheckOverlay,
} from '@/lib/check-overlay';
import { useCheckPoll } from '@/hooks/useCheckPoll';
import { getCheckViewerRole } from '@98plus/shared';
import { timingLog, timingStart } from '@/lib/timing-log';
import { logFriendsTiming } from '@/lib/boot-timing';
import {
  acknowledgeBanResultOnServer,
  diagnoseResultShow,
  dismissBanResultLocally,
  shouldShowBanResult,
} from '@/lib/ban-result-flow';
import {
  logResultLatency,
  resultElapsedSinceSubmit,
  resultParticipantRole,
} from '@/lib/result-latency-diag';
import {
  hydrateDismissedResultIds,
  isDismissedResultLocally,
} from '@/lib/dismissed-results';
import {
  buildReplyDeeplinkShellBan,
  REPLY_DEEPLINK_FAST_TIMEOUT_MS,
  buildReplyPrefillLookup,
  resolveReplyFastCachedBan,
  resolveReplyPrefillBan,
  diagnoseReplyPrefillSources,
  buildReplyPrefillMissDetail,
  canReplyFastEnableButtons,
  hasReplyFastDisplayText,
  isReplyDeeplinkShellBan,
} from '@/lib/reply-deeplink-fast';
import {
  resolveConnectionUiState,
  STARTUP_GRACE_MS,
  type ConnectionUiState,
} from '@/lib/connection-ui';

interface AppContextValue {
  token: string | null;
  user: ReturnType<typeof useAuth>['user'];
  loading: boolean;
  /** True when Telegram user matches backend /users/me. */
  authReady: boolean;
  /** True when friends/session state belongs to current auth user. */
  isAppReady: boolean;
  /** Initial /friends fetch finished (or cache hydrated). */
  friendsReady: boolean;
  /** HomeArena can render from local snapshot without waiting network. */
  homeSnapshotReady: boolean;
  /** First session fetch finished — incoming gate can resolve. */
  sessionReady: boolean;
  /** Incoming modal blocks main arena until dismissed. */
  incomingGateActive: boolean;
  /** True while overlay queue has items — keeps notification session (dim) between cards. */
  notificationSessionActive: boolean;
  activeOverlayKind: 'incoming' | 'check' | 'result' | null;
  markOverlayUserAction: (kind: string, banId?: string) => void;
  reportOverlayRendered: (kind: string, banId: string, buttonsReady?: boolean) => void;
  /** Dev-only: last overlay handoff timing from reportOverlayRendered. */
  overlayHandoffDebug: { delayMs: number; cause: string } | null;
  error: string | null;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
  incomingBan: BanInteraction | null;
  setIncomingBan: (b: BanInteraction | null) => void;
  dismissIncoming: (banId?: string) => void;
  acknowledgeIncomingAndStartReply: (ban: BanInteraction) => void;
  acknowledgeIncomingSeen: (banId: string) => Promise<void>;
  checkBan: BanInteraction | null;
  checkGateActive: boolean;
  setCheckBan: (b: BanInteraction | null) => void;
  /** Telegram check deep link — opens check overlay immediately (not lobby). */
  openDeepLinkCheck: (b: BanInteraction) => void;
  /** Telegram repeat-ban deep link — opens confirm for the same challenge. */
  deepLinkRepeatBan: BanInteraction | null;
  openDeepLinkRepeat: (b: BanInteraction) => void;
  clearDeepLinkRepeatBan: () => void;
  /** Telegram reply-ban deep link — opens What with sender pre-selected. */
  deepLinkReplyBan: BanInteraction | null;
  openDeepLinkReply: (b: BanInteraction) => Promise<void>;
  clearDeepLinkReplyBan: () => void;
  /** Telegram active-ban deep link — opens active ban card with timer. */
  deepLinkActiveBan: BanInteraction | null;
  openDeepLinkActive: (b: BanInteraction) => void;
  clearDeepLinkActiveBan: () => void;
  /** Exit active-ban deep link shell when user sends another ban from that card. */
  clearActiveBanDeepLinkShell: (source?: string) => void;
  /** Sender "Ты запретил" deep link — block lobby until active card is visible. */
  activeBanUiShellActive: boolean;
  activeBanDeepLinkBanId: string | null;
  notifyActiveBanCardVisible: (banId: string) => void;
  overlayQueueLength: number;
  deepLinkSelectedBanId: string | null;
  /** Latched true when a deep-link send/active flow should keep lobby closed. */
  sendFlowOpen: boolean;
  openSendFlow: () => void;
  closeSendFlow: () => void;
  deepLinkReplyBooting: boolean;
  setDeepLinkReplyBooting: (v: boolean) => void;
  /** Reply deep link: optimistic incoming card shell before /open returns. */
  replyDeeplinkFastShell: boolean;
  abortReplyDeepLinkFast: (reason: string) => void;
  /** Reply deep link: block lobby render until What is ready. */
  replyUiShellActive: boolean;
  /** Dark transition shell — hidden while incoming card is on screen. */
  replyUiShellDark: boolean;
  replyDeepLinkBanId: string | null;
  replyHandoffLock: boolean;
  armReplyDeepLink: (banId: string) => void;
  beginReplyHandoff: (banId: string) => void;
  notifyReplyWhatVisible: (banId: string, selectedUserId: string | null) => void;
  releaseReplyHandoffLock: () => void;
  submitCheckAnswer: (
    banId: string,
    completed: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  submitIncomingOverboard: (
    ban: BanInteraction,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Sync optimistic result open — call directly from overboard click handler. */
  openIncomingOverboardOptimistic: (
    ban: BanInteraction,
    clickTs?: number,
    opts?: { fallbackBans?: BanInteraction[] },
  ) => boolean;
  /** POST /overboard after optimistic result is already visible. */
  runIncomingOverboardApi: (
    ban: BanInteraction,
    clickTs?: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  checkWaiting: boolean;
  setCheckWaiting: (v: boolean) => void;
  result: BanResult | null;
  openBanResult: (r: BanResult | null | undefined, mode: ResultOpenMode) => void;
  dismissBanResult: () => void;
  /** Result card → What with opponent pre-selected (overboard / check outcomes). */
  startReplyFromResult: (r: BanResult) => void;
  /** Result card → next overlay or lobby («К запретам»). */
  navigateFromResult: () => void;
  resultReplyPending: { banId: string; opponent: UserPublic } | null;
  resultReplyRequest: number;
  resultReplyHandoffLock: boolean;
  notifyResultReplyWhatVisible: (
    banId: string,
    selectedUserId: string | null,
  ) => void;
  popups: EnergyPopup[];
  pushPopup: (p: EnergyPopup) => void;
  activeBans: BanInteraction[];
  friends: FriendCard[];
  sendOpen: boolean;
  setSendOpen: (v: boolean) => void;
  sendReceiver: string;
  setSendReceiver: (v: string) => void;
  sendText: string;
  setSendText: (v: string) => void;
  sendDuration: number;
  setSendDuration: (v: number) => void;
  openSendTo: (receiver: string, text?: string) => void;
  /** Opens send sheet to reply to a pending incoming ban (uses /reply API). */
  startIncomingReply: (ban: BanInteraction) => void;
  incomingReplyBanId: string | null;
  /** Parent ban id for /bans/:id/reply — survives incoming-card consume. */
  replyToBanId: string | null;
  /** True while What/Confirm compose is open for a reply (before POST). */
  replyComposeActive: boolean;
  /** Ref-backed parent ban id — read at send time to avoid stale React state. */
  getPinnedReplyToBanId: () => string | null;
  clearIncomingReply: (opts?: { finalizeBanId?: string }) => void;
  applySession: (s: SessionState) => void;
  reloadPending: () => Promise<void>;
  reloadFriends: () => Promise<void>;
  wsStatus: ReturnType<typeof useWebSocket>['status'];
  connectionUiState: ConnectionUiState;
  networkBootstrapCompleted: boolean;
  hasSuccessfulNetworkSync: boolean;
  eventLog: string[];
  viralOnboarding: boolean;
  banSentOpen: boolean;
  setBanSentOpen: (v: boolean) => void;
  /** Blur keyboard, clear ban text, then open success modal after viewport settles. */
  completeBanSendSuccess: () => void;
  /** Queue session/friends refresh until success modal closes. */
  scheduleDeferredSync: () => void;
  optimisticSendWait: OptimisticSendWait | null;
  applyOptimisticSend: (params: {
    username: string;
    firstName?: string;
    banText: string;
    durationMinutes: number;
  }) => void;
  confirmOptimisticSend: (username: string) => void;
  rollbackOptimisticSend: (params: {
    username: string;
    message: string;
  }) => void;
  clearCheckOverlay: () => void;
  showFirstBanOnboarding: boolean;
  completeFirstBan: () => void;
  inlineBanError: string | null;
  setInlineBanError: (msg: string | null) => void;
  banInputShake: boolean;
  triggerBanInputShake: () => void;
  /** Ritual entry gate — blocks challenge overlays until dismissed. */
  lobbyOpen: boolean;
  closeLobby: () => void;
  openLobby: (source?: string) => void;
  /** Full reset of reply deep-link latch (ban id, handoff, incoming reply). */
  clearReplyDeepLinkState: () => void;
  /** Opens InstantBan Who screen for a new ban (increments on each request). */
  newBanWhoFlowRequest: number;
  openNewBanWhoFlow: () => void;
  /** Opens BansOverlay from result card «К запретам» (increments on each request). */
  openBansOverlayRequest: number;
  /** Closes BansOverlay when result-cta navigation intent is cleared. */
  closeBansOverlayRequest: number;
  /** Provider latch: InstantBanFlow must open BansOverlay while direct result closes. */
  resultCtaBansOverlayOpen: boolean;
  clearResultCtaBansOverlayOpen: () => void;
  /** Hides notification queue while BansOverlay opened from direct overboard CTA. */
  bansCtaQueueSuppress: boolean;
  clearBansCtaQueueSuppress: () => void;
  bansNavState: BansNavState;
  armBansNavFromResultCta: () => void;
  resetBansNavState: () => void;
  /** Blocks page shell effects from closing lobby during bans→lobby return. */
  bansReturnToLobbyLatch: boolean;
  setBansReturnToLobbyLatch: (active: boolean) => void;
  /** Closes result-cta bans session: open lobby before queue/result reset. */
  completeBansOverlayCloseFromResultCta: (source?: string) => boolean;
  /** Accumulated pre-open interactions waiting for ritual release. */
  pendingStartupInteractions: boolean;
  /** Release queued startup interactions (e.g. after opening «Твои запреты»). */
  releaseStartupInteractions: (opts?: {
    requireBanSend?: boolean;
    force?: boolean;
  }) => void;
  /** Mark first successful ban send in this session (InstantBan success path). */
  markSessionBanSendSuccess: () => void;
  /** Lock overlay queue before active-ban API returns (start_param a_*). */
  armActiveBanDeepLinkEarly: (banId: string) => void;
  /** Unlock overlay queue and flush deferred pending overlays. */
  unlockNotificationQueueAndFlush: (reason: string) => void;
}

export type BansNavOrigin = 'lobby' | 'result-cta';

export type BansNavState = {
  origin: BansNavOrigin;
  previousScreen: 'lobby';
  returnTarget: 'lobby';
};

export const DEFAULT_BANS_NAV: BansNavState = {
  origin: 'lobby',
  previousScreen: 'lobby',
  returnTarget: 'lobby',
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside Providers');
  return ctx;
}

/** WS energy toast for overboard — full ResultOverlay replaces it. */
function isOverboardEnergyPopup(p: EnergyPopup): boolean {
  const msg = p.message?.trim();
  if (!msg) return false;
  return msg === SYSTEM_VOICE.overboard || msg.includes('ПЕРЕБОР');
}

function pickIncomingForOverlay(
  ban: BanInteraction | null | undefined,
  dismissed: Set<string>,
  viewerId: string | null | undefined,
): BanInteraction | null {
  if (!shouldShowIncomingBanModal(ban, viewerId, dismissed)) return null;
  return enrichBanInteraction(ban!);
}

function enrichSessionState(s: SessionState): SessionState {
  return {
    ...s,
    incoming: s.incoming ? enrichBanInteraction(s.incoming) : s.incoming,
    check: s.check ? enrichBanInteraction(s.check) : s.check,
    active: Array.isArray(s.active)
      ? s.active.map((b) => enrichBanInteraction(b))
      : [],
  };
}

function applySessionToState(
  s: SessionState,
  setters: {
    setActiveBans: (b: BanInteraction[]) => void;
    setCheckWaiting: (v: boolean) => void;
  },
) {
  const session = enrichSessionState(s);
  setters.setActiveBans(Array.isArray(session.active) ? session.active : []);
  if (!session.needsOnboardingRecovery) {
    setters.setCheckWaiting(false);
  }
}

/** Hard remount on Telegram account switch — wipes in-memory friends/session. */
export function Providers({ children }: { children: React.ReactNode }) {
  const { telegramId } = useTelegram();

  const scopeKey = telegramId != null ? `tg:${telegramId}` : 'tg:pending';
  console.log('[boot]', { phase: 'providers-mount', scopeKey, telegramId });

  return <ProvidersBody key={scopeKey}>{children}</ProvidersBody>;
}

function ProvidersBody({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  console.log('[providers-render]', {
    userId: auth.user?.id ?? null,
    authReady: auth.authReady,
    loading: auth.loading,
  });
  const [dataOwnerUserId, setDataOwnerUserId] = useState<string | null>(null);
  const [incomingBan, setIncomingBan] = useState<BanInteraction | null>(null);
  const [checkBan, setCheckBan] = useState<BanInteraction | null>(null);
  const [checkWaiting, setCheckWaiting] = useState(false);
  const [result, setResult] = useState<BanResult | null>(null);
  const resultRef = useRef<BanResult | null>(null);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  const [overlayQueue, setOverlayQueue] = useState<QueuedOverlay[]>([]);
  const overlayQueueRef = useRef<QueuedOverlay[]>([]);
  const activeOverlayLockRef = useRef<string | null>(null);
  const overlayQueueDrainActiveRef = useRef(false);
  const overlayActionTsRef = useRef<number | null>(null);
  const overlayHandoffTsRef = useRef<number | null>(null);
  const [overlayHandoffDebug, setOverlayHandoffDebug] = useState<{
    delayMs: number;
    cause: string;
  } | null>(null);
  const pendingStartupInteractionsRef = useRef<QueuedOverlay[]>([]);
  const startupInteractionsHoldRef = useRef(true);
  const sessionBanSendSuccessRef = useRef(false);
  const [pendingStartupInteractionsCount, setPendingStartupInteractionsCount] =
    useState(0);

  const [popups, setPopups] = useState<EnergyPopup[]>([]);
  const [activeBans, setActiveBans] = useState<BanInteraction[]>([]);
  const sessionActiveBansRef = useRef<BanInteraction[]>([]);
  useEffect(() => {
    sessionActiveBansRef.current = activeBans;
  }, [activeBans]);
  // Isolation: until auth.user is confirmed, never show cached friends from another Telegram user.
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReceiver, setSendReceiver] = useState('');
  const [sendText, setSendText] = useState('');
  const [sendDuration, setSendDuration] = useState(10);
  const [incomingReplyBanId, setIncomingReplyBanId] = useState<string | null>(
    null,
  );
  const [viralOnboarding, setViralOnboarding] = useState(false);
  const [banSentOpen, setBanSentOpenRaw] = useState(false);
  const [uiFreeze, setUiFreeze] = useState<{
    friends: FriendCard[];
    activeBans: BanInteraction[];
    optimisticSendWait: OptimisticSendWait | null;
  } | null>(null);
  const [optimisticSendWait, setOptimisticSendWait] =
    useState<OptimisticSendWait | null>(null);
  const [firstBanComplete, setFirstBanComplete] = useState(false);
  const [inlineBanError, setInlineBanError] = useState<string | null>(null);
  const [banInputShake, setBanInputShake] = useState(false);
  const [friendsBootstrapped, setFriendsBootstrapped] = useState(false);
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false);
  const [homeSnapshotReady, setHomeSnapshotReady] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(true);
  const [openBansOverlayRequest, setOpenBansOverlayRequest] = useState(0);
  const [closeBansOverlayRequest, setCloseBansOverlayRequest] = useState(0);
  const [resultCtaBansOverlayOpen, setResultCtaBansOverlayOpen] =
    useState(false);
  const [bansCtaQueueSuppress, setBansCtaQueueSuppress] = useState(false);
  const [bansNavState, setBansNavState] = useState<BansNavState>(DEFAULT_BANS_NAV);
  const [bansReturnToLobbyLatch, setBansReturnToLobbyLatch] = useState(false);
  const lobbyOpenRef = useRef(true);
  const lobbyShownLoggedRef = useRef(false);
  const [, setAvatarPreloadEpoch] = useState(0);
  const [startupGraceActive, setStartupGraceActive] = useState(true);
  const [networkBootstrapCompleted, setNetworkBootstrapCompleted] =
    useState(false);
  const [hasSuccessfulNetworkSync, setHasSuccessfulNetworkSync] =
    useState(false);
  const [initialNetworkBootstrapAttempted, setInitialNetworkBootstrapAttempted] =
    useState(false);
  const [wsHasConnectedOnce, setWsHasConnectedOnce] = useState(false);
  const [navigatorOffline, setNavigatorOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const triggerBanInputShake = useCallback(() => {
    setBanInputShake(true);
    window.setTimeout(() => setBanInputShake(false), 500);
  }, []);

  const dismissedIncomingRef = useRef<Set<string>>(new Set());
  const dismissedCheckSessionRef = useRef<Set<string>>(new Set());
  const answeredCheckRef = useRef<Set<string>>(new Set());
  const checkAnswerInFlightRef = useRef<Set<string>>(new Set());
  const resultOpenRef = useRef(false);
  const overboardInFlightRef = useRef<string | null>(null);
  type ForceOpenOverboardFn = (
    payload: BanResult,
    banId: string,
    clickTs?: number | null,
    opts?: { source?: 'local-overboard-click' | 'api-sync' | 'recovery' },
  ) => boolean;
  const forceOpenOverboardLatestImplRef = useRef<ForceOpenOverboardFn | null>(
    null,
  );
  const forceOpenOverboardResultRef = useRef<ForceOpenOverboardFn>(
    function forceOpenOverboardResultStub(
      _payload: BanResult,
      banId: string,
    ): boolean {
      markVisibleOverboardTrace('FORCE-STUB-INVOKED', {
        banId,
        implId: 'stub',
      });
      return false;
    },
  );
  const assignForceOpenOverboardRef = useCallback((impl: ForceOpenOverboardFn) => {
    Object.assign(impl, {
      __forceOpenImplId: FORCE_OPEN_OVERBOARD_IMPL_ID,
    });
    forceOpenOverboardLatestImplRef.current = impl;
    forceOpenOverboardResultRef.current = impl;
    markVisibleOverboardTrace('FORCE-REF-ASSIGNED', {
      typeofImpl: typeof impl,
      implName: impl.name || '(anonymous)',
      implId: FORCE_OPEN_OVERBOARD_IMPL_ID,
    });
  }, []);
  const directResultOverlayRef = useRef(false);
  const directResultOverlayActiveRef = useRef(false);
  const resultBanIdRef = useRef<string | null>(null);
  const displayResultBanIdRef = useRef<string | null>(null);
  const showDirectOverboardLayerRef = useRef(false);
  const commitDirectOverboardLayerRefs = useCallback(
    (banId: string, active: boolean) => {
      directResultOverlayRef.current = active;
      directResultOverlayActiveRef.current = active;
      resultOpenRef.current = active;
      resultBanIdRef.current = active ? banId : null;
      displayResultBanIdRef.current = active ? banId : null;
      showDirectOverboardLayerRef.current = active;
    },
    [],
  );
  const clearDirectOverboardLayerRefs = useCallback(() => {
    directResultOverlayRef.current = false;
    directResultOverlayActiveRef.current = false;
    resultOpenRef.current = false;
    resultBanIdRef.current = null;
    displayResultBanIdRef.current = null;
    showDirectOverboardLayerRef.current = false;
  }, []);
  const snapshotDirectOverboardGate =
    useCallback((): DirectOverboardGateSnapshot => {
      return {
        directResultOverlayActive: directResultOverlayActiveRef.current,
        directResultOverlayRef: directResultOverlayRef.current,
        resultBanId: resultBanIdRef.current ?? resultRef.current?.id ?? null,
        showDirectOverboardLayer: showDirectOverboardLayerRef.current,
        hasResult: resultRef.current != null,
      };
    }, []);
  const armBansNavFromResultCtaRef = useRef<() => void>(() => {});
  const bansNavStateRef = useRef<BansNavState>(DEFAULT_BANS_NAV);
  const bansCtaQueueSuppressRef = useRef(false);
  const bansReturnToLobbyLatchRef = useRef(false);
  const completeBansCloseFromResultCtaRef = useRef<() => boolean>(() => false);
  const requestOpenBansFromResultCtaRef = useRef<(banId: string | null) => void>(
    () => {},
  );
  const openLobbyRef = useRef<(source?: string) => void>(() => {});
  const resultCtaBansOverlayOpenRef = useRef(false);
  const openBansOverlayRequestRef = useRef(0);

  const isDirectOverboardLocallyActive = useCallback(() => {
    return (
      directResultOverlayActiveRef.current ||
      directResultOverlayRef.current ||
      overboardInFlightRef.current != null ||
      getLocalOverboardBypassBanId() != null
    );
  }, []);
  /** Last auth user id we already ran providers-reset for (avoids deps-only reruns). */
  const providersResetForUserIdRef = useRef<string | null | undefined>(undefined);
  const [directResultOverlayActive, setDirectResultOverlayActive] =
    useState(false);
  const [overboardTransitionActive, setOverboardTransitionActive] =
    useState(false);
  const bufferedIncomingRef = useRef<BanInteraction | null>(null);
  const bufferedCheckDeepLinkRef = useRef<BanInteraction | null>(null);
  const bufferedRepeatDeepLinkRef = useRef<BanInteraction | null>(null);
  const bufferedReplyDeepLinkRef = useRef<BanInteraction | null>(null);
  const bufferedActiveDeepLinkRef = useRef<BanInteraction | null>(null);
  const [deepLinkRepeatBan, setDeepLinkRepeatBan] = useState<BanInteraction | null>(
    null,
  );
  const [deepLinkReplyBan, setDeepLinkReplyBan] = useState<BanInteraction | null>(
    null,
  );
  const [deepLinkActiveBan, setDeepLinkActiveBan] = useState<BanInteraction | null>(
    null,
  );
  const [activeBanDeepLinkBanId, setActiveBanDeepLinkBanId] = useState<string | null>(
    null,
  );
  const [activeBanCardReady, setActiveBanCardReady] = useState(false);
  const activeBanCardVisibleRef = useRef(false);
  const [sendFlowOpen, setSendFlowOpen] = useState(false);
  const [deepLinkReplyBooting, setDeepLinkReplyBooting] = useState(false);
  const [replyDeeplinkFastShell, setReplyDeeplinkFastShell] = useState(false);
  const replyDeeplinkPendingBanIdRef = useRef<string | null>(null);
  const replyDeeplinkFastOpenedRef = useRef(false);
  const replyDeeplinkFastShellRef = useRef(false);
  const replyDeeplinkPrefetchRef = useRef(false);
  const bootClaimedIncomingRef = useRef<BanInteraction | null>(null);
  const bootReplyDeeplinkPreviewRef = useRef<BanInteraction | null>(null);
  const replyStartParamPreviewBanRef = useRef<BanInteraction | null>(null);
  const replyStartParamPreviewRawRef = useRef<
    import('@98plus/shared').ReplyStartParamPreview | null
  >(null);
  const lastSessionIncomingRef = useRef<BanInteraction | null>(null);
  const replyDeeplinkFastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const replyDeepLinkBanIdRef = useRef<string | null>(null);
  const replyDeeplinkFastWrittenAtRef = useRef<number | null>(null);
  const replyDeeplinkFastWrittenBanIdRef = useRef<string | null>(null);
  const replyDeeplinkFastHydratedRef = useRef(false);
  const replyDeeplinkPrefillBanRef = useRef<BanInteraction | null>(null);
  const incomingConsumedAfterAnswerRef = useRef<Set<string>>(new Set());
  const replyToBanIdPersistRef = useRef<string | null>(null);
  const incomingReplyComposeDismissedRef = useRef<Set<string>>(new Set());
  const [replyToBanId, setReplyToBanId] = useState<string | null>(null);
  const [replyComposeActive, setReplyComposeActive] = useState(false);
  const [replyDeepLinkBanId, setReplyDeepLinkBanId] = useState<string | null>(null);
  const [replyHandoffLock, setReplyHandoffLock] = useState(false);
  const [replyWhatReady, setReplyWhatReady] = useState(false);
  const [resultReplyPending, setResultReplyPending] = useState<{
    banId: string;
    opponent: UserPublic;
  } | null>(null);
  const [resultReplyRequest, setResultReplyRequest] = useState(0);
  const [resultReplyHandoffLock, setResultReplyHandoffLock] = useState(false);
  const [resultReplyWhatReady, setResultReplyWhatReady] = useState(true);
  const replyFlowArmedBanIdRef = useRef<string | null>(null);
  const replyLockReleasedRef = useRef(false);
  const openSendFlow = useCallback(() => {
    setSendFlowOpen(true);
    setLobbyOpen(false);
  }, []);
  const closeSendFlow = useCallback(() => {
    setSendFlowOpen(false);
  }, []);

  const pinReplyToBanId = useCallback((banId: string | null) => {
    replyToBanIdPersistRef.current = banId;
    setReplyToBanId(banId);
    if (!banId) {
      setReplyComposeActive(false);
    }
  }, []);

  const getPinnedReplyToBanId = useCallback(
    () => replyToBanIdPersistRef.current,
    [],
  );

  const armReplyDeepLink = useCallback((banId: string) => {
    if (activeBanDeepLinkBanId != null || activeBanCardVisibleRef.current) {
      logActiveBanDeeplink('wrong-reply-flow-blocked', {
        payload: `a_${activeBanDeepLinkBanId ?? banId}`,
        banId: activeBanDeepLinkBanId ?? banId,
      });
      return;
    }
    if (replyLockReleasedRef.current) {
      logReplyFlowLoopGuard('skip arm after release');
      return;
    }
    if (replyFlowArmedBanIdRef.current === banId) {
      logReplyFlowLoopGuard('skip already armed');
      return;
    }
    replyFlowArmedBanIdRef.current = banId;
    pinReplyToBanId(banId);
    setReplyDeepLinkBanId((prev) => (prev === banId ? prev : banId));
    setIncomingReplyBanId((prev) => (prev === banId ? prev : banId));
    setReplyWhatReady((prev) => (prev ? false : prev));
    setReplyHandoffLock((prev) => (prev ? prev : true));
    logReplyFlow('telegram-open-start', {
      banId,
      lockActive: true,
      lobbyOpen: lobbyOpen,
    });
  }, [lobbyOpen, activeBanDeepLinkBanId, pinReplyToBanId]);

  const beginReplyHandoff = useCallback((banId: string) => {
    if (replyLockReleasedRef.current) {
      logReplyFlowLoopGuard('skip handoff after release');
      return;
    }
    setReplyHandoffLock((prev) => (prev ? prev : true));
    setReplyWhatReady((prev) => (prev ? false : prev));
    logReplyFlow('card-reply-click', {
      banId,
      lockActive: true,
      acceptPending: true,
      lobbyOpen: lobbyOpen,
    });
  }, [lobbyOpen]);

  const notifyReplyWhatVisible = useCallback(
    (banId: string, selectedUserId: string | null) => {
      if (replyLockReleasedRef.current) {
        logReplyFlowLoopGuard('skip already released');
        return;
      }
      replyLockReleasedRef.current = true;
      logReplyFlowLoopGuard('release once');
      setReplyWhatReady((prev) => (prev ? prev : true));
      setReplyHandoffLock((prev) => (prev ? false : prev));
      setDeepLinkReplyBooting((prev) => (prev ? false : prev));
      logReplyFlow('what-visible', {
        banId,
        lockActive: false,
        selectedUserId,
        phase: 'composingBan',
        instantBanOpen: true,
        lobbyOpen: lobbyOpen,
      });
      logReplyFlow('lock-released', {
        banId,
        lockActive: false,
        selectedUserId,
        phase: 'composingBan',
        lobbyOpen: lobbyOpen,
      });
    },
    [lobbyOpen],
  );

  const releaseReplyHandoffLock = useCallback(() => {
    if (replyLockReleasedRef.current) {
      logReplyFlowLoopGuard('skip already released');
      return;
    }
    replyLockReleasedRef.current = true;
    logReplyFlowLoopGuard('release once');
    setReplyHandoffLock((prev) => (prev ? false : prev));
    setReplyWhatReady((prev) => (prev ? prev : true));
    setDeepLinkReplyBooting((prev) => (prev ? false : prev));
    logReplyFlow('lock-released', {
      banId: replyDeepLinkBanId,
      lockActive: false,
      lobbyOpen: lobbyOpen,
    });
  }, [lobbyOpen, replyDeepLinkBanId]);

  const incomingWsSeenRef = useRef<Set<string>>(new Set());
  const incomingBanRef = useRef<BanInteraction | null>(null);
  const checkBanRef = useRef<BanInteraction | null>(null);
  const checkWsSeenRef = useRef<Set<string>>(new Set());
  const resultDeliveredBanIdsRef = useRef<Set<string>>(new Set());
  const resultCtaConsumedBanIdsRef = useRef<Set<string>>(new Set());
  const checkSubmitAtRef = useRef<Map<string, number>>(new Map());
  const resultPollBurstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shownOverlayKeysRef = useRef<Set<string>>(new Set());
  const locallyAckedIncomingRef = useRef<Set<string>>(new Set());
  const deepLinkBlockedRef = useRef(false);
  const reloadPendingRef = useRef<() => Promise<void>>(async () => {});
  const overlayShowNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const activeBanDeepLinkBanIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBanDeepLinkBanIdRef.current = activeBanDeepLinkBanId;
  }, [activeBanDeepLinkBanId]);

  const suppressQueuedOverlayDisplay = useCallback(() => {
    if (!isNotificationQueueLocked()) return;
    if (getLocalOverboardBypassBanId() != null) {
      return;
    }
    if (
      directResultOverlayRef.current &&
      overboardInFlightRef.current != null
    ) {
      return;
    }
    logResultOpenAttempt('syncDisplayFromQueue', {
      resultId: result?.id ?? null,
      allowed: false,
      blockReason: 'suppress-queued-display',
    });
    logResultStateCleared('syncDisplayFromQueue', {
      banId: result?.id ?? null,
      reason: 'suppress-queued-display',
    });
    const gateBefore = snapshotDirectOverboardGate();
    clearDirectOverboardLayerRefs();
    setResult(null);
    setDirectResultOverlayActive(false);
    logDirectOverboardStateReset({
      source: 'suppressQueuedOverlayDisplay',
      reason: 'suppress-queued-display',
      before: gateBefore,
      after: {
        directResultOverlayActive: false,
        directResultOverlayRef: false,
        resultBanId: null,
        showDirectOverboardLayer: false,
        hasResult: false,
      },
    });
  }, [clearDirectOverboardLayerRefs, result?.id, snapshotDirectOverboardGate]);

  const armActiveBanDeepLinkEarly = useCallback((banId: string) => {
    armPendingDeepLinkRouteFromStartParam('armActiveBanDeepLinkEarly');
    lockNotificationQueue('deep-link-active-ban', banId);
    logOverlayPriority('deep-link-active-start', { banId });
    activeBanCardVisibleRef.current = false;
    setActiveBanCardReady(false);
    setActiveBanDeepLinkBanId(banId);
    setLobbyOpen(false);
    suppressQueuedOverlayDisplay();
  }, [suppressQueuedOverlayDisplay]);

  useLayoutEffect(() => {
    const syncReplyStartParamPreview = (viewerId: string | null | undefined) => {
      if (!viewerId) return;
      const rawPreview = replyStartParamPreviewRawRef.current;
      if (!rawPreview) return;
      const banId =
        replyDeeplinkPendingBanIdRef.current ??
        replyDeepLinkBanIdRef.current ??
        null;
      if (!banId) return;
      replyStartParamPreviewBanRef.current = enrichBanInteraction(
        buildBanInteractionFromReplyPreview(banId, rawPreview, viewerId),
      );
      console.log('[REPLY START_PARAM PREVIEW PARSED]', {
        banId,
        hasText: !!rawPreview.text?.trim(),
        hasSender: !!rawPreview.senderId,
      });
      markVisibleOverboardTrace('[REPLY START_PARAM PREVIEW PARSED]', {
        banId,
        hasText: !!rawPreview.text?.trim(),
        hasSender: !!rawPreview.senderId,
      });
    };

    if (tryLockFromStartParam('providers-layout')) {
      const action = parseStartParam(readPriorityStartParamRaw() ?? undefined);
      if (action?.type === 'active') {
        armActiveBanDeepLinkEarly(action.banId);
      }
      if (action?.type === 'reply') {
        replyDeeplinkPendingBanIdRef.current = action.banId;
        if (action.preview?.text?.trim()) {
          replyStartParamPreviewRawRef.current = action.preview;
          syncReplyStartParamPreview(
            userIdRef.current ?? auth.user?.id ?? null,
          );
        }
      }
    } else {
      const action = parseStartParam(readPriorityStartParamRaw() ?? undefined);
      if (action?.type === 'reply') {
        replyDeeplinkPendingBanIdRef.current = action.banId;
        if (action.preview?.text?.trim()) {
          replyStartParamPreviewRawRef.current = action.preview;
          syncReplyStartParamPreview(
            userIdRef.current ?? auth.user?.id ?? null,
          );
        }
      }
    }
  }, [armActiveBanDeepLinkEarly, auth.user?.id]);

  useEffect(() => {
    const viewerId = auth.user?.id;
    if (!viewerId || auth.loading) return;
    const rawPreview = replyStartParamPreviewRawRef.current;
    if (!rawPreview) return;
    const banId = replyDeeplinkPendingBanIdRef.current;
    if (!banId) return;
    replyStartParamPreviewBanRef.current = enrichBanInteraction(
      buildBanInteractionFromReplyPreview(banId, rawPreview, viewerId),
    );
  }, [auth.user?.id, auth.loading]);

  useEffect(() => {
    replyDeeplinkFastShellRef.current = replyDeeplinkFastShell;
  }, [replyDeeplinkFastShell]);

  useEffect(() => {
    replyDeepLinkBanIdRef.current = replyDeepLinkBanId;
  }, [replyDeepLinkBanId]);

  useEffect(() => {
    bootClaimedIncomingRef.current = auth.boot?.claimedIncoming ?? null;
  }, [auth.boot?.claimedIncoming]);

  useEffect(() => {
    registerResultOpenTraceContext({
      getActiveOverlayKind: () =>
        directResultOverlayRef.current
          ? 'result'
          : (overlayQueueRef.current[0]?.kind ?? null),
      getActiveBanDeepLinkId: () => activeBanDeepLinkBanIdRef.current,
    });
    return () => registerResultOpenTraceContext(null);
  }, []);

  const syncPendingStartupCount = useCallback(() => {
    setPendingStartupInteractionsCount(
      pendingStartupInteractionsRef.current.length,
    );
  }, []);

  const isOverlayLive = useCallback(
    (opts?: { live?: boolean; source?: 'ws' | 'session' | 'poll' }) => {
      if (opts?.live === true) return true;
      if (startupInteractionsHoldRef.current) return false;
      if (opts?.source === 'ws') return true;
      if (opts?.source === 'poll') return true;
      return false;
    },
    [],
  );

  const syncDisplayFromQueue = useCallback((queue: QueuedOverlay[]) => {
    const active = queue[0] ?? null;
    const replyFastBanId = replyDeeplinkFastOpenedRef.current
      ? (replyDeepLinkBanIdRef.current ??
        replyDeeplinkPendingBanIdRef.current)
      : null;
    if (
      replyFastBanId &&
      !incomingConsumedAfterAnswerRef.current.has(replyFastBanId)
    ) {
      const queuedIncoming = queue.find(
        (q) => q.kind === 'incoming' && q.ban.id === replyFastBanId,
      );
      const stateBan =
        incomingBanRef.current?.id === replyFastBanId
          ? incomingBanRef.current
          : null;
      const ban =
        queuedIncoming?.kind === 'incoming' ? queuedIncoming.ban : stateBan;
      if (ban) {
        console.log('[SYNC QUEUE SKIPPED] reason=reply-fast-incoming-active', {
          banId: replyFastBanId,
        });
        markVisibleOverboardTrace('[SYNC QUEUE SKIPPED]', {
          reason: 'reply-fast-incoming-active',
          banId: replyFastBanId,
        });
        setIncomingBan(ban);
        setCheckBan(null);
        return;
      }
    }

    const resultBlock = shouldBlockResultOpen({
      resultBanId: active?.kind === 'result' ? active.result.id : null,
      overboardInFlightBanId: overboardInFlightRef.current,
    });

    if (isNotificationQueueLocked()) {
      setIncomingBan(null);
      setCheckBan(null);
    } else {
      setIncomingBan(active?.kind === 'incoming' ? active.ban : null);
      setCheckBan(active?.kind === 'check' ? active.ban : null);
    }

    const shouldSkipResultQueueSync =
      bansCtaQueueSuppressRef.current ||
      bansReturnToLobbyLatchRef.current ||
      bansNavStateRef.current.origin === 'result-cta' ||
      resultCtaBansOverlayOpenRef.current;

    if (shouldSkipResultQueueSync) {
      console.log('[QUEUE SYNC SKIPPED] reason=result-cta-bans-open', {
        bansCtaSuppress: bansCtaQueueSuppressRef.current,
        navOrigin: bansNavStateRef.current.origin,
        resultCtaBansOverlayOpen: resultCtaBansOverlayOpenRef.current,
        headKind: active?.kind ?? null,
      });
      markVisibleOverboardTrace('[QUEUE SYNC SKIPPED]', {
        reason: 'result-cta-bans-open',
        headKind: active?.kind ?? null,
      });
      return;
    }

    if (active?.kind === 'result') {
      const inFlightId = overboardInFlightRef.current;
      if (
        directResultOverlayRef.current &&
        inFlightId &&
        active.result.id === inFlightId
      ) {
        logResultPath('syncDisplayFromQueue', 'path-skip', {
          banId: active.result.id,
          resultId: active.result.id,
          allowed: true,
          reason: 'keep-direct-overboard-in-flight',
        });
        resultOpenRef.current = true;
      } else {
      logResultOpenAttempt('syncDisplayFromQueue', {
        resultId: active.result.id,
        allowed: !resultBlock.blocked,
        blockReason: resultBlock.reason,
        bypassPriorityLock: resultBlock.bypassPriorityLock,
      });
      if (resultBlock.blocked) {
        if (!directResultOverlayRef.current) {
          resultOpenRef.current = false;
          logResultStateCleared('syncDisplayFromQueue', {
            banId: active.result.id,
            resultId: active.result.id,
            reason: resultBlock.reason ?? 'queue-head-blocked',
          });
          const gateBefore = snapshotDirectOverboardGate();
          setResult(null);
          setDirectResultOverlayActive(false);
          logDirectOverboardStateReset({
            source: 'syncDisplayFromQueue',
            reason: resultBlock.reason ?? 'queue-head-blocked',
            before: gateBefore,
            after: {
              directResultOverlayActive: false,
              directResultOverlayRef: gateBefore.directResultOverlayRef,
              resultBanId: null,
              showDirectOverboardLayer: gateBefore.showDirectOverboardLayer,
              hasResult: false,
            },
          });
        } else {
          resultOpenRef.current = true;
          logResultPath('syncDisplayFromQueue', 'path-skip', {
            banId: active.result.id,
            resultId: active.result.id,
            allowed: true,
            reason: 'queue-head-blocked-keep-direct',
          });
        }
      } else {
        const resultId = active.result.id;
        const viewerId = active.result.viewerId ?? userIdRef.current ?? null;
        if (
          resultCtaConsumedBanIdsRef.current.has(resultId) ||
          isDismissedResultLocally(resultId, viewerId)
        ) {
          console.log('[overboard-repeat-debug] duplicate result blocked', {
            banId: resultId,
            source: 'syncDisplayFromQueue',
            consumed: resultCtaConsumedBanIdsRef.current.has(resultId),
            dismissedLocal: viewerId
              ? isDismissedResultLocally(resultId, viewerId)
              : false,
          });
          console.log('[DIRECT RESULT REOPEN BLOCKED]', {
            reason: 'dismissed-after-result-cta',
            banId: resultId,
          });
          markVisibleOverboardTrace('[DIRECT RESULT REOPEN BLOCKED]', {
            reason: 'dismissed-after-result-cta',
            banId: resultId,
            source: 'syncDisplayFromQueue',
          });
          const pruned = removeOverlaysForBan(queue, resultId, ['result']);
          if (pruned.length !== queue.length) {
            overlayQueueRef.current = pruned;
            setOverlayQueue(pruned);
          }
          if (!directResultOverlayRef.current) {
            resultOpenRef.current = false;
            setResult(null);
            setDirectResultOverlayActive(false);
          }
          logResultPath('syncDisplayFromQueue', 'path-skip', {
            banId: resultId,
            resultId,
            allowed: false,
            reason: 'dismissed-after-result-cta',
          });
          if (pruned.length !== queue.length) {
            syncDisplayFromQueue(pruned);
          }
          return;
        }
        logResultOpenAttempt('syncDisplayFromQueue', {
          resultId: active.result.id,
          allowed: true,
          bypassPriorityLock: resultBlock.bypassPriorityLock,
          extra: { phase: 'queue-head-result-applied' },
        });
        logResultPath('syncDisplayFromQueue', 'state-written', {
          banId: active.result.id,
          resultId: active.result.id,
          allowed: true,
          bypassPriorityLock: resultBlock.bypassPriorityLock,
          extra: { via: 'queue-head' },
        });
        const gateBefore = snapshotDirectOverboardGate();
        clearDirectOverboardLayerRefs();
        setDirectResultOverlayActive(false);
        resultOpenRef.current = true;
        setResult(active.result);
        if (active.result.outcome === 'overboard') {
          console.log('[overboard-repeat-debug] status shown', {
            banId: active.result.id,
            source: 'syncDisplayFromQueue',
          });
        }
        logDirectOverboardStateReset({
          source: 'syncDisplayFromQueue',
          reason: 'queue-head-result-applied',
          before: gateBefore,
          after: {
            directResultOverlayActive: false,
            directResultOverlayRef: false,
            resultBanId: active.result.id,
            showDirectOverboardLayer: false,
            hasResult: true,
          },
        });
      }
      }
    } else if (directResultOverlayRef.current) {
      const directBanId =
        getLocalOverboardBypassBanId() ?? overboardInFlightRef.current;
      const directBlock = shouldBlockResultOpen({
        source: 'syncDisplayFromQueue-direct',
        resultBanId: directBanId,
        overboardInFlightBanId: overboardInFlightRef.current,
      });
      if (directBlock.blocked) {
        const keepDirect =
          overboardInFlightRef.current != null &&
          (isLocalOverboardBypassForBan(overboardInFlightRef.current) ||
            directBanId === overboardInFlightRef.current);
        if (keepDirect) {
          resultOpenRef.current = true;
          logResultPath('syncDisplayFromQueue-direct', 'path-skip', {
            banId: directBanId,
            resultId: directBanId,
            allowed: true,
            reason: 'direct-in-flight-protected',
          });
        } else {
        logResultOpenAttempt('syncDisplayFromQueue-direct', {
          resultId: directBanId,
          allowed: false,
          blockReason: directBlock.reason,
          bypassPriorityLock: directBlock.bypassPriorityLock,
        });
        logResultStateCleared('syncDisplayFromQueue-direct', {
          banId: directBanId,
          resultId: directBanId,
          reason: directBlock.reason ?? 'direct-blocked',
        });
        const gateBefore = snapshotDirectOverboardGate();
        clearDirectOverboardLayerRefs();
        setResult(null);
        setDirectResultOverlayActive(false);
        logDirectOverboardStateReset({
          source: 'syncDisplayFromQueue-direct',
          reason: directBlock.reason ?? 'direct-blocked',
          before: gateBefore,
          after: {
            directResultOverlayActive: false,
            directResultOverlayRef: false,
            resultBanId: null,
            showDirectOverboardLayer: false,
            hasResult: false,
          },
        });
        }
      } else {
        resultOpenRef.current = true;
      }
    } else if (!directResultOverlayRef.current) {
      const returningFromResultCtaBans =
        bansReturnToLobbyLatchRef.current ||
        (bansNavStateRef.current.origin === 'result-cta' &&
          bansNavStateRef.current.returnTarget === 'lobby');
      if (returningFromResultCtaBans) {
        console.log('[QUEUE SYNC SKIPPED] reason=result-cta-return-lobby', {
          headKind: active?.kind ?? null,
          bansReturnLatch: bansReturnToLobbyLatchRef.current,
          navOrigin: bansNavStateRef.current.origin,
        });
        markVisibleOverboardTrace('[QUEUE SYNC SKIPPED]', {
          reason: 'result-cta-return-lobby',
          headKind: active?.kind ?? null,
        });
      } else {
      resultOpenRef.current = false;
      logResultPath('syncDisplayFromQueue', 'state-cleared', {
        banId:
          getLocalOverboardBypassBanId() ?? overboardInFlightRef.current,
        allowed: false,
        reason: 'queue-head-not-result',
        extra: { headKind: active?.kind ?? null },
      });
      const gateBefore = snapshotDirectOverboardGate();
      setResult(null);
      setDirectResultOverlayActive(false);
      logDirectOverboardStateReset({
        source: 'syncDisplayFromQueue',
        reason: 'queue-head-not-result',
        before: gateBefore,
        after: {
          directResultOverlayActive: false,
          directResultOverlayRef: gateBefore.directResultOverlayRef,
          resultBanId: null,
          showDirectOverboardLayer: gateBefore.showDirectOverboardLayer,
          hasResult: false,
        },
      });
      }
    } else {
      resultOpenRef.current = true;
    }
    if (active?.kind === 'incoming') {
      console.log('INCOMING QUEUE ACTIVE', { banId: active.ban.id });
    } else if (queue.some((q) => q.kind === 'incoming')) {
      console.log('INCOMING QUEUE ACTIVE', {
        banId: null,
        reason: 'incoming-queued-not-head',
        headKind: active?.kind ?? null,
      });
    }
    if (active?.kind === 'check') {
      console.log('[CHECK OVERLAY ACTIVE]', { banId: active.ban.id });
    } else if (queue.some((q) => q.kind === 'check')) {
      console.log('[CHECK OVERLAY ACTIVE]', {
        banId: null,
        reason: 'check-queued-not-head',
        headKind: active?.kind ?? null,
      });
    }
  }, [snapshotDirectOverboardGate]);

  const applyOverlayQueue = useCallback(
    (next: QueuedOverlay[]) => {
      const prevHead = overlayQueueRef.current[0] ?? null;
      const nextHead = next[0] ?? null;
      const prevKey = prevHead ? overlayQueueKey(prevHead) : null;
      const nextKey = nextHead ? overlayQueueKey(nextHead) : null;
      activeOverlayLockRef.current = nextKey;
      if (nextKey) {
        console.log('[OVERLAY ACTIVE LOCK]', {
          key: nextKey,
          kind: nextHead?.kind ?? null,
        });
      } else {
        console.log('[OVERLAY ACTIVE LOCK]', { key: null });
      }
      if (prevKey !== nextKey) {
        console.log('[OVERLAY DISPLAY NEXT]', {
          prevKey,
          nextKey,
          queueLength: next.length,
          nextKind: nextHead?.kind ?? null,
        });
        console.log('[OVERLAY QUEUE NEXT]', {
          prevKey,
          nextKey,
          queueLength: next.length,
          nextKind: nextHead?.kind ?? null,
        });
        if (nextKey) {
          shownOverlayKeysRef.current.add(nextKey);
          logOverlayArbiter('show', {
            key: nextKey,
            kind: nextHead?.kind ?? null,
            banId:
              nextHead?.kind === 'result'
                ? nextHead.result.id
                : nextHead?.ban.id ?? null,
          });
        }
      }
      overlayQueueRef.current = next;
      syncDisplayFromQueue(next);
      setOverlayQueue(next);
    },
    [syncDisplayFromQueue],
  );

  const markOverlayUserAction = useCallback((kind: string, banId?: string) => {
    const ts = overlayTs();
    overlayActionTsRef.current = ts;
    console.log('[OVERLAY ACTION CLICK]', { ts, kind, banId: banId ?? null });
  }, []);

  const reportOverlayRendered = useCallback(
    (kind: string, banId: string, buttonsReady = true) => {
      const ts = overlayTs();
      const delayFromAction = overlayDelayMs(overlayActionTsRef.current);
      const delayFromHandoff = overlayDelayMs(overlayHandoffTsRef.current);
      console.log('[OVERLAY NEXT RENDERED]', {
        ts,
        kind,
        banId,
        delayFromActionMs: delayFromAction,
        delayFromHandoffMs: delayFromHandoff,
      });
      if (buttonsReady) {
        console.log('[OVERLAY BUTTONS ENABLED]', {
          ts,
          kind,
          banId,
          delayFromActionMs: delayFromAction,
        });
      }
      if (delayFromAction != null) {
        const cause = overlayDelayCause(delayFromAction, {
          handoffMs: delayFromHandoff,
        });
        console.log('[OVERLAY NEXT_DELAY_MS]', {
          delayMs: delayFromAction,
          kind,
          banId,
          cause,
          from: 'action-click',
        });
        if (delayFromAction > 150) {
          console.log('[OVERLAY HANDOFF SLOW]', {
            delayMs: delayFromAction,
            kind,
            banId,
            delayFromHandoffMs: delayFromHandoff,
            cause,
          });
        }
        if (process.env.NODE_ENV === 'development') {
          setOverlayHandoffDebug({ delayMs: delayFromAction, cause });
        }
      }
    },
    [],
  );

  const dismissCurrentOverlay = useCallback(
    (reason: string, nextQueue?: QueuedOverlay[]) => {
      const prev = overlayQueueRef.current;
      const prevKey = prev[0] ? overlayQueueKey(prev[0]) : null;
      const remaining = nextQueue ?? popOverlayHead(prev);
      const drainTotal = prev.length;
      const dismissTs = overlayTs();
      overlayHandoffTsRef.current = dismissTs;

      logOverlayArbiter('dismiss', {
        prevKey,
        reason,
        remaining: remaining.length,
        actionAgeMs: overlayDelayMs(overlayActionTsRef.current),
      });

      console.log('[OVERLAY DISMISS CURRENT]', {
        ts: dismissTs,
        prevKey,
        reason,
        remaining: remaining.length,
        actionAgeMs: overlayDelayMs(overlayActionTsRef.current),
      });

      if (drainTotal > 1 && !overlayQueueDrainActiveRef.current) {
        overlayQueueDrainActiveRef.current = true;
        console.log('[OVERLAY QUEUE DRAIN START]', { ts: dismissTs, count: drainTotal });
      }

      if (overlayShowNextTimerRef.current) {
        clearTimeout(overlayShowNextTimerRef.current);
        overlayShowNextTimerRef.current = null;
      }

      const commit = () => {
        applyOverlayQueue(remaining);
        const selectTs = overlayTs();
        if (remaining.length > 0) {
          const nextKey = remaining[0] ? overlayQueueKey(remaining[0]) : null;
          logOverlayArbiter('show-next', {
            prevKey,
            nextKey,
            delayMs: overlayDelayMs(dismissTs),
          });
          console.log('[OVERLAY NEXT SELECTED]', {
            ts: selectTs,
            prevKey,
            nextKey,
            commitDelayMs: overlayDelayMs(dismissTs),
          });
        }
        if (remaining.length === 0) {
          overlayActionTsRef.current = null;
          overlayHandoffTsRef.current = null;
          if (overlayQueueDrainActiveRef.current) {
            overlayQueueDrainActiveRef.current = false;
            console.log('[OVERLAY QUEUE DRAIN END]', { ts: selectTs });
          }
        }
      };

      if (remaining.length > 0) {
        overlayShowNextTimerRef.current = setTimeout(() => {
          overlayShowNextTimerRef.current = null;
          flushSync(commit);
        }, OVERLAY_SHOW_NEXT_DELAY_MS);
      } else {
        commit();
      }
    },
    [applyOverlayQueue],
  );

  const markSessionBanSendSuccess = useCallback(() => {
    sessionBanSendSuccessRef.current = true;
  }, []);

  const enqueueNotification = useCallback(
    (
      item: QueuedOverlay,
      opts?: {
        live?: boolean;
        source?: 'ws' | 'session' | 'poll' | 'deeplink';
      },
    ) => {
      const live = isOverlayLive(opts);
      const banId = item.kind === 'result' ? item.result.id : item.ban.id;
      const key = overlayQueueKey(item);

      if (item.kind === 'result') {
        const resultId = item.result.id;
        const uid = userIdRef.current;
        if (
          resultCtaConsumedBanIdsRef.current.has(resultId) ||
          (uid && isDismissedResultLocally(resultId, uid))
        ) {
          console.log('[overboard-repeat-debug] duplicate result blocked', {
            banId: resultId,
            source: 'enqueueNotification',
            enqueueSource: opts?.source ?? null,
          });
          return;
        }

        const block = shouldBlockResultOpen({
          source: 'enqueueNotification',
          resultBanId: item.result.id,
          overboardInFlightBanId: overboardInFlightRef.current,
        });
        logResultOpenAttempt('enqueueNotification', {
          resultId: item.result.id,
          allowed: !block.blocked,
          blockReason: block.reason,
          bypassPriorityLock: block.bypassPriorityLock,
          extra: { enqueueSource: opts?.source ?? null, live },
        });
        if (block.blocked) {
          return;
        }
      }

      const decision = evaluateOverlayEnqueue(item, {
        viewerId: userIdRef.current,
        deepLinkBlocked:
          deepLinkBlockedRef.current || isNotificationQueueLocked(),
        activeOverlayKey: getActiveOverlayKey(overlayQueueRef.current),
        queueKeys: new Set(overlayQueueRef.current.map(overlayQueueKey)),
        pendingKeys: new Set(
          pendingStartupInteractionsRef.current.map(overlayQueueKey),
        ),
        shownOverlayKeys: shownOverlayKeysRef.current,
        dismissedIncoming: dismissedIncomingRef.current,
        dismissedCheck: dismissedCheckSessionRef.current,
        answeredChecks: answeredCheckRef.current,
        locallyAckedIncoming: locallyAckedIncomingRef.current,
        source: opts?.source,
        live,
      });

      if (!decision.accept) {
        logOverlayArbiter(
          decision.reason === 'ttl-skip'
            ? 'ttl-skip'
            : decision.reason === 'dedup-skip'
              ? 'dedup-skip'
              : decision.reason === 'blocked-by-deeplink'
                ? 'blocked-by-deeplink'
                : 'dedup-skip',
          { key, kind: item.kind, banId, source: opts?.source ?? null },
        );
        return;
      }

      if (startupInteractionsHoldRef.current && !live) {
        const prevPending = pendingStartupInteractionsRef.current;
        const nextPending = mergeStartupPendingSingle(prevPending, item);
        pendingStartupInteractionsRef.current = nextPending;
        syncPendingStartupCount();
        logOverlayArbiter('enqueue', {
          key,
          kind: item.kind,
          banId,
          source: opts?.source ?? null,
          scope: 'startup-pending',
          queueLength: nextPending.length,
        });
        return;
      }

      const prev = overlayQueueRef.current;
      const activeKey = getActiveOverlayKey(prev);
      const newKey = key;
      const { queue: next, changed, action } = enqueueWithActiveLock(prev, item);

      if (!changed) {
        if (item.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: item.ban.id,
            skipped: true,
            reason: 'dedup',
            source: opts?.source ?? null,
          });
        } else if (item.kind === 'check') {
          console.log('[CHECK QUEUE DEDUP]', {
            banId: item.ban.id,
            skipped: true,
            reason: 'unchanged',
            source: opts?.source ?? null,
          });
        }
        return;
      }

      if (action === 'same-key-refresh') {
        console.log('[OVERLAY SAME_KEY_REFRESH]', {
          key: newKey,
          kind: item.kind,
          source: opts?.source ?? null,
        });
      } else if (action === 'enqueue-waiting') {
        logOverlayArbiter('blocked-by-current-overlay', {
          activeKey,
          newKey,
          kind: item.kind,
          source: opts?.source ?? null,
        });
        logOverlayArbiter('enqueue', {
          key: newKey,
          kind: item.kind,
          banId,
          source: opts?.source ?? null,
          scope: 'queue-tail',
          queueLength: next.length,
        });
      } else if (action === 'display-new') {
        logOverlayArbiter('enqueue', {
          key: newKey,
          kind: item.kind,
          banId,
          source: opts?.source ?? null,
          scope: 'display-new',
        });
        if (item.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: item.ban.id,
            skipped: false,
            reason: 'display-new',
            source: opts?.source ?? null,
            live,
          });
        } else if (item.kind === 'check') {
          console.log('[CHECK QUEUE PUSH]', {
            banId: item.ban.id,
            source: opts?.source ?? null,
            live,
          });
        }
      }

      applyOverlayQueue(next);
    },
    [applyOverlayQueue, isOverlayLive, syncPendingStartupCount],
  );

  const unlockNotificationQueueAndFlush = useCallback(
    (reason: string) => {
      const prevLock = getNotificationQueueLockReason();
      const startupPending = pendingStartupInteractionsRef.current;
      const startupCounts = countQueuedOverlaysByKind(startupPending);
      const queueCounts = countQueuedOverlaysByKind(overlayQueueRef.current);

      logQueueDebug('unlock queue', {
        reason,
        prevLock,
        startupHold: startupInteractionsHoldRef.current,
        startupPending: startupCounts,
        queuePending: queueCounts,
        deepLinkBlocked: deepLinkBlockedRef.current,
        activeBanDeepLinkId: activeBanDeepLinkBanIdRef.current,
      });

      if (isNotificationQueueLocked()) {
        unlockNotificationQueue(reason);
      }

      // Stale ref from useEffect may still block enqueue right after unlock.
      deepLinkBlockedRef.current = isNotificationQueueLocked();
      logQueueDebug('active locks', {
        queueLock: getNotificationQueueLockReason(),
        deepLinkBlocked: deepLinkBlockedRef.current,
        startupHold: startupInteractionsHoldRef.current,
        activeBanDeepLinkId: activeBanDeepLinkBanIdRef.current,
      });

      const shouldFlushStartup =
        startupInteractionsHoldRef.current || startupPending.length > 0;

      runWithExplicitResultUnlock(() => {
        if (shouldFlushStartup) {
          startupInteractionsHoldRef.current = false;
          pendingStartupInteractionsRef.current = [];
          syncPendingStartupCount();
          if (startupPending.length > 0) {
            logQueueDebug('pending incoming count', {
              incoming: startupCounts.incoming,
            });
            logQueueDebug('pending check count', {
              check: startupCounts.check,
            });
            logQueueDebug('pending result count', {
              result: startupCounts.result,
            });
            console.log('[startup-interactions-release]', {
              count: startupPending.length,
              reason,
            });
            for (const item of startupPending) {
              enqueueNotification(item, { source: 'session' });
            }
          }
        }

        syncDisplayFromQueue(overlayQueueRef.current);
        const head = overlayQueueRef.current[0];
        if (head) {
          logQueueDebug('show next overlay', {
            kind: head.kind,
            banId:
              head.kind === 'result'
                ? head.result.id
                : head.kind === 'incoming' || head.kind === 'check'
                  ? head.ban.id
                  : null,
          });
        } else {
          logQueueDebug('no pending -> lobby', { reason: 'empty-queue-reload' });
        }

        if (head?.kind === 'result') {
          logOverlayPriority('pending-result-shown', {
            resultId: head.result.id,
          });
        } else {
          void reloadPendingRef.current().catch(() => {});
        }
      });
    },
    [enqueueNotification, syncDisplayFromQueue, syncPendingStartupCount],
  );

  const releaseStartupInteractions = useCallback(
    (opts?: { requireBanSend?: boolean; force?: boolean }) => {
      if (!opts?.force && isNotificationQueueLocked()) {
        return;
      }
      if (opts?.requireBanSend && !sessionBanSendSuccessRef.current) {
        return;
      }
      const pending = pendingStartupInteractionsRef.current;
      const hadHold = startupInteractionsHoldRef.current;
      startupInteractionsHoldRef.current = false;
      pendingStartupInteractionsRef.current = [];
      syncPendingStartupCount();

      if (!opts?.force && !hadHold && pending.length === 0) return;

      console.log('[startup-interactions-release]', {
        count: pending.length,
        requireBanSend: opts?.requireBanSend ?? false,
        force: opts?.force ?? false,
      });

      if (pending.length === 0) return;

      deepLinkBlockedRef.current = isNotificationQueueLocked();
      for (const item of pending) {
        enqueueNotification(item, { source: 'session' });
      }
      syncDisplayFromQueue(overlayQueueRef.current);
    },
    [enqueueNotification, syncDisplayFromQueue, syncPendingStartupCount],
  );

  const openBanResult = useCallback(
    (r: BanResult | null | undefined, mode: ResultOpenMode) => {
      const queueHeadKind = overlayQueueRef.current[0]?.kind ?? null;
      const resultKey = r?.id ? `result:${r.id}` : null;

      if (r) {
        const uid = userIdRef.current;
        if (
          resultCtaConsumedBanIdsRef.current.has(r.id) ||
          (uid && isDismissedResultLocally(r.id, uid))
        ) {
          console.log('[overboard-repeat-debug] duplicate result blocked', {
            banId: r.id,
            source: `openBanResult:${mode}`,
          });
          return;
        }

        const block = shouldBlockResultOpen({
          resultBanId: r.id,
          overboardInFlightBanId: overboardInFlightRef.current,
        });
        logResultOpenAttempt('openBanResult', {
          resultId: r.id,
          mode,
          allowed: !block.blocked,
          blockReason: block.reason,
          bypassPriorityLock: block.bypassPriorityLock,
        });
        if (block.blocked) {
          logOverlayPriority('pending-result-blocked', {
            resultId: r.id,
            reason: block.reason,
          });
          return;
        }
      }

      if (!r) {
        logResultUi(null, {
          overlayKind: queueHeadKind,
          compactCard: false,
          fullOverlay: false,
          source: `openBanResult:${mode}`,
          rejectReason: 'null-payload',
        });
        applyOverlayQueue([]);
        return;
      }

      if (mode === 'explicit' || mode === 'live') {
        setLobbyOpen(false);
        noteDeepLinkHandlerOpened('openBanResult', r.id);
      }

      if (resultDeliveredBanIdsRef.current.has(r.id)) {
        logResultUi(r.outcome, {
          overlayKind: queueHeadKind,
          compactCard: false,
          fullOverlay: queueHeadKind === 'result',
          source: `openBanResult:${mode}`,
          rejectReason: 'resultDelivered-duplicate',
          overlayQueueLength: overlayQueueRef.current.length,
          resultDelivered: true,
          shownOverlayKey: resultKey
            ? shownOverlayKeysRef.current.has(resultKey)
            : false,
        });
        return;
      }

      if (!shouldShowBanResult(r, mode, r.id, userIdRef.current)) {
        const rejectReason = diagnoseResultShow(
          r,
          mode,
          userIdRef.current,
          r.id,
        ).reason;
        challengeLog('result:reject-open', {
          banId: r.id,
          outcome: r.outcome,
          mode,
          reason: rejectReason,
        });
        logResultUi(r.outcome, {
          overlayKind: queueHeadKind,
          compactCard: false,
          fullOverlay: false,
          source: `openBanResult:${mode}`,
          rejectReason,
          overlayQueueLength: overlayQueueRef.current.length,
        });
        console.log('[result-dismiss-local]', {
          banId: r.id,
          authUserId: r.viewerId ?? userIdRef.current,
        });
        dismissBanResultLocally(r.id, r.viewerId ?? null);
        void acknowledgeBanResultOnServer(r.id, tokenRef.current);
        return;
      }

      const source: 'deeplink' | 'ws' | 'poll' =
        mode === 'explicit'
          ? 'deeplink'
          : mode === 'live'
            ? 'ws'
            : 'poll';

      const queueLenBefore = overlayQueueRef.current.length;
      enqueueNotification(
        { kind: 'result', result: r },
        {
          live: mode === 'explicit' || mode === 'live',
          source,
        },
      );

      const head = overlayQueueRef.current[0];
      const fullOverlay = head?.kind === 'result' && head.result.id === r.id;
      if (fullOverlay) {
        resultDeliveredBanIdsRef.current.add(r.id);
      }

      logResultUi(r.outcome, {
        overlayKind: head?.kind ?? null,
        compactCard: false,
        fullOverlay,
        source: `openBanResult:${mode}`,
        rejectReason: fullOverlay
          ? undefined
          : queueLenBefore === overlayQueueRef.current.length
            ? 'enqueue-skipped'
            : 'enqueue-not-head',
        overlayQueueLength: overlayQueueRef.current.length,
        resultDelivered: resultDeliveredBanIdsRef.current.has(r.id),
        shownOverlayKey: resultKey
          ? shownOverlayKeysRef.current.has(resultKey)
          : false,
      });

      if (mode === 'explicit' && fullOverlay) {
        resolvePendingDeepLinkRoute('result', r.id);
      }

      if (mode === 'explicit' || mode === 'live') {
        logDeepLinkHandlerResult({
          type: 'result',
          banId: r.id,
          instantBanOpen: false,
          sendFlowOpen: false,
          selectedBanId: r.id,
          overlayQueueLength: overlayQueueRef.current.length,
          ok: fullOverlay,
          reason: fullOverlay ? null : 'enqueue-not-head',
        });
      }
    },
    [applyOverlayQueue, enqueueNotification],
  );

  const dismissBanResult = useCallback(() => {
    const nav = bansNavStateRef.current;
    console.log('[DISMISS RESULT]', {
      origin: nav.origin,
      returnTarget: nav.returnTarget,
      bansReturnLatch: bansReturnToLobbyLatchRef.current,
      bansCtaSuppress: bansCtaQueueSuppressRef.current,
      resultBanId: result?.id ?? resultRef.current?.id ?? null,
    });
    if (bansReturnToLobbyLatchRef.current) {
      console.log('[DISMISS RESULT] skipped reason=bans-return-latch');
      return;
    }
    if (
      bansCtaQueueSuppressRef.current ||
      resultCtaBansOverlayOpenRef.current ||
      (nav.origin === 'result-cta' && nav.returnTarget === 'lobby')
    ) {
      console.log('[DISMISS RESULT] skipped reason=result-cta-bans-open');
      markVisibleOverboardTrace('[DISMISS RESULT SKIPPED]', {
        reason: 'result-cta-bans-open',
        bansCtaSuppress: bansCtaQueueSuppressRef.current,
        resultCtaBansOverlayOpen: resultCtaBansOverlayOpenRef.current,
        navOrigin: nav.origin,
      });
      return;
    }

    const head = overlayQueueRef.current[0];
    const wasDirect = directResultOverlayRef.current;
    const banId =
      head?.kind === 'result'
        ? head.result.id
        : (result?.id ?? null);
    const viewerId =
      head?.kind === 'result'
        ? (head.result.viewerId ?? userIdRef.current)
        : (result?.viewerId ?? userIdRef.current);
    if (banId) {
      console.log('[result-dismiss-local]', {
        banId,
        authUserId: viewerId,
      });
      dismissBanResultLocally(banId, viewerId ?? null);
      void acknowledgeBanResultOnServer(banId, tokenRef.current);
    }
    clearLocalOverboardBypass();
    if (wasDirect) {
      overboardInFlightRef.current = null;
    }
    const gateBefore = snapshotDirectOverboardGate();
    clearDirectOverboardLayerRefs();
    setDirectResultOverlayActive(false);
    const clearsResult = wasDirect || head?.kind !== 'result';
    if (clearsResult) {
      logResultStateCleared('dismissBanResult', {
        banId,
        resultId: banId,
        wasDirect,
      });
      setResult(null);
    }
    logDirectOverboardStateReset({
      source: 'dismissBanResult',
      reason: clearsResult ? 'dismiss-clear-result' : 'dismiss-keep-queue-result',
      before: gateBefore,
      after: {
        directResultOverlayActive: false,
        directResultOverlayRef: false,
        resultBanId: clearsResult ? null : banId,
        showDirectOverboardLayer: false,
        hasResult: !clearsResult,
      },
    });
    if (head?.kind === 'result') {
      dismissCurrentOverlay('result-dismiss');
    }
  }, [
    clearDirectOverboardLayerRefs,
    dismissCurrentOverlay,
    result,
    snapshotDirectOverboardGate,
  ]);

  const pruneAndSyncOverlayQueue = useCallback(() => {
    const viewerId = userIdRef.current;
    const prev = overlayQueueRef.current;
    const prunedChecks = prev
      .filter((q) => q.kind === 'check')
      .map((q) => q.ban.id);
    let next = filterOverlayQueueByTtl(
      pruneOverlayQueue(prev, {
        viewerId,
        dismissedIncoming: dismissedIncomingRef.current,
        dismissedCheck: dismissedCheckSessionRef.current,
        answeredChecks: answeredCheckRef.current,
        checkInFlight: checkAnswerInFlightRef.current,
      }),
    );

    const replyFastBanId = replyDeeplinkFastOpenedRef.current
      ? (replyDeepLinkBanIdRef.current ??
        replyDeeplinkPendingBanIdRef.current)
      : null;
    if (
      replyFastBanId &&
      !incomingConsumedAfterAnswerRef.current.has(replyFastBanId)
    ) {
      const inNext = next.some(
        (q) => q.kind === 'incoming' && q.ban.id === replyFastBanId,
      );
      if (!inNext) {
        const preserved = prev.find(
          (q) => q.kind === 'incoming' && q.ban.id === replyFastBanId,
        );
        const ban =
          preserved?.kind === 'incoming'
            ? preserved.ban
            : incomingBanRef.current?.id === replyFastBanId
              ? incomingBanRef.current
              : viewerId
                ? buildReplyDeeplinkShellBan(replyFastBanId, viewerId)
                : null;
        if (ban) {
          next = [
            { kind: 'incoming', ban },
            ...next.filter(
              (q) =>
                !(q.kind === 'incoming' && q.ban.id === replyFastBanId),
            ),
          ];
        }
      } else if (
        !(
          next[0]?.kind === 'incoming' && next[0].ban.id === replyFastBanId
        )
      ) {
        const preserved = next.find(
          (q) => q.kind === 'incoming' && q.ban.id === replyFastBanId,
        );
        if (preserved) {
          next = [
            preserved,
            ...next.filter(
              (q) =>
                !(q.kind === 'incoming' && q.ban.id === replyFastBanId),
            ),
          ];
        }
      }
    }

    for (const banId of prunedChecks) {
      if (hasCheckInQueue(next, banId)) continue;
      const removed = prev.find(
        (q) => q.kind === 'check' && q.ban.id === banId,
      );
      if (!removed) continue;
      const stillValid = shouldShowCheckOverlay(
        removed.ban,
        viewerId,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        resultOpenRef.current,
      );
      if (!stillValid) {
        console.log('[CHECK OVERLAY PRUNE]', {
          banId,
          removed: true,
          reason: 'guard-rejected',
        });
        continue;
      }
      const wasHead =
        prev[0]?.kind === 'check' && prev[0].ban.id === banId;
      console.log('[CHECK OVERLAY PRUNE]', {
        banId,
        removed: true,
        restored: true,
        wasHead,
      });
      const { queue: restoredQueue } = enqueueWithActiveLock(next, removed);
      next = restoredQueue;
    }

    applyOverlayQueue(next);
  }, [applyOverlayQueue]);

  useEffect(() => {
    incomingBanRef.current = incomingBan;
  }, [incomingBan]);
  useEffect(() => {
    checkBanRef.current = checkBan;
  }, [checkBan]);
  const banSentOpenRef = useRef(false);
  const deferredSyncRef = useRef(false);

  useEffect(() => {
    const uid = auth.user?.id ?? null;
    dismissedIncomingRef.current = new Set();
    dismissedCheckSessionRef.current = new Set();
    answeredCheckRef.current = new Set();
    checkAnswerInFlightRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    resultCtaConsumedBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();
    if (!uid || auth.loading) return;
    for (const id of hydrateAnsweredCheckIds(uid)) {
      answeredCheckRef.current.add(id);
    }
    for (const id of hydrateDismissedResultIds(uid)) {
      resultCtaConsumedBanIdsRef.current.add(id);
      resultDeliveredBanIdsRef.current.add(id);
    }
  }, [auth.user?.id, auth.loading]);

  const checkWaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(auth.token);
  tokenRef.current = auth.token;
  const userIdRef = useRef<string | null>(auth.user?.id ?? null);
  userIdRef.current = auth.user?.id ?? null;
  const authUserRef = useRef(auth.user);
  authUserRef.current = auth.user;
  const refreshUserRef = useRef(auth.refreshUser);
  refreshUserRef.current = auth.refreshUser;
  const reloadFriendsRef = useRef<() => Promise<void>>(async () => {});
  const friendsRef = useRef<FriendCard[]>([]);
  const friendsBootstrappedRef = useRef(false);

  useEffect(() => {
    friendsRef.current = friends;
    friendsBootstrappedRef.current = friendsBootstrapped;
  }, [friends, friendsBootstrapped]);

  /** Owner is confirmed auth user — friends may load later (empty until fetch). */
  useEffect(() => {
    if (!auth.user?.id || auth.loading) {
      setDataOwnerUserId(null);
      return;
    }
    setDataOwnerUserId(auth.user.id);
  }, [auth.user?.id, auth.loading]);

  /** Sync reset before paint when backend user id changes (no flash of previous user's data). */
  useLayoutEffect(() => {
    const nextUserId = auth.user?.id ?? null;
    const directActive = isDirectOverboardLocallyActive();

    if (
      providersResetForUserIdRef.current !== undefined &&
      providersResetForUserIdRef.current === nextUserId
    ) {
      if (directActive) {
        markVisibleOverboardTrace('DIRECT OVERBOARD STATE RESET SKIPPED', {
          source: 'providers-reset',
          reason: 'same-user-deps-rerun',
          directActive: true,
          userId: nextUserId,
        });
      }
      return;
    }

    const prevResetUserId = providersResetForUserIdRef.current;
    const realUserChange =
      prevResetUserId !== undefined &&
      prevResetUserId !== null &&
      nextUserId !== null &&
      prevResetUserId !== nextUserId;
    providersResetForUserIdRef.current = nextUserId;

    console.log('[providers-reset]', {
      userId: nextUserId,
      prevResetUserId: prevResetUserId ?? null,
      directActive,
      realUserChange,
    });

    clearAvatarCaches();
    setDataOwnerUserId(null);
    setHomeSnapshotReady(false);
    setStartupGraceActive(true);
    setNetworkBootstrapCompleted(false);
    setHasSuccessfulNetworkSync(false);
    setInitialNetworkBootstrapAttempted(false);
    setWsHasConnectedOnce(false);
    setIncomingBan(null);
    setCheckBan(null);
    setCheckWaiting(false);

    const preserveDirectOverboard =
      !realUserChange &&
      directActive &&
      (directResultOverlayActiveRef.current ||
        directResultOverlayRef.current ||
        overboardInFlightRef.current != null ||
        getLocalOverboardBypassBanId() != null);

    if (preserveDirectOverboard) {
      markVisibleOverboardTrace('DIRECT OVERBOARD STATE RESET SKIPPED', {
        source: 'providers-reset',
        reason: 'auth-user-changed',
        directActive: true,
        userId: nextUserId,
        prevUserId: prevResetUserId ?? null,
      });
    } else {
      const gateBefore = snapshotDirectOverboardGate();
      setResult(null);
      clearDirectOverboardLayerRefs();
      setDirectResultOverlayActive(false);
      logDirectOverboardStateReset({
        source: 'providers-reset',
        reason: 'auth-user-changed',
        before: gateBefore,
        after: {
          directResultOverlayActive: false,
          directResultOverlayRef: false,
          resultBanId: null,
          showDirectOverboardLayer: false,
          hasResult: false,
        },
      });
    }

    setOverlayQueue([]);
    overlayQueueRef.current = [];
    pendingStartupInteractionsRef.current = [];
    startupInteractionsHoldRef.current = true;
    sessionBanSendSuccessRef.current = false;
    setPendingStartupInteractionsCount(0);
    setPopups([]);
    setActiveBans([]);
    setFriends([]);
    setFriendsBootstrapped(false);
    setSessionBootstrapped(false);
    setSendOpen(false);
    setSendReceiver('');
    setSendText('');
    setIncomingReplyBanId(null);
    pinReplyToBanId(null);
    setReplyComposeActive(false);
    setResultReplyPending(null);
    setResultReplyRequest(0);
    setResultReplyHandoffLock(false);
    setResultReplyWhatReady(true);
    setViralOnboarding(false);
    setBanSentOpen(false);
    setOptimisticSendWait(null);
    dismissedIncomingRef.current = new Set();
    incomingConsumedAfterAnswerRef.current = new Set();
    incomingReplyComposeDismissedRef.current = new Set();
    dismissedCheckSessionRef.current = new Set();
    answeredCheckRef.current = new Set();
    locallyAckedIncomingRef.current = new Set();
    shownOverlayKeysRef.current = new Set();
    checkAnswerInFlightRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    resultCtaConsumedBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();

    const uid = auth.user?.id;
    if (!uid) return;

    for (const id of hydrateAcknowledgedIncomingIds(uid)) {
      dismissedIncomingRef.current.add(id);
      locallyAckedIncomingRef.current.add(id);
    }
    for (const id of hydrateAnsweredCheckIds(uid)) {
      answeredCheckRef.current.add(id);
    }
    installOverlayDismissCacheDevHelper(uid);

    const snapshot = readHomeSnapshot(uid);
    if (snapshot) {
      const hydratedFriends = coerceFriendList(snapshot.friends);
      for (const f of hydratedFriends) {
        rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
      }
      friendsRef.current = hydratedFriends;
      setFriends(hydratedFriends);
      setSendDuration(snapshot.sendDuration);
      if (snapshot.sendReceiver) {
        setSendReceiver(snapshot.sendReceiver);
      }
      setFriendsBootstrapped(true);
      setSessionBootstrapped(true);
      setHomeSnapshotReady(true);
      setDataOwnerUserId(uid);
      logFriendsTiming('home-snapshot-hydrated', {
        userId: uid,
        count: hydratedFriends.length,
        savedAt: snapshot.savedAt,
      });
      void preloadFriendAvatars(hydratedFriends, { timeoutMs: 2000 });
      const cachedCheck = snapshot.checkBan
        ? enrichBanInteraction(snapshot.checkBan)
        : null;
      if (
        cachedCheck &&
        shouldShowCheckOverlay(
          cachedCheck,
          uid,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          resultOpenRef.current,
        )
      ) {
        enqueueNotification(
          { kind: 'check', ban: cachedCheck },
          { source: 'session' },
        );
        console.log('[check-overlay]', {
          event: 'snapshot-hydrated',
          banId: cachedCheck.id,
        });
      }
      return;
    }

    const cached = readFriendsCache(uid);
    for (const f of cached) {
      rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
    }
    if (cached.length > 0) {
      friendsRef.current = cached;
      setFriends(cached);
      setFriendsBootstrapped(true);
      setHomeSnapshotReady(true);
      setDataOwnerUserId(uid);
      logFriendsTiming('cache-hydrated-memory', {
        userId: uid,
        count: cached.length,
      });
      markAvatarStartup();
      preloadAvatarUrls(cached.map((f) => f.avatarUrl ?? f.photoUrl));
      void preloadFriendAvatars(cached, { timeoutMs: 2000, via: 'friends-cache' });
    }

    if (tryLockFromStartParam('providers-user-reset')) {
      const action = parseStartParam(readPriorityStartParamRaw() ?? undefined);
      if (action?.type === 'active') {
        armActiveBanDeepLinkEarly(action.banId);
      }
    }
  }, [
    auth.user?.id,
    armActiveBanDeepLinkEarly,
    clearDirectOverboardLayerRefs,
    enqueueNotification,
    isDirectOverboardLocallyActive,
    snapshotDirectOverboardGate,
  ]);

  useEffect(() => {
    setAvatarPreloadCompleteListener(() => {
      setAvatarPreloadEpoch((n) => n + 1);
    });
    return () => setAvatarPreloadCompleteListener(null);
  }, []);

  useEffect(() => {
    if (auth.authReady && auth.user?.id) markAvatarStartup();
  }, [auth.authReady, auth.user?.id]);

  const clearCheckOverlay = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
      checkWaitingTimerRef.current = null;
    }
    setCheckWaiting(false);
    const prev = overlayQueueRef.current;
    const dismissedIds = prev
      .filter((q) => q.kind === 'check')
      .map((q) => q.ban.id);
    const next =
      prev[0]?.kind === 'check'
        ? popOverlayHead(prev)
        : prev.filter((q) => q.kind !== 'check');
    for (const banId of dismissedIds) {
      console.log('[CHECK OVERLAY DISMISSED]', {
        banId,
        reason: 'clear-check-overlay',
      });
    }
    dismissCurrentOverlay('clear-check-overlay', next);
  }, [dismissCurrentOverlay]);

  const cancelResultPollBurst = useCallback(() => {
    for (const t of resultPollBurstTimersRef.current) {
      clearTimeout(t);
    }
    resultPollBurstTimersRef.current = [];
  }, []);

  const receiveResult = useCallback(
    (
      payload: BanResult | null | undefined,
      source: 'ws' | 'http' | 'poll',
    ) => {
      const banId = payload?.id ?? null;
      const uid = userIdRef.current;
      if (!banId || !payload) return;

      const block = shouldBlockResultOpen({
        resultBanId: banId,
        overboardInFlightBanId: overboardInFlightRef.current,
      });
      logResultOpenAttempt('receiveResult', {
        resultId: banId,
        allowed: !block.blocked,
        blockReason: block.reason,
        bypassPriorityLock: block.bypassPriorityLock,
        extra: { wsOrHttpSource: source },
      });
      if (block.blocked) {
        logResultPath('receiveResult', 'path-skip', {
          banId,
          resultId: banId,
          allowed: false,
          reason: block.reason ?? 'priority-lock',
          extra: { wsOrHttpSource: source },
        });
        logOverlayPriority('pending-result-blocked', {
          resultId: banId,
          reason: block.reason,
        });
        return;
      }

      const role = resultParticipantRole(uid, payload);
      const elapsedMs = resultElapsedSinceSubmit(
        banId,
        checkSubmitAtRef.current,
      );

      if (overboardInFlightRef.current === banId) {
        logResultPath('receiveResult', 'path-skip', {
          banId,
          resultId: banId,
          allowed: false,
          reason: 'overboard-in-flight',
          extra: { wsOrHttpSource: source },
        });
        logResultLatency('[result-skip-overboard-in-flight]', {
          banId,
          authUserId: uid,
          role,
          source,
          elapsedMs,
        });
        return;
      }

      if (resultDeliveredBanIdsRef.current.has(banId)) {
        console.log('[overboard-repeat-debug] duplicate result blocked', {
          banId,
          source,
          reason: 'result-delivered-ref',
        });
        logResultLatency('[result-skip-duplicate]', {
          banId,
          authUserId: uid,
          role,
          source,
          elapsedMs,
        });
        return;
      }

      if (
        resultCtaConsumedBanIdsRef.current.has(banId) ||
        (uid && isDismissedResultLocally(banId, uid))
      ) {
        console.log('[overboard-repeat-debug] duplicate result blocked', {
          banId,
          source,
          consumed: resultCtaConsumedBanIdsRef.current.has(banId),
          dismissedLocal: uid ? isDismissedResultLocally(banId, uid) : false,
        });
        void acknowledgeBanResultOnServer(banId, tokenRef.current);
        return;
      }

      const mode = source === 'poll' ? 'auto' : 'live';
      const decision = diagnoseResultShow(payload, mode, uid, banId);

      if (!decision.shouldShow) {
        logResultLatency('[result-show-decision]', {
          banId,
          authUserId: uid,
          role,
          source,
          elapsedMs,
          shouldShow: false,
          reason: decision.reason,
        });
        dismissBanResultLocally(banId, payload.viewerId ?? uid);
        void acknowledgeBanResultOnServer(banId, tokenRef.current);
        return;
      }

      logResultLatency('[result-open-immediate]', {
        banId,
        authUserId: uid,
        role,
        source,
        elapsedMs,
      });
      logResultPath('receiveResult', 'receive', {
        banId,
        resultId: banId,
        allowed: true,
        mode,
        extra: { wsOrHttpSource: source },
      });
      openBanResult(payload, mode);

      logResultLatency('[result-show-decision]', {
        banId,
        authUserId: uid,
        role,
        source,
        elapsedMs,
        shouldShow: true,
        reason: decision.reason,
      });
    },
    [openBanResult],
  );

  const pollPendingResultOnce = useCallback(
    async (source: 'interval' | 'burst') => {
      const requestUserId = userIdRef.current;
      const requestToken = tokenRef.current;
      if (!requestUserId || !requestToken) {
        logResultPath('pollPendingResultOnce', 'path-skip', {
          allowed: false,
          reason: 'no-auth',
          extra: { pollSource: source },
        });
        return;
      }
      if (resultOpenRef.current) {
        logResultPath('pollPendingResultOnce', 'path-skip', {
          allowed: false,
          reason: 'result-already-open',
          extra: { pollSource: source },
        });
        return;
      }
      const pollBlock = shouldBlockResultOpen({
        overboardInFlightBanId: overboardInFlightRef.current,
      });
      logResultPath('pollPendingResultOnce', 'poll-gate', {
        allowed: !pollBlock.blocked,
        blockReason: pollBlock.reason,
        bypassPriorityLock: pollBlock.bypassPriorityLock,
        extra: { pollSource: source },
      });
      logResultOpenAttempt('pollPendingResultOnce', {
        allowed: !pollBlock.blocked,
        blockReason: pollBlock.reason,
        bypassPriorityLock: pollBlock.bypassPriorityLock,
        extra: { pollSource: source, phase: 'poll-gate' },
      });
      if (pollBlock.blocked) return;

      try {
        const { result: pendingResult } = await api<{ result: BanResult | null }>(
          '/bans/result/pending',
          { token: requestToken, retries: 0 },
        );
        if (!pendingResult?.id) {
          logResultPath('pollPendingResultOnce', 'poll-miss', {
            allowed: true,
            extra: { pollSource: source },
          });
          return;
        }
        if (resultDeliveredBanIdsRef.current.has(pendingResult.id)) {
          console.log('[overboard-repeat-debug] poll skipped dismissed result', {
            banId: pendingResult.id,
            pollSource: source,
            reason: 'result-delivered-ref',
          });
          logResultPath('pollPendingResultOnce', 'poll-skip-delivered', {
            banId: pendingResult.id,
            resultId: pendingResult.id,
            allowed: false,
            extra: { pollSource: source },
          });
          return;
        }
        if (
          resultCtaConsumedBanIdsRef.current.has(pendingResult.id) ||
          isDismissedResultLocally(pendingResult.id, requestUserId)
        ) {
          console.log('[overboard-repeat-debug] poll skipped dismissed result', {
            banId: pendingResult.id,
            pollSource: source,
            consumed: resultCtaConsumedBanIdsRef.current.has(pendingResult.id),
            dismissedLocal: isDismissedResultLocally(
              pendingResult.id,
              requestUserId,
            ),
          });
          markVisibleOverboardTrace('[POLL RESULT SKIPPED DISMISSED]', {
            banId: pendingResult.id,
            pollSource: source,
          });
          void acknowledgeBanResultOnServer(pendingResult.id, requestToken);
          return;
        }

        const submitAt = checkSubmitAtRef.current.get(pendingResult.id);
        const elapsedClientMs =
          submitAt != null
            ? Math.round(performance.now() - submitAt)
            : undefined;

        const role = resultParticipantRole(requestUserId, pendingResult);
        if (source === 'burst') {
          logResultLatency('[result-poll-burst]', {
            banId: pendingResult.id,
            authUserId: requestUserId,
            role,
            source: 'poll',
            elapsedMs: elapsedClientMs,
          });
        } else {
          logResultLatency('[result-poll-hit]', {
            banId: pendingResult.id,
            authUserId: requestUserId,
            role,
            source: 'poll',
            elapsedMs: elapsedClientMs,
          });
        }
        logResultPath('pollPendingResultOnce', 'poll-hit', {
          banId: pendingResult.id,
          resultId: pendingResult.id,
          allowed: true,
          extra: { pollSource: source },
        });
        receiveResult(pendingResult, 'poll');
      } catch {
        /* fallback only */
      }
    },
    [receiveResult],
  );

  const scheduleResultPollBurst = useCallback(() => {
    cancelResultPollBurst();
    const uid = userIdRef.current;
    for (const [banId] of checkSubmitAtRef.current) {
      logResultLatency('[result-poll-burst-scheduled]', {
        banId,
        authUserId: uid,
        role: resultParticipantRole(uid, checkBanRef.current),
        delaysMs: [0, 200, 500, 900],
      });
    }
    for (const ms of [0, 200, 500, 900]) {
      const t = window.setTimeout(
        () => void pollPendingResultOnce('burst'),
        ms,
      );
      resultPollBurstTimersRef.current.push(t);
    }
  }, [cancelResultPollBurst, pollPendingResultOnce]);

  useEffect(() => () => cancelResultPollBurst(), [cancelResultPollBurst]);

  const setCheckBanSafe = useCallback(
    (b: BanInteraction | null) => {
      const viewerId = auth.user?.id ?? null;
      if (b !== null) {
        if (
          !shouldShowCheckOverlay(
            b,
            viewerId,
            dismissedCheckSessionRef.current,
            answeredCheckRef.current,
            checkAnswerInFlightRef.current,
            resultOpenRef.current,
          )
        ) {
          console.log('[check-overlay]', {
            event: 'reject-set',
            banId: b.id,
            authUserId: viewerId,
          });
          return;
        }
        challengeLog('check:set', { id: b.id, status: b.status });
        enqueueNotification({
          kind: 'check',
          ban: enrichBanInteraction(b),
        });
        return;
      }
      applyOverlayQueue(
        overlayQueueRef.current.filter((q) => q.kind !== 'check'),
      );
    },
    [auth.user?.id, applyOverlayQueue, enqueueNotification],
  );

  const openDeepLinkCheck = useCallback(
    (b: BanInteraction) => {
      noteDeepLinkHandlerOpened('openDeepLinkCheck', b.id);
      const viewerId = userIdRef.current;
      if (!viewerId || auth.loading) {
        bufferedCheckDeepLinkRef.current = enrichBanInteraction(b);
        console.log('[check-deeplink]', {
          banId: b.id,
          buffered: true,
          reason: 'auth-not-ready',
        });
        return;
      }
      if (
        !shouldShowCheckOverlay(
          b,
          viewerId,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          resultOpenRef.current,
        )
      ) {
        console.log('[check-deeplink]', {
          banId: b.id,
          rejected: true,
          authUserId: viewerId,
        });
        return;
      }
      setLobbyOpen(false);
      challengeLog('check:deeplink', { id: b.id, status: b.status });
      enqueueNotification(
        { kind: 'check', ban: enrichBanInteraction(b) },
        { live: true, source: 'deeplink' },
      );
      resolvePendingDeepLinkRoute('check', b.id);
      logDeepLinkHandlerResult({
        type: 'check',
        banId: b.id,
        instantBanOpen: false,
        sendFlowOpen: false,
        selectedBanId: b.id,
        overlayQueueLength: overlayQueueRef.current.length + 1,
        ok: true,
      });
    },
    [auth.loading, enqueueNotification],
  );

  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    const buffered = bufferedCheckDeepLinkRef.current;
    if (!buffered) return;
    bufferedCheckDeepLinkRef.current = null;
    console.log('[check-deeplink]', {
      banId: buffered.id,
      action: 'apply-buffered',
    });
    openDeepLinkCheck(buffered);
  }, [auth.user?.id, auth.loading, openDeepLinkCheck]);

  const clearDeepLinkRepeatBan = useCallback(() => {
    setDeepLinkRepeatBan(null);
  }, []);

  const openDeepLinkRepeat = useCallback(
    (b: BanInteraction) => {
      noteDeepLinkHandlerOpened('openDeepLinkRepeat', b.id);
      lockNotificationQueue('repeat-ban-flow', b.id);
      logOverlayPriority('repeat-flow-start', { banId: b.id });
      suppressQueuedOverlayDisplay();
      const enriched = enrichBanInteraction(b);
      if (!userIdRef.current || auth.loading) {
        bufferedRepeatDeepLinkRef.current = enriched;
        console.log('[repeat-deeplink]', {
          banId: b.id,
          buffered: true,
          reason: 'auth-not-ready',
        });
        return;
      }
      openSendFlow();
      setDeepLinkRepeatBan(enriched);
      resolvePendingDeepLinkRoute('repeat', b.id);
      console.log('[repeat-deeplink]', { banId: b.id, queued: true });
      logDeepLinkHandlerResult({
        type: 'repeat',
        banId: b.id,
        instantBanOpen: false,
        sendFlowOpen: true,
        selectedBanId: b.id,
        overlayQueueLength: overlayQueueRef.current.length,
        ok: true,
      });
    },
    [auth.loading, openSendFlow, suppressQueuedOverlayDisplay],
  );

  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    const buffered = bufferedRepeatDeepLinkRef.current;
    if (!buffered) return;
    bufferedRepeatDeepLinkRef.current = null;
    console.log('[repeat-deeplink]', {
      banId: buffered.id,
      action: 'apply-buffered',
    });
    openSendFlow();
    setDeepLinkRepeatBan(buffered);
    logDeepLinkHandlerResult({
      type: 'repeat',
      banId: buffered.id,
      instantBanOpen: false,
      sendFlowOpen: true,
      selectedBanId: buffered.id,
      overlayQueueLength: overlayQueueRef.current.length,
      ok: true,
      reason: 'buffered',
    });
  }, [auth.user?.id, auth.loading, openSendFlow]);

  const clearDeepLinkReplyBan = useCallback(() => {
    setDeepLinkReplyBan(null);
  }, []);

  const clearDeepLinkActiveBan = useCallback(() => {
    setDeepLinkActiveBan(null);
  }, []);

  const clearActiveBanDeepLinkShell = useCallback((source = 'unknown') => {
    const banId = activeBanDeepLinkBanIdRef.current;
    if (
      !banId &&
      !activeBanCardVisibleRef.current &&
      !bufferedActiveDeepLinkRef.current
    ) {
      return;
    }
    console.log('[active-repeat-debug] clear active deep link shell', {
      source,
      banId,
      hadCardVisible: activeBanCardVisibleRef.current,
    });
    const lockReason = getNotificationQueueLockReason();
    if (
      lockReason === 'deep-link-active-ban' ||
      (source === 'success-exit' && lockReason === 'repeat-ban-flow')
    ) {
      unlockNotificationQueue(`active-repeat:${source}`);
    }
    dismissActiveBanDeepLinkRoute(source);
    bufferedActiveDeepLinkRef.current = null;
    activeBanCardVisibleRef.current = false;
    activeBanDeepLinkBanIdRef.current = null;
    setActiveBanCardReady(true);
    setActiveBanDeepLinkBanId(null);
    setDeepLinkActiveBan(null);
    deepLinkBlockedRef.current = isNotificationQueueLocked();
    logQueueDebug('active locks after clear shell', {
      source,
      queueLock: getNotificationQueueLockReason(),
      deepLinkBlocked: deepLinkBlockedRef.current,
      activeBanDeepLinkId: activeBanDeepLinkBanIdRef.current,
    });
  }, []);

  const notifyActiveBanCardVisible = useCallback((banId: string) => {
    if (activeBanCardVisibleRef.current) return;
    activeBanCardVisibleRef.current = true;
    setActiveBanCardReady(true);
    logOverlayPriority('active-ban-opened', { banId });
    logActiveBanDeeplink('active-card-visible', {
      banId,
      cardVisible: true,
      bansOverlayOpen: true,
      lobbyBlocked: false,
    });
  }, []);

  const openDeepLinkActive = useCallback(
    (b: BanInteraction) => {
      noteDeepLinkHandlerOpened('openDeepLinkActive', b.id);
      lockNotificationQueue('deep-link-active-ban', b.id);
      suppressQueuedOverlayDisplay();
      const enriched = enrichBanInteraction(b);
      const payload = `a_${b.id}`;
      logActiveBanDeeplink('telegram-open', { payload, banId: b.id });
      logActiveBanDeeplink('ban-id', { payload, banId: b.id });
      logActiveBanDeeplink('lobby-blocked', {
        payload,
        banId: b.id,
        lobbyBlocked: true,
      });
      activeBanCardVisibleRef.current = false;
      setActiveBanCardReady(false);
      setActiveBanDeepLinkBanId(b.id);
      setLobbyOpen(false);
      if (!userIdRef.current || auth.loading) {
        bufferedActiveDeepLinkRef.current = enriched;
        console.log('[active-deeplink]', {
          banId: b.id,
          buffered: true,
          reason: 'auth-not-ready',
        });
        return;
      }
      logOpenActiveBanCard(b.id, 'openDeepLinkActive');
      resolvePendingDeepLinkRoute('active-ban', b.id);
      setDeepLinkActiveBan(enriched);
      console.log('[active-deeplink]', { banId: b.id, queued: true });
      logDeepLinkHandlerResult({
        type: 'active',
        banId: b.id,
        instantBanOpen: false,
        sendFlowOpen: false,
        selectedBanId: b.id,
        overlayQueueLength: overlayQueueRef.current.length,
        ok: true,
        reason: 'active-ban-card',
      });
    },
    [auth.loading, suppressQueuedOverlayDisplay],
  );

  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    const buffered = bufferedActiveDeepLinkRef.current;
    if (!buffered) return;
    bufferedActiveDeepLinkRef.current = null;
    console.log('[active-deeplink]', {
      banId: buffered.id,
      action: 'apply-buffered',
    });
    openDeepLinkActive(buffered);
  }, [auth.user?.id, auth.loading, openDeepLinkActive]);

  const submitCheckAnswer = useCallback(
    async (banId: string, completed: boolean) => {
      const uid = userIdRef.current;
      const token = tokenRef.current;
      if (!uid || !token) {
        return { ok: false, error: 'Нет авторизации' };
      }

      dismissedCheckSessionRef.current.add(banId);
      answeredCheckRef.current.add(banId);
      markCheckAnsweredLocally(uid, banId);
      checkAnswerInFlightRef.current.add(banId);
      console.log('[CHECK OVERLAY DISMISSED]', {
        banId,
        reason: 'user-answer',
        completed,
      });
      const t0 = performance.now();
      checkSubmitAtRef.current.set(banId, t0);
      const role = resultParticipantRole(uid, checkBanRef.current);
      logResultLatency('[result-click-answer]', {
        banId,
        authUserId: uid,
        role,
        elapsedMs: 0,
      });
      dismissCurrentOverlay(
        'user-answer',
        removeOverlaysForBan(overlayQueueRef.current, banId, ['check']),
      );
      setCheckWaiting(false);

      try {
        logResultLatency('[result-http-start]', {
          banId,
          authUserId: uid,
          role,
          elapsedMs: Math.round(performance.now() - t0),
        });
        const res = await api<{
          done: boolean;
          waiting?: boolean;
          result?: BanResult;
        }>(`/bans/${banId}/check`, {
          method: 'POST',
          token,
          body: JSON.stringify({ completed }),
          retries: 0,
        });

        const elapsedMs = Math.round(performance.now() - t0);
        logResultLatency('[result-http-response]', {
          banId,
          authUserId: uid,
          role,
          source: 'http',
          elapsedMs,
          done: res.done,
          waiting: !!res.waiting,
          hasResult: !!res.result,
        });

        if (res.done && res.result) {
          challengeLog('check:done', { banId });
          receiveResult(res.result, 'http');
          queueMicrotask(() => {
            setOverlayQueue((prev) =>
              removeOverlaysForBan(prev, banId, ['check', 'incoming']),
            );
            void refreshUserRef.current().catch(() => {});
          });
        } else if (res.waiting) {
          challengeLog('check:waiting-partner', { banId });
          scheduleResultPollBurst();
        } else if (res.done) {
          scheduleResultPollBurst();
        }

        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка отправки';
        challengeLog('check:submit-failed', { banId, message });
        return { ok: false, error: message };
      } finally {
        checkAnswerInFlightRef.current.delete(banId);
      }
    },
    [dismissCurrentOverlay, receiveResult, scheduleResultPollBurst],
  );

  const readDirectOverboardSnapshot =
    useCallback((): OverboardDirectStateSnapshot => {
      const renderDirectActive =
        directResultOverlayActiveRef.current || directResultOverlayActive;
      const resultBanId =
        resultBanIdRef.current ??
        resultRef.current?.id ??
        null;
      const locked = isNotificationQueueLocked();
      const bypassBanId = getLocalOverboardBypassBanId();
      const priorityBlocks =
        !renderDirectActive &&
        locked &&
        !isLocalOverboardBypassForBan(resultBanId);
      const displayBanId = priorityBlocks
        ? null
        : (displayResultBanIdRef.current ?? resultBanId);
      const showDirect =
        showDirectOverboardLayerRef.current ||
        (renderDirectActive && displayBanId != null && resultRef.current != null);
      return {
        directResultOverlayActive: renderDirectActive,
        directResultOverlayRef: directResultOverlayRef.current,
        resultOpenRef: resultOpenRef.current,
        resultBanId,
        activeOverlayKind: showDirect
          ? 'result'
          : (overlayQueueRef.current[0]?.kind ?? null),
        overboardInFlightBanId: overboardInFlightRef.current,
        localBypassBanId: bypassBanId,
        priorityLocked: locked,
        showDirectOverboardLayer: showDirect,
        displayResultBanId: displayBanId,
      };
    }, [directResultOverlayActive]);

  const snapshotOverboardOverlayState = useCallback(
    (banId: string) => ({
      banId,
      activeOverlayKind: directResultOverlayRef.current
        ? 'result'
        : (overlayQueueRef.current[0]?.kind ?? null),
      directResultOverlay: directResultOverlayRef.current,
      overlayQueueLength: overlayQueueRef.current.length,
      resultOpen: resultOpenRef.current,
      lobbyOpen: lobbyOpenRef.current,
      resultDelivered: resultDeliveredBanIdsRef.current.has(banId),
      incomingGateHead:
        overlayQueueRef.current[0]?.kind === 'incoming'
          ? overlayQueueRef.current[0].ban.id
          : null,
    }),
    [],
  );

  const logOverboardFinalState = useCallback(
    (banId: string, outcome: string) => {
      traceOverboardFlow('final-state', {
        ...snapshotOverboardOverlayState(banId),
        outcome,
      });
    },
    [snapshotOverboardOverlayState],
  );

  const forceOpenOverboardResult = useCallback(
    function forceOpenOverboardResultImpl(
      payload: BanResult,
      banId: string,
      clickTs?: number | null,
      opts?: { source?: 'local-overboard-click' | 'api-sync' | 'recovery' },
    ): boolean {
      markVisibleOverboardTrace('FORCE-OVERBOARD-ENTER-VISIBLE', {
        banId,
        implId: FORCE_OPEN_OVERBOARD_IMPL_ID,
        diagBuild: 'overboard-diag-v5',
      });
      console.log('[FORCE OVERBOARD] enter', FORCE_OPEN_OVERBOARD_IMPL_ID);
      const uid = userIdRef.current;
      const inFlightId = overboardInFlightRef.current;
      const isLocalForce =
        opts?.source === 'local-overboard-click' ||
        isLocalOverboardBypassForBan(banId) ||
        inFlightId === banId;

      logForceOverboard('enter', {
        banId,
        source: opts?.source ?? null,
        isLocalForce,
        inFlightId,
        localBypassBanId: getLocalOverboardBypassBanId(),
      });
      logForceOverboard('input', {
        banId,
        resultExists: !!payload,
        resultId: payload?.id ?? null,
        outcome: payload?.outcome ?? null,
        senderId: payload?.sender?.id ?? null,
        receiverId: payload?.receiver?.id ?? null,
        viewerId: payload?.viewerId ?? null,
        textLen: payload?.text?.trim().length ?? 0,
      });

      if (!uid) {
        logForceOverboard('early-return', {
          banId,
          reason: 'no-auth-user',
          guard: 'uid',
        });
        return false;
      }

      if (
        resultCtaConsumedBanIdsRef.current.has(banId) ||
        isDismissedResultLocally(banId, uid)
      ) {
        console.log('[overboard-repeat-debug] duplicate result blocked', {
          banId,
          source: 'forceOpenOverboardResult',
          consumed: resultCtaConsumedBanIdsRef.current.has(banId),
          dismissedLocal: isDismissedResultLocally(banId, uid),
        });
        console.log('[DIRECT RESULT REOPEN BLOCKED]', {
          reason: 'dismissed-after-result-cta',
          banId,
        });
        markVisibleOverboardTrace('[DIRECT RESULT REOPEN BLOCKED]', {
          reason: 'dismissed-after-result-cta',
          banId,
          source: 'forceOpenOverboardResult',
        });
        logForceOverboard('early-return', {
          banId,
          reason: 'dismissed-after-result-cta',
          guard: 'result-cta-consumed',
        });
        return false;
      }

      if (!payload) {
        logForceOverboard('early-return', {
          banId,
          reason: 'no-payload',
          guard: 'payload',
        });
        return false;
      }

      const payloadValidStrict = isValidBanResultPayload(payload);
      const payloadValidOptimistic = isDirectOverboardOpenable(payload, uid);
      logForceOverboard('input', {
        banId,
        resultValidStrict: payloadValidStrict,
        resultValidOptimistic: payloadValidOptimistic,
        isLocalForce,
      });

      const block = shouldBlockResultOpen({
        source: 'forceOpenOverboardResult',
        resultBanId: banId,
        overboardInFlightBanId: inFlightId,
        bypassPriorityLock: isLocalForce,
        explicitUserUnlock: isLocalForce,
      });
      logForceOverboard('guard', {
        banId,
        guard: 'shouldBlockResultOpen',
        blocked: block.blocked,
        blockReason: block.reason,
        bypassPriorityLock: block.bypassPriorityLock,
        isLocalForce,
        queueLocked: isNotificationQueueLocked(),
      });
      logResultOpenAttempt('forceOpenOverboardResult', {
        resultId: banId,
        allowed: !block.blocked,
        blockReason: block.reason,
        bypassPriorityLock: block.bypassPriorityLock || isLocalForce,
      });

      if (block.blocked && !isLocalForce) {
        logForceOverboard('early-return', {
          banId,
          reason: block.reason ?? 'priority-lock',
          guard: 'shouldBlockResultOpen',
        });
        return false;
      }

      let normalized: BanResult = {
        ...payload,
        viewerId: payload.viewerId ?? uid,
      };

      if (isLocalForce) {
        if (!payloadValidOptimistic) {
          logForceOverboard('early-return', {
            banId,
            reason: 'optimistic-not-openable',
            guard: 'isDirectOverboardOpenable',
            senderId: payload.sender?.id ?? null,
            receiverId: payload.receiver?.id ?? null,
          });
          return false;
        }
        normalized = ensureDirectOverboardOptimisticResult(normalized, uid);
      } else if (!payloadValidStrict) {
        logForceOverboard('early-return', {
          banId,
          reason: 'invalid-payload',
          guard: 'isValidBanResultPayload',
          senderId: payload.sender?.id ?? null,
          receiverId: payload.receiver?.id ?? null,
        });
        return false;
      }

      const normalizedValid = isValidBanResultPayload(normalized);
      logForceOverboard('input', {
        banId,
        resultValid: normalizedValid,
        senderId: normalized.sender.id,
        receiverId: normalized.receiver.id,
        viewerId: normalized.viewerId,
      });
      if (!normalizedValid) {
        logForceOverboard('early-return', {
          banId,
          reason: 'normalized-invalid',
          guard: 'isValidBanResultPayload-after-normalize',
        });
        return false;
      }

      dismissedIncomingRef.current.add(banId);

      const cleaned = removeOverlaysForBan(
        overlayQueueRef.current,
        banId,
        ['incoming', 'check'],
      );
      overlayQueueRef.current = cleaned;

      logForceOverboard('before-flushSync', {
        banId,
        queueLength: cleaned.length,
        directWasActive: directResultOverlayRef.current,
      });

      try {
        flushSync(() => {
          logForceOverboard('inside-flushSync', { banId });
          setOverboardTransitionActive(false);
          setIncomingBan(null);
          setCheckBan(null);
          setOverlayQueue(cleaned);
          setPopups((prev) => prev.filter((x) => !isOverboardEnergyPopup(x)));
          setResult(normalized);
          setDirectResultOverlayActive(true);
          resultRef.current = normalized;
          commitDirectOverboardLayerRefs(banId, true);
          logForceOverboard('setResult-done', {
            banId,
            resultBanId: normalized.id,
          });
          logForceOverboard('setDirectResultOverlayActive-done', {
            banId,
            directResultOverlayActive: true,
            activeOverlayKind: 'result',
          });
        });
      } catch (error) {
        logForceOverboard('flushSync-error', {
          banId,
          reason: error instanceof Error ? error.message : String(error),
        });
        const gateBefore = snapshotDirectOverboardGate();
        clearDirectOverboardLayerRefs();
        logDirectOverboardStateReset({
          source: 'forceOpenOverboardResult',
          reason: 'flushSync-error',
          before: gateBefore,
          after: {
            directResultOverlayActive: false,
            directResultOverlayRef: false,
            resultBanId: null,
            showDirectOverboardLayer: false,
            hasResult: gateBefore.hasResult,
          },
        });
        return false;
      }

      commitDirectOverboardLayerRefs(banId, true);
      resultRef.current = normalized;

      logForceOverboard('state-written', {
        banId,
        resultBanId: normalized.id,
        directResultOverlayActive: true,
        directResultOverlayRef: directResultOverlayRef.current,
        resultOpenRef: resultOpenRef.current,
        showDirectOverboardLayerRef: showDirectOverboardLayerRef.current,
        activeOverlayKind: 'result',
        isLocalForce,
        bypassPriorityLock: block.bypassPriorityLock || isLocalForce,
      });
      logResultOpenAttempt('forceOpenOverboardResult', {
        resultId: banId,
        allowed: true,
        bypassPriorityLock: block.bypassPriorityLock || isLocalForce,
        extra: { phase: 'state-written', directResultOverlay: true },
      });
      logOverboardDirectState('after', readDirectOverboardSnapshot(), {
        banId,
        forceReturned: true,
        step: 'forceOpenOverboardResult',
      });

      queueMicrotask(() => {
        closeSendFlow();
        logOverboardPaint('closeSendFlow deferred', clickTs);
        if (lobbyOpenRef.current) {
          setLobbyOpen(false);
          lobbyOpenRef.current = false;
        }
      });

      resultDeliveredBanIdsRef.current.add(banId);
      shownOverlayKeysRef.current.add(
        overlayQueueKey({ kind: 'result', result: normalized }),
      );

      console.log('[overboard-repeat-debug] status shown', {
        banId,
        source: opts?.source ?? null,
        outcome: normalized.outcome,
      });

      logResultUi(normalized.outcome, {
        overlayKind: 'result',
        compactCard: false,
        fullOverlay: true,
        source: 'forceOpenOverboardResult',
        overlayQueueLength: overlayQueueRef.current.length,
        resultDelivered: true,
      });
      logResultPresentation(normalized.outcome, {
        component: 'ResultOverlay',
        presentation: resolveResultPresentation(normalized.outcome),
        displayHeadline: normalized.headline,
        resultStatus: 'OVERBOARD',
        source: 'forceOpenOverboardResult',
      });

      logForceOverboard('exit', { banId, ok: true });
      return true;
    },
    [
      clearDirectOverboardLayerRefs,
      closeSendFlow,
      commitDirectOverboardLayerRefs,
      readDirectOverboardSnapshot,
      snapshotDirectOverboardGate,
    ],
  );
  assignForceOpenOverboardRef(forceOpenOverboardResult);
  useLayoutEffect(() => {
    assignForceOpenOverboardRef(forceOpenOverboardResult);
  }, [assignForceOpenOverboardRef, forceOpenOverboardResult]);

  const collectOverboardFallbackBans = useCallback(
    (banId: string, extra: BanInteraction[] = []): BanInteraction[] => {
      const out: BanInteraction[] = [];
      const seen = new Set<string>();
      const push = (row: BanInteraction | null | undefined) => {
        if (!row?.id || row.id !== banId || seen.has(row.id)) return;
        seen.add(row.id);
        out.push(row);
      };
      for (const row of extra) push(row);
      push(incomingBanRef.current);
      push(sessionActiveBansRef.current.find((row) => row.id === banId));
      return out;
    },
    [],
  );

  const clearReplyFastSessionAfterAnswer = useCallback(
    (banId: string, opts?: { preserveReplySendIds?: boolean }) => {
      const preserveReplySendIds = opts?.preserveReplySendIds === true;
      if (replyDeeplinkFastTimeoutRef.current) {
        clearTimeout(replyDeeplinkFastTimeoutRef.current);
        replyDeeplinkFastTimeoutRef.current = null;
      }
      replyDeeplinkFastOpenedRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastWrittenAtRef.current = null;
      replyDeeplinkFastWrittenBanIdRef.current = null;
      replyDeeplinkFastHydratedRef.current = false;
      replyDeeplinkFastShellRef.current = false;
      replyDeeplinkPrefetchRef.current = false;
      setReplyDeeplinkFastShell(false);
      setDeepLinkReplyBooting(false);

      if (!preserveReplySendIds) {
        replyDeepLinkBanIdRef.current = null;
        setReplyDeepLinkBanId((prev) => (prev === banId ? null : prev));
        setIncomingReplyBanId((prev) => (prev === banId ? null : prev));
        setReplyHandoffLock(false);
        setReplyWhatReady(true);
        replyFlowArmedBanIdRef.current = null;
        pinReplyToBanId(null);
      }

      console.log('[REPLY FAST CLEARED AFTER ANSWER]', {
        banId,
        preserveReplySendIds,
      });
      markVisibleOverboardTrace('[REPLY FAST CLEARED AFTER ANSWER]', {
        banId,
        preserveReplySendIds,
      });
    },
    [pinReplyToBanId],
  );

  const consumeIncomingAfterAnswer = useCallback(
    (banId: string, answer: 'overboard' | 'reply') => {
      const alreadyConsumed = incomingConsumedAfterAnswerRef.current.has(banId);
      incomingConsumedAfterAnswerRef.current.add(banId);
      dismissedIncomingRef.current.add(banId);
      locallyAckedIncomingRef.current.add(banId);

      if (!alreadyConsumed) {
        console.log('[INCOMING CONSUMED AFTER ANSWER]', { banId, answer });
        markVisibleOverboardTrace('[INCOMING CONSUMED AFTER ANSWER]', {
          banId,
          answer,
        });
      }

      const beforeQueue = overlayQueueRef.current;
      const beforeLen = beforeQueue.length;
      const nextQueue = removeOverlaysForBan(beforeQueue, banId, ['incoming']);
      if (nextQueue.length !== beforeLen) {
        applyOverlayQueue(nextQueue);
      } else if (overlayQueueRef.current !== nextQueue) {
        overlayQueueRef.current = nextQueue;
        setOverlayQueue(nextQueue);
      }

      console.log('[INCOMING QUEUE POP AFTER ANSWER]', {
        banId,
        before: beforeLen,
        after: nextQueue.length,
        answer,
      });
      markVisibleOverboardTrace('[INCOMING QUEUE POP AFTER ANSWER]', {
        banId,
        before: beforeLen,
        after: nextQueue.length,
        answer,
      });

      if (incomingBanRef.current?.id === banId) {
        setIncomingBan(null);
      }
      clearReplyFastSessionAfterAnswer(banId, {
        preserveReplySendIds: answer === 'reply',
      });
    },
    [applyOverlayQueue, clearReplyFastSessionAfterAnswer],
  );

  const dismissIncomingCardForReplyCompose = useCallback(
    (banId: string) => {
      incomingReplyComposeDismissedRef.current.add(banId);

      const beforeQueue = overlayQueueRef.current;
      const beforeLen = beforeQueue.length;
      const nextQueue = removeOverlaysForBan(beforeQueue, banId, ['incoming']);
      if (nextQueue.length !== beforeLen) {
        applyOverlayQueue(nextQueue);
      } else if (overlayQueueRef.current !== nextQueue) {
        overlayQueueRef.current = nextQueue;
        setOverlayQueue(nextQueue);
      }

      if (incomingBanRef.current?.id === banId) {
        setIncomingBan(null);
      }

      clearReplyFastSessionAfterAnswer(banId, { preserveReplySendIds: true });
      setReplyHandoffLock(false);
      setReplyWhatReady(true);
      setDeepLinkReplyBooting(false);

      console.log('[INCOMING CARD DISMISSED FOR REPLY COMPOSE]', { banId });
      markVisibleOverboardTrace('[INCOMING CARD DISMISSED FOR REPLY COMPOSE]', {
        banId,
      });
    },
    [applyOverlayQueue, clearReplyFastSessionAfterAnswer],
  );

  const finalizeIncomingReplyAfterSend = useCallback(
    (banId: string) => {
      incomingConsumedAfterAnswerRef.current.add(banId);
      dismissedIncomingRef.current.add(banId);
      locallyAckedIncomingRef.current.add(banId);
      incomingReplyComposeDismissedRef.current.delete(banId);

      const beforeQueue = overlayQueueRef.current;
      const nextQueue = removeOverlaysForBan(beforeQueue, banId, ['incoming']);
      if (nextQueue.length !== beforeQueue.length) {
        applyOverlayQueue(nextQueue);
      }

      if (incomingBanRef.current?.id === banId) {
        setIncomingBan(null);
      }

      clearReplyFastSessionAfterAnswer(banId);

      console.log('[INCOMING REPLY FINALIZED AFTER SEND]', { banId });
      markVisibleOverboardTrace('[INCOMING REPLY FINALIZED AFTER SEND]', {
        banId,
      });
    },
    [applyOverlayQueue, clearReplyFastSessionAfterAnswer],
  );

  const openIncomingOverboardOptimistic = useCallback(
    (
      ban: BanInteraction,
      clickTs = performance.now(),
      opts?: { fallbackBans?: BanInteraction[] },
    ): boolean => {
      const banId = ban.id;
      const uid = userIdRef.current;
      logOverboardDirectState('before', readDirectOverboardSnapshot(), {
        banId,
        step: 'openIncomingOverboardOptimistic',
      });
      logResultPath('openIncomingOverboardOptimistic', 'attempt', {
        banId,
        resultId: banId,
        extra: { hasUid: !!uid },
      });
      if (!uid) {
        logResultPath('openIncomingOverboardOptimistic', 'path-skip', {
          banId,
          allowed: false,
          reason: 'no-auth-user',
        });
        return false;
      }

      const buildCtx: OptimisticOverboardBuildContext = {
        viewerId: uid,
        viewer: authUserRef.current,
        friends: friendsRef.current,
        fallbackBans: collectOverboardFallbackBans(
          banId,
          opts?.fallbackBans ?? [],
        ),
      };
      const optimistic = buildOptimisticOverboardResult(ban, uid, buildCtx);
      logOverboardTiming('optimistic-built', clickTs);
      logOverboardDirectState('builtResult', readDirectOverboardSnapshot(), {
        banId,
        builtResult: !!optimistic,
        diagBuild: 'overboard-diag-v5',
      });
      markVisibleOverboardTrace('BUILT-RESULT-VISIBLE', {
        banId,
        builtResult: !!optimistic,
        diagBuild: 'overboard-diag-v5',
      });
      if (!optimistic) {
        const diag = getOptimisticOverboardBuildDiagnostics(ban, uid, buildCtx);
        logResultPath('openIncomingOverboardOptimistic', 'path-skip', {
          banId,
          allowed: false,
          reason: 'optimistic-build-null',
          extra: {
            missingSenderId: diag.missingSenderId,
            missingReceiverId: diag.missingReceiverId,
            missingText: diag.missingText,
            missingBanId: diag.missingBanId,
            missingParticipants: diag.missingParticipants,
            buildReason: diag.reason,
          },
        });
        return false;
      }

      logResultPath('openIncomingOverboardOptimistic', 'state-written', {
        banId,
        resultId: banId,
        allowed: true,
        extra: { phase: 'optimistic-built' },
      });

      logOverboardTiming('flushSync-start', clickTs);
      armLocalOverboardBypass(banId);
      logResultPath('local-overboard-click', 'attempt', {
        banId,
        resultId: banId,
        allowed: true,
        bypassPriorityLock: true,
      });
      overboardInFlightRef.current = banId;
      dismissedIncomingRef.current.add(banId);

      logOverboardDirectState('calling forceOpenOverboardResult', readDirectOverboardSnapshot(), {
        banId,
        diagBuild: 'overboard-diag-v5',
      });
      console.error('DIRECT-CALL-VISIBLE-1');
      markVisibleOverboardTrace('DIRECT-CALL-VISIBLE-1', {
        banId,
        diagBuild: 'overboard-diag-v5',
      });
      console.error('DIRECT-CALL-VISIBLE-2');
      markVisibleOverboardTrace('DIRECT-CALL-VISIBLE-2', {
        banId,
        diagBuild: 'overboard-diag-v5',
      });

      let ok = false;
      try {
        const refFn = forceOpenOverboardResultRef.current;
        const implFn = forceOpenOverboardLatestImplRef.current;
        markVisibleOverboardTrace('DIRECT-CALL-PROBE', {
          argsBanId: banId,
          ...probeForceOpenRef(refFn, implFn),
        });

        if (typeof refFn !== 'function') {
          markVisibleOverboardTrace('DIRECT-CALL-NOT-A-FUNCTION', {
            argsBanId: banId,
            typeofRef: typeof refFn,
          });
        } else {
          markVisibleOverboardTrace('DIRECT-CALL-BEFORE-INVOKE', {
            argsBanId: banId,
            fnName: refFn.name || '(anonymous)',
          });
          ok = refFn(optimistic, banId, clickTs, {
            source: 'local-overboard-click',
          });
          markVisibleOverboardTrace('DIRECT-CALL-AFTER-INVOKE', {
            argsBanId: banId,
            returned: ok,
          });
        }
      } catch (error) {
        markVisibleOverboardTrace('DIRECT-CALL-EXCEPTION', {
          argsBanId: banId,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        ok = false;
      }

      logOverboardTiming('result-state-set', clickTs);
      logOverboardDirectState('force returned', readDirectOverboardSnapshot(), {
        banId,
        forceReturned: ok,
      });

      if (!ok) {
        logResultPath('forceOpenOverboardResult', 'path-skip', {
          banId,
          allowed: false,
          reason: 'force-open-returned-false',
        });
        overboardInFlightRef.current = null;
        clearLocalOverboardBypass();
        return false;
      }

      traceOverboardFlow('optimistic-result-opened', { banId });
      logOverboardDirectState('after', readDirectOverboardSnapshot(), {
        banId,
        optimisticOpened: true,
      });
      consumeIncomingAfterAnswer(banId, 'overboard');
      return true;
    },
    [
      collectOverboardFallbackBans,
      consumeIncomingAfterAnswer,
      readDirectOverboardSnapshot,
    ],
  );

  const runIncomingOverboardApi = useCallback(
    async (
      ban: BanInteraction,
      clickTs?: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      const banId = ban.id;
      const uid = userIdRef.current;
      const token = tokenRef.current;
      if (!uid || !token) {
        return { ok: false, error: 'Нет авторизации' };
      }

      logOverboardTiming('api-start', clickTs);
      traceOverboardFlow('submit-start', {
        banId,
        authUserId: uid,
        optimistic: true,
      });
      setViralOnboarding(false);
      challengeLog('incoming:overboard', { banId });

      const syncOverboardResultFromApi = (
        payload: BanResult,
        source: string,
      ): boolean => {
        if (!isValidBanResultPayload(payload)) return false;
        const normalized: BanResult = {
          ...payload,
          viewerId: payload.viewerId ?? uid,
        };
        if (
          resultCtaConsumedBanIdsRef.current.has(banId) ||
          isDismissedResultLocally(banId, uid)
        ) {
          console.log('[overboard-repeat-debug] duplicate result blocked', {
            banId,
            source: `api-sync:${source}`,
            consumed: resultCtaConsumedBanIdsRef.current.has(banId),
            dismissedLocal: isDismissedResultLocally(banId, uid),
          });
          console.log('[DIRECT RESULT REOPEN BLOCKED]', {
            reason: 'dismissed-after-result-cta',
            banId,
          });
          markVisibleOverboardTrace('[DIRECT RESULT REOPEN BLOCKED]', {
            reason: 'dismissed-after-result-cta',
            banId,
            source: `api-sync:${source}`,
          });
          traceOverboardFlow('api-sync-skipped-dismissed', { banId, source });
          return true;
        }
        if (
          directResultOverlayRef.current &&
          resultDeliveredBanIdsRef.current.has(banId)
        ) {
          setResult((prev) =>
            prev
              ? mergeOverboardResultUsers(prev, normalized)
              : normalized,
          );
          traceOverboardFlow('optimistic-sync-api', { banId, source });
          logOverboardFinalState(banId, `sync-${source}`);
          return true;
        }
        return forceOpenOverboardResultRef.current(normalized, banId, undefined, {
          source: 'api-sync',
        });
      };

      const finishOverboardSuccess = (payload: BanResult, source: string) => {
        syncOverboardResultFromApi(payload, source);
        void acknowledgeIncomingFully(banId, token, uid).catch(() => {});
        queueMicrotask(() => {
          void refreshUserRef.current().catch(() => {});
        });
        return { ok: true as const };
      };

      const fetchResultByBanId = async (
        source: string,
      ): Promise<BanResult | null> => {
        try {
          const fetched = await api<{ result: BanResult | null }>(
            `/bans/${banId}/result`,
            { token, retries: 0, timeoutMs: 5000 },
          );
          traceOverboardFlow('api-response-raw', {
            banId,
            source,
            result: fetched.result,
          });
          traceOverboardFlow('has-result', {
            banId,
            value: isValidBanResultPayload(fetched.result),
            source,
          });
          return fetched.result;
        } catch (e) {
          traceOverboardFlow('api-response-raw', {
            banId,
            source,
            error: e instanceof Error ? e.message : 'fetch-failed',
          });
          traceOverboardFlow('has-result', {
            banId,
            value: false,
            source,
          });
          return null;
        }
      };

      const fetchPendingResult = async (
        source: string,
      ): Promise<BanResult | null> => {
        try {
          const fetched = await api<{ result: BanResult | null }>(
            '/bans/result/pending',
            { token, retries: 0, timeoutMs: 5000 },
          );
          traceOverboardFlow('api-response-raw', {
            banId,
            source,
            result: fetched.result,
          });
          if (
            fetched.result?.id === banId &&
            isValidBanResultPayload(fetched.result)
          ) {
            return fetched.result;
          }
          return null;
        } catch {
          return null;
        }
      };

      const recoverAfterOverboardApiIssue = async (
        reason: string,
        apiError?: string,
      ): Promise<{ ok: boolean; error?: string }> => {
        traceOverboardFlow('api-recovery-start', { banId, reason, apiError });
        scheduleResultPollBurst();

        const payload =
          (await fetchResultByBanId(`recovery-${reason}`)) ??
          (await fetchPendingResult(`recovery-pending-${reason}`));

        if (payload && isValidBanResultPayload(payload)) {
          return finishOverboardSuccess(payload, `recovery-${reason}`);
        }

        if (directResultOverlayRef.current) {
          traceOverboardFlow('optimistic-kept-api-fail', {
            banId,
            reason,
            apiError,
          });
          logOverboardFinalState(banId, `optimistic-kept-${reason}`);
          return { ok: true };
        }

        dismissedIncomingRef.current.add(banId);
        setOverboardTransitionActive(false);
        dismissCurrentOverlay(
          'overboard-recovery-lobby',
          removeOverlaysForBan(overlayQueueRef.current, banId, [
            'incoming',
            'check',
          ]),
        );
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        lobbyShownLoggedRef.current = false;
        setOverboardEmergencyHint('перебор сохранён');
        window.setTimeout(() => setOverboardEmergencyHint(null), 5000);
        traceOverboardFlow('fallback-to-lobby', { banId, reason });
        logOverboardFinalState(banId, reason);
        return { ok: true };
      };

      try {
        traceOverboardFlow('api-request', {
          banId,
          endpoint: `/bans/${banId}/overboard`,
        });

        let res: Awaited<ReturnType<typeof postOverboardWithTrace>>;
        try {
          res = await postOverboardWithTrace(banId, token);
        } catch (apiErr) {
          const apiError =
            apiErr instanceof Error ? apiErr.message : String(apiErr);
          if (apiErr instanceof ApiError && apiErr.status === 400) {
            const fetched = await fetchResultByBanId('api-400-recovery');
            if (fetched && isValidBanResultPayload(fetched)) {
              traceOverboardFlow('api-400-recovered-result', { banId, apiError });
              return finishOverboardSuccess(fetched, 'api-400-idempotent-recovery');
            }
          }
          const reason =
            apiErr instanceof RequestTimeoutError
              ? 'api-timeout'
              : 'api-fetch-error';
          return recoverAfterOverboardApiIssue(reason, apiError);
        }

        if (res.idempotent) {
          traceOverboardFlow('api-idempotent-200', { banId });
        }

        traceOverboardFlow('has-result', {
          banId,
          value: isValidBanResultPayload(res.result),
          source: 'overboard-response',
        });

        if (res.result) {
          logResultPresentation(res.result.outcome, {
            component: 'ResultOverlay',
            presentation: {
              headline: res.result.headline,
              subline: res.result.subline,
            },
            displayHeadline: res.result.headline,
            resultStatus: res.status ?? null,
            resultType: res.ban?.status ?? null,
            source: 'overboard-api-response',
          });
        }

        if (res.result && isValidBanResultPayload(res.result)) {
          return finishOverboardSuccess(res.result, 'overboard-response');
        }

        let resultPayload: BanResult | null = res.result ?? null;
        if (!isValidBanResultPayload(resultPayload)) {
          resultPayload = await fetchResultByBanId('result-fetch-after-overboard');
        }

        if (resultPayload && isValidBanResultPayload(resultPayload)) {
          return finishOverboardSuccess(resultPayload, 'result-fetch-after-overboard');
        }

        const polled = await fetchPendingResult('post-overboard-pending');
        if (polled && isValidBanResultPayload(polled)) {
          return finishOverboardSuccess(polled, 'post-overboard-pending');
        }

        return recoverAfterOverboardApiIssue('no-valid-result-payload');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка перебора';
        traceOverboardFlow('api-fetch-error', { banId, message });
        return recoverAfterOverboardApiIssue('unexpected-error', message);
      } finally {
        overboardInFlightRef.current = null;
        if (!directResultOverlayRef.current) {
          setOverboardTransitionActive(false);
        }
      }
    },
    [dismissCurrentOverlay, logOverboardFinalState, scheduleResultPollBurst],
  );

  const submitIncomingOverboard = useCallback(
    async (ban: BanInteraction) => {
      const clickTs = markOverboardClickStart();
      if (!openIncomingOverboardOptimistic(ban, clickTs)) {
        return { ok: false, error: 'Не удалось открыть перебор' };
      }
      return runIncomingOverboardApi(ban, clickTs);
    },
    [openIncomingOverboardOptimistic, runIncomingOverboardApi],
  );

  const scheduleCheckWaitingDismiss = useCallback(() => {
    if (checkWaitingTimerRef.current) {
      clearTimeout(checkWaitingTimerRef.current);
    }
    checkWaitingTimerRef.current = setTimeout(() => {
      challengeLog('check-waiting:expired');
      setCheckWaiting(false);
      checkWaitingTimerRef.current = null;
    }, CHECK_WAITING_UI_TTL_MS);
  }, [applyOverlayQueue]);

  const setIncomingBanSafe = useCallback(
    (b: BanInteraction | null) => {
      const viewerId = auth.user?.id;
      if (b !== null && (!viewerId || auth.loading)) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: false,
          reason: why.reason,
        });
        return;
      }
      if (
        b !== null &&
        !shouldShowIncomingBanModal(
          b,
          viewerId,
          dismissedIncomingRef.current,
        )
      ) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: false,
          reason: why.reason,
        });
        challengeLog('incoming:reject-set', {
          id: b.id,
          status: b.status,
          hasSender: !!b.sender?.id,
        });
        return;
      }
      challengeLog(b ? 'incoming:set' : 'incoming:clear', {
        id: b?.id ?? null,
        status: b?.status ?? null,
      });
      if (b !== null) {
        const why = explainIncomingHidden(
          b,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        logIncomingDebug({
          authUserId: viewerId,
          incomingId: b.id,
          incomingReceiverId: b.receiver?.id,
          incomingAcknowledged: b.incomingAcknowledged,
          shouldShow: why.shouldShow,
          reason: why.reason,
        });
      }
      if (b === null) {
        const prev = overlayQueueRef.current;
        if (prev[0]?.kind === 'incoming') {
          applyOverlayQueue(popOverlayHead(prev));
        }
        return;
      }
      enqueueNotification(
        { kind: 'incoming', ban: b },
        { source: 'session' },
      );
      resolvePendingDeepLinkRoute('incoming', b.id);
    },
    [auth.user?.id, auth.loading, applyOverlayQueue, enqueueNotification],
  );

  const removeIncomingFromQueue = useCallback(
    (banId: string) => {
      const prev = overlayQueueRef.current;
      const next = prev.filter(
        (q) => !(q.kind === 'incoming' && q.ban.id === banId),
      );
      const headWasTarget =
        prev[0]?.kind === 'incoming' && prev[0].ban.id === banId;
      if (headWasTarget) {
        dismissCurrentOverlay('incoming-seen', next);
      } else {
        applyOverlayQueue(next);
      }
    },
    [applyOverlayQueue, dismissCurrentOverlay],
  );

  const clearReplyDeeplinkFastTimeout = useCallback(() => {
    if (replyDeeplinkFastTimeoutRef.current) {
      clearTimeout(replyDeeplinkFastTimeoutRef.current);
      replyDeeplinkFastTimeoutRef.current = null;
    }
  }, []);

  const abortReplyDeepLinkFast = useCallback(
    (reason: string) => {
      clearReplyDeeplinkFastTimeout();
      const banId =
        replyDeeplinkPendingBanIdRef.current ??
        replyDeepLinkBanId ??
        (overlayQueueRef.current[0]?.kind === 'incoming'
          ? overlayQueueRef.current[0].ban.id
          : null);

      console.log('[REPLY DEEPLINK FAST ABORT]', { reason, banId });
      markVisibleOverboardTrace('[REPLY DEEPLINK FAST ABORT]', { reason, banId });

      replyDeeplinkFastOpenedRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastWrittenAtRef.current = null;
      replyDeeplinkFastWrittenBanIdRef.current = null;
      replyDeeplinkFastHydratedRef.current = false;
      replyDeepLinkBanIdRef.current = null;
      replyDeeplinkFastShellRef.current = false;
      replyDeeplinkPrefetchRef.current = false;
      setReplyDeeplinkFastShell(false);
      setDeepLinkReplyBooting(false);

      if (banId && overlayQueueRef.current[0]?.kind === 'incoming') {
        const headId = overlayQueueRef.current[0].ban.id;
        if (headId === banId) {
          dismissCurrentOverlay('reply-deeplink-fast-abort');
        }
      }

      setReplyDeepLinkBanId(null);
      setIncomingReplyBanId(null);
      pinReplyToBanId(null);
      setReplyHandoffLock(false);
      setReplyWhatReady(true);
      replyFlowArmedBanIdRef.current = null;
      replyLockReleasedRef.current = false;

      setLobbyOpen(true);
      lobbyOpenRef.current = true;
      lobbyShownLoggedRef.current = false;
      resolveActiveDeepLinkRouteBoot(banId);
    },
    [clearReplyDeeplinkFastTimeout, dismissCurrentOverlay, pinReplyToBanId, replyDeepLinkBanId],
  );

  const hydrateReplyDeeplinkIncomingBan = useCallback(
    (enriched: BanInteraction): boolean => {
      const prev = overlayQueueRef.current;
      const idx = prev.findIndex(
        (q) => q.kind === 'incoming' && q.ban.id === enriched.id,
      );
      if (idx < 0) return false;
      const next = [...prev];
      next[idx] = { kind: 'incoming', ban: enriched };
      applyOverlayQueue(next);
      return true;
    },
    [applyOverlayQueue],
  );

  const applyAuthReplyPreviewHydration = useCallback(
    (preview: BanInteraction) => {
      const banId = preview.id;
      if (incomingConsumedAfterAnswerRef.current.has(banId)) return false;

      const pendingBanId =
        replyDeeplinkPendingBanIdRef.current ??
        replyDeepLinkBanIdRef.current;
      if (pendingBanId && pendingBanId !== banId) return false;

      const enriched = enrichBanInteraction(preview);
      bootReplyDeeplinkPreviewRef.current = enriched;
      replyDeeplinkPrefillBanRef.current = enriched;

      if (!replyDeeplinkFastOpenedRef.current) {
        return false;
      }

      const viewerId = userIdRef.current;
      if (!viewerId) return false;

      const current = incomingBanRef.current;
      const alreadyReal =
        current?.id === banId &&
        hasReplyFastDisplayText(current) &&
        !isReplyDeeplinkShellBan(current) &&
        replyDeeplinkFastHydratedRef.current &&
        !replyDeeplinkFastShellRef.current;
      if (alreadyReal) return false;

      const hydratedInPlace = hydrateReplyDeeplinkIncomingBan(enriched);
      flushSync(() => {
        setIncomingBan(enriched);
        replyDeeplinkFastShellRef.current = false;
        replyDeeplinkPrefetchRef.current = true;
        setReplyDeeplinkFastShell(false);
        setDeepLinkReplyBooting(false);
        replyDeeplinkFastHydratedRef.current = true;
      });
      console.log('[INCOMING CARD HYDRATED FROM AUTH PREVIEW]', {
        banId,
        hydratedInPlace,
        hasText: hasReplyFastDisplayText(enriched),
        hasSender: canReplyFastEnableButtons(enriched, viewerId),
      });
      markVisibleOverboardTrace('[INCOMING CARD HYDRATED FROM AUTH PREVIEW]', {
        banId,
        hydratedInPlace,
      });
      return true;
    },
    [hydrateReplyDeeplinkIncomingBan],
  );

  useLayoutEffect(() => {
    return subscribeAuthReplyPreviewEarly((preview) => {
      applyAuthReplyPreviewHydration(preview);
    });
  }, [applyAuthReplyPreviewHydration]);

  const isReplyFastQueueHeadValid = useCallback((banId: string): boolean => {
    const head = overlayQueueRef.current[0];
    return head?.kind === 'incoming' && head.ban.id === banId;
  }, []);

  const isReplyFastIncomingCardMounted = isReplyFastQueueHeadValid;

  const resolveReplyFastStillValid = useCallback(
    (banId: string): { valid: boolean; source: string | null } => {
      if (incomingConsumedAfterAnswerRef.current.has(banId)) {
        console.log('[INCOMING REOPEN BLOCKED AFTER ANSWER]', { banId });
        markVisibleOverboardTrace('[INCOMING REOPEN BLOCKED AFTER ANSWER]', {
          banId,
        });
        return { valid: false, source: null };
      }
      const head = overlayQueueRef.current[0];
      if (head?.kind === 'incoming' && head.ban.id === banId) {
        return { valid: true, source: 'queue-head' };
      }
      if (
        overlayQueueRef.current.some(
          (q) => q.kind === 'incoming' && q.ban.id === banId,
        )
      ) {
        return { valid: true, source: 'queue' };
      }
      if (incomingBanRef.current?.id === banId) {
        return { valid: true, source: 'state' };
      }
      if (replyDeeplinkFastHydratedRef.current) {
        return { valid: true, source: 'hydrated' };
      }
      if (
        replyDeeplinkFastWrittenBanIdRef.current === banId &&
        replyDeepLinkBanIdRef.current === banId &&
        (replyDeeplinkFastShellRef.current ||
          replyDeeplinkFastOpenedRef.current)
      ) {
        return { valid: true, source: 'session-written' };
      }
      return { valid: false, source: null };
    },
    [],
  );

  const ensureReplyFastIncomingAtHead = useCallback(
    (banId: string) => {
      if (incomingConsumedAfterAnswerRef.current.has(banId)) return;
      if (isReplyFastQueueHeadValid(banId)) return;
      const queued = overlayQueueRef.current.find(
        (q) => q.kind === 'incoming' && q.ban.id === banId,
      );
      const ban =
        queued?.kind === 'incoming'
          ? queued.ban
          : incomingBanRef.current?.id === banId
            ? incomingBanRef.current
            : null;
      if (!ban) return;
      const item: QueuedOverlay = { kind: 'incoming', ban };
      const key = overlayQueueKey(item);
      applyOverlayQueue([
        item,
        ...overlayQueueRef.current.filter((q) => overlayQueueKey(q) !== key),
      ]);
    },
    [applyOverlayQueue, isReplyFastQueueHeadValid],
  );

  const scheduleReplyFastTimeout = useCallback(
    (banId: string) => {
      clearReplyDeeplinkFastTimeout();
      replyDeeplinkFastTimeoutRef.current = setTimeout(() => {
        if (!replyDeeplinkFastOpenedRef.current) return;
        const activeBanId =
          replyDeepLinkBanIdRef.current ??
          replyDeeplinkPendingBanIdRef.current ??
          banId;
        const inQueue = overlayQueueRef.current.some(
          (q) => q.kind === 'incoming' && q.ban.id === activeBanId,
        );
        const inIncomingBan = incomingBanRef.current?.id === activeBanId;
        const hydrated = replyDeeplinkFastHydratedRef.current;
        if (inQueue || inIncomingBan || hydrated) {
          return;
        }
        console.log('[REPLY FAST ABORT AFTER TIMEOUT]', {
          reason: 'no-incoming-state',
          banId: activeBanId,
        });
        markVisibleOverboardTrace('[REPLY FAST ABORT AFTER TIMEOUT]', {
          reason: 'no-incoming-state',
          banId: activeBanId,
        });
        abortReplyDeepLinkFast('no-incoming-state');
      }, REPLY_DEEPLINK_FAST_TIMEOUT_MS);
    },
    [abortReplyDeepLinkFast, clearReplyDeeplinkFastTimeout],
  );

  /** Reply deeplink: force incoming at queue head — bypass overlay arbiter. */
  const applyReplyDeeplinkFastOverlay = useCallback(
    (ban: BanInteraction): boolean => {
      const item: QueuedOverlay = { kind: 'incoming', ban };
      const prev = overlayQueueRef.current;
      const key = overlayQueueKey(item);
      const next: QueuedOverlay[] = [
        item,
        ...prev.filter((q) => overlayQueueKey(q) !== key),
      ];
      applyOverlayQueue(next);
      const mounted = isReplyFastQueueHeadValid(ban.id);
      if (mounted) {
        setIncomingBan(ban);
      }
      return mounted;
    },
    [applyOverlayQueue, isReplyFastQueueHeadValid],
  );

  const buildReplyFastLookupCtx = useCallback(
    (banId: string, viewerId: string) =>
      buildReplyPrefillLookup(banId, viewerId, dismissedIncomingRef.current, {
        overlayQueue: overlayQueueRef.current,
        incomingBan: incomingBanRef.current,
        bufferedIncoming: bufferedIncomingRef.current,
        bufferedReplyDeepLink: bufferedReplyDeepLinkRef.current,
        pendingStartup: pendingStartupInteractionsRef.current,
        activeBans: sessionActiveBansRef.current,
        claimedIncoming:
          bootClaimedIncomingRef.current ?? auth.boot?.claimedIncoming ?? null,
        replyDeeplinkPreview:
          getAuthReplyPreviewStash() ??
          bootReplyDeeplinkPreviewRef.current ??
          (auth.boot?.replyDeeplinkPreview
            ? enrichBanInteraction(auth.boot.replyDeeplinkPreview)
            : null),
        startParamPreviewBan: replyStartParamPreviewBanRef.current,
        sessionIncoming: lastSessionIncomingRef.current,
      }),
    [auth.boot?.claimedIncoming, auth.boot?.replyDeeplinkPreview],
  );

  const openReplyDeepLinkFast = useCallback(
    (banId: string, optionalPrefilledBan?: BanInteraction | null) => {
      if (replyDeeplinkFastOpenedRef.current) return false;
      if (incomingConsumedAfterAnswerRef.current.has(banId)) {
        console.log('[INCOMING REOPEN BLOCKED AFTER ANSWER]', { banId });
        markVisibleOverboardTrace('[INCOMING REOPEN BLOCKED AFTER ANSWER]', {
          banId,
        });
        return false;
      }
      if (
        incomingReplyComposeDismissedRef.current.has(banId) &&
        replyToBanIdPersistRef.current === banId
      ) {
        console.log('[INCOMING REOPEN BLOCKED REPLY COMPOSE ACTIVE]', { banId });
        markVisibleOverboardTrace('[INCOMING REOPEN BLOCKED REPLY COMPOSE ACTIVE]', {
          banId,
        });
        return false;
      }
      const viewerId = userIdRef.current;
      const token = tokenRef.current;
      if (!viewerId || !token || auth.loading) return false;

      console.log('[REPLY FAST SHELL OPEN ATTEMPT]', { banId });
      markVisibleOverboardTrace('[REPLY FAST SHELL OPEN ATTEMPT]', { banId });
      console.log('[REPLY DEEPLINK FAST OPEN]', { banId });
      markVisibleOverboardTrace('[REPLY DEEPLINK FAST OPEN]', { banId });

      const lookupCtx = buildReplyFastLookupCtx(banId, viewerId);
      console.log('[REPLY PREFILL LOOKUP]', { banId });
      markVisibleOverboardTrace('[REPLY PREFILL LOOKUP]', { banId });

      let cacheHit: ReturnType<typeof resolveReplyFastCachedBan> = null;
      if (
        optionalPrefilledBan?.id === banId &&
        hasReplyFastDisplayText(optionalPrefilledBan) &&
        !isReplyDeeplinkShellBan(optionalPrefilledBan)
      ) {
        cacheHit = { ban: optionalPrefilledBan, source: 'caller-prefill' };
      }
      if (!cacheHit) {
        cacheHit = resolveReplyFastCachedBan(lookupCtx);
      }
      if (!cacheHit) {
        const prefill = resolveReplyPrefillBan(lookupCtx);
        cacheHit = prefill.hit;
        if (prefill.hit) {
          const hasText = hasReplyFastDisplayText(prefill.hit.ban);
          const hasSender = canReplyFastEnableButtons(prefill.hit.ban, viewerId);
          console.log('[REPLY PREFILL HIT]', {
            banId,
            source: prefill.hit.source,
            hasText,
            hasSender,
          });
          markVisibleOverboardTrace('[REPLY PREFILL HIT]', {
            banId,
            source: prefill.hit.source,
            hasText,
            hasSender,
          });
        } else {
          const sourceChecks = diagnoseReplyPrefillSources(lookupCtx);
          for (const check of sourceChecks) {
            console.log('[REPLY PREFILL SOURCE CHECK]', {
              source: check.source,
              count: check.count,
              matched: check.matched,
              hasText: check.hasText,
              hasSender: check.hasSender,
              failReason: check.failReason,
              sampleKeys: check.sampleKeys,
            });
            markVisibleOverboardTrace('[REPLY PREFILL SOURCE CHECK]', {
              source: check.source,
              count: check.count,
              matched: check.matched,
              hasText: check.hasText,
              hasSender: check.hasSender,
              failReason: check.failReason,
              sampleKeys: check.sampleKeys,
            });
          }
          const missDetailReason = buildReplyPrefillMissDetail(
            banId,
            sourceChecks,
          );
          console.log('[REPLY PREFILL MISS]', {
            banId,
            reason: prefill.missReason,
          });
          markVisibleOverboardTrace('[REPLY PREFILL MISS]', {
            banId,
            reason: prefill.missReason,
          });
          console.log('[REPLY PREFILL MISS DETAIL]', {
            banId,
            reason: missDetailReason,
          });
          markVisibleOverboardTrace('[REPLY PREFILL MISS DETAIL]', {
            banId,
            reason: missDetailReason,
          });
        }
      } else {
        const hasText = hasReplyFastDisplayText(cacheHit.ban);
        const hasSender = canReplyFastEnableButtons(cacheHit.ban, viewerId);
        console.log('[REPLY PREFILL HIT]', {
          banId,
          source: cacheHit.source,
          hasText,
          hasSender,
        });
        markVisibleOverboardTrace('[REPLY PREFILL HIT]', {
          banId,
          source: cacheHit.source,
          hasText,
          hasSender,
        });
        if (cacheHit.source !== 'caller-prefill') {
          console.log('[REPLY FAST DATA CACHE HIT]', {
            banId,
            source: cacheHit.source,
            textLen: cacheHit.ban.text?.length ?? 0,
            senderId: cacheHit.ban.sender?.id ?? null,
          });
          markVisibleOverboardTrace('[REPLY FAST DATA CACHE HIT]', {
            banId,
            source: cacheHit.source,
          });
        }
      }

      if (!cacheHit) {
        console.log('[REPLY FAST DATA CACHE MISS]', { banId });
        markVisibleOverboardTrace('[REPLY FAST DATA CACHE MISS]', { banId });
      }

      const openBan = cacheHit
        ? enrichBanInteraction(cacheHit.ban)
        : buildReplyDeeplinkShellBan(banId, viewerId);
      const usingPrefetch = cacheHit != null;

      replyDeeplinkFastOpenedRef.current = true;
      replyDeeplinkPendingBanIdRef.current = banId;
      replyDeeplinkFastHydratedRef.current = usingPrefetch;

      let cardMounted = false;
      flushSync(() => {
        cardMounted = applyReplyDeeplinkFastOverlay(openBan);
        if (!cardMounted) return;

        replyDeepLinkBanIdRef.current = banId;
        replyFlowArmedBanIdRef.current = banId;
        pinReplyToBanId(banId);
        setReplyDeepLinkBanId(banId);
        setIncomingReplyBanId(banId);
        setIncomingBan(openBan);
        setReplyWhatReady(false);
        setReplyHandoffLock(true);
        setDeepLinkReplyBooting(!usingPrefetch);
        setReplyDeeplinkFastShell(!usingPrefetch);
        replyDeeplinkFastShellRef.current = !usingPrefetch;
        replyDeeplinkPrefetchRef.current = usingPrefetch;
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
      });

      if (!cardMounted) {
        console.log('[REPLY FAST SHELL OPEN FAILED UNBLOCK LOBBY]', {
          banId,
          reason: 'queue-head-not-incoming',
        });
        markVisibleOverboardTrace('[REPLY FAST SHELL OPEN FAILED UNBLOCK LOBBY]', {
          banId,
        });
        replyDeeplinkFastOpenedRef.current = false;
        replyDeeplinkPendingBanIdRef.current = null;
        replyDeeplinkFastHydratedRef.current = false;
        return false;
      }

      replyDeeplinkFastWrittenAtRef.current = performance.now();
      replyDeeplinkFastWrittenBanIdRef.current = banId;

      const writtenOverlayKind = overlayQueueRef.current[0]?.kind ?? null;
      console.log('[REPLY FAST STATE WRITTEN]', {
        banId,
        activeOverlayKind: writtenOverlayKind,
        selectedBanId: banId,
      });
      markVisibleOverboardTrace('[REPLY FAST STATE WRITTEN]', {
        banId,
        activeOverlayKind: writtenOverlayKind,
        selectedBanId: banId,
      });

      console.log('[REPLY FAST SHELL OPEN OK]', {
        banId,
        usingPrefetch,
        activeOverlayKind: writtenOverlayKind,
      });
      markVisibleOverboardTrace('[REPLY FAST SHELL OPEN OK]', { banId });

      if (usingPrefetch) {
        console.log('[INCOMING CARD OPENED WITH PREFILL]', {
          banId,
          source: cacheHit!.source,
          textLen: openBan.text?.length ?? 0,
          senderId: openBan.sender?.id ?? null,
        });
        markVisibleOverboardTrace('[INCOMING CARD OPENED WITH PREFILL]', {
          banId,
          source: cacheHit!.source,
        });
        console.log('[INCOMING CARD OPENED WITH PREFETCHED DATA]', {
          banId,
          source: cacheHit!.source,
          textLen: openBan.text?.length ?? 0,
        });
        markVisibleOverboardTrace('[INCOMING CARD OPENED WITH PREFETCHED DATA]', {
          banId,
          source: cacheHit!.source,
        });
      } else {
        console.log('[INCOMING CARD SHELL OPENED]', {
          source: 'reply-deeplink-fast',
          banId,
        });
        markVisibleOverboardTrace('[INCOMING CARD SHELL OPENED]', {
          source: 'reply-deeplink-fast',
          banId,
        });
      }
      console.log('[REPLY DEEPLINK LOBBY BLOCKED]', {
        reason: 'waiting-incoming-card',
        banId,
      });
      markVisibleOverboardTrace('[REPLY DEEPLINK LOBBY BLOCKED]', {
        reason: 'waiting-incoming-card',
        banId,
      });

      resolvePendingDeepLinkRoute('reply', banId);
      scheduleReplyFastTimeout(banId);

      return true;
    },
    [
      applyReplyDeeplinkFastOverlay,
      auth.boot?.claimedIncoming,
      auth.loading,
      buildReplyFastLookupCtx,
      scheduleReplyFastTimeout,
    ],
  );

  useLayoutEffect(() => {
    const banId = replyDeeplinkPendingBanIdRef.current;
    const viewerId = auth.user?.id;
    if (!banId || !viewerId || auth.loading || !auth.token) {
      replyDeeplinkPrefillBanRef.current = null;
      return;
    }
    if (incomingConsumedAfterAnswerRef.current.has(banId)) {
      replyDeeplinkPrefillBanRef.current = null;
      return;
    }
    const lookupCtx = buildReplyFastLookupCtx(banId, viewerId);
    const strict = resolveReplyFastCachedBan(lookupCtx);
    const prefill = strict ?? resolveReplyPrefillBan(lookupCtx).hit;
    replyDeeplinkPrefillBanRef.current = prefill?.ban ?? null;

    if (
      prefill?.ban &&
      replyDeeplinkFastOpenedRef.current &&
      replyDeepLinkBanIdRef.current === banId &&
      replyDeeplinkFastShellRef.current &&
      !incomingConsumedAfterAnswerRef.current.has(banId)
    ) {
      const enriched = enrichBanInteraction(prefill.ban);
      const hydratedInPlace = hydrateReplyDeeplinkIncomingBan(enriched);
      if (hydratedInPlace) {
        flushSync(() => {
          setIncomingBan(enriched);
          replyDeeplinkFastShellRef.current = false;
          replyDeeplinkPrefetchRef.current = true;
          setReplyDeeplinkFastShell(false);
          setDeepLinkReplyBooting(false);
          replyDeeplinkFastHydratedRef.current = true;
        });
        console.log('[INCOMING CARD OPENED WITH PREFILL]', {
          banId,
          source: prefill.source,
          late: true,
        });
        markVisibleOverboardTrace('[INCOMING CARD OPENED WITH PREFILL]', {
          banId,
          source: prefill.source,
          late: true,
        });
      }
    }
  }, [
    auth.loading,
    auth.token,
    auth.user?.id,
    auth.boot?.claimedIncoming,
    auth.boot?.replyDeeplinkPreview,
    buildReplyFastLookupCtx,
    hydrateReplyDeeplinkIncomingBan,
    overlayQueue.length,
    incomingBan?.id,
    sessionBootstrapped,
    pinReplyToBanId,
  ]);

  useLayoutEffect(() => {
    const banId = replyDeeplinkPendingBanIdRef.current;
    if (!banId || replyDeeplinkFastOpenedRef.current) return;
    if (!auth.user?.id || auth.loading || !auth.token) return;
    openReplyDeepLinkFast(banId, replyDeeplinkPrefillBanRef.current);
  }, [
    auth.loading,
    auth.token,
    auth.user?.id,
    openReplyDeepLinkFast,
  ]);

  const openDeepLinkReply = useCallback(
    async (b: BanInteraction) => {
      noteDeepLinkHandlerOpened('openDeepLinkReply', b.id);
      const enriched = enrichBanInteraction(b);
      if (!userIdRef.current || auth.loading) {
        bufferedReplyDeepLinkRef.current = enriched;
        console.log('[reply-deeplink]', {
          banId: b.id,
          buffered: true,
          reason: 'auth-not-ready',
        });
        return;
      }
      const viewerId = userIdRef.current;
      if (
        !shouldShowIncomingBanModal(
          enriched,
          viewerId,
          dismissedIncomingRef.current,
        )
      ) {
        const why = explainIncomingHidden(
          enriched,
          viewerId,
          auth.loading,
          viewerId,
          dismissedIncomingRef.current,
        );
        console.log('[reply-deeplink]', {
          banId: b.id,
          rejected: true,
          reason: why.reason,
        });
        if (replyDeeplinkFastShellRef.current) {
          abortReplyDeepLinkFast(`incoming-rejected:${why.reason}`);
        } else {
          setDeepLinkReplyBooting(false);
          setReplyDeepLinkBanId(null);
          setReplyHandoffLock(false);
          replyFlowArmedBanIdRef.current = null;
          replyLockReleasedRef.current = false;
        }
        logDeepLinkHandlerResult({
          type: 'reply',
          banId: b.id,
          instantBanOpen: false,
          sendFlowOpen: false,
          selectedBanId: b.id,
          overlayQueueLength: overlayQueueRef.current.length,
          ok: false,
          reason: why.reason,
        });
        resolveActiveDeepLinkRouteBoot(b.id);
        return;
      }
      const wasShell = replyDeeplinkFastShellRef.current;
      const wasPrefetch = replyDeeplinkPrefetchRef.current;
      const hadFastOpen = wasShell || wasPrefetch;
      setLobbyOpen(false);
      lobbyOpenRef.current = false;
      challengeLog('incoming:reply-deeplink', { id: b.id, status: b.status });

      let hydratedInPlace = false;
      if (hadFastOpen) {
        const prevHead = overlayQueueRef.current.find(
          (q) => q.kind === 'incoming' && q.ban.id === enriched.id,
        );
        const prevText =
          prevHead?.kind === 'incoming' ? prevHead.ban.text : null;
        hydratedInPlace = hydrateReplyDeeplinkIncomingBan(enriched);
        if (!hydratedInPlace) {
          enqueueNotification(
            { kind: 'incoming', ban: enriched },
            { live: true, source: 'deeplink' },
          );
        }
        replyDeeplinkFastHydratedRef.current = true;
        clearReplyDeeplinkFastTimeout();
        flushSync(() => {
          replyDeeplinkFastShellRef.current = false;
          replyDeeplinkPrefetchRef.current = false;
          setReplyDeeplinkFastShell(false);
          setDeepLinkReplyBooting(false);
        });
        const headBan = overlayQueueRef.current[0];
        console.log('[INCOMING CARD DATA READY]', {
          banId: b.id,
          hydratedInPlace,
          wasShell,
          wasPrefetch,
          selectedBanId: replyDeepLinkBanId ?? b.id,
          queueHeadKind: headBan?.kind ?? null,
          queueHeadText: enriched.text ?? null,
        });
        markVisibleOverboardTrace('[INCOMING CARD DATA READY]', {
          banId: b.id,
          hydratedInPlace,
          wasPrefetch,
        });
        console.log('[INCOMING CARD HYDRATED FROM API]', {
          banId: b.id,
          hydratedInPlace,
          wasShell,
          wasPrefetch,
          textChanged: prevText !== enriched.text,
          senderId: enriched.sender?.id ?? null,
          textLen: enriched.text?.length ?? 0,
        });
        markVisibleOverboardTrace('[INCOMING CARD HYDRATED FROM API]', {
          banId: b.id,
          hydratedInPlace,
          wasPrefetch,
        });
      } else {
        enqueueNotification(
          { kind: 'incoming', ban: enriched },
          { live: true, source: 'deeplink' },
        );
      }
      logReplyFlow('incoming-visible', {
        banId: b.id,
        lockActive: true,
        activeOverlayKind: 'incoming',
        selectedBanId: b.id,
        lobbyOpen: false,
        hydratedFromShell: wasShell,
        hydratedFromPrefetch: wasPrefetch,
        hydratedInPlace,
      });
      console.log('[reply-deeplink]', { banId: b.id, queued: 'incoming-overlay' });
      resolvePendingDeepLinkRoute('reply', b.id);
      logDeepLinkHandlerResult({
        type: 'reply',
        banId: b.id,
        instantBanOpen: false,
        sendFlowOpen: false,
        selectedBanId: b.id,
        overlayQueueLength: overlayQueueRef.current.length,
        ok: true,
        reason: 'incoming-overlay',
      });
    },
    [
      abortReplyDeepLinkFast,
      auth.loading,
      clearReplyDeeplinkFastTimeout,
      enqueueNotification,
      hydrateReplyDeeplinkIncomingBan,
      replyDeepLinkBanId,
    ],
  );

  useEffect(
    () => () => clearReplyDeeplinkFastTimeout(),
    [clearReplyDeeplinkFastTimeout],
  );

  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    const buffered = bufferedReplyDeepLinkRef.current;
    if (!buffered) return;
    bufferedReplyDeepLinkRef.current = null;
    console.log('[reply-deeplink]', {
      banId: buffered.id,
      action: 'apply-buffered',
    });
    void openDeepLinkReply(buffered);
  }, [auth.user?.id, auth.loading, openDeepLinkReply]);

  // Apply WS-buffered incoming after auth is ready (must run after setIncomingBanSafe exists).
  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    if (!bufferedIncomingRef.current) return;
    const b = bufferedIncomingRef.current;
    bufferedIncomingRef.current = null;
    console.log('[incoming-buffer]', {
      action: 'apply',
      banId: b.id,
      receiverId: b.receiver?.id,
    });

    const incoming = pickIncomingForOverlay(
      b,
      dismissedIncomingRef.current,
      auth.user.id,
    );
    if (incoming) {
      enqueueNotification(
        { kind: 'incoming', ban: incoming },
        { live: true, source: 'ws' },
      );
    }
  }, [auth.user?.id, auth.loading, enqueueNotification]);

  const pushPopup = useCallback((p: EnergyPopup) => {
    const isOverboardEnergy = isOverboardEnergyPopup(p);
    if (isOverboardEnergy) {
      logResultUi('overboard', {
        overlayKind: overlayQueueRef.current[0]?.kind ?? null,
        compactCard: true,
        fullOverlay: false,
        source: 'EnergyPopupStack',
        rejectReason: 'suppressed-overboard-result-flow',
        overlayQueueLength: overlayQueueRef.current.length,
      });
      return;
    }
    logResultUi('energy-popup', {
      overlayKind: overlayQueueRef.current[0]?.kind ?? null,
      compactCard: true,
      fullOverlay: overlayQueueRef.current[0]?.kind === 'result',
      source: 'EnergyPopupStack',
      overlayQueueLength: overlayQueueRef.current.length,
    });
    setPopups((prev) => [...prev, p]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((x) => x.id !== p.id));
    }, 2200);
  }, []);

  const applyOptimisticSend = useCallback(
    (params: {
      username: string;
      firstName?: string;
      banText: string;
      durationMinutes: number;
    }) => {
      clearCheckOverlay();
      const wait = createOptimisticSendWait(params);
      challengeLog('optimistic-send:set', {
        username: wait.username,
        expiresAt: wait.expiresAt,
      });
      setOptimisticSendWait(wait);
    },
    [clearCheckOverlay],
  );

  const confirmOptimisticSend = useCallback((username: string) => {
    const u = normalizeWaitUsername(username);
    setOptimisticSendWait((prev) => {
      if (!prev || normalizeWaitUsername(prev.username) !== u) return prev;
      challengeLog('optimistic-send:confirmed', { username: u });
      return { ...prev, resolved: true };
    });
    setActiveBans((prev) =>
      prev.filter((b) => !b.id.startsWith('optimistic-ban:')),
    );
  }, []);

  const rollbackOptimisticSend = useCallback(
    (params: { username: string; message: string }) => {
      const u = normalizeWaitUsername(params.username);
      challengeLog('optimistic-send:rollback', {
        username: u,
        message: params.message,
      });
      setOptimisticSendWait((prev) => {
        if (!prev || normalizeWaitUsername(prev.username) !== u) return prev;
        return {
          ...prev,
          resolved: true,
          failed: true,
          errorMessage: params.message,
        };
      });
      setActiveBans((prev) =>
        prev.filter((b) => !b.id.startsWith('optimistic-ban:')),
      );
      void reloadFriendsRef.current?.().catch(() => {});
    },
    [],
  );

  const resolveOptimisticFromSession = useCallback(
    (active: BanInteraction[]) => {
      setOptimisticSendWait((prev) => {
        if (!isOptimisticSendWaitActive(prev)) return prev;
        const match = active.some((b) => {
          const recv = (b.receiver?.username ?? '').toLowerCase();
          const send = (b.sender?.username ?? '').toLowerCase();
          return recv === prev!.username || send === prev!.username;
        });
        if (!match) return prev;
        challengeLog('optimistic-send:resolved-session', {
          username: prev!.username,
        });
        return { ...prev!, resolved: true };
      });
    },
    [],
  );

  const resolveOptimisticFromFriends = useCallback((list: FriendCard[]) => {
    setOptimisticSendWait((prev) => {
      if (!isOptimisticSendWaitActive(prev)) return prev;
      const hasReal = list.some(
        (f) =>
          normalizeWaitUsername(f.username ?? '') === prev!.username &&
          (f.userId != null || f.isRegistered),
      );
      if (!hasReal) return prev;
      challengeLog('optimistic-send:resolved', { username: prev!.username });
      return { ...prev!, resolved: true };
    });
  }, []);

  const commitFriendsWithAvatarPreload = useCallback(
    async (
      incomingList: FriendCard[],
      meta: { via: string; markReady?: boolean; allowEmpty?: boolean },
    ) => {
      const requestUid = userIdRef.current;
      const requestToken = tokenRef.current;
      const merged = mergeFriendsPreservingAvatars(
        friendsRef.current,
        incomingList,
        { allowEmpty: meta.allowEmpty },
      );
      logFriendsTiming('friends-committed', {
        userId: requestUid,
        count: merged.length,
        via: meta.via,
      });
      friendsRef.current = merged;
      setFriends(merged);
      if (requestUid) writeFriendsCache(requestUid, merged);
      resolveOptimisticFromFriends(merged);
      if (meta.markReady !== false) {
        setFriendsBootstrapped(true);
      }

      logFriendsTiming('avatar-preload-start', {
        userId: requestUid,
        count: merged.length,
        via: meta.via,
      });
      preloadAvatarUrls(merged.map((f) => f.avatarUrl ?? f.photoUrl));
      syncSeedCachedFriendAvatars(merged);
      const preloadStartedAt = Date.now();
      void preloadFriendAvatars(merged, {
        timeoutMs: 1000,
        via: meta.via,
      }).then(() => {
        if (tokenRef.current !== requestToken) return;
        if (userIdRef.current !== requestUid) return;
        logFriendsTiming('avatar-preload-done', {
          userId: requestUid,
          ms: Date.now() - preloadStartedAt,
          via: meta.via,
        });
      });
    },
    [resolveOptimisticFromFriends],
  );

  useEffect(() => {
    if (!optimisticSendWait || optimisticSendWait.resolved) return;
    const ms = optimisticSendWait.expiresAt - Date.now();
    if (ms <= 0) {
      setOptimisticSendWait(null);
      return;
    }
    const t = setTimeout(() => {
      challengeLog('optimistic-send:expired', {
        username: optimisticSendWait.username,
      });
      setOptimisticSendWait(null);
    }, ms);
    return () => clearTimeout(t);
  }, [optimisticSendWait]);

  useEffect(() => {
    resolveOptimisticFromFriends(friends);
  }, [friends, resolveOptimisticFromFriends]);

  const receiveIncomingBan = useCallback(
    (payload: BanInteraction, source: 'ws' | 'session' | 'poll') => {
      const b = enrichBanInteraction(payload);
      const viewerId = userIdRef.current;

      if (source === 'ws' || source === 'poll') {
        incomingWsSeenRef.current.add(b.id);
      }

      const decision = incomingShowDecision(
        b,
        viewerId,
        dismissedIncomingRef.current,
      );
      console.log('[incoming-show-decision]', {
        banId: b.id,
        shouldShow: decision.shouldShow,
        reason: decision.reason,
        source,
      });

      const incoming = pickIncomingForOverlay(
        b,
        dismissedIncomingRef.current,
        viewerId,
      );
      if (incoming) {
        if (
          source === 'session' &&
          !incomingWsSeenRef.current.has(incoming.id)
        ) {
          const delayMs = incoming.createdAt
            ? Date.now() - new Date(incoming.createdAt).getTime()
            : null;
          console.log('[incoming-recovery-session]', {
            banId: incoming.id,
            delayMs,
          });
        }
        enqueueNotification(
          { kind: 'incoming', ban: incoming },
          {
            live:
              source === 'ws' ||
              (source === 'poll' && !startupInteractionsHoldRef.current),
            source,
          },
        );
        return;
      }

      console.log('INCOMING QUEUE PUSH', {
        banId: b.id,
        skipped: true,
        reason: decision.reason,
        source,
        authUserId: viewerId,
      });

      if (b.receiver?.id && (!viewerId || b.receiver.id === viewerId)) {
        lastSessionIncomingRef.current = b;
      }

      if (
        source === 'ws' &&
        b.receiver?.id &&
        (!viewerId || b.receiver.id === viewerId)
      ) {
        bufferedIncomingRef.current = b;
        console.log('INCOMING QUEUE PUSH', {
          banId: b.id,
          skipped: true,
          reason: 'buffered-no-auth',
          authUserId: viewerId,
        });
      }
    },
    [enqueueNotification],
  );

  const getOpenIncomingBan = useCallback(
    () => incomingBanRef.current,
    [],
  );

  useIncomingPoll({
    userId: auth.user?.id,
    token: auth.token,
    receiveIncomingBan,
    dismissedIncomingRef,
    getOpenIncomingBan,
    userIdRef,
    tokenRef,
  });

  const receiveCheckBan = useCallback(
    (payload: BanInteraction, source: 'ws' | 'session' | 'poll') => {
      const b = enrichBanInteraction(payload);
      const viewerId = userIdRef.current;

      if (source === 'ws') {
        checkWsSeenRef.current.add(b.id);
        const role = getCheckViewerRole(
          viewerId,
          b.sender.id,
          b.receiver.id,
        );
        console.log('[check-ws-received]', {
          banId: b.id,
          role,
          authUserId: viewerId,
        });
      }

      const decision = checkShowDecision(
        b,
        viewerId,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        resultOpenRef.current,
      );
      console.log('[check-show-decision]', {
        banId: b.id,
        shouldShow: decision.shouldShow,
        reason: decision.reason,
        role: decision.role,
        source,
      });

      const check = pickCheckForOverlay(
        b,
        viewerId,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        resultOpenRef.current,
      );
      if (!check) return;

      if (source === 'session' && !checkWsSeenRef.current.has(check.id)) {
        console.log('[check-recovery-session]', { banId: check.id });
      }
      enqueueNotification(
        { kind: 'check', ban: check },
        {
          live:
            source === 'ws' ||
            (source === 'poll' && !startupInteractionsHoldRef.current),
          source,
        },
      );
      setCheckWaiting(false);
    },
    [enqueueNotification],
  );

  const getOpenCheckBan = useCallback(() => checkBanRef.current, []);

  useCheckPoll({
    userId: auth.user?.id,
    token: auth.token,
    receiveCheckBan,
    dismissedCheckSessionRef,
    answeredCheckRef,
    checkAnswerInFlightRef,
    resultOpenRef,
    getOpenCheckBan,
    userIdRef,
    tokenRef,
  });

  useEffect(() => {
    const userId = auth.user?.id;
    const token = auth.token;
    if (!userId || !token) {
      console.log('[result-poll-skip]', { reason: 'no-auth' });
      return;
    }
    console.log('[result-poll-start]', { userId });

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        console.log('[result-poll-skip]', { reason: 'hidden' });
        return;
      }
      if (result?.id) {
        console.log('[result-poll-skip]', {
          reason: 'already-open',
          banId: result.id,
        });
        return;
      }
      void pollPendingResultOnce('interval');
    };

    void tick();
    const timer = window.setInterval(tick, 2500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auth.user?.id, auth.token, result, pollPendingResultOnce]);

  const applySession = useCallback((s: SessionState) => {
    const viewerId = auth.user?.id ?? null;
    if (!viewerId) {
      logIncomingDebug({
        authUserId: viewerId,
        sessionUserId: s.userId,
        incomingId: s.incoming?.id,
        incomingReceiverId: s.incoming?.receiver?.id,
        shouldShow: false,
        reason: 'no-auth-user',
      });
      return;
    }
    if (s.userId && s.userId !== viewerId) {
      challengeLog('session:discard-user-mismatch', {
        sessionUserId: s.userId,
        viewerId,
      });
      logIncomingDebug({
        authUserId: viewerId,
        sessionUserId: s.userId,
        incomingId: s.incoming?.id,
        incomingReceiverId: s.incoming?.receiver?.id,
        shouldShow: false,
        reason: 'stale-session-discarded',
      });
      return;
    }

    const session = enrichSessionState(s);
    const nextIncoming = pickIncomingForOverlay(
      session.incoming,
      dismissedIncomingRef.current,
      viewerId,
    );
    if (session.incoming) {
      lastSessionIncomingRef.current = enrichBanInteraction(session.incoming);
      console.log('[incoming-session-received]', {
        banId: session.incoming.id,
        receiverId: session.incoming.receiver?.id ?? null,
        authUserId: viewerId,
        status: session.incoming.status,
      });
      receiveIncomingBan(session.incoming, 'session');
    } else {
      lastSessionIncomingRef.current = null;
    }

    if (session.check) {
      const role = getCheckViewerRole(
        viewerId,
        session.check.sender.id,
        session.check.receiver.id,
      );
      console.log('[check-session-received]', {
        banId: session.check.id,
        role,
        authUserId: viewerId,
      });
      receiveCheckBan(session.check, 'session');
    }

    logIncomingDebug({
      authUserId: viewerId,
      sessionUserId: s.userId ?? viewerId,
      incomingId: s.incoming?.id ?? null,
      incomingReceiverId: s.incoming?.receiver?.id ?? null,
      incomingAcknowledged: s.incoming?.incomingAcknowledged ?? null,
      shouldShow: !!nextIncoming,
      reason: nextIncoming ? 'shown' : 'no-incoming',
    });

    if (banSentOpenRef.current) {
      pruneAndSyncOverlayQueue();
      return;
    }

    challengeLog('session:apply', {
      incoming: s.incoming?.id ?? null,
      incomingStatus: s.incoming?.status ?? null,
      incomingAck: s.incoming?.incomingAcknowledged ?? null,
      overlayIncoming: nextIncoming?.id ?? null,
      active: Array.isArray(s.active) ? s.active.length : 0,
    });
    const nextActive = Array.isArray(s.active) ? s.active : [];
    applySessionToState(
      enrichSessionState({
        ...s,
        incoming: nextIncoming,
        active: nextActive.filter((b) => !b.id.startsWith('optimistic-ban:')),
      }),
      {
        setActiveBans,
        setCheckWaiting,
      },
    );
    resolveOptimisticFromSession(nextActive);
    pruneAndSyncOverlayQueue();
    if (!nextIncoming) {
      setViralOnboarding(false);
    }
    setDataOwnerUserId(viewerId);
  }, [
    resolveOptimisticFromSession,
    auth.user?.id,
    receiveIncomingBan,
    receiveCheckBan,
    pruneAndSyncOverlayQueue,
  ]);

  useEffect(() => {
    if (!auth.boot || !auth.user?.id || auth.loading) return;
    const incoming = pickIncomingForOverlay(
      auth.boot.claimedIncoming,
      dismissedIncomingRef.current,
      auth.user.id,
    );
    if (incoming) {
      challengeLog('boot:claimed-incoming', { banId: incoming.id });
      enqueueNotification(
        { kind: 'incoming', ban: enrichBanInteraction(incoming) },
        { source: 'session' },
      );
      setViralOnboarding(true);
      setDataOwnerUserId(auth.user.id);
      setSessionBootstrapped(true);
    }
    auth.clearBoot();
  }, [auth.boot, auth.clearBoot, auth.user?.id, auth.loading, enqueueNotification]);

  const reloadFriends = useCallback(async () => {
    const token = tokenRef.current;
    const uid = userIdRef.current;
    if (!token || !uid) return;
    logFriendsTiming('started-fetch', { userId: uid, via: 'reloadFriends' });
    const fetchStartedAt = Date.now();
    const end = timingStart('friends fetch');
    try {
      const requestToken = token;
      const requestUid = uid;
      const { friends: list } = await api<{ friends: FriendCard[] }>(
        '/friends',
        { token },
      );
      if (tokenRef.current !== requestToken) return end();
      if (userIdRef.current !== requestUid) return end();
      const safe = coerceFriendList(list);
      logFriendsTiming('response-received', {
        userId: requestUid,
        count: safe.length,
        ms: Date.now() - fetchStartedAt,
        via: 'reloadFriends',
      });
      await commitFriendsWithAvatarPreload(safe, {
        via: 'reloadFriends',
        markReady: !friendsBootstrappedRef.current,
        allowEmpty: true,
      });
      setDataOwnerUserId(requestUid);
      end();
    } catch {
      logFriendsTiming('response-failed', {
        userId: uid,
        ms: Date.now() - fetchStartedAt,
        via: 'reloadFriends',
      });
      if (!friendsBootstrappedRef.current) setFriendsBootstrapped(true);
      end();
    }
  }, [commitFriendsWithAvatarPreload]);

  reloadFriendsRef.current = reloadFriends;

  const reloadPending = useCallback(async () => {
    tryLockFromStartParam('reloadPending-start');
    const token = tokenRef.current;
    const requestUserId = userIdRef.current;
    if (!token || !requestUserId) {
      setSessionBootstrapped(true);
      setInitialNetworkBootstrapAttempted(true);
      return;
    }
    try {
      const requestedAt = Date.now();
      console.log('[session-fetch]', {
        authUserId: requestUserId,
        requestedAt,
      });
      const session = await fetchSession(token);
      // Discard if user/token switched while request in-flight.
      if (tokenRef.current !== token) return;
      if (userIdRef.current !== requestUserId) return;

      console.log('[session-fetch]', {
        authUserId: requestUserId,
        requestedAt,
        responseUserId: (session as SessionState & { userId?: string })?.userId ?? null,
        incomingId: session.incoming?.id ?? null,
        incomingReceiverId: session.incoming?.receiver?.id ?? null,
      });
      applySession(session);

      if (session.pendingResultId) {
        const pendingId = session.pendingResultId;
        logResultLatency('[result-diag-reload-pending]', {
          banId: pendingId,
          authUserId: requestUserId,
          pendingResultId: pendingId,
          alreadyDelivered: resultDeliveredBanIdsRef.current.has(pendingId),
        });
        const pendingBlock = shouldBlockResultOpen({
          resultBanId: pendingId,
          overboardInFlightBanId: overboardInFlightRef.current,
        });
        logResultOpenAttempt('reloadPending', {
          resultId: pendingId,
          allowed: !pendingBlock.blocked,
          blockReason: pendingBlock.reason,
          bypassPriorityLock: pendingBlock.bypassPriorityLock,
          extra: { phase: 'session-pendingResultId' },
        });
        if (pendingBlock.blocked) {
          logOverlayPriority('pending-result-blocked', {
            resultId: pendingId,
            reason: pendingBlock.reason,
          });
        } else if (
          resultCtaConsumedBanIdsRef.current.has(pendingId) ||
          isDismissedResultLocally(pendingId, requestUserId)
        ) {
          console.log('[overboard-repeat-debug] poll skipped dismissed result', {
            banId: pendingId,
            source: 'reloadPending',
            consumed: resultCtaConsumedBanIdsRef.current.has(pendingId),
            dismissedLocal: isDismissedResultLocally(
              pendingId,
              requestUserId,
            ),
          });
          void acknowledgeBanResultOnServer(pendingId, token);
        } else {
          try {
            const { result: pendingResult } = await api<{ result: BanResult }>(
              `/bans/${pendingId}/result`,
              { token },
            );
            if (tokenRef.current !== token) return;
            if (userIdRef.current !== requestUserId) return;
            if (pendingResult) {
              const afterFetchBlock = shouldBlockResultOpen({
                resultBanId: pendingResult.id,
                overboardInFlightBanId: overboardInFlightRef.current,
              });
              logResultOpenAttempt('reloadPending', {
                resultId: pendingResult.id,
                allowed: !afterFetchBlock.blocked,
                blockReason: afterFetchBlock.reason,
                bypassPriorityLock: afterFetchBlock.bypassPriorityLock,
                extra: { phase: 'after-fetch' },
              });
              if (!afterFetchBlock.blocked) {
                receiveResult(pendingResult, 'poll');
              }
            }
          } catch {
            /* result not ready */
          }
        }
      }

      void refreshUserRef.current().catch(() => {});
      void api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.SESSION_RECOVERED,
        }),
      }).catch(() => {});
      setHasSuccessfulNetworkSync(true);
      setNetworkBootstrapCompleted(true);
      console.log('[connection-ui]', {
        phase: 'session-sync-ok',
        authUserId: requestUserId,
      });
    } catch {
      console.log('[connection-ui]', {
        phase: 'session-sync-failed',
        authUserId: requestUserId,
      });
    } finally {
      setSessionBootstrapped(true);
      setInitialNetworkBootstrapAttempted(true);
    }
  }, [applySession, receiveResult]);

  const openSendTo = useCallback((receiver: string, text = '') => {
    const trimmed = receiver.trim();
    const withAt =
      trimmed && !trimmed.startsWith('@') ? `@${trimmed}` : trimmed;
    setSendReceiver(withAt);
    setSendText(text);
  }, []);

  const clearIncomingReply = useCallback(
    (opts?: { finalizeBanId?: string }) => {
      if (opts?.finalizeBanId) {
        finalizeIncomingReplyAfterSend(opts.finalizeBanId);
      }
      pinReplyToBanId(null);
      setIncomingReplyBanId(null);
      setDeepLinkReplyBan(null);
    },
    [finalizeIncomingReplyAfterSend, pinReplyToBanId],
  );

  const clearBansCtaQueueSuppress = useCallback(() => {
    bansCtaQueueSuppressRef.current = false;
    setBansCtaQueueSuppress(false);
  }, []);

  const clearResultCtaBansOverlayOpen = useCallback(() => {
    resultCtaBansOverlayOpenRef.current = false;
    setResultCtaBansOverlayOpen(false);
  }, []);

  const clearBansOverlayNavigationIntent = useCallback((source: string) => {
    const hadIntent =
      bansCtaQueueSuppressRef.current ||
      resultCtaBansOverlayOpenRef.current ||
      openBansOverlayRequestRef.current > 0 ||
      bansNavStateRef.current.origin === 'result-cta';
    if (!hadIntent) return;

    console.log('[queue-reply-debug] clear bans overlay intent', { source });
    bansCtaQueueSuppressRef.current = false;
    setBansCtaQueueSuppress(false);
    resultCtaBansOverlayOpenRef.current = false;
    setResultCtaBansOverlayOpen(false);
    setOpenBansOverlayRequest(0);
    openBansOverlayRequestRef.current = 0;
    bansNavStateRef.current = DEFAULT_BANS_NAV;
    setBansNavState(DEFAULT_BANS_NAV);
    setBansReturnToLobbyLatch(false);
    bansReturnToLobbyLatchRef.current = false;
    setCloseBansOverlayRequest((n) => n + 1);
  }, []);

  const armOpenBansOverlayFromResultCta = useCallback(
    (banId: string | null) => {
      closeSendFlow();
      clearIncomingReply();
      clearDeepLinkReplyBan();
      logResultNav('block-send-flow', {
        reason: 'open-bans-cta',
        direct: true,
        banId,
      });
      markVisibleOverboardTrace('RESULT NAV BLOCK SEND FLOW', {
        reason: 'open-bans-cta',
        direct: true,
        banId,
      });

      bansCtaQueueSuppressRef.current = true;
      bansNavStateRef.current = {
        origin: 'result-cta',
        previousScreen: 'lobby',
        returnTarget: 'lobby',
      };

      let nextBansRequest = 0;
      flushSync(() => {
        setBansCtaQueueSuppress(true);
        setBansNavState(bansNavStateRef.current);
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        setOpenBansOverlayRequest((n) => {
          nextBansRequest = n + 1;
          openBansOverlayRequestRef.current = n + 1;
          return nextBansRequest;
        });
        setResultCtaBansOverlayOpen(true);
        resultCtaBansOverlayOpenRef.current = true;
      });

      markVisibleOverboardTrace('[BANS OPEN REQUESTED]', {
        openBansOverlayRequest: nextBansRequest,
        resultCtaBansOverlayOpen: true,
        bansCtaQueueSuppress: true,
      });
      console.log('[BANS OPEN REQUESTED]', {
        openBansOverlayRequest: nextBansRequest,
        resultCtaBansOverlayOpen: true,
        lobbyOpen: lobbyOpenRef.current,
      });
    },
    [clearDeepLinkReplyBan, clearIncomingReply, closeSendFlow],
  );

  const notifyResultReplyWhatVisible = useCallback(
    (banId: string, selectedUserId: string | null) => {
      setResultReplyWhatReady(true);
      setResultReplyHandoffLock(false);
      setResultReplyPending(null);
      logResultReply('what-visible', {
        banId,
        selectedUserId,
        phase: 'composingBan',
      });
    },
    [],
  );

  const startReplyFromResult = useCallback(
    (r: BanResult) => {
      logResultReply('start', { banId: r.id, outcome: r.outcome });
      const opponent = resolveResultReplyOpponent(r);
      if (!opponent?.id) {
        console.warn('[RESULT REPLY] no-opponent', { banId: r.id });
        return;
      }
      setLobbyOpen(false);
      setResultReplyHandoffLock(true);
      setResultReplyWhatReady(false);
      setResultReplyPending({ banId: r.id, opponent });
      setResultReplyRequest((n) => n + 1);
      openSendFlow();
      logResultReply('selected-user', {
        banId: r.id,
        userId: opponent.id,
        username: opponent.username,
      });
    },
    [openSendFlow],
  );

  const applyDirectOverboardCloseState = useCallback(
    (banId: string | null) => {
      console.log('[DIRECT OVERBOARD CLOSE FROM CTA]', {
        banId,
        inFlightId: overboardInFlightRef.current,
      });
      markVisibleOverboardTrace('DIRECT OVERBOARD CLOSE FROM CTA', {
        banId,
        inFlightId: overboardInFlightRef.current,
      });

      const viewerId =
        resultRef.current?.viewerId ?? userIdRef.current ?? null;
      if (banId) {
        dismissBanResultLocally(banId, viewerId);
        void acknowledgeBanResultOnServer(banId, tokenRef.current);
      }

      if (overboardInFlightRef.current === banId) {
        overboardInFlightRef.current = null;
      }
      clearLocalOverboardBypass();
      clearDirectOverboardLayerRefs();
      resultOpenRef.current = false;
      setDirectResultOverlayActive(false);
      setResult(null);
      resultRef.current = null;
    },
    [clearDirectOverboardLayerRefs],
  );

  const consumeResultBanForResultCta = useCallback(
    (banId: string) => {
      const viewerId =
        resultRef.current?.viewerId ?? userIdRef.current ?? null;
      const outcome = resultRef.current?.outcome ?? result?.outcome ?? null;

      if (outcome === 'overboard') {
        consumeIncomingAfterAnswer(banId, 'overboard');
      }

      console.log('[overboard-repeat-debug] local dismiss resultId', {
        banId,
        viewerId,
        outcome,
      });
      console.log('[RESULT CTA CONSUME]', { banId });
      markVisibleOverboardTrace('[RESULT CTA CONSUME]', { banId });

      resultCtaConsumedBanIdsRef.current.add(banId);
      resultDeliveredBanIdsRef.current.add(banId);
      dismissBanResultLocally(banId, viewerId);

      const token = tokenRef.current;
      console.log('[overboard-repeat-debug] ack result start', { banId });
      void (async () => {
        await acknowledgeBanResultOnServer(banId, token);
        console.log('[overboard-repeat-debug] ack result done', { banId });
      })();

      const beforeQueue = overlayQueueRef.current;
      const beforeLen = beforeQueue.length;
      const nextQueue = removeOverlaysForBan(beforeQueue, banId, ['result']);
      overlayQueueRef.current = nextQueue;
      setOverlayQueue(nextQueue);

      console.log('[QUEUE POP RESULT CTA]', {
        banId,
        before: beforeLen,
        after: nextQueue.length,
        beforeHeadKind: beforeQueue[0]?.kind ?? null,
        afterHeadKind: nextQueue[0]?.kind ?? null,
      });
      markVisibleOverboardTrace('[QUEUE POP RESULT CTA]', {
        banId,
        before: beforeLen,
        after: nextQueue.length,
        beforeHeadKind: beforeQueue[0]?.kind ?? null,
        afterHeadKind: nextQueue[0]?.kind ?? null,
      });

      cancelResultPollBurst();
      applyDirectOverboardCloseState(banId);
    },
    [
      applyDirectOverboardCloseState,
      cancelResultPollBurst,
      consumeIncomingAfterAnswer,
      result?.outcome,
    ],
  );

  const closeDirectOverboardForCta = useCallback(
    (banId: string | null) => {
      const gateBefore = snapshotDirectOverboardGate();
      flushSync(() => {
        applyDirectOverboardCloseState(banId);
      });
      logDirectOverboardStateReset({
        source: 'open-bans-cta',
        reason: 'user-open-bans',
        before: gateBefore,
        after: {
          directResultOverlayActive: false,
          directResultOverlayRef: false,
          resultBanId: null,
          showDirectOverboardLayer: false,
          hasResult: false,
        },
      });
    },
    [applyDirectOverboardCloseState, snapshotDirectOverboardGate],
  );

  const navigateFromResult = useCallback(() => {
    const banId = result?.id ?? resultRef.current?.id ?? null;
    const wasDirect =
      directResultOverlayRef.current ||
      directResultOverlayActiveRef.current ||
      directResultOverlayActive;
    const queueLen = overlayQueueRef.current.length;

    console.log('[overboard-repeat-debug] to bans clicked', {
      banId,
      wasDirect,
      queueLength: queueLen,
    });
    console.log('[overboard-status-debug] to bans clicked', {
      banId,
      wasDirect,
      queueLength: queueLen,
    });

    markVisibleOverboardTrace('RESULT CTA OPEN BANS click', {
      action: wasDirect ? 'open-bans' : 'open-bans-queue',
      direct: wasDirect,
      banId,
      wasDirect,
      queueLength: queueLen,
    });
    logResultNav('to-bans', {
      action: 'open-bans',
      direct: wasDirect,
      banId,
      queueLength: queueLen,
      wasDirect,
    });
    markOverlayUserAction('result-nav', banId ?? undefined);

    const showNextPendingOrOpenBans = (source: string) => {
      const nextHead = overlayQueueRef.current[0] ?? null;
      if (nextHead) {
        const nextBanId =
          nextHead.kind === 'result'
            ? nextHead.result.id
            : nextHead.ban.id;
        console.log('[overboard-status-debug] queue has next pending', {
          kind: nextHead.kind,
          banId: nextBanId,
          queueLength: overlayQueueRef.current.length,
        });
        console.log(
          '[overboard-status-debug] open next pending instead of persistent bans intent',
          { source },
        );
        clearBansOverlayNavigationIntent(source);
        syncDisplayFromQueue(overlayQueueRef.current);
        logResultNav('next-overlay', {
          remaining: overlayQueueRef.current.length,
        });
        return true;
      }
      return false;
    };

    if (banId) {
      consumeResultBanForResultCta(banId);
    } else if (wasDirect) {
      applyDirectOverboardCloseState(null);
      cancelResultPollBurst();
    }

    clearBansOverlayNavigationIntent(
      wasDirect ? 'overboard-status-direct' : 'navigate-from-result-queue',
    );

    if (
      showNextPendingOrOpenBans(
        wasDirect ? 'overboard-status-direct' : 'navigate-from-result-non-direct',
      )
    ) {
      return;
    }

    logResultNav('open-bans-overlay', { direct: wasDirect, banId, wasDirect });
    armOpenBansOverlayFromResultCta(banId);
  }, [
    applyDirectOverboardCloseState,
    armOpenBansOverlayFromResultCta,
    cancelResultPollBurst,
    clearBansOverlayNavigationIntent,
    consumeResultBanForResultCta,
    directResultOverlayActive,
    markOverlayUserAction,
    result?.id,
    syncDisplayFromQueue,
  ]);

  const startIncomingReply = useCallback(
    (ban: BanInteraction) => {
      const enriched = enrichBanInteraction(ban);
      pinReplyToBanId(ban.id);
      setReplyComposeActive(true);
      setIncomingReplyBanId(ban.id);
      setReplyDeepLinkBanId(ban.id);
      replyDeepLinkBanIdRef.current = ban.id;
      setDeepLinkReplyBan(enriched);
      setLobbyOpen(false);
      logReplyFlow('reply-compose-open', {
        banId: ban.id,
        lockActive: false,
        instantBanOpen: false,
        sendFlowOpen: false,
        lobbyOpen: false,
      });
      console.log('[reply-deeplink]', {
        banId: ban.id,
        action: 'card-reply-start',
      });
    },
    [pinReplyToBanId],
  );

  const acknowledgeIncomingSeen = useCallback(async (banId: string) => {
    dismissedIncomingRef.current.add(banId);
    setViralOnboarding(false);
    removeIncomingFromQueue(banId);
    console.log('[incoming-cleared]', {
      banId,
      reason: 'receiver-dismiss',
      authUserId: userIdRef.current,
    });
    const uid = userIdRef.current;
    if (uid) {
      await acknowledgeIncomingFully(banId, tokenRef.current, uid);
    }
    challengeLog('incoming:acked', { banId });
  }, [removeIncomingFromQueue]);

  const acknowledgeIncomingAndStartReply = useCallback(
    (ban: BanInteraction) => {
      const banId = ban.id;
      console.log('[queue-reply-debug] reply clicked from queued incoming', {
        banId,
      });
      if (
        bansCtaQueueSuppressRef.current ||
        resultCtaBansOverlayOpenRef.current ||
        openBansOverlayRequestRef.current > 0
      ) {
        console.log('[queue-reply-debug] blocked by bans overlay intent', {
          bansCtaQueueSuppress: bansCtaQueueSuppressRef.current,
          resultCtaBansOverlayOpen: resultCtaBansOverlayOpenRef.current,
          openBansOverlayRequest: openBansOverlayRequestRef.current,
        });
      }
      clearBansOverlayNavigationIntent('incoming-reply-click');

      setViralOnboarding(false);
      challengeLog('incoming:reply-open', { banId });

      beginReplyHandoff(banId);
      startIncomingReply(ban);
      dismissIncomingCardForReplyCompose(banId);

      console.log('[queue-reply-debug] replyToBanId', { banId });
      console.log('[queue-reply-debug] selectedUser', {
        userId: ban.sender?.id ?? null,
        username: ban.sender?.username ?? null,
      });
      console.log('[queue-reply-debug] open What', { banId });
      logReplyFlow('overlay-dismissed', {
        banId,
        lockActive: true,
        activeOverlayKind: null,
        lobbyOpen: false,
      });

      const token = tokenRef.current;
      if (token) {
        void (async () => {
          try {
            await api<{ ban: BanInteraction }>(`/bans/${banId}/accept`, {
              method: 'POST',
              token,
            });
            patchReplyHandoffDebug({
              acceptPending: false,
              acceptDone: true,
            });
          } catch (e) {
            challengeLog('incoming:accept-failed', {
              banId,
              message: (e as Error).message,
            });
            patchReplyHandoffDebug({
              acceptPending: false,
              acceptDone: false,
            });
          }
        })();
      } else {
        patchReplyHandoffDebug({ acceptPending: false, acceptDone: false });
      }
    },
    [
      beginReplyHandoff,
      clearBansOverlayNavigationIntent,
      dismissIncomingCardForReplyCompose,
      startIncomingReply,
    ],
  );

  const dismissIncoming = useCallback(
    (banId?: string) => {
      if (banId) {
        void acknowledgeIncomingSeen(banId);
        return;
      }
      challengeLog('incoming:dismiss', { banId: null });
      setViralOnboarding(false);
      dismissCurrentOverlay('incoming-dismiss');
    },
    [acknowledgeIncomingSeen, dismissCurrentOverlay],
  );

  const { status: wsStatus, eventLog } = useWebSocket(
    auth.token,
    (event) => {
      switch (event.type) {
        case 'ban:incoming': {
          receiveIncomingBan(event.payload as BanInteraction, 'ws');
          break;
        }
        case 'check:due': {
          receiveCheckBan(event.payload as BanInteraction, 'ws');
          break;
        }
        case 'check:waiting':
          setCheckWaiting(true);
          scheduleCheckWaitingDismiss();
          scheduleResultPollBurst();
          logResultLatency('[result-diag-check-waiting-ws]', {
            authUserId: userIdRef.current,
            role: resultParticipantRole(
              userIdRef.current,
              checkBanRef.current,
            ),
          });
          break;
        case 'check:completed': {
          const payload = event.payload as BanResult;
          const uid = userIdRef.current;
          const banId = payload?.id ?? null;
          const submitAt = banId ? checkSubmitAtRef.current.get(banId) : undefined;
          const role = resultParticipantRole(uid, payload);
          const elapsedMs = resultElapsedSinceSubmit(
            banId,
            checkSubmitAtRef.current,
          );
          logResultLatency('[result-ws-received]', {
            banId,
            authUserId: uid,
            role,
            source: 'ws',
            elapsedMs,
          });
          const wsResultBlock = shouldBlockResultOpen({
            resultBanId: banId,
            overboardInFlightBanId: overboardInFlightRef.current,
          });
          logResultOpenAttempt('ws-check-completed', {
            resultId: banId,
            allowed: !wsResultBlock.blocked,
            blockReason: wsResultBlock.reason,
            bypassPriorityLock: wsResultBlock.bypassPriorityLock,
          });
          receiveResult(payload, 'ws');
          if (uid && banId) {
            answeredCheckRef.current.add(banId);
            dismissedCheckSessionRef.current.add(banId);
            markCheckAnsweredLocally(uid, banId);
          }
          queueMicrotask(() => {
            if (banId) {
              applyOverlayQueue(
                removeOverlaysForBan(overlayQueueRef.current, banId, [
                  'check',
                  'incoming',
                ]),
              );
            }
            void refreshUserRef.current().catch(() => {});
          });
          break;
        }
        case 'sync:session':
          applySession(event.payload as SessionState);
          break;
        case 'energy:popup':
          pushPopup(event.payload as EnergyPopup);
          queueMicrotask(() => {
            void refreshUserRef.current().catch(() => {});
          });
          break;
        case 'ban:updated':
          if (!banSentOpenRef.current) reloadPending();
          break;
        case 'friends:updated': {
          if (banSentOpenRef.current) break;
          const payload = event.payload as { friends?: unknown };
          const list = coerceFriendList(payload?.friends);
          const uid = userIdRef.current;
          if (!uid) break;
          void commitFriendsWithAvatarPreload(list, {
            via: 'ws-friends',
            markReady: false,
          }).then(() => {
            setDataOwnerUserId(uid);
          });
          break;
        }
      }
    },
    () => {
      logResultLatency('[result-diag-ws-reconnect]', {
        authUserId: userIdRef.current,
      });
      void reloadPendingRef.current().catch(() => {});
    },
  );

  useEffect(() => {
    if (wsStatus === 'connected') {
      setWsHasConnectedOnce(true);
    }
  }, [wsStatus]);

  useEffect(() => {
    if (!auth.user?.id || !auth.token || auth.loading) {
      setStartupGraceActive(true);
      return;
    }
    setStartupGraceActive(true);
    console.log('[connection-ui]', {
      phase: 'grace-start',
      ms: STARTUP_GRACE_MS,
      userId: auth.user.id,
    });
    const t = window.setTimeout(() => {
      setStartupGraceActive(false);
      console.log('[connection-ui]', { phase: 'grace-end', userId: auth.user?.id });
    }, STARTUP_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [auth.user?.id, auth.token, auth.loading]);

  useEffect(() => {
    const sync = () => setNavigatorOffline(!navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (startupGraceActive) return;
    if (hasSuccessfulNetworkSync) return;
    if (!initialNetworkBootstrapAttempted) return;
    setNetworkBootstrapCompleted(true);
    console.log('[connection-ui]', { phase: 'bootstrap-settled-without-sync' });
  }, [
    startupGraceActive,
    hasSuccessfulNetworkSync,
    initialNetworkBootstrapAttempted,
  ]);

  useEffect(() => {
    const uid = auth.user?.id;
    const token = auth.token;
    if (!uid || !token || auth.loading) return;
    void backfillAcknowledgedIncomingOnce(token, uid);
  }, [auth.user?.id, auth.token, auth.loading]);

  reloadPendingRef.current = reloadPending;

  useEffect(() => {
    resultOpenRef.current = !!result;
  }, [result]);

  useEffect(() => {
    const uid = auth.user?.id;
    const token = auth.token;
    if (!uid || !token) return;
    void reloadPendingRef.current().catch(() => {});
  }, [auth.user?.id, auth.token]);

  useEffect(() => {
    setFirstBanComplete(isFirstBanComplete());
  }, []);

  const completeFirstBan = useCallback(() => {
    markFirstBanComplete();
    setFirstBanComplete(true);
    void auth.onboard().catch(() => {});
  }, [auth.onboard]);

  const showFirstBanOnboarding = useMemo(() => {
    if (firstBanComplete) return false;
    if (auth.user?.isOnboarded) return false;
    return friends.length === 0;
  }, [firstBanComplete, auth.user?.isOnboarded, friends.length]);

  useEffect(() => {
    if (!result) return;
    if (bansReturnToLobbyLatchRef.current) return;
    const nav = bansNavStateRef.current;
    if (nav.origin === 'result-cta' && nav.returnTarget === 'lobby') {
      return;
    }
    if (
      isDismissedResultLocally(result.id, result.viewerId ?? null) ||
      !isValidBanResultPayload(result)
    ) {
      dismissBanResult();
    }
  }, [result, dismissBanResult]);

  useEffect(() => {
    resetScrollLock();
  }, []);

  useEffect(
    () => () => {
      if (checkWaitingTimerRef.current) {
        clearTimeout(checkWaitingTimerRef.current);
      }
      resetScrollLock();
    },
    [],
  );

  useEffect(() => {
    const uid = auth.user?.id;
    if (!uid || !auth.token || auth.loading) return;

    logFriendsTiming('started-fetch', {
      userId: uid,
      authReady: auth.authReady,
    });
    const fetchStartedAt = Date.now();
    const end = timingStart('/friends loaded');
    const requestToken = auth.token;
    const requestUid = uid;
    api<{ friends?: unknown }>('/friends', { token: requestToken })
      .then(async (r) => {
        const ms = Date.now() - fetchStartedAt;
        if (tokenRef.current !== requestToken || userIdRef.current !== requestUid) {
          logFriendsTiming('response-discarded', { userId: requestUid, ms });
          end();
          return;
        }
        const list = coerceFriendList(r?.friends);
        logFriendsTiming('response-received', {
          userId: requestUid,
          count: list.length,
          ms,
        });
        await commitFriendsWithAvatarPreload(list, {
          via: 'initial-fetch',
          allowEmpty: true,
        });
        setDataOwnerUserId(requestUid);
        end();
      })
      .catch(() => {
        logFriendsTiming('response-failed', {
          userId: requestUid,
          ms: Date.now() - fetchStartedAt,
        });
        setFriendsBootstrapped(true);
        end();
        timingLog('friends fetch failed', 0);
      });
  }, [
    auth.token,
    auth.user?.id,
    auth.loading,
    auth.authReady,
    commitFriendsWithAvatarPreload,
  ]);

  const displayFriends = useMemo(
    () => mergeFriendsWithOptimistic(friends, optimisticSendWait),
    [friends, optimisticSendWait],
  );

  const displayActiveBans = useMemo(
    () => mergeActiveBansWithOptimistic(activeBans, optimisticSendWait),
    [activeBans, optimisticSendWait],
  );

  const displayFriendsRef = useRef(displayFriends);
  displayFriendsRef.current = displayFriends;
  const displayActiveBansRef = useRef(displayActiveBans);
  displayActiveBansRef.current = displayActiveBans;
  const optimisticSendWaitRef = useRef(optimisticSendWait);
  optimisticSendWaitRef.current = optimisticSendWait;

  const flushDeferredSync = useCallback(async () => {
    if (!deferredSyncRef.current) return;
    deferredSyncRef.current = false;
    await reloadPending();
    await reloadFriends();
    await auth.refreshUser().catch(() => {});
    await auth.onboard().catch(() => {});
  }, [reloadPending, reloadFriends, auth.refreshUser, auth.onboard]);

  const scheduleDeferredSync = useCallback(() => {
    deferredSyncRef.current = true;
  }, []);

  const setBanSentOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setUiFreeze({
          friends: displayFriendsRef.current,
          activeBans: displayActiveBansRef.current,
          optimisticSendWait: optimisticSendWaitRef.current,
        });
        banSentOpenRef.current = true;
        setBanSentOpenRaw(true);
        return;
      }
      banSentOpenRef.current = false;
      setBanSentOpenRaw(false);
      setUiFreeze(null);
      console.log('[success-done-click]', {
        banId: null,
        senderId: userIdRef.current,
      });
      void flushDeferredSync();
    },
    [flushDeferredSync],
  );

  const completeBanSendSuccess = useCallback(() => {
    blurActiveInputs();
    setSendText('');
    setInlineBanError(null);
    afterKeyboardCollapse(() => {
      setBanSentOpen(true);
    }, 100);
  }, [setBanSentOpen]);

  banSentOpenRef.current = banSentOpen;

  const optimisticForUi =
    banSentOpen && uiFreeze ? uiFreeze.optimisticSendWait : optimisticSendWait;

  useEffect(() => {
    const uid = auth.user?.id;
    if (!uid || auth.loading || !friendsBootstrapped || !auth.user) return;

    const timer = window.setTimeout(() => {
      writeHomeSnapshot(uid, {
        friends: displayFriendsRef.current,
        user: auth.user,
        sendDuration,
        sendReceiver,
        activeBansCount: displayActiveBansRef.current.length,
        checkBan: checkBan?.status === 'checking' ? checkBan : null,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    auth.user,
    auth.loading,
    friendsBootstrapped,
    sendDuration,
    sendReceiver,
    displayFriends,
    displayActiveBans.length,
    checkBan,
  ]);

  // Show user data as soon as backend user id + token exist (do not wait authReady / session).
  const isAppReady = !!auth.user?.id && !!auth.token && !auth.loading;
  const friendsReady = friendsBootstrapped;
  const sessionReady = sessionBootstrapped;
  const notificationQueueLocked = isNotificationQueueLocked();
  const priorityBlocksResult =
    !directResultOverlayActive &&
    notificationQueueLocked &&
    !isLocalOverboardBypassForBan(result?.id ?? null);
  const displayResult = priorityBlocksResult ? null : result;
  const showDirectOverboardLayer =
    directResultOverlayActive && displayResult != null;

  useLayoutEffect(() => {
    directResultOverlayActiveRef.current = directResultOverlayActive;
    if (directResultOverlayActive && result?.id) {
      commitDirectOverboardLayerRefs(result.id, true);
    }
  }, [
    commitDirectOverboardLayerRefs,
    directResultOverlayActive,
    result?.id,
  ]);

  useLayoutEffect(() => {
    if (
      !directResultOverlayActive &&
      !overboardInFlightRef.current &&
      result?.outcome !== 'overboard'
    ) {
      return;
    }
    markVisibleOverboardTrace('DIRECT OVERBOARD LAYER render-check', {
      active: directResultOverlayActive,
      hasResult: result != null,
      resultBanId: result?.id ?? null,
      refActive: directResultOverlayRef.current,
      willRender: showDirectOverboardLayer,
    });
  }, [
    directResultOverlayActive,
    result,
    showDirectOverboardLayer,
  ]);

  const replyFastDisplayBanId =
    replyDeeplinkFastOpenedRef.current && replyDeepLinkBanId
      ? replyDeepLinkBanId
      : null;
  const replyFastIncomingActive =
    replyFastDisplayBanId != null &&
    !incomingConsumedAfterAnswerRef.current.has(replyFastDisplayBanId) &&
    (resolveReplyFastStillValid(replyFastDisplayBanId).valid ||
      (replyDeeplinkFastWrittenBanIdRef.current === replyFastDisplayBanId &&
        replyDeeplinkFastWrittenAtRef.current != null &&
        performance.now() - replyDeeplinkFastWrittenAtRef.current <
          REPLY_DEEPLINK_FAST_TIMEOUT_MS));
  const activeOverlayKind = showDirectOverboardLayer
    ? 'result'
    : replyFastIncomingActive
      ? 'incoming'
      : (overlayQueue[0]?.kind ?? overlayQueueRef.current[0]?.kind ?? null);
  const displayActiveOverlayKind =
    priorityBlocksResult && !replyFastIncomingActive
      ? null
      : activeOverlayKind;
  const queueHeadKind =
    overlayQueue[0]?.kind ?? overlayQueueRef.current[0]?.kind ?? null;
  const notificationShellSuppressedForBansLobby =
    bansCtaQueueSuppressRef.current || bansReturnToLobbyLatchRef.current;
  const incomingAnswerBlockId =
    replyDeepLinkBanId ?? replyDeeplinkPendingBanIdRef.current;
  const incomingBlockedAfterAnswer =
    incomingAnswerBlockId != null &&
    incomingConsumedAfterAnswerRef.current.has(incomingAnswerBlockId);
  const shouldRenderIncomingOverlay =
    !showDirectOverboardLayer &&
    !notificationShellSuppressedForBansLobby &&
    !incomingBlockedAfterAnswer &&
    (displayActiveOverlayKind === 'incoming' ||
      activeOverlayKind === 'incoming' ||
      queueHeadKind === 'incoming' ||
      replyFastIncomingActive ||
      (replyDeepLinkBanId != null &&
        (replyDeeplinkFastShell || replyHandoffLock) &&
        !incomingReplyComposeDismissedRef.current.has(replyDeepLinkBanId)));
  const incomingOverlayDisplayKind = shouldRenderIncomingOverlay
    ? 'incoming'
    : displayActiveOverlayKind;
  const hasQueuedOverlayShell =
    (overlayQueue.length > 0 ||
      replyFastIncomingActive ||
      shouldRenderIncomingOverlay) &&
    incomingOverlayDisplayKind != null;
  const notificationSessionActive =
    !priorityBlocksResult &&
    !notificationShellSuppressedForBansLobby &&
    (showDirectOverboardLayer ||
      overboardTransitionActive ||
      hasQueuedOverlayShell);

  const incomingGateActive = useMemo(() => {
    if (priorityBlocksResult) return false;
    if (!auth.user?.id || auth.loading) return false;
    if (replyFastIncomingActive) return true;
    if (activeOverlayKind === 'incoming' && incomingBan) return true;
    return shouldShowIncomingBanModal(
      incomingBan,
      auth.user.id,
      dismissedIncomingRef.current,
    );
  }, [
    priorityBlocksResult,
    replyFastIncomingActive,
    activeOverlayKind,
    incomingBan,
    auth.user?.id,
    auth.loading,
  ]);

  const queueHeadBanId =
    overlayQueue[0]?.kind === 'incoming'
      ? overlayQueue[0].ban.id
      : overlayQueueRef.current[0]?.kind === 'incoming'
        ? overlayQueueRef.current[0].ban.id
        : null;
  const isReplyFastShellRequested = Boolean(
    replyDeeplinkFastShell && replyDeepLinkBanId && incomingGateActive,
  );
  const isReplyFastPendingOpen = Boolean(
    replyDeeplinkPendingBanIdRef.current &&
      !replyDeeplinkFastOpenedRef.current &&
      !incomingBlockedAfterAnswer &&
      !showDirectOverboardLayer &&
      !notificationShellSuppressedForBansLobby &&
      auth.user?.id &&
      !auth.loading &&
      auth.token,
  );
  const effectiveShouldRenderIncoming =
    shouldRenderIncomingOverlay ||
    isReplyFastShellRequested ||
    isReplyFastPendingOpen;
  const effectiveIncomingOverlayDisplayKind = effectiveShouldRenderIncoming
    ? 'incoming'
    : incomingOverlayDisplayKind;

  const checkGateActive = useMemo(
    () => {
      if (priorityBlocksResult) return false;
      if (activeOverlayKind === 'check' && checkBan) return true;
      return shouldShowCheckOverlay(
        checkBan,
        auth.user?.id ?? null,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        !!result,
      );
    },
    [priorityBlocksResult, activeOverlayKind, checkBan, auth.user?.id, result],
  );

  const notificationOverlayActive =
    notificationSessionActive ||
    incomingGateActive ||
    checkGateActive ||
    !!displayResult;

  const overlayActiveKinds = useMemo(() => {
    const kinds: string[] = [];
    if (incomingGateActive) kinds.push('incoming');
    if (checkGateActive) kinds.push('check');
    if (result) kinds.push('result');
    return kinds;
  }, [incomingGateActive, checkGateActive, result]);

  const closeLobby = useCallback(() => {
    console.log('[lobby-enter-click]', { userId: userIdRef.current ?? null });
    setLobbyOpen(false);
    lobbyOpenRef.current = false;
    console.log('[lobby-closed]', { userId: userIdRef.current ?? null });
  }, []);

  const openLobby = useCallback((source?: string) => {
    setLobbyOpen(true);
    lobbyOpenRef.current = true;
    lobbyShownLoggedRef.current = false;
    console.log('[lobby-opened]', {
      userId: userIdRef.current ?? null,
      source: source ?? 'default',
      lobbyOpen: true,
    });
  }, []);

  useLayoutEffect(() => {
    openLobbyRef.current = openLobby;
  }, [openLobby]);

  useEffect(() => {
    lobbyOpenRef.current = lobbyOpen;
  }, [lobbyOpen]);

  const clearReplyDeepLinkState = useCallback(() => {
    pinReplyToBanId(null);
    setReplyDeepLinkBanId(null);
    setIncomingReplyBanId(null);
    setDeepLinkReplyBan(null);
    setReplyHandoffLock(false);
    setReplyWhatReady(false);
    setDeepLinkReplyBooting(false);
    replyFlowArmedBanIdRef.current = null;
    replyLockReleasedRef.current = false;
  }, [pinReplyToBanId]);

  const restoreLobbyShellForResultCtaReturn = useCallback(() => {
    clearReplyDeepLinkState();
    setReplyWhatReady(true);
    setResultReplyHandoffLock(false);
    setResultReplyWhatReady(true);
    setResultReplyPending(null);
    activeBanCardVisibleRef.current = false;
    setActiveBanCardReady(true);
    setActiveBanDeepLinkBanId(null);
  }, [clearReplyDeepLinkState]);

  const [newBanWhoFlowRequest, setNewBanWhoFlowRequest] = useState(0);

  const requestOpenBansFromResultCta = useCallback(
    (banId: string | null) => {
      console.log('[RESULT CTA OPEN BANS]', { banId, click: true });
      markVisibleOverboardTrace('[RESULT CTA OPEN BANS]', {
        banId,
        click: true,
      });

      const gateBefore = snapshotDirectOverboardGate();

      flushSync(() => {
        if (banId) {
          console.log('[RESULT CTA OPEN BANS PRIORITY]', { banId });
          markVisibleOverboardTrace('[RESULT CTA OPEN BANS PRIORITY]', { banId });
          consumeResultBanForResultCta(banId);
        } else {
          applyDirectOverboardCloseState(null);
          cancelResultPollBurst();
        }
      });

      armOpenBansOverlayFromResultCta(banId);

      logDirectOverboardStateReset({
        source: 'open-bans-cta',
        reason: 'user-open-bans-sync-consume',
        before: gateBefore,
        after: {
          directResultOverlayActive: false,
          directResultOverlayRef: false,
          resultBanId: null,
          showDirectOverboardLayer: false,
          hasResult: false,
        },
      });
      markVisibleOverboardTrace('[DIRECT RESULT CLEANUP DONE]', {
        banId,
        bansCtaQueueSuppress: bansCtaQueueSuppressRef.current,
        resultCtaBansOverlayOpen: resultCtaBansOverlayOpenRef.current,
      });
    },
    [
      applyDirectOverboardCloseState,
      armOpenBansOverlayFromResultCta,
      cancelResultPollBurst,
      consumeResultBanForResultCta,
      snapshotDirectOverboardGate,
    ],
  );

  const armBansNavFromResultCta = useCallback(() => {
    const next: BansNavState = {
      origin: 'result-cta',
      previousScreen: 'lobby',
      returnTarget: 'lobby',
    };
    bansNavStateRef.current = next;
    setBansNavState(next);
    console.log('[BANS NAV] opened-from-result-cta returnTarget=lobby');
  }, []);

  const resetBansNavState = useCallback(() => {
    bansNavStateRef.current = DEFAULT_BANS_NAV;
    setBansNavState(DEFAULT_BANS_NAV);
  }, []);

  const completeBansOverlayCloseFromResultCta = useCallback(
    (closeSource = 'unknown') => {
      const nav = bansNavStateRef.current;
      const fromResultCta =
        (nav.origin === 'result-cta' && nav.returnTarget === 'lobby') ||
        bansCtaQueueSuppressRef.current;

      console.log('[BANS CLOSE]', {
        source: closeSource,
        origin: nav.origin,
        returnTarget: nav.returnTarget,
        previousScreen: nav.previousScreen,
        'lobbyOpen(before)': lobbyOpenRef.current,
        bansCtaQueueSuppress: bansCtaQueueSuppressRef.current,
        fromResultCta,
      });
      markVisibleOverboardTrace('[BANS CLOSE]', {
        source: closeSource,
        fromResultCta,
        origin: nav.origin,
      });

      if (!fromResultCta) {
        console.log('[BANS CLOSE BRANCH] branch=default');
        return false;
      }

      console.log('[BANS CLOSE BRANCH] branch=result-cta');
      markVisibleOverboardTrace('[BANS CLOSE BRANCH]', {
        branch: 'result-cta',
        source: closeSource,
      });

      const lobbySource =
        closeSource === 'back-arrow'
          ? 'bans-back-arrow-result-cta'
          : 'bans-close-result-cta';
      const wasBansCta = bansCtaQueueSuppressRef.current;

      console.log('[LOBBY OPEN]', {
        source: lobbySource,
        lobbyOpenBefore: lobbyOpenRef.current,
      });
      markVisibleOverboardTrace('[LOBBY OPEN]', {
        source: lobbySource,
        lobbyOpenBefore: lobbyOpenRef.current,
      });

      flushSync(() => {
        setBansReturnToLobbyLatch(true);
        bansReturnToLobbyLatchRef.current = true;
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        lobbyShownLoggedRef.current = false;
        if (wasBansCta) {
          bansCtaQueueSuppressRef.current = false;
          setBansCtaQueueSuppress(false);
        }
        resultCtaBansOverlayOpenRef.current = false;
        setResultCtaBansOverlayOpen(false);
        setOverboardTransitionActive(false);

        let nextQueue = overlayQueueRef.current;
        let poppedDismissedResult = false;
        while (nextQueue[0]?.kind === 'result') {
          const headResult = nextQueue[0].result;
          const viewerId = headResult.viewerId ?? userIdRef.current ?? null;
          if (!isDismissedResultLocally(headResult.id, viewerId)) break;
          nextQueue = popOverlayHead(nextQueue);
          poppedDismissedResult = true;
        }
        if (poppedDismissedResult) {
          overlayQueueRef.current = nextQueue;
          setOverlayQueue(nextQueue);
          markVisibleOverboardTrace('[BANS CLOSE QUEUE DRAIN]', {
            queueLength: nextQueue.length,
            headKind: nextQueue[0]?.kind ?? null,
          });
        }
        resultOpenRef.current = false;
        setResult(null);
        resultRef.current = null;
        clearDirectOverboardLayerRefs();
        setDirectResultOverlayActive(false);
        restoreLobbyShellForResultCtaReturn();
      });

      console.log('[LOBBY OPEN DONE]', {
        lobbyOpen: lobbyOpenRef.current,
        source: lobbySource,
      });

      const head = overlayQueueRef.current[0];
      if (head?.kind === 'result') {
        const viewerId = head.result.viewerId ?? userIdRef.current ?? null;
        if (isDismissedResultLocally(head.result.id, viewerId)) {
          dismissCurrentOverlay('result-cta-bans-close-pop');
        }
      }

      queueMicrotask(() => {
        resetBansNavState();
      });
      window.setTimeout(() => {
        if (isNotificationQueueLocked() || wasBansCta) {
          unlockNotificationQueueAndFlush(
            wasBansCta ? 'result-cta-bans-closed' : 'target-flow-closed',
          );
        }
        requestAnimationFrame(() => {
          setBansReturnToLobbyLatch(false);
          bansReturnToLobbyLatchRef.current = false;
        });
      }, 400);

      console.log('[BANS NAV] back-to-lobby source=result-cta');
      markVisibleOverboardTrace('[BANS NAV]', {
        action: 'back-to-lobby',
        source: 'result-cta',
        closeSource,
      });
      return true;
    },
    [
      clearDirectOverboardLayerRefs,
      dismissCurrentOverlay,
      resetBansNavState,
      restoreLobbyShellForResultCtaReturn,
      unlockNotificationQueueAndFlush,
    ],
  );

  useLayoutEffect(() => {
    armBansNavFromResultCtaRef.current = armBansNavFromResultCta;
    completeBansCloseFromResultCtaRef.current =
      completeBansOverlayCloseFromResultCta;
    requestOpenBansFromResultCtaRef.current = requestOpenBansFromResultCta;
  }, [
    armBansNavFromResultCta,
    completeBansOverlayCloseFromResultCta,
    requestOpenBansFromResultCta,
  ]);

  useEffect(() => {
    openBansOverlayRequestRef.current = openBansOverlayRequest;
  }, [openBansOverlayRequest]);

  useEffect(() => {
    bansCtaQueueSuppressRef.current = bansCtaQueueSuppress;
  }, [bansCtaQueueSuppress]);

  useEffect(() => {
    bansReturnToLobbyLatchRef.current = bansReturnToLobbyLatch;
  }, [bansReturnToLobbyLatch]);

  const openNewBanWhoFlow = useCallback(() => {
    closeLobby();
    setNewBanWhoFlowRequest((n) => n + 1);
  }, [closeLobby]);

  useEffect(() => {
    if (!lobbyOpen || lobbyShownLoggedRef.current) return;
    if (!auth.user?.id || auth.loading) return;
    lobbyShownLoggedRef.current = true;
    console.log('[lobby-show]', { userId: auth.user.id });
  }, [lobbyOpen, auth.user?.id, auth.loading]);

  useEffect(() => {
    if (!lobbyOpen) return;
    if (incomingGateActive && incomingBan) {
      console.log('[lobby-gated-overlay]', {
        type: 'incoming',
        banId: incomingBan.id,
      });
    }
    if (checkGateActive && checkBan) {
      console.log('[lobby-gated-overlay]', {
        type: 'check',
        banId: checkBan.id,
      });
    }
    if (result) {
      console.log('[lobby-gated-overlay]', {
        type: 'result',
        banId: result.id,
      });
    }
  }, [
    lobbyOpen,
    incomingGateActive,
    checkGateActive,
    incomingBan,
    checkBan,
    result,
  ]);

  const scopedFriends = isAppReady
    ? banSentOpen && uiFreeze
      ? uiFreeze.friends
      : displayFriends
    : [];
  const scopedActiveBans = isAppReady
    ? banSentOpen && uiFreeze
      ? uiFreeze.activeBans
      : displayActiveBans
    : [];
  const scopedIncomingBan = useMemo(() => {
    const viewerId = auth.user?.id;
    if (!viewerId || auth.loading) return null;
    if (incomingBan) return incomingBan;
    const fastBanId =
      replyDeepLinkBanId ?? replyDeeplinkPendingBanIdRef.current;
    if (!fastBanId || !replyDeeplinkFastOpenedRef.current) return null;
    if (
      incomingConsumedAfterAnswerRef.current.has(fastBanId) ||
      dismissedIncomingRef.current.has(fastBanId)
    ) {
      return null;
    }
    const fromQueue =
      overlayQueue.find(
        (q) => q.kind === 'incoming' && q.ban.id === fastBanId,
      ) ??
      overlayQueueRef.current.find(
        (q) => q.kind === 'incoming' && q.ban.id === fastBanId,
      );
    if (fromQueue?.kind === 'incoming') return fromQueue.ban;
    if (incomingBanRef.current?.id === fastBanId) return incomingBanRef.current;
    return buildReplyDeeplinkShellBan(fastBanId, viewerId);
  }, [
    auth.user?.id,
    auth.loading,
    incomingBan,
    overlayQueue,
    replyDeepLinkBanId,
    replyDeeplinkFastShell,
    replyHandoffLock,
  ]);
  const scopedCheckBan = checkGateActive ? checkBan : null;

  const connectionUiState = useMemo(
    () =>
      resolveConnectionUiState({
        wsStatus,
        startupGraceActive,
        networkBootstrapCompleted,
        hasSuccessfulNetworkSync,
        wsHasConnectedOnce,
        navigatorOffline,
      }),
    [
      wsStatus,
      startupGraceActive,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      wsHasConnectedOnce,
      navigatorOffline,
    ],
  );

  useEffect(() => {
    if (!auth.user?.id) {
      logFriendsTiming('why-not-rendered', { reason: 'no-user-id' });
      return;
    }
    if (auth.loading) {
      logFriendsTiming('why-not-rendered', { reason: 'auth-loading' });
      return;
    }
    if (!auth.token) {
      logFriendsTiming('why-not-rendered', { reason: 'no-token' });
      return;
    }
    if (!isAppReady) {
      logFriendsTiming('why-not-rendered', { reason: 'not-app-ready' });
      return;
    }
    if (!friendsReady) {
      logFriendsTiming('why-not-rendered', { reason: 'friends-loading' });
      return;
    }
    if (scopedFriends.length === 0 && friends.length === 0) {
      logFriendsTiming('why-not-rendered', {
        reason: 'empty-list',
        fetchMayBeInFlight: true,
      });
    }
  }, [
    auth.user?.id,
    auth.loading,
    auth.token,
    isAppReady,
    friendsReady,
    sessionReady,
    incomingGateActive,
    scopedFriends.length,
    friends.length,
  ]);

  const pendingStartupInteractions = pendingStartupInteractionsCount > 0;

  const deepLinkSelectedBanId = useMemo(
    () =>
      replyDeepLinkBanId ??
      deepLinkReplyBan?.id ??
      deepLinkActiveBan?.id ??
      deepLinkRepeatBan?.id ??
      scopedCheckBan?.id ??
      scopedIncomingBan?.id ??
      result?.id ??
      null,
    [
      replyDeepLinkBanId,
      deepLinkReplyBan?.id,
      deepLinkActiveBan?.id,
      deepLinkRepeatBan?.id,
      scopedCheckBan?.id,
      scopedIncomingBan?.id,
      result?.id,
    ],
  );

  const effectiveIncomingBanId =
    deepLinkSelectedBanId ?? queueHeadBanId ?? replyDeepLinkBanId;

  const effectiveScopedIncomingBan = useMemo(() => {
    if (scopedIncomingBan) return scopedIncomingBan;
    if (!isReplyFastShellRequested && !isReplyFastPendingOpen) return null;
    const viewerId = auth.user?.id;
    if (!viewerId || auth.loading) return null;
    const banId =
      effectiveIncomingBanId ??
      replyDeepLinkBanId ??
      replyDeeplinkPendingBanIdRef.current;
    if (!banId) return null;
    if (
      incomingConsumedAfterAnswerRef.current.has(banId) ||
      dismissedIncomingRef.current.has(banId)
    ) {
      return null;
    }
    return buildReplyDeeplinkShellBan(banId, viewerId);
  }, [
    scopedIncomingBan,
    isReplyFastShellRequested,
    isReplyFastPendingOpen,
    effectiveIncomingBanId,
    replyDeepLinkBanId,
    auth.user?.id,
    auth.loading,
  ]);

  const replyIncomingCardMounted = useMemo(() => {
    const banId = replyDeepLinkBanId;
    if (!banId) return false;
    if (replyDeeplinkFastOpenedRef.current) {
      const { valid } = resolveReplyFastStillValid(banId);
      if (valid) return true;
    }
    const head = overlayQueue[0] ?? overlayQueueRef.current[0];
    const overlayKind =
      activeOverlayKind === 'incoming'
        ? 'incoming'
        : head?.kind === 'incoming'
          ? 'incoming'
          : activeOverlayKind;
    return (
      overlayKind === 'incoming' &&
      head?.kind === 'incoming' &&
      head.ban.id === banId
    );
  }, [
    replyDeepLinkBanId,
    overlayQueue,
    activeOverlayKind,
    resolveReplyFastStillValid,
  ]);

  useLayoutEffect(() => {
    const banId = replyDeepLinkBanId ?? replyDeeplinkPendingBanIdRef.current;
    if (!banId || !replyDeeplinkFastOpenedRef.current) return;
    if (!replyDeeplinkFastShell && !replyHandoffLock) return;

    const { valid, source } = resolveReplyFastStillValid(banId);
    if (valid) {
      console.log('[REPLY FAST STILL VALID]', { source, banId });
      markVisibleOverboardTrace('[REPLY FAST STILL VALID]', { source, banId });
      ensureReplyFastIncomingAtHead(banId);
      return;
    }

    const writtenAt = replyDeeplinkFastWrittenAtRef.current;
    const withinFastWindow =
      writtenAt != null &&
      replyDeeplinkFastWrittenBanIdRef.current === banId &&
      performance.now() - writtenAt < REPLY_DEEPLINK_FAST_TIMEOUT_MS;
    if (withinFastWindow) {
      console.log('[REPLY FAST ABORT SUPPRESSED]', {
        reason: 'within-fast-window',
        banId,
      });
      markVisibleOverboardTrace('[REPLY FAST ABORT SUPPRESSED]', {
        reason: 'within-fast-window',
        banId,
      });
      ensureReplyFastIncomingAtHead(banId);
    }
  }, [
    activeOverlayKind,
    ensureReplyFastIncomingAtHead,
    replyDeepLinkBanId,
    replyDeeplinkFastShell,
    replyHandoffLock,
    overlayQueue,
    resolveReplyFastStillValid,
  ]);

  const replyIncomingReady = useMemo(
    () =>
      replyIncomingCardMounted &&
      replyDeepLinkBanId != null &&
      deepLinkSelectedBanId === replyDeepLinkBanId,
    [replyIncomingCardMounted, replyDeepLinkBanId, deepLinkSelectedBanId],
  );

  const resultReplyUiShellActive = useMemo(
    () => resultReplyHandoffLock && !resultReplyWhatReady,
    [resultReplyHandoffLock, resultReplyWhatReady],
  );

  const replyUiShellActive = useMemo(
    () =>
      (replyComposeActive
        ? false
        : replyDeepLinkBanId != null &&
          replyHandoffLock &&
          !replyWhatReady &&
          (replyDeeplinkFastShell ||
            replyIncomingCardMounted ||
            shouldRenderIncomingOverlay)) ||
      resultReplyUiShellActive,
    [
      replyComposeActive,
      replyDeepLinkBanId,
      replyHandoffLock,
      replyWhatReady,
      replyDeeplinkFastShell,
      replyIncomingCardMounted,
      shouldRenderIncomingOverlay,
      resultReplyUiShellActive,
    ],
  );

  const replyUiShellDark = useMemo(
    () => replyUiShellActive && !replyIncomingReady,
    [replyUiShellActive, replyIncomingReady],
  );

  const activeBanUiShellActive = useMemo(
    () => activeBanDeepLinkBanId != null && !activeBanCardReady,
    [activeBanDeepLinkBanId, activeBanCardReady],
  );

  useEffect(() => {
    deepLinkBlockedRef.current =
      isNotificationQueueLocked() ||
      replyHandoffLock ||
      replyUiShellActive ||
      resultReplyUiShellActive ||
      activeBanUiShellActive ||
      deepLinkReplyBooting ||
      deepLinkReplyBan != null ||
      deepLinkActiveBan != null ||
      activeBanDeepLinkBanId != null;
    if (isNotificationQueueLocked()) {
      suppressQueuedOverlayDisplay();
    }
  }, [
    replyHandoffLock,
    replyUiShellActive,
    resultReplyUiShellActive,
    activeBanUiShellActive,
    deepLinkReplyBooting,
    deepLinkReplyBan,
    deepLinkActiveBan,
    activeBanDeepLinkBanId,
    suppressQueuedOverlayDisplay,
  ]);

  useEffect(() => {
    if (!auth.user?.id) return;
    if (
      deepLinkReplyBan ||
      deepLinkRepeatBan ||
      deepLinkActiveBan ||
      sendFlowOpen ||
      deepLinkReplyBooting ||
      replyDeeplinkFastShell ||
      replyHandoffLock ||
      replyUiShellActive ||
      resultReplyUiShellActive ||
      activeBanUiShellActive ||
      incomingGateActive ||
      checkGateActive ||
      result
    ) {
      return;
    }
    setLobbyOpen(true);
    lobbyShownLoggedRef.current = false;
  }, [
    auth.user?.id,
    deepLinkReplyBan,
    deepLinkRepeatBan,
    deepLinkActiveBan,
    sendFlowOpen,
    deepLinkReplyBooting,
    replyDeeplinkFastShell,
    replyHandoffLock,
    replyUiShellActive,
    resultReplyUiShellActive,
    activeBanUiShellActive,
    incomingGateActive,
    checkGateActive,
    result,
  ]);

  useEffect(() => {
    if (!deepLinkReplyBooting || !replyIncomingReady) return;
    setDeepLinkReplyBooting(false);
  }, [deepLinkReplyBooting, replyIncomingReady]);

  const incomingJsxRenderSource =
    isReplyFastShellRequested || isReplyFastPendingOpen
      ? 'reply-fast-shell-fallback'
      : shouldRenderIncomingOverlay
        ? 'normal'
        : null;

  const incomingJsxWillRender =
    effectiveShouldRenderIncoming &&
    !showDirectOverboardLayer &&
    effectiveIncomingOverlayDisplayKind === 'incoming' &&
    effectiveScopedIncomingBan != null;

  useLayoutEffect(() => {
    const jsxBranch = {
      activeOverlayKind: effectiveIncomingOverlayDisplayKind,
      selectedBanId: effectiveIncomingBanId,
      queueHeadKind,
      willRender: incomingJsxWillRender,
      source: incomingJsxRenderSource,
      hasIncomingBan: effectiveScopedIncomingBan != null,
      isReplyFastShellRequested,
      isReplyFastPendingOpen,
      showDirectOverboardLayer,
      notificationSessionActive,
    };
    console.log(
      `[INCOMING JSX BRANCH] activeOverlayKind=${effectiveIncomingOverlayDisplayKind ?? 'null'} selectedBanId=${effectiveIncomingBanId ?? 'null'} queueHeadKind=${queueHeadKind ?? 'null'} willRender=${incomingJsxWillRender} source=${incomingJsxRenderSource ?? 'null'}`,
      jsxBranch,
    );
    markVisibleOverboardTrace('[INCOMING JSX BRANCH]', jsxBranch);
    if (incomingJsxWillRender && effectiveScopedIncomingBan?.id) {
      console.log('[INCOMING JSX RENDER CARD]', {
        banId: effectiveScopedIncomingBan.id,
        source: incomingJsxRenderSource,
      });
      markVisibleOverboardTrace('[INCOMING JSX RENDER CARD]', {
        banId: effectiveScopedIncomingBan.id,
        source: incomingJsxRenderSource,
      });
      return;
    }
    const nullReason = !effectiveShouldRenderIncoming
      ? 'incoming-overlay-not-requested'
      : showDirectOverboardLayer
        ? 'direct-overboard-active'
        : effectiveIncomingOverlayDisplayKind !== 'incoming'
          ? 'display-kind-not-incoming'
          : !effectiveScopedIncomingBan
            ? 'no-incoming-ban'
            : 'unknown';
    console.log('[INCOMING JSX RETURN NULL]', { reason: nullReason, ...jsxBranch });
    markVisibleOverboardTrace('[INCOMING JSX RETURN NULL]', {
      reason: nullReason,
      ...jsxBranch,
    });
  }, [
    effectiveIncomingBanId,
    effectiveIncomingOverlayDisplayKind,
    effectiveScopedIncomingBan,
    effectiveShouldRenderIncoming,
    incomingJsxRenderSource,
    incomingJsxWillRender,
    isReplyFastPendingOpen,
    isReplyFastShellRequested,
    notificationSessionActive,
    queueHeadKind,
    shouldRenderIncomingOverlay,
    showDirectOverboardLayer,
  ]);

  const contextValue = useMemo(
    () => ({
      token: auth.token,
      user: auth.user,
      loading: auth.loading,
      authReady: auth.authReady,
      isAppReady,
      friendsReady,
      homeSnapshotReady,
      sessionReady,
      incomingGateActive,
      notificationSessionActive,
      activeOverlayKind: incomingOverlayDisplayKind,
      markOverlayUserAction,
      reportOverlayRendered,
      overlayHandoffDebug,
      error: auth.error,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
      incomingBan: effectiveScopedIncomingBan,
      setIncomingBan: setIncomingBanSafe,
      dismissIncoming,
      checkBan: scopedCheckBan,
      checkGateActive,
      setCheckBan: setCheckBanSafe,
      openDeepLinkCheck,
      deepLinkRepeatBan,
      openDeepLinkRepeat,
      clearDeepLinkRepeatBan,
      deepLinkReplyBan,
      openDeepLinkReply,
      clearDeepLinkReplyBan,
      deepLinkActiveBan,
      openDeepLinkActive,
      clearDeepLinkActiveBan,
      clearActiveBanDeepLinkShell,
      activeBanUiShellActive,
      activeBanDeepLinkBanId,
      notifyActiveBanCardVisible,
      overlayQueueLength: overlayQueue.length,
      deepLinkSelectedBanId,
      sendFlowOpen,
      openSendFlow,
      closeSendFlow,
      deepLinkReplyBooting,
      setDeepLinkReplyBooting,
      replyDeeplinkFastShell,
      abortReplyDeepLinkFast,
      replyUiShellActive,
      replyUiShellDark,
      replyDeepLinkBanId,
      replyHandoffLock,
      armReplyDeepLink,
      beginReplyHandoff,
      notifyReplyWhatVisible,
      releaseReplyHandoffLock,
      submitCheckAnswer,
      submitIncomingOverboard,
      openIncomingOverboardOptimistic,
      runIncomingOverboardApi,
      checkWaiting,
      setCheckWaiting,
      result,
      openBanResult,
      dismissBanResult,
      startReplyFromResult,
      navigateFromResult,
      resultReplyPending,
      resultReplyRequest,
      resultReplyHandoffLock,
      notifyResultReplyWhatVisible,
      popups,
      pushPopup,
      activeBans: scopedActiveBans,
      friends: scopedFriends,
      sendOpen,
      setSendOpen,
      sendReceiver,
      setSendReceiver,
      sendText,
      setSendText,
      sendDuration,
      setSendDuration,
      openSendTo,
      startIncomingReply,
      acknowledgeIncomingAndStartReply,
      acknowledgeIncomingSeen,
      incomingReplyBanId,
      replyToBanId,
      replyComposeActive,
      getPinnedReplyToBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      connectionUiState,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      eventLog,
      viralOnboarding,
      banSentOpen,
      setBanSentOpen,
      completeBanSendSuccess,
      scheduleDeferredSync,
      optimisticSendWait: optimisticForUi,
      applyOptimisticSend,
      confirmOptimisticSend,
      rollbackOptimisticSend,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
      inlineBanError,
      setInlineBanError,
      banInputShake,
      triggerBanInputShake,
      lobbyOpen,
      closeLobby,
      openLobby,
      clearReplyDeepLinkState,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      openBansOverlayRequest,
      closeBansOverlayRequest,
      resultCtaBansOverlayOpen,
      clearResultCtaBansOverlayOpen,
      bansCtaQueueSuppress,
      clearBansCtaQueueSuppress,
      bansNavState,
      armBansNavFromResultCta,
      resetBansNavState,
      bansReturnToLobbyLatch,
      setBansReturnToLobbyLatch,
      completeBansOverlayCloseFromResultCta,
      pendingStartupInteractions,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
      armActiveBanDeepLinkEarly,
      unlockNotificationQueueAndFlush,
    }),
    [
      auth.token,
      auth.user,
      auth.loading,
      auth.authReady,
      isAppReady,
      friendsReady,
      homeSnapshotReady,
      sessionReady,
      incomingGateActive,
      notificationSessionActive,
      incomingOverlayDisplayKind,
      markOverlayUserAction,
      reportOverlayRendered,
      overlayHandoffDebug,
      auth.error,
      auth.refreshUser,
      auth.onboard,
      scopedIncomingBan,
      effectiveScopedIncomingBan,
      setIncomingBanSafe,
      dismissIncoming,
      scopedCheckBan,
      checkGateActive,
      setCheckBanSafe,
      openDeepLinkCheck,
      deepLinkRepeatBan,
      openDeepLinkRepeat,
      clearDeepLinkRepeatBan,
      deepLinkReplyBan,
      openDeepLinkReply,
      clearDeepLinkReplyBan,
      deepLinkActiveBan,
      openDeepLinkActive,
      clearDeepLinkActiveBan,
      clearActiveBanDeepLinkShell,
      overlayQueue.length,
      deepLinkSelectedBanId,
      sendFlowOpen,
      openSendFlow,
      closeSendFlow,
      deepLinkReplyBooting,
      setDeepLinkReplyBooting,
      replyDeeplinkFastShell,
      abortReplyDeepLinkFast,
      replyUiShellActive,
      replyUiShellDark,
      replyDeepLinkBanId,
      replyHandoffLock,
      armReplyDeepLink,
      beginReplyHandoff,
      notifyReplyWhatVisible,
      releaseReplyHandoffLock,
      submitCheckAnswer,
      submitIncomingOverboard,
      openIncomingOverboardOptimistic,
      runIncomingOverboardApi,
      checkWaiting,
      setCheckWaiting,
      result,
      openBanResult,
      dismissBanResult,
      startReplyFromResult,
      navigateFromResult,
      resultReplyPending,
      resultReplyRequest,
      resultReplyHandoffLock,
      notifyResultReplyWhatVisible,
      popups,
      pushPopup,
      scopedActiveBans,
      scopedFriends,
      sendOpen,
      sendReceiver,
      sendText,
      sendDuration,
      openSendTo,
      startIncomingReply,
      acknowledgeIncomingAndStartReply,
      acknowledgeIncomingSeen,
      incomingReplyBanId,
      replyToBanId,
      replyComposeActive,
      getPinnedReplyToBanId,
      clearIncomingReply,
      applySession,
      reloadPending,
      reloadFriends,
      wsStatus,
      connectionUiState,
      networkBootstrapCompleted,
      hasSuccessfulNetworkSync,
      eventLog,
      viralOnboarding,
      banSentOpen,
      uiFreeze,
      optimisticForUi,
      scheduleDeferredSync,
      setBanSentOpen,
      completeBanSendSuccess,
      applyOptimisticSend,
      confirmOptimisticSend,
      rollbackOptimisticSend,
      clearCheckOverlay,
      showFirstBanOnboarding,
      completeFirstBan,
      inlineBanError,
      banInputShake,
      triggerBanInputShake,
      lobbyOpen,
      closeLobby,
      openLobby,
      clearReplyDeepLinkState,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      openBansOverlayRequest,
      closeBansOverlayRequest,
      resultCtaBansOverlayOpen,
      clearResultCtaBansOverlayOpen,
      bansCtaQueueSuppress,
      clearBansCtaQueueSuppress,
      bansNavState,
      armBansNavFromResultCta,
      resetBansNavState,
      bansReturnToLobbyLatch,
      setBansReturnToLobbyLatch,
      completeBansOverlayCloseFromResultCta,
      pendingStartupInteractions,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
      armActiveBanDeepLinkEarly,
      unlockNotificationQueueAndFlush,
      replyDeeplinkFastShell,
      abortReplyDeepLinkFast,
      replyUiShellActive,
      replyUiShellDark,
      replyDeepLinkBanId,
      replyHandoffLock,
      armReplyDeepLink,
      beginReplyHandoff,
      notifyReplyWhatVisible,
      releaseReplyHandoffLock,
      activeBanUiShellActive,
      activeBanDeepLinkBanId,
      notifyActiveBanCardVisible,
      clearActiveBanDeepLinkShell,
      openBansOverlayRequest,
      closeBansOverlayRequest,
      bansCtaQueueSuppress,
      clearBansCtaQueueSuppress,
      bansNavState,
      armBansNavFromResultCta,
      resetBansNavState,
      bansReturnToLobbyLatch,
      setBansReturnToLobbyLatch,
      completeBansOverlayCloseFromResultCta,
      resultCtaBansOverlayOpen,
      clearResultCtaBansOverlayOpen,
    ],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <ShellErrorBoundary name="app">
        {children}
        {!showDirectOverboardLayer ? (
          <GlobalOverlayHost
            active={notificationSessionActive || incomingJsxWillRender}
            queueSessionActive={
              notificationSessionActive || incomingJsxWillRender
            }
            activeOverlayKind={effectiveIncomingOverlayDisplayKind}
            activeIncomingBanId={
              effectiveIncomingOverlayDisplayKind === 'incoming'
                ? (effectiveScopedIncomingBan?.id ?? null)
                : null
            }
          >
            <NotificationQueueShell
              kind={effectiveIncomingOverlayDisplayKind}
              sessionActive={
                notificationSessionActive || incomingJsxWillRender
              }
              contentKey={
                overlayQueue[0]
                  ? overlayQueueKey(overlayQueue[0])
                  : effectiveScopedIncomingBan?.id
                    ? `incoming:${effectiveScopedIncomingBan.id}`
                    : null
              }
            >
              {effectiveIncomingOverlayDisplayKind === 'incoming' &&
              effectiveScopedIncomingBan ? (
                <ChallengeErrorBoundary
                  name="incoming"
                  onRecover={() => dismissIncoming()}
                >
                  <IncomingBanOverlay contentOnly />
                </ChallengeErrorBoundary>
              ) : null}
              {effectiveIncomingOverlayDisplayKind === 'check' ? (
                <ChallengeErrorBoundary
                  name="check"
                  onRecover={() => clearCheckOverlay()}
                >
                  <CheckOverlay contentOnly />
                </ChallengeErrorBoundary>
              ) : null}
              {effectiveIncomingOverlayDisplayKind === 'result' && displayResult ? (
                <ChallengeErrorBoundary
                  name="result"
                  onRecover={() => dismissBanResult()}
                >
                  <ResultOverlay
                    result={displayResult}
                    onClose={dismissBanResult}
                    contentOnly
                  />
                </ChallengeErrorBoundary>
              ) : null}
            </NotificationQueueShell>
          </GlobalOverlayHost>
        ) : null}
        {(() => {
          const directJsxFields = {
            active: directResultOverlayActive,
            hasResult: result != null,
            resultBanId: result?.id ?? null,
            refActive: directResultOverlayRef.current,
            willRender: showDirectOverboardLayer,
            outcome: result?.outcome ?? null,
            showable: displayResult != null,
            contentOnly: false,
            embedded: true,
          };
          if (!showDirectOverboardLayer) {
            markVisibleOverboardTrace('DIRECT OVERBOARD JSX BRANCH', {
              branch: 'providers-return-null-not-active',
              ...directJsxFields,
            });
            return null;
          }
          if (!displayResult) {
            markVisibleOverboardTrace('DIRECT OVERBOARD JSX BRANCH', {
              branch: 'providers-return-null-no-result',
              ...directJsxFields,
            });
            return null;
          }
          markVisibleOverboardTrace('DIRECT OVERBOARD JSX BRANCH', {
            branch: 'providers-render-direct-layer',
            ...directJsxFields,
            resultBanId: displayResult.id,
            outcome: displayResult.outcome,
          });
          markVisibleOverboardTrace('ABOUT TO RENDER RESULT OVERLAY', {
            ...directJsxFields,
            resultBanId: displayResult.id,
            outcome: displayResult.outcome,
            embedded: true,
            directPaint: true,
            contentOnly: false,
          });
          return (
            <ChallengeErrorBoundary
              name="direct-overboard-result"
              onRecover={() => {
                if (
                  bansCtaQueueSuppressRef.current ||
                  resultCtaBansOverlayOpenRef.current ||
                  bansNavStateRef.current.origin === 'result-cta'
                ) {
                  markVisibleOverboardTrace(
                    'RESULT OVERLAY CLEANUP SKIPPED',
                    { reason: 'result-cta-bans-open', effect: 'error-boundary-recover' },
                  );
                  return;
                }
                dismissBanResult();
              }}
            >
              <DirectOverboardResultLayer
                result={displayResult}
                onClose={dismissBanResult}
              />
            </ChallengeErrorBoundary>
          );
        })()}
        {!displayResult ? (
          <ShellErrorBoundary name="energy" fallback={null}>
            <EnergyPopupStack popups={popups} />
          </ShellErrorBoundary>
        ) : null}
      </ShellErrorBoundary>
    </AppContext.Provider>
  );
}
