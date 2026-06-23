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
  getResultCardHeadline,
  isDirectOverboardOpenable,
  isValidBanResultPayload,
  parseStartParam,
  buildStartParam,
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
import { RouteOverlayBootPriorityMarker } from './RouteOverlayBootPriorityMarker';
import { DirectOverboardResultLayer } from './DirectOverboardResultLayer';
import {
  overlayDelayCause,
  overlayDelayMs,
  overlayTs,
} from '@/lib/overlay-timing';
import {
  enqueueWithActiveLock,
  buildCheckPriorityQueue,
  buildResultPriorityQueue,
  getActiveOverlayKey,
  hasCheckInQueue,
  hasStaleCheckOverlayForBan,
  overlayBanId,
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
  isDeepLinkRouteBootPending,
  logOpenActiveBanCard,
  releaseDeepLinkRouteBoot,
  resolveActiveDeepLinkRouteBoot,
  resolvePendingDeepLinkRoute,
  dismissActiveBanDeepLinkRoute,
} from '@/lib/deep-link-route-boot';
import { shouldBootYieldToRouteOverlay } from '@/lib/lobby-boot-route-priority';
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
  normalizeBanResult,
  normalizeId,
  normalizeQueuedOverlay,
} from '@/lib/normalize-json';
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
  mergeStartupPendingChain,
} from '@/lib/overlay-arbiter';
import {
  logQueueApiFetchResult,
  logQueueApiFetchStart,
  maybeLogQueueApiEmptyButDirectBanExists,
  noteKnownDirectBanId,
  readKnownDirectBanId,
} from '@/lib/queue-api-fetch-debug';
import {
  buildMergeSkippedFlags,
  logIncomingPendingAllMergeSkipped,
  logLobbyBansPendingFetchMissing,
  logPendingStartupToOverlayMergeDecision,
  logQueueApiResultApplyDecision,
} from '@/lib/queue-api-result-apply-debug';
import { fetchPendingChainPrefetch } from '@/lib/pending-chain-prefetch';
import {
  logChainDrainContinue,
  logChainDrainUserAnswerAllowed,
  logChainEmptyFallbackLobby,
  logCheckAnswerFinalResultEnqueued,
  logCheckAnswerFinalResultFetchOk,
  logCheckAnswerFinalResultFetchStart,
  logCheckAnswerFinalResultFound,
  logCheckAnswerFinalResultMissing,
  logCheckAnswerFinalResultShow,
  logCheckAnswerResultSkippedBug,
  logCheckAnswerSubmitOk,
  logCheckDismissBootReleased,
  logCheckDismissCurrentConsumed,
  logCheckDismissEmptyOpenLobby,
  logCheckDismissRemainingQueue,
  logCheckDismissShowNext,
  logCheckAnswerEmptyRemainingDeferred,
  logCheckAnswerWaitingResultHold,
  logCheckAnswerWaitingResultReleased,
  logCheckAnswerWaitingHoldReleased,
  logCheckAnswerAdvanceTrace,
  logCheckCardHoldLifecycleTrace,
  logCheckDismissStart,
  logCheckDismissStuckOnBootBug,
  logLobbyOpenAfterCheckEmpty,
  logCheckAnswerContinueOutcome,
  logCheckAnswerKeepTransition,
  logCheckAnswerRetryContinue,
  logCheckAnswerRetryExhaustedOpenLobby,
  logCheckAnswerTransitionReleased,
  logCheckAnswerWaitingForNext,
  logCheckTransitionPlaceholderDecision,
  logCheckTransitionPlaceholderShown,
  logChainPlaceholderStuckTrace,
  logChainFinalizeDiag,
  logChainAdvanceWaitingClearedRejectedOnly,
  logEmptyOverlayShellDiag,
  logResultDisplayReadyCheck,
  logResultShellSuppressedNotReady,
  logFinalStatusHoldDecision,
  logResultStalePruneDecision,
  logResultDismissRequiredCheck,
  logResultShellWithoutPayload,
  logResultShellKindBlockedUntilChild,
  logResultShellWaitingChildBlocked,
  logResultShellReleasedWithChild,
  logCheckContinueBlocked,
  logCheckContinueCall,
  logCheckContinueDecision,
  logCheckNextEmpty,
  logCheckNextSelected,
  logCheckQueueAfterRemove,
  logCheckQueueBeforeRemove,
  logOverlayHostVisibilityDecision,
  logOverlayActiveCleared,
  logOverlayMarkDismissing,
} from '@/lib/check-chain-drain-debug';
import {
  getResultDisplayReadySnapshot,
  hasVisibleResultOverlayContent,
  isAtomicOverboardShellReady,
  resolveResultOverlayViewerId,
  isFinalCheckStatusOutcome,
  isResultDisplayReady,
} from '@/lib/result-display-ready';
import {
  buildResultShellHeldCardGuardContextFromHeld,
  isHeldOrMountedIncomingOrCheckActive,
  shouldBlockResultShellOverHeldIncomingOrCheck,
} from '@/lib/result-shell-held-card-guard';
import {
  logCheckCardMountedBug,
  logCheckPrimeSkipStaleBecauseResultExists,
  logResultCardMounted,
  logResultPollDropStaleCheck,
  logResultPollHit,
  logResultPollItemBuilt,
  logResultPollPrioritySet,
  logResultPollShowResultCard,
} from '@/lib/result-poll-priority-debug';
import {
  logCheckDeeplinkSkipNoUiChange,
  logLobbyChromeHiddenBug,
  logResultPollDoesNotHideLobby,
} from '@/lib/lobby-chrome-debug';
import {
  isLobbyIndicatorPrefetchSource,
  isLobbyIndicatorPrimeOnlySource,
  logLobbyIndicatorDelayBug,
  logLobbyIndicatorOpenedCardBug,
  logLobbyIndicatorOpenedEmptyHostBug,
  logLobbyIndicatorPrefetchNoOverlay,
  logLobbyIndicatorPrimeOnly,
  logLobbyIndicatorPrimeReady,
  logLobbyIndicatorPrimeStart,
  logResultPollOpenedEmptyHostBug,
} from '@/lib/lobby-bans-indicator-debug';
import {
  logIncomingOverboardAtomicResult,
  logResultCardClearedBug,
  logResultCardPreserveDomOk,
  logResultCardRemountBug,
  logResultCardStableHold,
} from '@/lib/incoming-overboard-atomic-debug';
import {
  logActiveUserCardHoldState,
  logChainAdvanceBlockedActiveUserCardDetail,
  logOverboardActionResult,
  logOverboardActionStart,
  logOverboardPathPick,
  logQueueItemBuiltAfterOverboard,
  logResultCardRenderDecision,
  logResultDisplaySourcePick,
  logResultOverlayJsxDecision,
} from '@/lib/overboard-action-queue-debug';
import {
  logResultAutoClearDecision,
  logResultClearCallsite,
  logResultHeldStillPresentAfterClear,
  logResultStaleGuardBlocked,
  logResultStaleGuardBypassedFreshCheckAnswer,
  logFreshResultOverlayStackTrace,
} from '@/lib/result-clear-debug';
import {
  logResultGoToBansClearActiveHold,
  logResultGoToBansClick,
  logResultGoToBansEmptyScreenBug,
  logResultGoToBansOpenBansSection,
  logResultGoToBansRemainingQueue,
  logResultGoToBansShowNext,
} from '@/lib/result-go-to-bans-debug';
import {
  isSuccessExitDrainSource,
  logLobbyCtaHiddenBug,
  logResultCardAutoClearedBug,
  logResultNextPayloadMissingBug,
  logResultNextPayloadReady,
  logSuccessDrainResultCardMounted,
  logSuccessDrainResultLostBug,
} from '@/lib/result-next-chain-debug';
import {
  beginPostSuccessHandoff,
  abortPostSuccessHandoffForReplyCompose,
  armPostSuccessHandoffEarly,
  completePostSuccessHandoffEmptyOpenLobby,
  completePostSuccessHandoffOnCardMounted,
  finalizePostSuccessHandoffEmptyNoRetry,
  getPostSuccessHandoffSelectedNext,
  getPostSuccessHandoffTraceId,
  isPostSuccessHandoffInProgress,
  isSuccessExitChainFullyEmpty,
  logPostSuccessHandoffLostBug,
  setPostSuccessHandoffSelectedNext,
  shouldBlockLobbyOpenForPostSuccessHandoff,
  shouldBlockPostSuccessEmptyRetry,
  shouldBlockPostSuccessPrefetchAfterEmpty,
} from '@/lib/post-success-handoff-debug';
import {
  buildPostSuccessQueueSnapshotBase,
  logLobbyBansQueueStartSnapshot,
  logPostSuccessEmptyQueueButUserHasBansIndicator,
  logPostSuccessQueueSnapshotBeforeRelease as emitPostSuccessQueueSnapshotBeforeRelease,
  logPostSuccessReleaseStartupResult as emitPostSuccessReleaseStartupResult,
  noteLastBansIndicatorReason,
  noteNotificationEnqueueSource,
  readLastBansIndicatorReason,
  readLastNotificationSources,
  type PostSuccessQueueSnapshotFields,
} from '@/lib/post-success-queue-snapshot-debug';
import {
  buildBanViewerRoleFlags,
  logDeeplinkBanSourceSnapshot,
  logLobbyBansDrainEntered,
  logLobbyBansDrainNotEntered,
  logQueueSourceComparisonSnapshot,
} from '@/lib/queue-source-comparison-debug';
import {
  clearLobbyNotificationAttentionHint,
  persistLobbyNotificationAttentionHint,
  readLobbyNotificationAttentionHint,
} from '@/lib/lobby-notification-attention-hint';
import {
  logLobbyBansCtaClick,
  logLobbyBansCtaDrainBug,
  logLobbyBansCtaEmptyOpenSection,
  logLobbyBansCtaHasNotifications,
  logLobbyBansCtaPendingLostBug,
  logLobbyBansCtaPendingMerged,
  logLobbyBansCtaPendingSnapshot,
  logLobbyBansCtaShowNext,
  logLobbyBansCtaStartDrain,
  type LobbyBansNotificationDrainOutcome,
} from '@/lib/lobby-bans-cta-debug';
import {
  logCheckCardMounted,
  logCheckCardOverlaySet,
  logCheckCardSelected,
  logCheckCardTopLayerOk,
  logCheckDeeplinkAuthReadyResume,
  logCheckDeeplinkAuthWait,
  logCheckDeeplinkFallbackLobby,
  logCheckDeeplinkFetchError,
  logCheckDeeplinkFetchOk,
  logCheckDeeplinkFetchStart,
  logCheckDeeplinkLobbySuppressed,
  logCheckDeeplinkPayloadParsed,
  logCheckDeeplinkResumeSkip,
  logCheckDeeplinkStart,
  logCheckFullLobbyFlashBug,
  logCheckStartupBlockers,
  logCheckStartupBlockersClear,
  type CheckStartupBlockersSnapshot,
} from '@/lib/check-deeplink-startup-debug';
import {
  isCheckDeepLinkStartParamPending,
  readCheckDeepLinkBanIdFromStartParam,
} from '@/lib/check-deeplink-startup';
import {
  logReplyCardMounted,
  logReplyCardOverlaySet,
  logReplyCardSelected,
  logReplyCardTopLayerOk,
  logReplyDeeplinkStart,
  logReplyStartupBlockers,
  logStartupBlockersClear,
  type ReplyStartupBlockersSnapshot,
} from '@/lib/reply-deeplink-startup-debug';
import { setOverlayInputLockAfterAction, clearOverlayInputLock } from '@/lib/overlay-input-guard';
import {
  allowDeeplinkExplicitNotificationDrain,
  completeDeeplinkSingleCardMode,
  enableDeeplinkSingleCardMode,
  getDeeplinkSingleCardMode,
  isDeeplinkSingleCardCompleting,
  isDeeplinkSingleCardModeActive,
  isExplicitNotificationDrainSource,
  logDeeplinkAutoDrainBlocked,
  logDeeplinkReturnLobby,
  logDeeplinkSingleCardChainBlocked,
  logSyncDisplayBlockedSingleCard,
  shouldBlockDeeplinkAutoDrain,
  shouldBlockNonExplicitNotificationDrain,
  shouldBlockSingleCardChainContinuation,
} from '@/lib/deeplink-single-card-mode';
import {
  logLobbyIndicatorOnlyNoCard,
  logNonExplicitDrainBlocked,
  logStartupAutoShowCardBug,
  logSyncDisplayBlockedStartupHold,
  shouldBlockLobbyOpenForQueuedNotifications,
} from '@/lib/notification-chain-explicit-drain';
import {
  isInteractiveOverboardResultContext,
  isPassiveResultOpenSource,
  logPassiveResultLookaheadBlocked,
  logPassiveResultOverlayBlocked,
  shouldBlockPassiveResultLookaheadDisplay,
  shouldBlockPassiveResultOverlayOpen,
  shouldBlockPassiveResultShellDisplay,
} from '@/lib/result-overlay-explicit-open';
import {
  getMountedBlockingUserOverlay,
  heldUserCardBanId,
  isBlockingUserOverlayKind,
  logActiveUserCardBlockedNextButKeptCurrent,
  logActiveUserCardHold,
  logActiveUserCardLostBug,
  logActiveUserCardPreserveCurrent,
  logActiveUserCardPreventLobbyFallback,
  logActiveUserCardPreventOverlayClear,
  logChainAdvanceBlockedActiveUserCard,
  logChainLookaheadOnlyActiveUserCard,
  logIncomingReplacedBug,
  logTransitionDelaySkippedActiveUserCard,
  overlayItemBanId,
  shouldBlockChainAdvanceOverActiveUserCard,
  shouldBlockOverlayClearWhileUserCardHeld,
  type BlockingUserOverlayKind,
  type HeldUserCardOverlay,
} from '@/lib/overlay-user-card-guard';
import {
  logConfirmBlockedByActiveUserCardBug,
  logConfirmEnterNotificationGuardClear,
  logIncomingReplyActionStart,
  logIncomingReplyClearActiveHold,
  logIncomingReplyFlowStart,
  logIncomingReplyOverlayClosed,
  logIncomingReplyCleanupSnapshot,
} from '@/lib/incoming-reply-compose-debug';
import {
  readOverlayInputLockFields,
  type ConfirmHoldDebugSnapshot,
  type ConfirmOrbQueueDebugSnapshot,
  logLobbyIndicatorDuringConfirm,
  logNotificationDisplayBlockedDuringCompose,
  logStaleComposeClearedBeforeBansNav,
} from '@/lib/confirm-hold-render-debug';
import {
  logResultPollBlockerCheck,
  logResultPollComposeDiagnostics,
  logConfirmOrbAfterResultPoll,
  logResultPollSkippedDuringCompose,
  shouldSkipResultPollDuringActiveCompose,
} from '@/lib/result-poll-compose-debug';
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
  registerDebug98LatchSnapshot,
} from '@/lib/debug98log';
import { logOverlayTransition } from '@/lib/overlay-transition-debug';
import {
  isSuccessExitInstrumentationActive,
  canDrainNotificationAfterSuccess,
  getSendSuccessCardSessionId,
  logFirstNotificationMounted,
  logFirstNotificationSelected,
  logSuccessCardMountedDebug,
  logSuccessDrainOnlyAfterExit,
  logSuccessExitDrainResult,
  logSuccessExitDrainStart,
  logSuccessExitLobbyOpenAttempt,
  logSuccessExitRetryBlockedBeforeCard,
  logSuccessExitEmptyQueueClearOverlay,
  logSuccessExitTimerCardTopOk,
  logEmptyBackdropBug,
  registerSuccessExitDebugSnapshot,
  shouldSuppressLobbyOpenDuringSuccessExit,
} from '@/lib/success-exit-first-notification-debug';
import {
  logChainEmptyFinalizeCheck,
  logEmptyOverlayHostBlockedState,
} from '@/lib/lobby-cta-render-debug';
import {
  traceSuccessCardUnmounted,
  traceSuccessHide,
  traceSuccessStateReset,
} from '@/lib/success-card-trace';
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
  clearDismissedResultLocally,
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
  isIncomingCardDisplayReady,
  isReplyDeeplinkShellBan,
  isReplyIncomingDisplayBan,
  getIncomingCardNotReadyReason,
  hasIncomingSenderIdentity,
  logIncomingCardDisplayState,
  pickIncomingCardDisplayBan,
  pickRicherIncomingBan,
} from '@/lib/reply-deeplink-fast';
import {
  REPLY_DEEPLINK_TOAST_OVERBOARD,
  REPLY_DEEPLINK_TOAST_SENT,
  getReplyDeeplinkActionResult,
  markReplyDeeplinkOverboard,
  markReplyDeeplinkSent,
} from '@/lib/reply-deeplink-action-result';
import {
  prepareReplyDeeplinkReopen,
  resolveReplyDeeplinkEntry,
} from '@/lib/reply-deeplink-guard';
import {
  buildActiveParentBanForSuccess,
  hasActiveParentTimerFields,
} from '@/lib/reply-parent-active-ban';
import { updateIncomingDirectDebug } from '@/lib/incoming-direct-debug';
import {
  logEmptyIncomingShellBug,
  logIncomingCardRenderBlockedBug,
  logIncomingNextHydrateOk,
  logIncomingNextHydrateStart,
  logIncomingNextPayloadMissingBug,
  logIncomingNextPayloadReady,
} from '@/lib/incoming-next-hydrate-debug';
import {
  logIncomingCardMounted,
  logIncomingOverlayJsxReturn,
  logIncomingOverlayReturnNull,
  logIncomingOverlayStateSet,
  logIncomingOverlayBlocked,
  logIncomingReadyButBanLostBug,
  logIncomingReadyButStableBanLostBug,
  logIncomingStableBanClearBlocked,
  logIncomingStableBanCleared,
  logIncomingStableBanSet,
  logIncomingStableBanUsed,
  peekLastIncomingPayloadReadyBanId,
} from '@/lib/incoming-overlay-mount-debug';
import {
  logChainContinueBlockedNonExplicitStartup,
  logChainContinueCollected,
  logChainContinueEmptyOpenLobby,
  logChainContinueLostPendingBug,
  logChainContinueShowNext,
  logChainContinueStart,
  logLobbyOpenBlockedChainNotEmpty,
} from '@/lib/notification-chain-continue-debug';
import { verifyIncomingChallenge } from '@/lib/deliver-challenge';
import {
  getLastKnownLobbyRingPercent,
  isLobbyBootIntroPrimed,
  markLobbyBootIntroPrimed,
  subscribeLobbyBootIntroSession,
} from '@/lib/lobby-boot-intro-session';
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
  /** True only when a notification card is actually mounted on screen. */
  notificationOverlayMounted: boolean;
  /** Lobby “твои запреты” attention dot — pending startup + queued overlays. */
  lobbyBansNeedAttention: boolean;
  /** True while swapping queued notification cards — blocks lobby flash between overlays. */
  notificationChainTransitioning: boolean;
  setNotificationChainTransitioning: (active: boolean) => void;
  /** Clears stale notification overlay/session when queue is empty after success exit. */
  clearNotificationOverlayForEmptyQueueAfterSuccessExit: (source: string) => boolean;
  /** True only when a notification modal is actually rendered (blocks lobby pointer). */
  notificationOverlayVisible: boolean;
  activeOverlayKind: 'incoming' | 'check' | 'result' | null;
  markOverlayUserAction: (kind: string, banId?: string) => void;
  logCardCloseClick: (opts: {
    kind: 'incoming' | 'check' | 'result';
    banId: string | null;
    source: string;
  }) => void;
  reportOverlayRendered: (kind: string, banId: string, buttonsReady?: boolean) => void;
  /** Dev-only: last overlay handoff timing from reportOverlayRendered. */
  overlayHandoffDebug: { delayMs: number; cause: string } | null;
  error: string | null;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
  incomingBan: BanInteraction | null;
  /** Incoming card with all display fields — null until fully ready (no shell). */
  incomingCardDisplayBan: BanInteraction | null;
  /** Stable incoming ban pinned at payload-ready until user action. */
  activeIncomingOverlayBan: BanInteraction | null;
  incomingCardFullyReady: boolean;
  /** Route card/overlay ready — boot stays as background under it (not a gate). */
  routeOverlayAboveBoot: boolean;
  checkDeepLinkBanId: string | null;
  checkOverlayMounted: boolean;
  checkDeeplinkDirectPending: boolean;
  setIncomingBan: (b: BanInteraction | null) => void;
  dismissIncoming: (banId?: string) => void;
  /** Close incoming card without server ack — pending deeplink can reopen. */
  dismissIncomingSoft: (banId: string) => void;
  acknowledgeIncomingAndStartReply: (ban: BanInteraction) => void;
  acknowledgeIncomingSeen: (banId: string) => Promise<void>;
  checkBan: BanInteraction | null;
  checkGateActive: boolean;
  setCheckBan: (b: BanInteraction | null) => void;
  /** Telegram check deep link — opens check overlay immediately (not lobby). */
  openDeepLinkCheck: (b: BanInteraction) => void;
  /** Telegram repeat-ban deep link — opens confirm for the same challenge. */
  deepLinkRepeatBan: BanInteraction | null;
  deepLinkRepeatGoToConfirm: boolean;
  openDeepLinkRepeat: (
    b: BanInteraction,
    options?: { goToConfirm?: boolean },
  ) => void;
  clearDeepLinkRepeatBan: () => void;
  /** Viral invite — opens What with inviter pre-selected. */
  deepLinkInviteToBanInviter: UserPublic | null;
  openDeepLinkInviteToBan: (inviter: UserPublic) => void;
  clearDeepLinkInviteToBan: () => void;
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
  /** Instant-ban compose phase — synced from InstantBanFlow for overlay guards. */
  sendComposePhase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
  /** Synchronous compose-flow latch (WHAT/CONFIRM) — must not depend on sendFlowOpen. */
  setComposeFlowState: (opts: {
    phase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
    source: string;
  }) => void;
  isWhatOrConfirmActive: () => boolean;
  isSendComposeActive: () => boolean;
  /** Reset InstantBanFlow send UI when leaving overlay for bans/queue navigation. */
  registerResetSendUiForBansNavigation: (fn: (() => void) | null) => void;
  /** Clear stale WHO/WHAT/CONFIRM/reply state before «К запретам» / chain continue. */
  clearStaleComposeStateBeforeBansNavigation: (source: string) => void;
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
  /** Block janitor / ResultOverlay auto-dismiss for atomic overboard result. */
  blockAutoDismissAtomicOverboardResult: (
    resultId: string | null | undefined,
    source: string,
  ) => boolean;
  /** Block auto-dismiss for terminal final status (split/both_yes/both_no) until user action. */
  blockAutoDismissTerminalFinalStatus: (
    resultId: string | null | undefined,
    source: string,
  ) => boolean;
  /** Queue notification shell: allow atomic overboard result-card render. */
  isQueueAtomicOverboardResultShowable: (
    resultId: string | null | undefined,
  ) => boolean;
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
  /** Run deferred reloadPending/friends refresh immediately (e.g. after success exit). */
  flushDeferredSync: () => Promise<void>;
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
  lobbyDeeplinkToast: string | null;
  /** Full reset of reply deep-link latch (ban id, handoff, incoming reply). */
  clearReplyDeepLinkState: () => void;
  /** Opens InstantBan Who screen for a new ban (increments on each request). */
  newBanWhoFlowRequest: number;
  openNewBanWhoFlow: () => void;
  /** Opens BansOverlay from result card «К запретам» (increments on each request). */
  openBansOverlayRequest: number;
  /** Preferred tab for BansOverlay opened from result CTA. */
  openBansOverlayTabRequest: 'yours' | 'toYou' | 'history' | 'archive' | null;
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
  setBansReturnToLobbyLatch: (
    active: boolean,
    debug?: { source: string; banId?: string | null },
  ) => void;
  /** Closes result-cta bans session: open lobby before queue/result reset. */
  completeBansOverlayCloseFromResultCta: (source?: string) => boolean;
  /** Accumulated pre-open interactions waiting for ritual release. */
  pendingStartupInteractions: boolean;
  /** True while overlay queue or startup hold still has pending notifications. */
  hasPendingNotificationChain: () => boolean;
  /** Arm post-success handoff before lobby fallback when queue/pending exist. */
  armPostSuccessHandoffEarlyIfPending: (source?: string) => boolean;
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
  /** Lobby «Твои запреты»: drain notification queue or open empty section. */
  startLobbyBansNotificationDrain: () => Promise<LobbyBansNotificationDrainOutcome>;
  /** After send-success exit: drain one pending notification over lobby. */
  drainNextNotificationAfterSuccess: (
    successBanId?: string | null,
  ) => Promise<boolean>;
  /** Reply deeplink: resolve accepted parent active ban synchronously after success. */
  resolveReplyParentActiveBanImmediate: () => BanInteraction | null;
  /** Reply deeplink: await in-flight accept then short fallback fetch if ref still empty. */
  ensureReplyParentActiveBanForSuccess: () => Promise<BanInteraction | null>;
  /** Reply deeplink: refresh parent active ban in background (non-blocking). */
  refreshReplyParentActiveBanInBackground: (parentBanId: string) => void;
  hasReplyParentActivePriorityPending: () => boolean;
  getReplyParentActiveBanId: () => string | null;
  fetchReplyParentActiveBanFallback: (
    parentBanId: string,
  ) => Promise<BanInteraction | null>;
  markReplyParentActivePriorityShown: (parentBanId: string) => void;
  isReplyParentActivePriorityActive: () => boolean;
  releaseNotificationQueueAfterReplyParentActive: () => void;
  /** Diagnostics only — confirm hold button / incoming-reply cleanup snapshots. */
  getConfirmHoldDebugSnapshot: () => ConfirmHoldDebugSnapshot;
  /** Diagnostics only — queue/handoff snapshot during confirm orb mount checks. */
  getConfirmOrbQueueDebugSnapshot: () => ConfirmOrbQueueDebugSnapshot;
  /** Diagnostics only — post-success queue snapshot before releaseStartupInteractions. */
  logPostSuccessQueueSnapshotBeforeRelease: (source: string) => void;
  /** Diagnostics only — post-success queue snapshot after release + unlock. */
  logPostSuccessReleaseStartupResult: (source: string, reason: string) => void;
  /** Diagnostics only — compare queue refs across success/lobby/deeplink paths. */
  logQueueSourceComparisonSnapshot: (source: string) => void;
  /** Success card blocks notification overlay sync until user closes it. */
  setSendSuccessCardMounted: (
    mounted: boolean,
    opts?: { banId?: string | null; source?: string },
  ) => void;
}

export type BansNavOrigin = 'lobby' | 'result-cta';

type ContinueNotificationChainEmptyFallback = 'lobby' | 'bans-section' | 'none';

type ContinueNotificationChainOptions = {
  clearActiveHold?: boolean;
  prefetchIfEmpty?: boolean;
  prefetchSkipBanId?: string | null;
  openLobbyIfEmpty?: boolean;
  emptyFallback?: ContinueNotificationChainEmptyFallback;
  openBansTab?: BansOverlayTabTarget;
  openBansBanId?: string | null;
};

type ContinueNotificationChainOutcome =
  | 'show-next'
  | 'open-lobby'
  | 'open-bans'
  | 'lost-pending'
  | 'needs-prefetch'
  | 'blocked';

type NotificationChainCollectedSnapshot = {
  queueLen: number;
  pendingLen: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  bufferedIncomingId: string | null;
  heldNextKind: string | null;
  mergedFromPending: number;
  finalQueueLen: number;
  finalPendingLen: number;
};

export type BansNavState = {
  origin: BansNavOrigin;
  previousScreen: 'lobby';
  returnTarget: 'lobby';
};

type BansOverlayTabTarget = 'yours' | 'toYou' | 'history' | 'archive';

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

function logResultPayloadSelectionTrace(data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.__debug98log?.('[RESULT PAYLOAD SELECTION TRACE]', data);
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
  const notificationChainTransitioningRef = useRef(false);
  const chainLookaheadInflightRef = useRef<Map<string, Promise<boolean>>>(
    new Map(),
  );
  const incomingNextHydrateInflightRef = useRef<
    Map<string, Promise<BanInteraction | null>>
  >(new Map());
  const [incomingNextHydrateBanId, setIncomingNextHydrateBanId] = useState<
    string | null
  >(null);
  const runChainLookaheadPrefetchRef = useRef<
    (skipBanId: string | null, source: string) => void
  >(() => {});
  const chainAdvanceWaitingRef = useRef(false);
  const chainPlaceholderStuckSnapshotRef = useRef<
    () => Record<string, unknown>
  >(() => ({}));
  const traceChainPlaceholderStuckRef = useRef<
    (
      phase: string,
      source: string,
      blockReason?: string | null,
      extra?: Record<string, unknown>,
    ) => void
  >((phase, source, blockReason, extra) => {
    logChainPlaceholderStuckTrace({
      phase,
      source,
      blockReason: blockReason ?? null,
      ...extra,
    });
  });
  const goToBansAdvancePendingRef = useRef(false);
  const showNextNotificationFromChainSyncRef = useRef<
    (source: string) => boolean
  >(() => false);
  const continueNotificationChainOrOpenLobbyRef = useRef<
    (
      source: string,
      opts?: ContinueNotificationChainOptions,
    ) => Promise<ContinueNotificationChainOutcome>
  >(async () => 'blocked');
  const handleCheckAnswerChainOutcomeRef = useRef<
    (
      outcome: ContinueNotificationChainOutcome,
      banId: string,
      source: string,
      retryCount?: number,
    ) => Promise<void>
  >(async () => {});
  const armOpenBansOverlayFromResultCtaRef = useRef<
    (banId: string | null, targetTab?: BansOverlayTabTarget) => void
  >(() => {});
  const openLobbyAfterCheckDismissIfEmptyRef = useRef<
    (reason: string, banId: string | null) => void
  >(() => {});
  const finalizeCheckDismissAfterUserAnswerRef = useRef<
    (banId: string, remaining: QueuedOverlay[]) => void
  >(() => {});
  const [notificationChainTransitioning, setNotificationChainTransitioningState] =
    useState(false);
  const [chainAdvanceWaiting, setChainAdvanceWaitingState] = useState(false);
  const [chainAdvancePlaceholderKind, setChainAdvancePlaceholderKind] = useState<
    'incoming' | 'check' | 'result' | null
  >(null);
  const setChainAdvanceWaiting = useCallback((active: boolean) => {
    chainAdvanceWaitingRef.current = active;
    setChainAdvanceWaitingState(active);
    if (!active) {
      setChainAdvancePlaceholderKind(null);
    }
  }, []);
  const overlayActionTsRef = useRef<number | null>(null);
  const overlayHandoffTsRef = useRef<number | null>(null);
  const [overlayHandoffDebug, setOverlayHandoffDebug] = useState<{
    delayMs: number;
    cause: string;
  } | null>(null);
  const pendingStartupInteractionsRef = useRef<QueuedOverlay[]>([]);
  const notificationSessionActiveForDebugRef = useRef(false);
  const hasPendingNotificationChainFnRef = useRef<() => boolean>(() => false);
  const startupInteractionsHoldRef = useRef(true);
  const sessionBanSendSuccessRef = useRef(false);
  const [pendingStartupInteractionsCount, setPendingStartupInteractionsCount] =
    useState(0);
  const [lobbyBansAttentionHint, setLobbyBansAttentionHint] = useState(0);
  const lobbyIndicatorPrimedForUserRef = useRef<string | null>(null);
  const primeLobbyBansAttentionHintSyncRef = useRef<(source: string) => void>(
    () => {},
  );
  const incomingOverboardAtomicBanIdRef = useRef<string | null>(null);

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
  const sessionBootstrappedRef = useRef(false);
  const [homeSnapshotReady, setHomeSnapshotReady] = useState(false);
  const [lobbyOpen, setLobbyOpenState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !isCheckDeepLinkStartParamPending();
  });
  const setLobbyOpen = useCallback((value: React.SetStateAction<boolean>) => {
    setLobbyOpenState((prev) => {
      const next =
        typeof value === 'function'
          ? (value as (previous: boolean) => boolean)(prev)
          : value;
      if (next && checkDeeplinkPendingBanIdRef.current) {
        logCheckFullLobbyFlashBug({
          reason: 'setLobbyOpen-while-check-deeplink-pending',
          banId: checkDeeplinkPendingBanIdRef.current,
        });
        return prev;
      }
      if (next && !prev && isPostSuccessHandoffInProgress()) {
        if (
          shouldBlockLobbyOpenForPostSuccessHandoff(
            overlayQueueRef.current.length,
            pendingStartupInteractionsRef.current.length,
            'setLobbyOpen-state',
          )
        ) {
          return prev;
        }
        completePostSuccessHandoffEmptyOpenLobby({
          source: 'setLobbyOpen-state',
        });
      }
      if (next && !prev) {
        if (shouldSuppressLobbyOpenDuringSuccessExit()) {
          logSuccessExitLobbyOpenAttempt({
            source: 'setLobbyOpen-state',
            via: 'setLobbyOpen(true)',
            blocked: 'success-exit-in-progress',
          });
          return prev;
        }
        logSuccessExitLobbyOpenAttempt({
          source: 'setLobbyOpen-state',
          via: 'setLobbyOpen(true)',
        });
      }
      lobbyOpenRef.current = next;
      return next;
    });
  }, []);

  const setCheckAnswerWaitingResultHold = useCallback((banId: string | null) => {
    const normalized = banId ? normalizeId(banId) || null : null;
    checkAnswerWaitingResultHoldBanIdRef.current = normalized;
    setCheckAnswerWaitingResultHoldBanIdState(normalized);
  }, []);

  const isCheckAnswerWaitingResultHoldActive = useCallback(
    (banId?: string | null) => {
      const held = checkAnswerWaitingResultHoldBanIdRef.current;
      if (!held) return false;
      if (banId != null && normalizeId(banId) !== held) return false;
      return true;
    },
    [],
  );

  const releaseCheckAnswerWaitingResultHold = useCallback(
    (resultBanId: string, source: string) => {
      const normalized = normalizeId(resultBanId);
      if (!normalized || !isCheckAnswerWaitingResultHoldActive(normalized)) {
        return false;
      }
      logCheckAnswerWaitingResultReleased({ banId: normalized, source });
      setCheckAnswerWaitingResultHold(null);
      return true;
    },
    [isCheckAnswerWaitingResultHoldActive, setCheckAnswerWaitingResultHold],
  );

  const [lobbyDeeplinkToast, setLobbyDeeplinkToast] = useState<string | null>(
    null,
  );
  const [openBansOverlayRequest, setOpenBansOverlayRequest] = useState(0);
  const [openBansOverlayTabRequest, setOpenBansOverlayTabRequest] =
    useState<BansOverlayTabTarget | null>(null);
  const [closeBansOverlayRequest, setCloseBansOverlayRequest] = useState(0);
  const [resultCtaBansOverlayOpen, setResultCtaBansOverlayOpen] =
    useState(false);
  const [bansCtaQueueSuppress, setBansCtaQueueSuppress] = useState(false);
  const [bansNavState, setBansNavState] = useState<BansNavState>(DEFAULT_BANS_NAV);
  const [bansReturnToLobbyLatch, setBansReturnToLobbyLatchState] =
    useState(false);
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
  const resultPriorityBanIdsRef = useRef<Set<string>>(new Set());
  const checkAnswerInFlightRef = useRef<Set<string>>(new Set());
  /** Result pending first show after user answered check-card in this session. */
  const checkAnswerPendingResultShowRef = useRef<Set<string>>(new Set());
  const resultOverlayRenderedBanIdsRef = useRef<Set<string>>(new Set());
  /** submitCheckAnswer owns empty-queue continue — skip dismiss microtask duplicate. */
  const checkAnswerDismissChainOwnedRef = useRef(false);
  const checkAnswerWaitingResultHoldBanIdRef = useRef<string | null>(null);
  const [checkAnswerWaitingResultHoldBanId, setCheckAnswerWaitingResultHoldBanIdState] =
    useState<string | null>(null);
  const checkAnswerChainRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const CHECK_ANSWER_CHAIN_RETRY_MAX = 5;
  const CHECK_ANSWER_CHAIN_RETRY_MS = 450;
  const resultOpenRef = useRef(false);
  const overboardInFlightRef = useRef<string | null>(null);
  const freshOverboardActionBanIdsRef = useRef<Set<string>>(new Set());
  const freshFinalStatusBanIdsRef = useRef<Set<string>>(new Set());
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
  const setBansReturnToLobbyLatch = useCallback(
    (
      active: boolean,
      debug?: { source: string; banId?: string | null },
    ) => {
      const event = active ? '[LATCH ON]' : '[LATCH OFF]';
      window.__debug98log?.(event, {
        banId: debug?.banId ?? resultRef.current?.id ?? null,
        bansReturnToLobbyLatchRef: bansReturnToLobbyLatchRef.current,
        latchNext: active,
        source: debug?.source ?? 'unknown',
        queueLen: overlayQueueRef.current.length,
      });
      bansReturnToLobbyLatchRef.current = active;
      setBansReturnToLobbyLatchState(active);
    },
    [],
  );
  const completeBansCloseFromResultCtaRef = useRef<() => boolean>(() => false);
  const requestOpenBansFromResultCtaRef = useRef<(banId: string | null) => void>(
    () => {},
  );
  const openLobbyRef = useRef<(source?: string) => void>(() => {});
  const resultCtaBansOverlayOpenRef = useRef(false);
  const openBansOverlayRequestRef = useRef(0);
  const openBansOverlayTabRequestRef = useRef<BansOverlayTabTarget | null>(null);
  const statusCtaNavigateGenerationRef = useRef(0);
  const notificationChainHandoffRef = useRef(false);
  const notificationChainAwaitingUserRef = useRef(false);
  const notificationChainReplyComposeActiveRef = useRef(false);
  const chainReplyParentBanIdRef = useRef<string | null>(null);
  const chainAdvanceExplicitRef = useRef(false);
  const heldUserCardOverlayRef = useRef<HeldUserCardOverlay | null>(null);
  const [heldUserCardOverlay, setHeldUserCardOverlay] =
    useState<HeldUserCardOverlay | null>(null);
  const lastProcessedOverlayKindForBansRef = useRef<
    'incoming' | 'check' | 'result' | null
  >(null);

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
  const bufferedRepeatGoToConfirmRef = useRef(true);
  const bufferedInviteToBanInviterRef = useRef<UserPublic | null>(null);
  const bufferedReplyDeepLinkRef = useRef<BanInteraction | null>(null);
  const bufferedActiveDeepLinkRef = useRef<BanInteraction | null>(null);
  const [deepLinkRepeatBan, setDeepLinkRepeatBan] = useState<BanInteraction | null>(
    null,
  );
  const [deepLinkRepeatGoToConfirm, setDeepLinkRepeatGoToConfirm] =
    useState(true);
  const [deepLinkInviteToBanInviter, setDeepLinkInviteToBanInviter] =
    useState<UserPublic | null>(null);
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
  const sendSuccessCardActiveRef = useRef(false);
  const sendSuccessCardBanIdRef = useRef<string | null>(null);
  const [sendSuccessCardActive, setSendSuccessCardActiveState] = useState(false);
  const [sendFlowOpen, setSendFlowOpen] = useState(false);
  const sendFlowOpenRef = useRef(false);
  const sendComposePhaseRef = useRef<
    'idle' | 'selectingTarget' | 'composingBan' | 'confirming'
  >('idle');
  const whatOrConfirmActiveRef = useRef(false);
  const sendComposeActiveRef = useRef(false);
  const resetSendUiForBansNavigationRef = useRef<(() => void) | null>(null);
  const [sendComposePhase, setSendComposePhaseState] = useState<
    'idle' | 'selectingTarget' | 'composingBan' | 'confirming'
  >('idle');
  const [deepLinkReplyBooting, setDeepLinkReplyBooting] = useState(false);
  const [replyDeeplinkFastShell, setReplyDeeplinkFastShell] = useState(false);
  const [replyIncomingDisplayBan, setReplyIncomingDisplayBan] =
    useState<BanInteraction | null>(null);
  const replyIncomingDisplayBanRef = useRef<BanInteraction | null>(null);
  const replyDeeplinkPendingBanIdRef = useRef<string | null>(null);
  const [checkDeepLinkBanId, setCheckDeepLinkBanId] = useState<string | null>(null);
  const checkDeepLinkBanIdRef = useRef<string | null>(null);
  const checkDeeplinkPendingBanIdRef = useRef<string | null>(null);
  const checkDeeplinkCompletedRouteBanIdRef = useRef<string | null>(null);
  const checkDeeplinkResumeInflightRef = useRef<string | null>(null);
  const replyDeeplinkRepeatEntryRef = useRef(false);
  const pendingReplyDeeplinkToastRef = useRef<{
    kind: 'overboard' | 'sent';
    banId: string;
  } | null>(null);
  const replyDeeplinkCompletedRouteBanIdRef = useRef<string | null>(null);
  const replyDeeplinkParentBanIdRef = useRef<string | null>(null);
  const acceptedParentBanAfterReplyRef = useRef<string | null>(null);
  const acceptedParentBanActiveRef = useRef<BanInteraction | null>(null);
  const acceptedParentIncomingSnapshotRef = useRef<BanInteraction | null>(null);
  const replyParentAcceptPromiseRef = useRef<Promise<BanInteraction | null> | null>(
    null,
  );
  const replyParentActivePriorityPendingRef = useRef(false);
  const replyParentActivePriorityActiveRef = useRef(false);
  const [replyParentActivePriorityActive, setReplyParentActivePriorityActive] =
    useState(false);
  const replyFlowStartedForBanIdRef = useRef<string | null>(null);
  const replyComposeActiveRef = useRef(false);
  const [lobbyIntroPrimedEpoch, setLobbyIntroPrimedEpoch] = useState(0);
  const [replyCompletedRouteEpoch, setReplyCompletedRouteEpoch] = useState(0);
  const replyDeeplinkFastOpenedRef = useRef(false);
  const replyDeeplinkFastShellRef = useRef(false);
  const replyDeeplinkPrefetchRef = useRef(false);
  const replyDeeplinkChainHoldRef = useRef(false);
  const bootClaimedIncomingRef = useRef<BanInteraction | null>(null);
  const bootReplyDeeplinkPreviewRef = useRef<BanInteraction | null>(null);
  const replyStartParamPreviewBanRef = useRef<BanInteraction | null>(null);
  const replyStartParamPreviewRawRef = useRef<
    import('@98plus/shared').ReplyStartParamPreview | null
  >(null);
  const lastSessionIncomingRef = useRef<BanInteraction | null>(null);
  const postSuccessReleaseBeforeRef = useRef<PostSuccessQueueSnapshotFields | null>(
    null,
  );
  const logPostSuccessEmptyQueueIfMisalignedRef = useRef<
    ((source: string) => void) | null
  >(null);
  const replyDeeplinkFastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const replyDeepLinkBanIdRef = useRef<string | null>(null);
  const replyDeeplinkFastWrittenAtRef = useRef<number | null>(null);
  const replyDeeplinkFastWrittenBanIdRef = useRef<string | null>(null);
  const replyDeeplinkFastHydratedRef = useRef(false);
  const replyDeeplinkPrefillBanRef = useRef<BanInteraction | null>(null);
  const incomingConsumedAfterAnswerRef = useRef<Set<string>>(new Set());
  /** Diag-only: prefetch in flight count for [CHAIN FINALIZE DIAG]. */
  const pendingChainPrefetchInFlightRef = useRef(0);
  /** Diag-only: last prefetch returned rejects but merged nothing. */
  const lastChainRejectOnlyPrefetchRef = useRef(false);
  const replyToBanIdPersistRef = useRef<string | null>(null);
  const incomingReplyComposeDismissedRef = useRef<Set<string>>(new Set());

  function isIncomingConsumedForReplyCompose(
    banId: string | null | undefined,
  ): boolean {
    const norm = normalizeId(banId ?? '');
    if (!norm) return false;
    return incomingReplyComposeDismissedRef.current.has(norm);
  }

  function isReplyComposeBlockingNotificationGuards(): boolean {
    return (
      notificationChainReplyComposeActiveRef.current ||
      replyComposeActiveRef.current ||
      chainReplyParentBanIdRef.current != null
    );
  }

  function clearNotificationChainTransitioningInline(): void {
    if (!notificationChainTransitioningRef.current) return;
    notificationChainTransitioningRef.current = false;
    setNotificationChainTransitioningState(false);
  }

  const [replyToBanId, setReplyToBanId] = useState<string | null>(null);
  const [replyComposeActive, setReplyComposeActive] = useState(false);
  useEffect(() => {
    replyComposeActiveRef.current = replyComposeActive;
  }, [replyComposeActive]);
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
    sendFlowOpenRef.current = true;
    setLobbyOpen(false);
  }, []);
  const closeSendFlow = useCallback(() => {
    setSendFlowOpen(false);
    sendFlowOpenRef.current = false;
  }, []);
  const setComposeFlowState = useCallback(
    (opts: {
      phase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
      source: string;
    }) => {
      const { phase, source } = opts;
      const whatOrConfirm =
        phase === 'composingBan' || phase === 'confirming';
      const sendCompose = phase !== 'idle';
      const prevWhatOrConfirm = whatOrConfirmActiveRef.current;

      whatOrConfirmActiveRef.current = whatOrConfirm;
      sendComposeActiveRef.current = sendCompose;
      sendComposePhaseRef.current = phase;
      setSendComposePhaseState(phase);

      console.log('[compose-state-change]', { phase, active: whatOrConfirm });
      console.log('[compose-ref-state]', {
        source,
        active: whatOrConfirm,
        sendCompose,
      });

      if (whatOrConfirm && !prevWhatOrConfirm) {
        incomingBanRef.current = null;
        checkBanRef.current = null;
        setIncomingBan(null);
        setCheckBan(null);
        if (!directResultOverlayRef.current) {
          resultOpenRef.current = false;
          resultRef.current = null;
          emitResultClearCallsite({
            source: 'compose-state-change',
            reason: 'compose-enter-clear-result',
            willClearResult: true,
          });
          setResult(null);
          emitResultHeldStillPresentAfterClear(
            'compose-state-change',
            'compose-enter-clear-result',
          );
          setDirectResultOverlayActive(false);
        }
      }

      if (phase === 'confirming') {
        const parentBanId = normalizeId(
          chainReplyParentBanIdRef.current ??
            replyDeeplinkParentBanIdRef.current ??
            '',
        );
        const held = heldUserCardOverlayRef.current;
        const heldBanId = held ? heldUserCardBanId(held) : null;
        const consumed =
          heldBanId != null &&
          incomingReplyComposeDismissedRef.current.has(normalizeId(heldBanId));
        const staleIncomingHold =
          held?.kind === 'incoming' &&
          (parentBanId.length === 0 ||
            normalizeId(heldBanId ?? '') === parentBanId ||
            consumed);
        if (
          staleIncomingHold ||
          (notificationChainAwaitingUserRef.current && held != null)
        ) {
          if (heldUserCardOverlayRef.current) {
            emitResultClearCallsite({
              source: 'compose-state-change',
              reason: 'confirm-enter-clear-held',
              willClearHeld: true,
            });
            heldUserCardOverlayRef.current = null;
            setHeldUserCardOverlay(null);
            emitResultHeldStillPresentAfterClear(
              'compose-state-change',
              'confirm-enter-clear-held',
            );
          }
          notificationChainAwaitingUserRef.current = false;
          console.log('[active-user-card-hold-clear]', {
            source: `${source}:confirm-enter`,
          });
        }
        notificationChainAwaitingUserRef.current = false;
        notificationChainHandoffRef.current = false;
        clearNotificationChainTransitioningInline();
        setChainAdvanceWaiting(false);
        logConfirmEnterNotificationGuardClear({
          source,
          parentBanId: parentBanId || null,
          heldKind: held?.kind ?? null,
          heldBanId,
          awaitingUser: notificationChainAwaitingUserRef.current,
        });
        const stillHeld = heldUserCardOverlayRef.current;
        if (
          stillHeld?.kind === 'incoming' &&
          (parentBanId.length === 0 ||
            normalizeId(heldUserCardBanId(stillHeld)) === parentBanId ||
            incomingReplyComposeDismissedRef.current.has(
              normalizeId(heldUserCardBanId(stillHeld)),
            ))
        ) {
          logConfirmBlockedByActiveUserCardBug({
            source,
            activeKind: stillHeld.kind,
            activeBanId: heldUserCardBanId(stillHeld),
            parentBanId: parentBanId || null,
          });
        }
      }
    },
    [setChainAdvanceWaiting],
  );
  const isWhatOrConfirmActive = useCallback(
    () => whatOrConfirmActiveRef.current,
    [],
  );
  const isSendComposeFlowActive = (): boolean =>
    sendComposePhaseRef.current !== 'idle' ||
    replyComposeActiveRef.current;
  const logNotificationDisplayBlockedDuringComposeGuard = (
    source: string,
    activeKind: string | null = null,
  ): void => {
    logNotificationDisplayBlockedDuringCompose({
      source,
      activeKind,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      sendComposePhase: sendComposePhaseRef.current,
      replyComposeActive: replyComposeActiveRef.current,
      lobbyOpen: lobbyOpenRef.current,
    });
  };
  const isSendComposeActive = useCallback(
    () => isSendComposeFlowActive(),
    [],
  );

  const pinReplyToBanId = useCallback((banId: string | null) => {
    replyToBanIdPersistRef.current = banId;
    setReplyToBanId(banId);
    if (!banId) {
      setReplyComposeActive(false);
    }
  }, []);

  const getPinnedReplyToBanId = useCallback(() => {
    return (
      replyToBanIdPersistRef.current ??
      chainReplyParentBanIdRef.current ??
      replyDeeplinkParentBanIdRef.current ??
      acceptedParentBanAfterReplyRef.current
    );
  }, []);

  const armReplyDeepLink = useCallback((banId: string) => {
    const bid = banId.trim();
    if (replyDeeplinkCompletedRouteBanIdRef.current === bid) {
      logReplyFlowLoopGuard('skip arm after completed route');
      return;
    }
    if (replyFlowStartedForBanIdRef.current === bid) {
      logReplyFlowLoopGuard('skip arm after reply flow started');
      return;
    }
    if (incomingReplyComposeDismissedRef.current.has(bid)) {
      logReplyFlowLoopGuard('skip arm after compose dismiss');
      return;
    }
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
    logReplyDeeplinkStart({ banId, source: 'armReplyDeepLink' });
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
  const activeIncomingOverlayBanRef = useRef<BanInteraction | null>(null);
  const [activeIncomingOverlayBan, setActiveIncomingOverlayBanState] =
    useState<BanInteraction | null>(null);
  const stableIncomingOverlayBan =
    activeIncomingOverlayBan ?? activeIncomingOverlayBanRef.current;

  const setActiveIncomingOverlayBanStable = useCallback(
    (ban: BanInteraction, source: string) => {
      logChainHeadSwitchTrace(source, 'incoming', ban.id);
      const enriched = enrichBanInteraction(ban);
      activeIncomingOverlayBanRef.current = enriched;
      setActiveIncomingOverlayBanState(enriched);
      logIncomingStableBanSet({ banId: enriched.id, source });
    },
    [],
  );

  const clearActiveIncomingOverlayBanStable = useCallback(
    (reason: string, banId?: string | null) => {
      const current = activeIncomingOverlayBanRef.current;
      if (!current?.id) return;
      if (banId && normalizeId(current.id) !== normalizeId(banId)) return;
      logIncomingStableBanCleared({ banId: current.id, reason });
      activeIncomingOverlayBanRef.current = null;
      setActiveIncomingOverlayBanState(null);
    },
    [],
  );

  const blockClearActiveIncomingOverlayBan = useCallback(
    (banId: string | null | undefined, source: string): boolean => {
      const stable = activeIncomingOverlayBanRef.current;
      if (!stable?.id || !banId) return false;
      if (normalizeId(stable.id) !== normalizeId(banId)) return false;
      logIncomingStableBanClearBlocked({ banId: stable.id, source });
      return true;
    },
    [],
  );

  const resolveStableIncomingForQueueHead = useCallback(
    (active: QueuedOverlay | null | undefined): BanInteraction | null => {
      const stable = activeIncomingOverlayBanRef.current;
      if (!stable?.id) return null;
      const headId =
        active?.kind === 'incoming'
          ? active.ban.id
          : overlayQueueRef.current[0]?.kind === 'incoming'
            ? overlayQueueRef.current[0].ban.id
            : null;
      if (!headId || normalizeId(headId) !== normalizeId(stable.id)) {
        return null;
      }
      return stable;
    },
    [],
  );
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

  const isUserAllowedCheckOverlayCloseReason = (reason: string) =>
    reason === 'user-answer' || reason === 'clear-check-overlay';

  const clearActiveOverlayStateForDismiss = (
    kind: QueuedOverlay['kind'] | null,
    banId: string | null,
    opts?: { explicitUserAction?: boolean },
  ) => {
    if (!banId) return;
    const norm = normalizeId(banId);
    if (
      incomingOverboardAtomicBanIdRef.current === norm &&
      !opts?.explicitUserAction
    ) {
      logResultCardClearedBug({
        banId: norm,
        source: 'clearActiveOverlayStateForDismiss',
        attemptedKind: kind,
      });
      restoreHeldUserCardOverlay('clearActiveOverlayStateForDismiss-atomic-blocked');
      return;
    }
    if (
      isActiveUserCardHold() &&
      !opts?.explicitUserAction &&
      heldUserCardOverlayRef.current &&
      heldUserCardBanId(heldUserCardOverlayRef.current) === norm
    ) {
      logActiveUserCardPreventOverlayClear({
        activeKind: heldUserCardOverlayRef.current.kind,
        activeBanId: heldUserCardBanId(heldUserCardOverlayRef.current),
        source: 'clearActiveOverlayStateForDismiss',
        attemptedKind: kind,
        attemptedBanId: banId,
      });
      restoreHeldUserCardOverlay('clearActiveOverlayStateForDismiss-blocked');
      return;
    }
    if (kind === 'check' && checkBanRef.current?.id === banId) {
      checkBanRef.current = null;
      setCheckBan(null);
      return;
    }
    if (kind === 'incoming' && incomingBanRef.current?.id === banId) {
      if (
        !opts?.explicitUserAction &&
        blockClearActiveIncomingOverlayBan(banId, 'clearActiveOverlayStateForDismiss')
      ) {
        return;
      }
      if (opts?.explicitUserAction) {
        clearActiveIncomingOverlayBanStable('user-dismiss', banId);
      }
      incomingBanRef.current = null;
      setIncomingBan(null);
    }
  };

  const snapshotCheckAnswerAdvanceSide = () => {
    const held = heldUserCardOverlayRef.current;
    const queueHead = overlayQueueRef.current[0] ?? null;
    return {
      queueRefHeadKind: queueHead?.kind ?? null,
      queueRefHeadBanId: queueHead ? overlayItemBanId(queueHead) : null,
      heldKind: held?.kind ?? null,
      heldBanId: held ? heldUserCardBanId(held) : null,
      checkBanRefId: checkBanRef.current?.id ?? null,
      resultRefBanId: resultRef.current?.id ?? null,
      activeUserCardHold:
        held && notificationChainAwaitingUserRef.current ? held.kind : null,
    };
  };

  const resolveChainAdvancePlaceholderKindForTrace = (
    remaining: QueuedOverlay[],
  ): 'incoming' | 'check' | 'result' | null => {
    if (!chainAdvanceWaitingRef.current) return null;
    const advanceHead =
      remaining[0] ?? pendingStartupInteractionsRef.current[0] ?? null;
    return advanceHead?.kind === 'check' ||
      advanceHead?.kind === 'result' ||
      advanceHead?.kind === 'incoming'
      ? advanceHead.kind
      : 'incoming';
  };

  const emitCheckAnswerAdvanceTrace = (
    phase:
      | 'before-clear'
      | 'after-clear'
      | 'before-apply-queue'
      | 'after-apply-queue',
    dismissBanId: string | null,
    remaining: QueuedOverlay[],
    before?: ReturnType<typeof snapshotCheckAnswerAdvanceSide>,
  ) => {
    const after = snapshotCheckAnswerAdvanceSide();
    const sideBefore = before ?? after;
    const remainingHead = remaining[0] ?? null;
    logCheckAnswerAdvanceTrace({
      phase,
      checkBanId: dismissBanId ?? checkBanRef.current?.id ?? null,
      dismissBanId,
      remainingLen: remaining.length,
      remainingHeadKind: remainingHead?.kind ?? null,
      remainingHeadBanId: remainingHead ? overlayItemBanId(remainingHead) : null,
      queueRefHeadKindBefore: sideBefore.queueRefHeadKind,
      queueRefHeadBanIdBefore: sideBefore.queueRefHeadBanId,
      queueRefHeadKindAfter: after.queueRefHeadKind,
      queueRefHeadBanIdAfter: after.queueRefHeadBanId,
      heldKindBefore: sideBefore.heldKind,
      heldBanIdBefore: sideBefore.heldBanId,
      heldKindAfter: after.heldKind,
      heldBanIdAfter: after.heldBanId,
      checkBanRefBefore: sideBefore.checkBanRefId,
      checkBanRefAfter: after.checkBanRefId,
      resultRefBanIdBefore: sideBefore.resultRefBanId,
      resultRefBanIdAfter: after.resultRefBanId,
      activeUserCardHoldBefore: sideBefore.activeUserCardHold,
      activeUserCardHoldAfter: after.activeUserCardHold,
      chainAdvanceWaiting: chainAdvanceWaitingRef.current,
      chainAdvancePlaceholderKind:
        resolveChainAdvancePlaceholderKindForTrace(remaining),
      notificationChainTransitioning: notificationChainTransitioningRef.current,
    });
  };

  const shouldDeferCheckAnswerEmptyRemainingApplyQueue = (
    reason: string,
    dismissBanId: string | null,
    remaining: QueuedOverlay[],
  ): boolean => {
    if (reason !== 'user-answer') return false;
    if (remaining.length > 0) return false;
    if (!dismissBanId) return false;
    const normalizedBanId = normalizeId(dismissBanId);
    if (!normalizedBanId) return false;
    if (!checkAnswerDismissChainOwnedRef.current) return false;
    return checkAnswerInFlightRef.current.has(normalizedBanId);
  };

  const prepareUserAnswerChainAdvance = (
    reason: string,
    dismissKind: QueuedOverlay['kind'] | null,
    dismissBanId: string | null,
    remaining: QueuedOverlay[],
  ): boolean => {
    if (!isUserAllowedCheckOverlayCloseReason(reason)) return false;
    const beforeClear = snapshotCheckAnswerAdvanceSide();
    emitCheckAnswerAdvanceTrace(
      'before-clear',
      dismissBanId,
      remaining,
      beforeClear,
    );
    logOverlayMarkDismissing({
      reason,
      kind: dismissKind,
      banId: dismissBanId,
      remainingLen: remaining.length,
    });
    clearActiveUserCardHold(`prepareUserAnswerChainAdvance:${reason}`);
    clearActiveOverlayStateForDismiss(dismissKind, dismissBanId, {
      explicitUserAction: true,
    });
    emitCheckAnswerAdvanceTrace(
      'after-clear',
      dismissBanId,
      remaining,
      beforeClear,
    );
    const dismissNorm = normalizeId(dismissBanId ?? '');
    if (dismissKind === 'check' && dismissNorm.length > 0) {
      if (heldUserCardOverlayRef.current?.kind === 'check') {
        traceCheckCardHoldLifecycle('hold-still-present-after-clear', {
          source: `prepareUserAnswerChainAdvance:${reason}`,
          reason: 'after-clear-still-held',
          banId: dismissNorm,
          checkBanId: dismissNorm,
        });
      }
      if (
        checkBanRef.current?.id &&
        normalizeId(checkBanRef.current.id) === dismissNorm
      ) {
        traceCheckCardHoldLifecycle('check-re-mounted-after-answer', {
          source: `prepareUserAnswerChainAdvance:${reason}`,
          reason: 'check-ban-ref-still-mounted-after-clear',
          banId: dismissNorm,
          checkBanId: dismissNorm,
        });
      }
    }
    logOverlayActiveCleared({
      reason,
      kind: dismissKind,
      banId: dismissBanId,
    });
    chainAdvanceExplicitRef.current = true;
    logChainDrainUserAnswerAllowed({
      reason,
      kind: dismissKind,
      banId: dismissBanId,
      remainingLen: remaining.length,
    });
    traceChainPlaceholderStuckRef.current(
      'prepare-user-answer-chain-advance',
      `prepareUserAnswerChainAdvance:${reason}`,
      null,
      { remainingLen: remaining.length, dismissKind, dismissBanId },
    );
    return true;
  };

  const isActiveCheckOverlayMounted = () => {
    const banId = checkBanRef.current?.id?.trim() ?? '';
    if (!banId) return false;
    const head = overlayQueueRef.current[0];
    return head?.kind === 'check' && head.ban.id === banId;
  };

  const getActiveMountedUserCard = () =>
    getMountedBlockingUserOverlay({
      incomingBanId: incomingBanRef.current?.id ?? null,
      checkBanId: checkBanRef.current?.id ?? null,
      resultBanId: resultRef.current?.id ?? null,
    });

  const getActiveUserCardForGuard = () => {
    if (isReplyComposeBlockingNotificationGuards()) {
      const parentId = normalizeId(
        chainReplyParentBanIdRef.current ??
          replyDeeplinkParentBanIdRef.current ??
          '',
      );
      const held = heldUserCardOverlayRef.current;
      if (
        held?.kind === 'incoming' &&
        (parentId.length === 0 ||
          normalizeId(heldUserCardBanId(held)) === parentId ||
          isIncomingConsumedForReplyCompose(heldUserCardBanId(held)))
      ) {
        return null;
      }
      const mounted = getActiveMountedUserCard();
      if (
        mounted?.kind === 'incoming' &&
        (parentId.length === 0 ||
          mounted.banId === parentId ||
          isIncomingConsumedForReplyCompose(mounted.banId))
      ) {
        return null;
      }
    }
    const held = heldUserCardOverlayRef.current;
    if (held && notificationChainAwaitingUserRef.current) {
      if (
        held.kind === 'incoming' &&
        isIncomingConsumedForReplyCompose(heldUserCardBanId(held))
      ) {
        return null;
      }
      return { kind: held.kind, banId: heldUserCardBanId(held) };
    }
    return getActiveMountedUserCard();
  };

  const blockOverlayReplaceWithoutUserAction = (
    source: string,
    nextHead: QueuedOverlay | null,
    opts?: { explicitUserAction?: boolean },
  ): boolean => {
    const active = getActiveUserCardForGuard();
    if (!active) return false;
    const nextKind = nextHead?.kind ?? null;
    const nextBanId = nextHead ? overlayItemBanId(nextHead) : null;
    if (
      !shouldBlockChainAdvanceOverActiveUserCard(active, nextKind, nextBanId, opts)
    ) {
      return false;
    }
    logChainAdvanceBlockedActiveUserCard({
      activeKind: active.kind,
      activeBanId: active.banId,
      nextKind,
      nextBanId,
      source,
    });
    logChainAdvanceBlockedActiveUserCardDetail({
      activeKind: active.kind,
      activeBanId: active.banId,
      nextKind,
      nextBanId,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      blockReason: 'chain-advance-over-active-user-card',
      heldKind: heldUserCardOverlayRef.current?.kind ?? null,
      heldBanId: heldUserCardOverlayRef.current
        ? heldUserCardBanId(heldUserCardOverlayRef.current)
        : null,
      source,
    });
    if (active.kind === 'incoming') {
      logIncomingReplacedBug({
        activeBanId: active.banId,
        nextBanId,
        source,
      });
    }
    return true;
  };

  const isActiveUserCardHold = () =>
    notificationChainAwaitingUserRef.current &&
    heldUserCardOverlayRef.current != null;

  const isHeldOverboardResultProtected = (
    resultId: string | null | undefined,
  ): boolean => shouldBlockAutoDismissAtomicOverboardResult(resultId);

  const isHeldFinalStatusResultProtected = (
    resultId: string | null | undefined,
  ): boolean => {
    const norm = normalizeId(resultId ?? '');
    if (!norm || !notificationChainAwaitingUserRef.current) return false;
    const held = heldUserCardOverlayRef.current;
    if (held?.kind !== 'result' || normalizeId(held.result.id) !== norm) {
      return false;
    }
    return isFinalCheckStatusOutcome(held.result.outcome);
  };

  const buildResultShellHeldCardGuardContext = (
    queueHead: QueuedOverlay | null,
  ) =>
    buildResultShellHeldCardGuardContextFromHeld(
      heldUserCardOverlayRef.current ?? heldUserCardOverlay,
      {
        awaitingUser: notificationChainAwaitingUserRef.current,
        mountedIncomingBanId: incomingBanRef.current?.id ?? null,
        mountedCheckBanId: checkBanRef.current?.id ?? null,
        atomicOverboardBanId: incomingOverboardAtomicBanIdRef.current,
        freshOverboardBanIds: freshOverboardActionBanIdsRef.current,
        overboardInFlightBanId: overboardInFlightRef.current,
        freshFinalStatusBanIds: freshFinalStatusBanIdsRef.current,
        resultPriorityBanIds: resultPriorityBanIdsRef.current,
        chainAdvanceExplicit: chainAdvanceExplicitRef.current,
        queueHead,
      },
    );

  const shouldBlockPassiveResultShell = (
    resultPayload: BanResult | null | undefined,
    guardCtx: ReturnType<typeof buildResultShellHeldCardGuardContext>,
    logSource?: string,
  ): boolean => {
    if (!resultPayload?.id?.trim()) return false;
    const blocked = shouldBlockResultShellOverHeldIncomingOrCheck(
      resultPayload.id,
      resultPayload,
      guardCtx,
    );
    if (blocked && logSource) {
      logResultShellSuppressedNotReady({
        banId: normalizeId(resultPayload.id),
        reason: 'passive-result-blocked-over-held-incoming-check',
        source: logSource,
        heldKind: guardCtx.heldKind,
        heldBanId: guardCtx.heldBanId,
      });
    }
    return blocked;
  };

  const shouldPreserveFinalStatusResult = (
    norm: string,
    result: BanResult | null | undefined,
  ): boolean => {
    if (!norm || !result) return false;
    if (!isFinalCheckStatusOutcome(result.outcome)) return false;
    if (freshFinalStatusBanIdsRef.current.has(norm)) return true;
    if (
      notificationChainAwaitingUserRef.current &&
      normalizeId(resultRef.current?.id ?? '') === norm &&
      resultOpenRef.current
    ) {
      return true;
    }
    return isHeldFinalStatusResultProtected(norm);
  };

  const preserveAtomicOverboardResultDuringSync = (
    source: string,
  ): boolean => {
    if (!isPendingAtomicOverboardResultAwaitingDismiss(source)) {
      return false;
    }
    const atomicNorm = normalizeId(incomingOverboardAtomicBanIdRef.current ?? '');
    if (!atomicNorm) return false;
    freshOverboardActionBanIdsRef.current.add(atomicNorm);
    logResultCardStableHold({
      banId: atomicNorm,
      source: `${source}-atomic-preserve`,
    });
    resultOpenRef.current = true;
    const held = heldUserCardOverlayRef.current;
    const heldNorm =
      held?.kind === 'result' ? normalizeId(held.result.id) : '';
    if (heldNorm === atomicNorm) {
      if (normalizeId(resultRef.current?.id ?? '') !== atomicNorm) {
        resultRef.current = held!.result;
      }
      setResult(held!.result);
      return true;
    }
    if (
      resultRef.current &&
      normalizeId(resultRef.current.id) === atomicNorm
    ) {
      setResult(resultRef.current);
      return true;
    }
    return true;
  };

  const resolveMountedResultPayloadForBanId = (
    banId: string,
  ): BanResult | null => {
    const norm = normalizeId(banId);
    if (!norm) return null;
    const refPayload = resultRef.current;
    if (refPayload && normalizeId(refPayload.id) === norm) {
      return refPayload;
    }
    const held = heldUserCardOverlayRef.current;
    if (held?.kind === 'result' && normalizeId(held.result.id) === norm) {
      return held.result;
    }
    return null;
  };

  const shouldBlockAutoDismissAtomicOverboardResult = (
    resultId: string | null | undefined,
  ): boolean => {
    const norm = normalizeId(resultId ?? '');
    if (!norm) return false;
    const atomicId = normalizeId(incomingOverboardAtomicBanIdRef.current ?? '');
    if (atomicId && atomicId === norm) return true;
    if (freshOverboardActionBanIdsRef.current.has(norm)) return true;
    const payload = resolveMountedResultPayloadForBanId(norm);
    if (payload && isFinalCheckStatusOutcome(payload.outcome)) {
      return false;
    }
    const held = heldUserCardOverlayRef.current;
    if (held?.kind === 'result' && normalizeId(held.result.id) === norm) {
      return true;
    }
    return normalizeId(resultRef.current?.id ?? '') === norm;
  };

  const isQueueAtomicOverboardResultShowable = useCallback(
    (resultId: string | null | undefined): boolean => {
      const norm = normalizeId(resultId ?? '');
      if (!norm) return false;
      const payload = resolveMountedResultPayloadForBanId(norm);
      if (payload && isFinalCheckStatusOutcome(payload.outcome)) {
        return false;
      }
      if (
        incomingOverboardAtomicBanIdRef.current === norm ||
        freshOverboardActionBanIdsRef.current.has(norm)
      ) {
        return true;
      }
      if (!payload) return false;
      return isAtomicOverboardShellReady(payload, {
        freshOverboardBanId: freshOverboardActionBanIdsRef.current.has(norm),
        atomicOverboardBanId: incomingOverboardAtomicBanIdRef.current === norm,
      });
    },
    [],
  );

  const isQueueResultShellVisibleContentReady = useCallback(
    (payload: BanResult | null | undefined): boolean => {
      if (!payload?.id?.trim()) return false;
      if (isQueueAtomicOverboardResultShowable(payload.id)) {
        return true;
      }
      return hasVisibleResultOverlayContent({
        result: payload,
        viewerId: resolveResultOverlayViewerId(
          payload,
          userIdRef.current ?? auth.user?.id ?? null,
        ),
        atomicOverboardShowable: isAtomicOverboardShellReady(payload, {
          freshOverboardBanId: freshOverboardActionBanIdsRef.current.has(
            normalizeId(payload.id),
          ),
          atomicOverboardBanId:
            incomingOverboardAtomicBanIdRef.current ===
            normalizeId(payload.id),
        }),
      });
    },
    [auth.user?.id, isQueueAtomicOverboardResultShowable],
  );

  const blockAutoDismissAtomicOverboardResult = useCallback(
    (resultId: string | null | undefined, source: string): boolean => {
      if (!shouldBlockAutoDismissAtomicOverboardResult(resultId)) {
        return false;
      }
      const norm = normalizeId(resultId ?? '');
      const held = heldUserCardOverlayRef.current;
      window.__debug98log?.('[RESULT AUTO DISMISS BLOCKED ATOMIC OVERBOARD]', {
        resultId: norm || null,
        source,
        atomicId:
          normalizeId(incomingOverboardAtomicBanIdRef.current ?? '') || null,
        fresh: norm ? freshOverboardActionBanIdsRef.current.has(norm) : false,
        heldKind: held?.kind ?? null,
        heldResultId:
          held?.kind === 'result' ? normalizeId(held.result.id) || null : null,
        resultRefId: normalizeId(resultRef.current?.id ?? '') || null,
      });
      return true;
    },
    [],
  );

  const blockAutoDismissTerminalFinalStatus = useCallback(
    (resultId: string | null | undefined, source: string): boolean => {
      const norm = normalizeId(resultId ?? '');
      if (!norm) return false;
      const refPayload =
        resultRef.current && normalizeId(resultRef.current.id) === norm
          ? resultRef.current
          : null;
      const held = heldUserCardOverlayRef.current;
      const heldPayload =
        held?.kind === 'result' && normalizeId(held.result.id) === norm
          ? held.result
          : null;
      const payload = refPayload ?? heldPayload;
      const isFinal =
        (payload != null && isFinalCheckStatusOutcome(payload.outcome)) ||
        freshFinalStatusBanIdsRef.current.has(norm);
      if (!isFinal) return false;
      const blocked =
        freshFinalStatusBanIdsRef.current.has(norm) ||
        isHeldFinalStatusResultProtected(norm) ||
        (notificationChainAwaitingUserRef.current &&
          normalizeId(resultRef.current?.id ?? '') === norm &&
          resultOpenRef.current);
      logResultDismissRequiredCheck({
        resultId: norm,
        source,
        blocked,
        awaitingUser: notificationChainAwaitingUserRef.current,
        freshFinalStatus: freshFinalStatusBanIdsRef.current.has(norm),
        outcome: payload?.outcome ?? null,
      });
      return blocked;
    },
    [],
  );

  const isPendingAtomicOverboardResultAwaitingDismiss = (
    source?: string,
  ): boolean => {
    const atomicId = incomingOverboardAtomicBanIdRef.current;
    if (!atomicId) return false;

    const normAtomic = normalizeId(atomicId);
    if (!normAtomic) return false;

    const held = heldUserCardOverlayRef.current;
    const heldKind = held?.kind ?? null;
    const heldResultId =
      held?.kind === 'result' ? normalizeId(held.result.id) : null;
    const resultRefId = normalizeId(resultRef.current?.id ?? '');
    const resultStateId = normalizeId(result?.id ?? '');
    const queueHead = overlayQueueRef.current[0] ?? null;
    const queueHeadKind = queueHead?.kind ?? null;
    const queueHeadResultId =
      queueHead?.kind === 'result'
        ? normalizeId(queueHead.result.id)
        : null;

    const pending =
      (heldKind === 'result' && heldResultId === normAtomic) ||
      resultRefId === normAtomic ||
      resultStateId === normAtomic ||
      (queueHeadKind === 'result' && queueHeadResultId === normAtomic);

    if (!pending && source) {
      const payload = {
        source,
        atomicId: normAtomic,
        heldKind,
        heldResultId,
        resultRefId: resultRefId || null,
        queueHeadKind,
        queueHeadResultId,
      };
      console.log('[atomic-overboard-guard-miss]', payload);
      window.__debug98log?.('[atomic-overboard-guard-miss]', payload);
    }

    return pending;
  };

  const logChainHeadSwitchTrace = (
    source: string,
    toKind: QueuedOverlay['kind'] | null,
    toBanId: string | null,
  ) => {
    const fromHead = overlayQueueRef.current[0] ?? null;
    const fromKind =
      fromHead?.kind ??
      (incomingBanRef.current
        ? 'incoming'
        : resultRef.current
          ? 'result'
          : checkBanRef.current
            ? 'check'
            : null);
    const fromBanId =
      fromHead?.kind === 'result'
        ? fromHead.result.id
        : fromHead?.kind === 'incoming' || fromHead?.kind === 'check'
          ? fromHead.ban.id
          : (incomingBanRef.current?.id ??
            resultRef.current?.id ??
            checkBanRef.current?.id ??
            null);
    const held = heldUserCardOverlayRef.current;
    const payload = {
      source,
      fromKind,
      fromBanId,
      toKind,
      toBanId,
      atomicId: incomingOverboardAtomicBanIdRef.current,
      heldKind: held?.kind ?? null,
      heldBanId: held ? heldUserCardBanId(held) : null,
      resultRefId: resultRef.current?.id ?? null,
      displayResultId: result?.id ?? null,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      notificationChainAwaitingUser: notificationChainAwaitingUserRef.current,
      chainAdvanceExplicit: chainAdvanceExplicitRef.current,
    };
    console.log('[CHAIN HEAD SWITCH TRACE]', payload);
    window.__debug98log?.('[CHAIN HEAD SWITCH TRACE]', payload);
  };

  type CheckCardHoldLifecyclePhase =
    | 'hold-created'
    | 'hold-preserved'
    | 'hold-blocked-next'
    | 'hold-cleared'
    | 'hold-still-present-after-clear'
    | 'check-re-mounted-after-answer';

  const getActiveOverlaySnapshotForHoldTrace = () => {
    if (checkBanRef.current?.id) {
      return {
        activeOverlayKind: 'check' as const,
        activeOverlayBanId: checkBanRef.current.id,
      };
    }
    if (incomingBanRef.current?.id) {
      return {
        activeOverlayKind: 'incoming' as const,
        activeOverlayBanId: incomingBanRef.current.id,
      };
    }
    if (resultRef.current?.id) {
      return {
        activeOverlayKind: 'result' as const,
        activeOverlayBanId: resultRef.current.id,
      };
    }
    return { activeOverlayKind: null, activeOverlayBanId: null };
  };

  const traceCheckCardHoldLifecycle = (
    phase: CheckCardHoldLifecyclePhase,
    opts: {
      source: string;
      reason?: string;
      banId?: string | null;
      checkBanId?: string | null;
    },
  ) => {
    const held = heldUserCardOverlayRef.current;
    const queueHead = overlayQueueRef.current[0] ?? null;
    const banNorm = normalizeId(opts.banId ?? opts.checkBanId ?? '');
    const checkBanNorm = normalizeId(
      opts.checkBanId ?? checkBanRef.current?.id ?? '',
    );
    const overlay = getActiveOverlaySnapshotForHoldTrace();
    const isCheckLifecycle =
      phase === 'check-re-mounted-after-answer' ||
      held?.kind === 'check' ||
      overlay.activeOverlayKind === 'check' ||
      queueHead?.kind === 'check' ||
      checkBanNorm.length > 0;
    if (!isCheckLifecycle) return;

    const traceBanId =
      banNorm.length > 0
        ? banNorm
        : checkBanNorm.length > 0
          ? checkBanNorm
          : '';
    logCheckCardHoldLifecycleTrace({
      phase,
      banId: banNorm || null,
      checkBanId: checkBanNorm || checkBanRef.current?.id || null,
      heldKind: held?.kind ?? null,
      heldBanId: held ? heldUserCardBanId(held) : null,
      activeOverlayKind: overlay.activeOverlayKind,
      activeOverlayBanId: overlay.activeOverlayBanId,
      activeUserCardHold:
        held && notificationChainAwaitingUserRef.current ? held.kind : null,
      reason: opts.reason ?? null,
      source: opts.source,
      answeredCheckBanIds: [...answeredCheckRef.current],
      answeredContainsBanId:
        traceBanId.length > 0
          ? answeredCheckRef.current.has(traceBanId)
          : false,
      checkAnswerInFlight: [...checkAnswerInFlightRef.current],
      checkAnswerInFlightContains:
        traceBanId.length > 0
          ? checkAnswerInFlightRef.current.has(traceBanId)
          : false,
      queueHeadKind: queueHead?.kind ?? null,
      queueHeadBanId: queueHead ? overlayItemBanId(queueHead) : null,
      pendingLen: pendingStartupInteractionsRef.current.length,
      queueLen: overlayQueueRef.current.length,
    });
  };

  const captureActiveUserCardHold = (
    kind: BlockingUserOverlayKind,
    source: string,
  ) => {
    if (isReplyComposeBlockingNotificationGuards()) return;
    const atomicBanId = incomingOverboardAtomicBanIdRef.current;
    if (atomicBanId) {
      if (kind === 'incoming') {
        logResultCardRemountBug({
          banId: atomicBanId,
          source,
          reason: 'capture-incoming-during-atomic',
        });
        return;
      }
      if (kind === 'result' && resultRef.current?.id === atomicBanId) {
        return;
      }
    }
    if (kind === 'incoming' && incomingBanRef.current?.id) {
      if (isIncomingConsumedForReplyCompose(incomingBanRef.current.id)) {
        return;
      }
      const held: HeldUserCardOverlay = {
        kind: 'incoming',
        ban: incomingBanRef.current,
      };
      heldUserCardOverlayRef.current = held;
      setHeldUserCardOverlay(held);
      notificationChainAwaitingUserRef.current = true;
      notificationChainHandoffRef.current = false;
      logActiveUserCardHold({
        kind,
        banId: held.ban.id,
        source,
      });
      logActiveUserCardHoldState({
        source,
        activeUserCardHold: kind,
        heldKind: kind,
        heldBanId: held.ban.id,
        notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
        willClear: false,
        willPreserve: true,
      });
      traceCheckCardHoldLifecycle('hold-created', {
        source,
        banId: held.ban.id,
        checkBanId: held.ban.id,
      });
      return;
    }
    if (kind === 'check' && checkBanRef.current?.id) {
      const held: HeldUserCardOverlay = {
        kind: 'check',
        ban: checkBanRef.current,
      };
      heldUserCardOverlayRef.current = held;
      setHeldUserCardOverlay(held);
      notificationChainAwaitingUserRef.current = true;
      notificationChainHandoffRef.current = false;
      logActiveUserCardHold({ kind, banId: held.ban.id, source });
      logActiveUserCardHoldState({
        source,
        activeUserCardHold: kind,
        heldKind: kind,
        heldBanId: held.ban.id,
        notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
        willClear: false,
        willPreserve: true,
      });
      traceCheckCardHoldLifecycle('hold-created', {
        source,
        banId: held.ban.id,
        checkBanId: held.ban.id,
      });
      return;
    }
    if (kind === 'result' && resultRef.current?.id) {
      const held: HeldUserCardOverlay = {
        kind: 'result',
        result: resultRef.current,
      };
      heldUserCardOverlayRef.current = held;
      setHeldUserCardOverlay(held);
      notificationChainAwaitingUserRef.current = true;
      notificationChainHandoffRef.current = false;
      const heldKey = normalizeId(held.result.id);
      if (isFinalCheckStatusOutcome(held.result.outcome)) {
        freshFinalStatusBanIdsRef.current.add(heldKey);
        resultDeliveredBanIdsRef.current.delete(heldKey);
        shownOverlayKeysRef.current.delete(`result:${heldKey}`);
        logFinalStatusHoldDecision({
          banId: heldKey,
          source,
          outcome: held.result.outcome,
          phase: 'capture-active-hold',
        });
      }
      logActiveUserCardHold({ kind, banId: held.result.id, source });
      logActiveUserCardHoldState({
        source,
        activeUserCardHold: kind,
        heldKind: kind,
        heldBanId: held.result.id,
        notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
        willClear: false,
        willPreserve: true,
      });
    }
  };

  const clearActiveUserCardHold = (source: string) => {
    if (!heldUserCardOverlayRef.current) return;
    const held = heldUserCardOverlayRef.current;
    const wasCheckHold = held.kind === 'check';
    const clearedCheckBanId = wasCheckHold ? heldUserCardBanId(held) : null;
    emitResultClearCallsite({
      source,
      reason: 'clear-active-user-card-hold',
      willClearHeld: true,
    });
    logActiveUserCardHoldState({
      source,
      activeUserCardHold: heldUserCardOverlayRef.current.kind,
      heldKind: heldUserCardOverlayRef.current.kind,
      heldBanId: heldUserCardBanId(heldUserCardOverlayRef.current),
      notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
      willClear: true,
      willPreserve: false,
    });
    heldUserCardOverlayRef.current = null;
    setHeldUserCardOverlay(null);
    notificationChainAwaitingUserRef.current = false;
    console.log('[active-user-card-hold-clear]', { source });
    if (wasCheckHold) {
      traceCheckCardHoldLifecycle('hold-cleared', {
        source,
        banId: clearedCheckBanId,
        checkBanId: clearedCheckBanId,
      });
    }
    emitResultHeldStillPresentAfterClear(source, 'clear-active-user-card-hold');
    if (wasCheckHold && heldUserCardOverlayRef.current?.kind === 'check') {
      traceCheckCardHoldLifecycle('hold-still-present-after-clear', {
        source,
        reason: 'clear-active-user-card-hold',
        banId: clearedCheckBanId,
        checkBanId: clearedCheckBanId,
      });
    }
  };

  const clearStaleUserCardHoldForNextHead = (
    nextHead: QueuedOverlay | null,
    source: string,
  ) => {
    const held = heldUserCardOverlayRef.current;
    if (!held || !nextHead) return;

    const heldBanId = normalizeId(heldUserCardBanId(held));
    const nextBanId =
      nextHead.kind === 'result'
        ? normalizeId(nextHead.result.id)
        : normalizeId(nextHead.ban.id);
    if (!heldBanId || !nextBanId) return;
    if (held.kind === nextHead.kind && heldBanId === nextBanId) return;

    const heldKindBefore = held.kind;
    clearActiveUserCardHold('show-next-head-mismatch');
    const logPayload = {
      source,
      heldKind: heldKindBefore,
      heldBanId,
      nextKind: nextHead.kind,
      nextBanId,
    };
    console.log('[ACTIVE USER CARD HOLD CLEARED HEAD MISMATCH]', logPayload);
    window.__debug98log?.(
      '[ACTIVE USER CARD HOLD CLEARED HEAD MISMATCH]',
      logPayload,
    );

    if (heldKindBefore === 'incoming') {
      const incomingId = incomingBanRef.current?.id;
      if (
        !incomingId ||
        !blockClearActiveIncomingOverlayBan(
          incomingId,
          `${source}-show-next-head-mismatch`,
        )
      ) {
        incomingBanRef.current = null;
        setIncomingBan(null);
      }
    } else if (heldKindBefore === 'check') {
      checkBanRef.current = null;
      setCheckBan(null);
    }
  };

  const emitResultClearCallsite = useCallback(
    (params: {
      source: string;
      reason: string;
      resultIdBefore?: string | null;
      willClearResult?: boolean;
      willClearHeld?: boolean;
      willPruneQueue?: boolean;
    }) => {
      const queueHead = overlayQueueRef.current[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      logResultClearCallsite({
        source: params.source,
        reason: params.reason,
        resultIdBefore:
          params.resultIdBefore ?? result?.id ?? resultRef.current?.id ?? null,
        heldKindBefore: held?.kind ?? null,
        heldResultIdBefore:
          held?.kind === 'result' ? held.result.id : null,
        queueHeadKindBefore: queueHead?.kind ?? null,
        queueHeadBanIdBefore:
          queueHead?.kind === 'result'
            ? queueHead.result.id
            : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
              ? queueHead.ban.id
              : null,
        activeOverlayKind:
          held?.kind ??
          queueHead?.kind ??
          (resultRef.current ? 'result' : null),
        notificationQueueLocked: isNotificationQueueLocked(),
        notificationChainAwaitingUser:
          notificationChainAwaitingUserRef.current,
        willClearResult: params.willClearResult ?? false,
        willClearHeld: params.willClearHeld ?? false,
        willPruneQueue: params.willPruneQueue ?? false,
      });
    },
    [result?.id],
  );

  const emitResultHeldStillPresentAfterClear = useCallback(
    (source: string, reason: string) => {
      const queueHead = overlayQueueRef.current[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      const resultIdAfter = result?.id ?? null;
      const resultRefIdAfter = resultRef.current?.id ?? null;
      logResultHeldStillPresentAfterClear({
        source,
        reason,
        resultIdAfter,
        resultRefIdAfter,
        heldKindAfter: held?.kind ?? null,
        heldResultIdAfter:
          held?.kind === 'result' ? held.result.id : null,
        queueHeadKindAfter: queueHead?.kind ?? null,
        queueHeadBanIdAfter:
          queueHead?.kind === 'result'
            ? queueHead.result.id
            : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
              ? queueHead.ban.id
              : null,
        resultStateStillPresent:
          resultIdAfter != null || resultRefIdAfter != null,
        heldStillPresent: held != null,
        queueHeadResultStillPresent: queueHead?.kind === 'result',
      });
      if (held?.kind === 'check') {
        traceCheckCardHoldLifecycle('hold-still-present-after-clear', {
          source,
          reason,
          banId: heldUserCardBanId(held),
          checkBanId: heldUserCardBanId(held),
        });
      }
    },
    [result?.id],
  );

  const emitResultAutoClearDecision = useCallback(
    (params: {
      banId: string | null;
      reason: string;
      refMismatch: boolean;
      willClear: boolean;
    }) => {
      const queueHead = overlayQueueRef.current[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      logResultAutoClearDecision({
        currentResultId: result?.id ?? null,
        resultRefId: resultRef.current?.id ?? null,
        heldResultId:
          held?.kind === 'result' ? held.result.id : null,
        queueHeadId:
          queueHead?.kind === 'result' ? queueHead.result.id : null,
        activeOverlayKind:
          held?.kind ?? queueHead?.kind ?? (resultRef.current ? 'result' : null),
        activeOverlayBanId: params.banId,
        reason: params.reason,
        refMismatch: params.refMismatch,
        willClear: params.willClear,
      });
    },
    [result?.id],
  );

  const getConfirmHoldDebugSnapshot = useCallback((): ConfirmHoldDebugSnapshot => {
    const held = heldUserCardOverlayRef.current;
    const lock = readOverlayInputLockFields();
    return {
      activeUserCardHold: held?.kind ?? null,
      activeUserCardHoldBanId: held
        ? heldUserCardBanId(held)
        : null,
      notificationChainAwaitingUser: notificationChainAwaitingUserRef.current,
      overlayInputLocked: lock.overlayInputLocked,
      overlayInputLockSource: lock.overlayInputLockSource,
    };
  }, []);

  const buildIncomingReplyCleanupSnapshot = useCallback(
    (extra?: Record<string, unknown>) => {
      const held = heldUserCardOverlayRef.current;
      const lock = readOverlayInputLockFields();
      return {
        activeUserCardHold: held?.kind ?? null,
        activeUserCardHoldBanId: held
          ? heldUserCardBanId(held)
          : null,
        incomingBanId: incomingBanRef.current?.id ?? null,
        checkBanId: checkBanRef.current?.id ?? null,
        overlayQueueLen: overlayQueueRef.current.length,
        notificationChainAwaitingUser: notificationChainAwaitingUserRef.current,
        notificationChainTransitioning: notificationChainTransitioningRef.current,
        replyComposeActive: replyComposeActiveRef.current,
        overlayInputLocked: lock.overlayInputLocked,
        overlayInputLockSource: lock.overlayInputLockSource,
        ...extra,
      };
    },
    [],
  );

  const getConfirmOrbQueueDebugSnapshot =
    useCallback((): ConfirmOrbQueueDebugSnapshot => {
      const selectedNext = getPostSuccessHandoffSelectedNext();
      return {
        pendingLen: pendingStartupInteractionsRef.current.length,
        queueLen: overlayQueueRef.current.length,
        selectedNextKind: selectedNext?.kind ?? null,
        selectedNextBanId: selectedNext?.banId ?? null,
        isPostSuccessHandoffInProgress: isPostSuccessHandoffInProgress(),
        postSuccessHandoffTraceId: getPostSuccessHandoffTraceId(),
        sendComposePhase: sendComposePhaseRef.current,
        replyComposeActive: replyComposeActiveRef.current,
        notificationChainTransitioning:
          notificationChainTransitioningRef.current,
        notificationChainReplyComposeActive:
          notificationChainReplyComposeActiveRef.current,
        chainReplyParentBanId: chainReplyParentBanIdRef.current,
        incomingBanId: incomingBanRef.current?.id ?? null,
        heldUserCardKind: heldUserCardOverlayRef.current?.kind ?? null,
        notificationChainHandoff: notificationChainHandoffRef.current,
        notificationChainAwaitingUser:
          notificationChainAwaitingUserRef.current,
      };
    }, []);

  const restoreHeldUserCardOverlay = (source: string): boolean => {
    const held = heldUserCardOverlayRef.current;
    if (
      held?.kind === 'incoming' &&
      isIncomingConsumedForReplyCompose(heldUserCardBanId(held))
    ) {
      return false;
    }
    if (
      held?.kind === 'incoming' &&
      incomingOverboardAtomicBanIdRef.current === heldUserCardBanId(held)
    ) {
      logResultCardRemountBug({
        banId: heldUserCardBanId(held),
        source,
        reason: 'restore-incoming-during-atomic',
      });
      return false;
    }
    if (isReplyComposeBlockingNotificationGuards()) {
      return false;
    }
    if (!held || !notificationChainAwaitingUserRef.current) {
      const mounted = getActiveMountedUserCard();
      if (mounted) {
        logActiveUserCardLostBug({
          activeKind: mounted.kind,
          activeBanId: mounted.banId,
          source,
          reason: 'hold-missing',
        });
      }
      return false;
    }
    const banId = heldUserCardBanId(held);
    logActiveUserCardHoldState({
      source,
      activeUserCardHold: held.kind,
      heldKind: held.kind,
      heldBanId: banId,
      notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
      willClear: false,
      willPreserve: true,
    });
    logActiveUserCardPreserveCurrent({ kind: held.kind, banId, source });
    if (held.kind === 'check') {
      traceCheckCardHoldLifecycle('hold-preserved', {
        source,
        banId,
        checkBanId: banId,
      });
    }
    if (held.kind === 'incoming') {
      incomingBanRef.current = held.ban;
      setIncomingBan(held.ban);
      checkBanRef.current = null;
      setCheckBan(null);
    } else if (held.kind === 'check') {
      checkBanRef.current = held.ban;
      setCheckBan(held.ban);
      if (
        !blockClearActiveIncomingOverlayBan(
          incomingBanRef.current?.id,
          `restoreHeldUserCardOverlay:${source}`,
        )
      ) {
        incomingBanRef.current = null;
        setIncomingBan(null);
      }
    } else {
      if (resultRef.current?.id === held.result.id) {
        if (incomingOverboardAtomicBanIdRef.current === banId) {
          logResultCardPreserveDomOk({ banId, source });
        }
        resultOpenRef.current = true;
        return true;
      }
      resultRef.current = held.result;
      setResult(held.result);
      resultOpenRef.current = true;
      if (
        !blockClearActiveIncomingOverlayBan(
          incomingBanRef.current?.id,
          `restoreHeldUserCardOverlay-result:${source}`,
        )
      ) {
        incomingBanRef.current = null;
        setIncomingBan(null);
      }
      checkBanRef.current = null;
      setCheckBan(null);
    }
    if (
      !notificationChainTransitioningRef.current &&
      incomingOverboardAtomicBanIdRef.current !== banId
    ) {
      setNotificationChainTransitioning(true);
    }
    return true;
  };

  const blockAndPreserveActiveUserCard = (
    source: string,
    nextHead: QueuedOverlay | null,
    opts?: { explicitUserAction?: boolean },
  ): boolean => {
    if (isReplyComposeBlockingNotificationGuards()) {
      return false;
    }
    const held = heldUserCardOverlayRef.current;
    const active =
      held != null && notificationChainAwaitingUserRef.current
        ? { kind: held.kind, banId: heldUserCardBanId(held) }
        : getActiveMountedUserCard();
    const explicit = opts?.explicitUserAction ?? false;
    const blockReplace =
      nextHead != null &&
      blockOverlayReplaceWithoutUserAction(source, nextHead, opts);
    const blockClear =
      (nextHead == null ||
        (active &&
          nextHead &&
          overlayItemBanId(nextHead) !== active.banId)) &&
      shouldBlockOverlayClearWhileUserCardHeld(active, {
        explicitUserAction: explicit,
      });
    if (!blockReplace && !blockClear) return false;
    const atomicBanId = incomingOverboardAtomicBanIdRef.current;
    if (
      atomicBanId &&
      held?.kind === 'result' &&
      heldUserCardBanId(held) === atomicBanId &&
      notificationChainAwaitingUserRef.current
    ) {
      logResultCardPreserveDomOk({ banId: atomicBanId, source });
      return true;
    }
    if (blockReplace) {
      const nextKind = nextHead?.kind ?? null;
      const nextBanId = nextHead ? overlayItemBanId(nextHead) : null;
      logActiveUserCardBlockedNextButKeptCurrent({
        activeKind: active?.kind ?? null,
        activeBanId: active?.banId ?? null,
        nextKind,
        nextBanId,
        source,
      });
      if (active?.kind === 'check' || held?.kind === 'check') {
        traceCheckCardHoldLifecycle('hold-blocked-next', {
          source,
          reason: 'block-replace',
          banId: active?.banId ?? (held ? heldUserCardBanId(held) : null),
          checkBanId: active?.banId ?? (held ? heldUserCardBanId(held) : null),
        });
      }
    } else {
      logActiveUserCardPreventOverlayClear({
        activeKind: active?.kind ?? null,
        activeBanId: active?.banId ?? null,
        source,
      });
    }
    restoreHeldUserCardOverlay(source);
    return true;
  };

  const isSuccessCardMounted = () => sendSuccessCardActiveRef.current;

  const isActiveTimerOverlayMounted = () =>
    activeBanCardVisibleRef.current ||
    replyParentActivePriorityActiveRef.current;

  const setSendSuccessCardMounted = useCallback(
    (
      mounted: boolean,
      opts?: { banId?: string | null; source?: string },
    ) => {
      sendSuccessCardActiveRef.current = mounted;
      setSendSuccessCardActiveState(mounted);
      if (mounted) {
        if (opts?.banId != null) {
          const bid = opts.banId.trim();
          if (bid) sendSuccessCardBanIdRef.current = bid;
        }
        console.log('[success-card-mounted]', {
          banId: sendSuccessCardBanIdRef.current,
          source: opts?.source ?? null,
        });
        logSuccessCardMountedDebug({
          banId: sendSuccessCardBanIdRef.current,
          source: opts?.source ?? null,
          sessionId: getSendSuccessCardSessionId(),
        });
        return;
      }
      traceSuccessHide(opts?.source ?? 'setSendSuccessCardMounted-false', {
        banId: sendSuccessCardBanIdRef.current,
      });
      traceSuccessCardUnmounted({
        source: opts?.source ?? 'setSendSuccessCardMounted-false',
        banId: sendSuccessCardBanIdRef.current,
      });
      const banId = sendSuccessCardBanIdRef.current;
      if (opts?.source === 'user-close') {
        console.log('[success-card-user-close]', { banId });
      }
      sendSuccessCardBanIdRef.current = null;
      console.log('[success-exit-cleanup-state]', {
        successMounted: false,
        composeActive: whatOrConfirmActiveRef.current,
        sendComposeActive: sendComposeActiveRef.current,
        queueLen: overlayQueueRef.current.length,
        startupLen: pendingStartupInteractionsRef.current.length,
        source: opts?.source ?? null,
      });
    },
    [],
  );

  const logSuccessCardBlocksNotification = (
    source: string,
    attemptedKind: QueuedOverlay['kind'] | null,
    attemptedBanId: string | null,
  ) => {
    console.log('[success-card-blocks-notification]', {
      attemptedKind,
      attemptedBanId,
      source,
    });
    console.log('[notification-flush-blocked]', {
      reason: 'success-card-mounted',
      source,
    });
    if (attemptedKind === 'check') {
      console.log('[check-overlay-deferred]', {
        banId: attemptedBanId,
        reason: 'success-card-mounted',
      });
      console.log('[chain-auto-advance-bug]', {
        activeKind: 'success',
        attemptedKind: 'check',
        attemptedBanId,
        source,
      });
    }
  };

  const blocksMountedNotificationOverlay = (
    source: string,
    attemptedKind: QueuedOverlay['kind'] | null,
    attemptedBanId: string | null,
  ): boolean => {
    if (isSuccessCardMounted()) {
      logSuccessCardBlocksNotification(source, attemptedKind, attemptedBanId);
      return true;
    }
    if (isActiveTimerOverlayMounted()) {
      logActiveTimerBlocksNotification(source, attemptedKind, attemptedBanId);
      return true;
    }
    if (isSendComposeFlowActive()) {
      logNotificationDisplayBlockedDuringComposeGuard(
        source,
        attemptedKind,
      );
      console.log('[compose-flow-notification-blocked]', {
        source,
        kind: attemptedKind,
        banId: attemptedBanId,
      });
      console.log('[notification-overlay-suppressed-on-compose]', {
        source,
        phase: sendComposePhaseRef.current,
      });
      return true;
    }
    return false;
  };

  const getActiveTimerBanId = () =>
    acceptedParentBanAfterReplyRef.current?.trim() ??
    activeBanDeepLinkBanIdRef.current?.trim() ??
    null;

  const logActiveTimerBlocksNotification = (
    source: string,
    attemptedKind: QueuedOverlay['kind'] | null,
    attemptedBanId: string | null,
  ) => {
    console.log('[active-timer-blocks-notification]', {
      activeBanId: getActiveTimerBanId(),
      attemptedKind,
      attemptedBanId,
      source,
    });
    console.log('[notification-flush-blocked]', {
      reason: 'active-timer-mounted',
      source,
    });
    if (attemptedKind === 'check') {
      console.log('[chain-auto-advance-bug]', {
        activeKind: 'active-timer',
        attemptedKind: 'check',
        attemptedBanId,
        source,
      });
    }
  };

  const deferNotificationToPendingStartup = (item: QueuedOverlay) => {
    pendingStartupInteractionsRef.current = mergeStartupPendingChain(
      pendingStartupInteractionsRef.current,
      [item],
    );
    syncPendingStartupCount();
    primeLobbyBansAttentionHintSyncRef.current('defer-pending-startup');
  };

  const deferResultWhileSuccessCardMounted = (
    source: string,
    item?: QueuedOverlay,
  ): boolean => {
    if (!isSuccessCardMounted()) return false;
    const banId =
      item?.kind === 'result'
        ? item.result.id
        : item?.kind === 'incoming' || item?.kind === 'check'
          ? item.ban.id
          : null;
    if (item) {
      blocksMountedNotificationOverlay(source, item.kind, banId);
      deferNotificationToPendingStartup(item);
    } else {
      logSuccessCardBlocksNotification(source, 'result', banId);
    }
    window.__debug98log?.('[SUCCESS CARD BLOCKS RESULT]', {
      source,
      banId,
      kind: item?.kind ?? 'result',
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
    });
    return true;
  };

  const shouldBlockActiveCheckOverlayAutoClose = (
    source: string,
    reason: string,
  ): boolean => {
    const banId = checkBanRef.current?.id?.trim() ?? '';
    if (!banId || isUserAllowedCheckOverlayCloseReason(reason)) return false;
    if (!isActiveCheckOverlayMounted()) return false;
    console.log('[check-overlay-auto-close-attempt]', { banId, source, reason });
    console.log('[check-overlay-close-blocked]', {
      banId,
      reason: 'no-user-action',
    });
    console.log('[chain-auto-advance-bug]', {
      activeKind: 'check',
      banId,
      source,
      autoCloseReason: reason,
    });
    return true;
  };

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
    emitResultAutoClearDecision({
      banId: result?.id ?? null,
      reason: 'suppress-queued-display',
      refMismatch: false,
      willClear: true,
    });
    emitResultClearCallsite({
      source: 'suppressQueuedOverlayDisplay',
      reason: 'suppress-queued-display',
      willClearResult: true,
    });
    const gateBefore = snapshotDirectOverboardGate();
    clearDirectOverboardLayerRefs();
    setResult(null);
    setDirectResultOverlayActive(false);
    emitResultHeldStillPresentAfterClear(
      'suppressQueuedOverlayDisplay',
      'suppress-queued-display',
    );
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
  }, [clearDirectOverboardLayerRefs, emitResultAutoClearDecision, emitResultClearCallsite, emitResultHeldStillPresentAfterClear, result?.id, snapshotDirectOverboardGate]);

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
        replyDeeplinkParentBanIdRef.current = action.banId;
        const viewerId = userIdRef.current ?? auth.user?.id ?? null;
        replyDeeplinkRepeatEntryRef.current = Boolean(
          viewerId &&
            getReplyDeeplinkActionResult(viewerId, action.banId),
        );
        if (action.preview?.text?.trim()) {
          replyStartParamPreviewRawRef.current = action.preview;
          syncReplyStartParamPreview(viewerId);
        }
      }
      if (action?.type === 'check') {
        if (checkDeeplinkCompletedRouteBanIdRef.current === action.banId) {
          logCheckDeeplinkResumeSkip({
            banId: action.banId,
            reason: 'completed-route',
            source: 'start-param-layout',
          });
          return;
        }
        checkDeeplinkPendingBanIdRef.current = action.banId;
        checkDeepLinkBanIdRef.current = action.banId;
        setCheckDeepLinkBanId(action.banId);
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
        setStartupGraceActive(false);
        logCheckDeeplinkStart({
          payload: buildStartParam(action),
          banId: action.banId,
        });
        logCheckDeeplinkPayloadParsed({ banId: action.banId });
        logCheckDeeplinkLobbySuppressed({ banId: action.banId, source: 'payload-parsed' });
      }
    } else {
      const action = parseStartParam(readPriorityStartParamRaw() ?? undefined);
      if (action?.type === 'reply') {
        replyDeeplinkPendingBanIdRef.current = action.banId;
        replyDeeplinkParentBanIdRef.current = action.banId;
        const viewerId = userIdRef.current ?? auth.user?.id ?? null;
        replyDeeplinkRepeatEntryRef.current = Boolean(
          viewerId &&
            getReplyDeeplinkActionResult(viewerId, action.banId),
        );
        if (action.preview?.text?.trim()) {
          replyStartParamPreviewRawRef.current = action.preview;
          syncReplyStartParamPreview(viewerId);
        }
      }
      if (action?.type === 'check') {
        if (checkDeeplinkCompletedRouteBanIdRef.current === action.banId) {
          logCheckDeeplinkResumeSkip({
            banId: action.banId,
            reason: 'completed-route',
            source: 'start-param-layout',
          });
          return;
        }
        checkDeeplinkPendingBanIdRef.current = action.banId;
        checkDeepLinkBanIdRef.current = action.banId;
        setCheckDeepLinkBanId(action.banId);
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
        setStartupGraceActive(false);
        logCheckDeeplinkStart({
          payload: buildStartParam(action),
          banId: action.banId,
        });
        logCheckDeeplinkPayloadParsed({ banId: action.banId });
        logCheckDeeplinkLobbySuppressed({ banId: action.banId, source: 'payload-parsed' });
      }
    }
  }, [armActiveBanDeepLinkEarly, auth.user?.id]);

  useEffect(() => {
    if (auth.loading || !auth.user?.id) return;
    const banId = replyDeeplinkPendingBanIdRef.current?.trim();
    if (!banId) return;
    replyDeeplinkRepeatEntryRef.current = Boolean(
      getReplyDeeplinkActionResult(auth.user.id, banId),
    );
  }, [auth.user?.id, auth.loading]);

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

  const setNotificationChainTransitioning = useCallback((active: boolean) => {
    if (notificationChainTransitioningRef.current === active) return;
    notificationChainTransitioningRef.current = active;
    setNotificationChainTransitioningState(active);
    if (active) {
      setLobbyOpen(false);
      lobbyOpenRef.current = false;
    }
  }, []);

  const clearNotificationOverlayForEmptyQueueAfterSuccessExit = useCallback(
    (source: string): boolean => {
      const queueLen = overlayQueueRef.current.length;
      const startupLen = pendingStartupInteractionsRef.current.length;
      if (queueLen > 0 || startupLen > 0) {
        return false;
      }

      logSuccessExitEmptyQueueClearOverlay({ source, queueLen, startupLen });
      clearActiveUserCardHold(`success-exit-empty-queue:${source}`);
      setChainAdvanceWaiting(false);
      chainAdvanceExplicitRef.current = false;
      setNotificationChainTransitioning(false);
      notificationChainHandoffRef.current = false;
      notificationChainAwaitingUserRef.current = false;
      return true;
    },
    [setChainAdvanceWaiting, setNotificationChainTransitioning],
  );

  const syncPendingStartupCount = useCallback(() => {
    const pendingLen = pendingStartupInteractionsRef.current.length;
    const queueLen = overlayQueueRef.current.length;
    setPendingStartupInteractionsCount(pendingLen);
    const uid = userIdRef.current?.trim() ?? '';
    if (!uid) return;
    const total = pendingLen + queueLen;
    if (total > 0) {
      noteLastBansIndicatorReason('syncPendingStartupCount');
      persistLobbyNotificationAttentionHint(uid, total);
      setLobbyBansAttentionHint(total);
    } else if (sessionBootstrappedRef.current) {
      clearLobbyNotificationAttentionHint(uid);
      setLobbyBansAttentionHint(0);
    }
  }, []);

  const logTransitionFromRefs = (
    event: string,
    extra?: Record<string, unknown>,
  ) => {
    logOverlayTransition(event, {
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      hasResult: resultRef.current != null,
      activeKind: resultRef.current
        ? 'result'
        : incomingBanRef.current
          ? 'incoming'
          : checkBanRef.current
            ? 'check'
            : null,
      ...extra,
    });
  };

  const logCardCloseClick = useCallback(
    (opts: {
      kind: 'incoming' | 'check' | 'result';
      banId: string | null;
      source: string;
    }) => {
      logTransitionFromRefs('[CARD CLOSE CLICK]', opts);
    },
    [],
  );

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

  const shouldDeferNotificationOverlayDisplay = (source: string): boolean => {
    if (!startupInteractionsHoldRef.current) return false;
    if (chainAdvanceExplicitRef.current) return false;
    if (isExplicitNotificationDrainSource(source)) return false;
    return true;
  };

  const isResultNotificationPayloadReady = useCallback(
    (row: BanResult | null | undefined): boolean => {
      if (!row?.id?.trim()) return false;
      if (!row.outcome) return false;
      return true;
    },
    [],
  );

  const holdResultForActiveNotificationChain = useCallback(
    (banId: string, source: string, resultPayload?: BanResult | null) => {
      const key = normalizeId(banId);
      if (!key) return;
      const held = heldUserCardOverlayRef.current;
      const marksFreshOverboard = [
        'incoming-overboard-atomic',
        'replaceIncomingWithOverboardResultAtomic',
        'openIncomingOverboardOptimistic',
        'syncDisplayFromQueue-atomic-hold',
        'syncDisplayFromQueue-blocked-atomic',
        'syncDisplayFromQueue-blocked-fresh-overboard',
        'forceOpenOverboardResult',
        'overboard-action',
        'preserveAtomicOverboard',
      ].some((marker) => source.includes(marker));
      if (marksFreshOverboard) {
        freshOverboardActionBanIdsRef.current.add(key);
      }
      const payload =
        resultPayload ??
        (held?.kind === 'result' && normalizeId(held.result.id) === key
          ? held.result
          : null) ??
        (normalizeId(resultRef.current?.id ?? '') === key
          ? resultRef.current
          : null);
      if (payload && isFinalCheckStatusOutcome(payload.outcome)) {
        freshFinalStatusBanIdsRef.current.add(key);
        logFinalStatusHoldDecision({
          banId: key,
          source,
          outcome: payload.outcome,
          awaitingUser: notificationChainAwaitingUserRef.current,
        });
      }
      resultCtaConsumedBanIdsRef.current.delete(key);
      resultDeliveredBanIdsRef.current.delete(key);
      shownOverlayKeysRef.current.delete(`result:${key}`);
      logResultCardStableHold({ banId: key, source });
    },
    [],
  );

  const isInteractiveOverboardResultBanId = (norm: string): boolean => {
    if (!norm) return false;
    if (incomingOverboardAtomicBanIdRef.current === norm) return true;
    if (freshOverboardActionBanIdsRef.current.has(norm)) return true;
    if (overboardInFlightRef.current === norm) return true;
    const held = heldUserCardOverlayRef.current;
    if (
      held?.kind === 'result' &&
      normalizeId(held.result.id) === norm &&
      notificationChainAwaitingUserRef.current
    ) {
      return true;
    }
    return false;
  };

  const buildPassiveResultGateContext = (
    banId: string | null | undefined,
  ): Parameters<typeof shouldBlockPassiveResultOverlayOpen>[1] => {
    const norm = normalizeId(banId ?? '');
    return {
      lobbyOpen: lobbyOpenRef.current,
      bansReturnToLobbyLatch: bansReturnToLobbyLatchRef.current,
      freshOverboardAction:
        norm.length > 0 && freshOverboardActionBanIdsRef.current.has(norm),
      atomicOverboardHold:
        norm.length > 0 &&
        incomingOverboardAtomicBanIdRef.current === norm &&
        notificationChainAwaitingUserRef.current,
      chainAdvanceExplicit: chainAdvanceExplicitRef.current,
      notificationChainAwaitingUser:
        notificationChainAwaitingUserRef.current,
      resultAlreadyMountedForBan:
        norm.length > 0 &&
        resultOpenRef.current &&
        normalizeId(resultRef.current?.id ?? '') === norm,
      directOverboardInFlight:
        norm.length > 0 && overboardInFlightRef.current === norm,
      interactiveResultBan: isInteractiveOverboardResultBanId(norm),
    };
  };

  const shouldBlockPassiveResultOverlayOpenForBan = (
    source: string,
    banId: string | null | undefined,
  ): boolean =>
    shouldBlockPassiveResultOverlayOpen(
      source,
      buildPassiveResultGateContext(banId),
    );

  const deferPassiveResultQueueHeadOnLobby = (
    source: string,
    _queue: QueuedOverlay[],
    active: Extract<QueuedOverlay, { kind: 'result' }>,
  ): boolean => {
    const gateCtx = buildPassiveResultGateContext(active.result.id);
    if (isInteractiveOverboardResultContext(gateCtx)) return false;
    if (!shouldBlockPassiveResultLookaheadDisplay(source, gateCtx)) {
      return false;
    }
    const held = heldUserCardOverlayRef.current;
    logPassiveResultLookaheadBlocked({
      source,
      banId: active.result.id,
      lobbyOpen: lobbyOpenRef.current,
      activeDrain:
        chainAdvanceExplicitRef.current ||
        notificationChainTransitioningRef.current,
      activeKind: held?.kind ?? null,
    });
    primeLobbyBansAttentionHintSyncRef.current(
      'passive-result-lookahead-blocked',
    );
    pendingStartupInteractionsRef.current = mergeStartupPendingSingle(
      pendingStartupInteractionsRef.current,
      active,
    );
    syncPendingStartupCount();
    resultOpenRef.current = false;
    if (
      normalizeId(resultRef.current?.id ?? '') ===
      normalizeId(active.result.id)
    ) {
      setResult(null);
    }
    setDirectResultOverlayActive(false);
    if (
      held?.kind === 'result' &&
      normalizeId(held.result.id) === normalizeId(active.result.id)
    ) {
      clearActiveUserCardHold('passive-result-lookahead-blocked');
    }
    return true;
  };

  const syncDisplayFromQueue = useCallback((queue: QueuedOverlay[]) => {
    const traceSyncDisplayBlocked = (blockReason: string) => {
      traceChainPlaceholderStuckRef.current(
        'sync-display-blocked',
        'syncDisplayFromQueue',
        blockReason,
        {
          queueLen: queue.length,
          headKind: queue[0]?.kind ?? null,
        },
      );
    };
    const headAtEnter = queue[0] ?? null;
    if (headAtEnter?.kind === 'incoming') {
      logChainHeadSwitchTrace(
        'syncDisplayFromQueue:enter',
        'incoming',
        headAtEnter.ban.id,
      );
    }
    if (isDeeplinkSingleCardModeActive()) {
      const cardMode = getDeeplinkSingleCardMode();
      const head = queue[0] ?? null;
      if (cardMode && head) {
        const headBanId =
          head.kind === 'result' ? head.result.id : head.ban.id;
        if (normalizeId(headBanId) !== cardMode.banId) {
          logSyncDisplayBlockedSingleCard({
            source: 'syncDisplayFromQueue',
            modeKind: cardMode.kind,
            modeBanId: cardMode.banId,
            headKind: head.kind,
            headBanId,
            queueLen: queue.length,
          });
          traceSyncDisplayBlocked('deeplink-single-card-mode');
          return;
        }
      }
    }
    if (preserveAtomicOverboardResultDuringSync('syncDisplayFromQueue')) {
      traceSyncDisplayBlocked('preserve-atomic-overboard');
      return;
    }
    if (
      startupInteractionsHoldRef.current &&
      !chainAdvanceExplicitRef.current &&
      queue.length > 0
    ) {
      logSyncDisplayBlockedStartupHold({
        source: 'syncDisplayFromQueue',
        queueLen: queue.length,
        headKind: queue[0]?.kind ?? null,
        headBanId:
          queue[0]?.kind === 'result'
            ? queue[0].result.id
            : queue[0]?.kind === 'incoming' || queue[0]?.kind === 'check'
              ? queue[0].ban.id
              : null,
        startupHold: true,
      });
      logLobbyIndicatorPrefetchNoOverlay({
        source: 'syncDisplayFromQueue',
        queueLen: queue.length,
        headKind: queue[0]?.kind ?? null,
        startupHold: true,
      });
      traceSyncDisplayBlocked('startup-interactions-hold');
      return;
    }
    for (const priorityBanId of [...resultPriorityBanIdsRef.current]) {
      const norm = normalizeId(priorityBanId);
      if (!norm) continue;
      const resultItem = queue.find(
        (q) => q.kind === 'result' && normalizeId(overlayBanId(q)) === norm,
      );
      if (
        resultItem &&
        (queue[0]?.kind !== 'result' ||
          normalizeId(overlayBanId(queue[0])) !== norm)
      ) {
        const nextQueue = buildResultPriorityQueue(queue, norm, resultItem);
        const prevHead = queue[0];
        const nextHead = nextQueue[0];
        if (
          prevHead &&
          nextHead &&
          overlayQueueKey(nextHead) !== overlayQueueKey(prevHead) &&
          blockAndPreserveActiveUserCard(
            'syncDisplayFromQueue-result-priority',
            nextHead,
            { explicitUserAction: chainAdvanceExplicitRef.current },
          )
        ) {
          return;
        }
        if (
          prevHead &&
          nextHead &&
          overlayQueueKey(nextHead) !== overlayQueueKey(prevHead)
        ) {
          logResultPollDropStaleCheck({
            banId: norm,
            source: 'syncDisplayFromQueue',
          });
          overlayQueueRef.current = nextQueue;
          setOverlayQueue(nextQueue);
          queue = nextQueue;
        }
        break;
      }
      if (
        !resultItem &&
        queue[0]?.kind === 'check' &&
        normalizeId(queue[0].ban.id) === norm
      ) {
        const nextQueue = removeOverlaysForBan(queue, norm, [
          'check',
          'incoming',
        ]);
        logResultPollDropStaleCheck({
          banId: norm,
          source: 'sync-priority-suppress-check',
        });
        overlayQueueRef.current = nextQueue;
        setOverlayQueue(nextQueue);
        queue = nextQueue;
        break;
      }
    }

    const active = queue[0] ?? null;
    const headKind = active?.kind ?? null;
    const headBanId =
      active?.kind === 'result'
        ? active.result.id
        : active?.kind === 'incoming' || active?.kind === 'check'
          ? active.ban.id
          : null;
    if (isActiveUserCardHold()) {
      const held = heldUserCardOverlayRef.current;
      const heldBanId = held ? heldUserCardBanId(held) : null;
      const headDiverges =
        !active ||
        !held ||
        active.kind !== held.kind ||
        normalizeId(headBanId) !== normalizeId(heldBanId);
      if (
        headDiverges &&
        blockAndPreserveActiveUserCard('syncDisplayFromQueue-early-hold', active, {
          explicitUserAction: chainAdvanceExplicitRef.current,
        })
      ) {
        traceSyncDisplayBlocked('active-user-card-hold-early');
        return;
      }
    }
    console.log('[queue-head-selection]', {
      headKind,
      headBanId,
      queueLen: queue.length,
    });
    console.log('[queue-head-kind]', { headKind });
    if (
      active &&
      isSuccessCardMounted() &&
      (active.kind === 'result' ||
        active.kind === 'incoming' ||
        active.kind === 'check')
    ) {
      deferResultWhileSuccessCardMounted(
        'syncDisplayFromQueue-early',
        active,
      );
      traceSyncDisplayBlocked('success-card-mounted-defer');
      return;
    }
    if (isSendComposeFlowActive() && active) {
      const banId =
        active.kind === 'result' ? active.result.id : active.ban.id;
      logNotificationDisplayBlockedDuringComposeGuard(
        'syncDisplayFromQueue',
        active.kind,
      );
      console.log('[sync-display-blocked-compose]', {
        kind: active.kind,
        banId,
      });
      console.log('[notification-overlay-suppressed-on-compose]', {
        source: 'syncDisplayFromQueue',
        phase: sendComposePhaseRef.current,
      });
      console.log('[notification-queue-deferred-until-compose-exit]', {
        queueLen: queue.length,
        headKind: active.kind,
        headBanId: banId,
      });
      traceSyncDisplayBlocked('compose-flow-active');
      return;
    }
    if (
      active &&
      blocksMountedNotificationOverlay(
        'syncDisplayFromQueue',
        active.kind,
        active.kind === 'result' ? active.result.id : active.ban.id,
      )
    ) {
      if (
        !blockClearActiveIncomingOverlayBan(
          incomingBanRef.current?.id,
          'syncDisplayFromQueue-blocked',
        )
      ) {
        const stable = resolveStableIncomingForQueueHead(active);
        if (stable) {
          incomingBanRef.current = stable;
          setIncomingBan(stable);
        } else {
          incomingBanRef.current = null;
          setIncomingBan(null);
        }
      }
      checkBanRef.current = null;
      setCheckBan(null);
      traceSyncDisplayBlocked('blocks-mounted-notification-overlay');
      return;
    }
    if (
      active &&
      blockAndPreserveActiveUserCard('syncDisplayFromQueue', active, {
        explicitUserAction: chainAdvanceExplicitRef.current,
      })
    ) {
      traceSyncDisplayBlocked('active-user-card-hold');
      return;
    }
    if (isActiveUserCardHold() && !active) {
      restoreHeldUserCardOverlay('syncDisplayFromQueue-empty-queue-head');
      return;
    }
    if (
      (notificationChainReplyComposeActiveRef.current ||
        replyComposeActiveRef.current ||
        chainReplyParentBanIdRef.current) &&
      active
    ) {
      const composeParentId =
        chainReplyParentBanIdRef.current?.trim() ??
        replyDeeplinkParentBanIdRef.current?.trim() ??
        '';
      const activeBanId =
        active.kind === 'result' ? active.result.id : active.ban.id;
      if (!composeParentId || activeBanId !== composeParentId) {
        console.log('[chain-reply-block-next-notification]', {
          parentBanId: composeParentId || null,
          reason: 'reply-compose',
          activeBanId,
          activeKind: active.kind,
        });
        return;
      }
    }
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
        incomingBanRef.current = ban;
        checkBanRef.current = null;
        setCheckBan(null);
        return;
      }
    }

    const resultBlock = shouldBlockResultOpen({
      resultBanId: active?.kind === 'result' ? active.result.id : null,
      overboardInFlightBanId: overboardInFlightRef.current,
    });

    if (isNotificationQueueLocked()) {
      if (isActiveUserCardHold()) {
        restoreHeldUserCardOverlay('syncDisplayFromQueue-queue-locked-hold');
        return;
      }
      if (!shouldBlockActiveCheckOverlayAutoClose('syncDisplayFromQueue', 'queue-locked')) {
        checkBanRef.current = null;
        setCheckBan(null);
      }
      if (
        !blockClearActiveIncomingOverlayBan(
          incomingBanRef.current?.id,
          'syncDisplayFromQueue-queue-locked',
        )
      ) {
        const stable = resolveStableIncomingForQueueHead(active);
        if (stable) {
          incomingBanRef.current = stable;
          setIncomingBan(stable);
        } else {
          incomingBanRef.current = null;
          setIncomingBan(null);
        }
      }
    } else {
      if (isActiveUserCardHold()) {
        logIncomingOverlayBlocked({
          reason: 'active-user-card-hold-before-state-set',
          source: 'syncDisplayFromQueue',
          queueLen: queue.length,
          headKind: queue[0]?.kind ?? null,
          headBanId:
            queue[0]?.kind === 'incoming' || queue[0]?.kind === 'check'
              ? queue[0].ban.id
              : queue[0]?.kind === 'result'
                ? queue[0].result.id
                : null,
          heldKind: heldUserCardOverlayRef.current?.kind ?? null,
        });
        restoreHeldUserCardOverlay('syncDisplayFromQueue-hold-before-state-set');
        return;
      }
      const stableIncoming = resolveStableIncomingForQueueHead(active);
      let nextIncoming =
        active?.kind === 'incoming' ? active.ban : stableIncoming;
      if (nextIncoming && stableIncoming) {
        nextIncoming = pickRicherIncomingBan(nextIncoming, stableIncoming);
      } else if (!nextIncoming && stableIncoming) {
        nextIncoming = stableIncoming;
      }
      let nextCheck = active?.kind === 'check' ? active.ban : null;
      if (nextCheck) {
        const viewerId = userIdRef.current?.trim() ?? '';
        if (
          !shouldShowCheckOverlay(
            nextCheck,
            viewerId,
            dismissedCheckSessionRef.current,
            answeredCheckRef.current,
            checkAnswerInFlightRef.current,
            resultOpenRef.current,
          )
        ) {
          nextCheck = null;
        }
      }
      const mountedCheckId = checkBanRef.current?.id?.trim() ?? '';
      if (
        nextCheck &&
        resultPriorityBanIdsRef.current.has(normalizeId(nextCheck.id))
      ) {
        logCheckPrimeSkipStaleBecauseResultExists({
          banId: nextCheck.id,
          source: 'syncDisplayFromQueue',
        });
        nextCheck = null;
      }
      if (
        mountedCheckId &&
        resultPriorityBanIdsRef.current.has(normalizeId(mountedCheckId))
      ) {
        checkBanRef.current = null;
      }
      if (
        mountedCheckId &&
        !nextCheck &&
        overlayQueueRef.current[0]?.kind === 'check' &&
        overlayQueueRef.current[0].ban.id === mountedCheckId
      ) {
        console.log('[check-overlay-auto-close-attempt]', {
          banId: mountedCheckId,
          source: 'syncDisplayFromQueue',
          reason: 'clear-mounted-check',
        });
        console.log('[check-overlay-close-blocked]', {
          banId: mountedCheckId,
          reason: 'no-user-action',
        });
        nextCheck = checkBanRef.current;
        traceCheckCardHoldLifecycle('check-re-mounted-after-answer', {
          source: 'syncDisplayFromQueue',
          reason: 'check-overlay-close-blocked-no-user-action',
          banId: mountedCheckId,
          checkBanId: mountedCheckId,
        });
      }
      incomingBanRef.current = nextIncoming;
      checkBanRef.current = nextCheck;
      if (nextIncoming) {
        logChainHeadSwitchTrace(
          'syncDisplayFromQueue:setIncomingBan',
          'incoming',
          nextIncoming.id,
        );
      }
      setIncomingBan(nextIncoming);
      setCheckBan(nextCheck);
      if (nextCheck) {
        const nextCheckNorm = normalizeId(nextCheck.id);
        if (answeredCheckRef.current.has(nextCheckNorm)) {
          traceCheckCardHoldLifecycle('check-re-mounted-after-answer', {
            source: 'syncDisplayFromQueue:setCheckBan',
            reason: 'answered-check-still-selected',
            banId: nextCheckNorm,
            checkBanId: nextCheckNorm,
          });
        }
      }
      if (nextIncoming) {
        logIncomingOverlayStateSet({
          banId: nextIncoming.id,
          source: 'syncDisplayFromQueue',
          textLen: nextIncoming.text?.length ?? 0,
          senderId: nextIncoming.sender?.id ?? null,
          heldUserCard: heldUserCardOverlayRef.current?.kind ?? null,
        });
        logTransitionFromRefs('[OVERLAY STATE SET]', {
          kind: 'incoming',
          banId: nextIncoming.id,
        });
        runChainLookaheadPrefetchRef.current(
          nextIncoming.id,
          'incoming-overlay-prime',
        );
      }
      if (nextCheck) {
        logTransitionFromRefs('[OVERLAY STATE SET]', {
          kind: 'check',
          banId: nextCheck.id,
        });
        if (
          !resultPriorityBanIdsRef.current.has(normalizeId(nextCheck.id))
        ) {
          runChainLookaheadPrefetchRef.current(
            nextCheck.id,
            'check-overlay-prime',
          );
        } else {
          logCheckPrimeSkipStaleBecauseResultExists({
            banId: nextCheck.id,
            source: 'check-overlay-prime',
          });
        }
      }
    }

    if (bansReturnToLobbyLatchRef.current && active) {
      console.log('[notification-overlay-base]', {
        kind: active.kind,
        baseScreen: 'lobby',
      });
    }

    const shouldSkipResultQueueSync =
      bansCtaQueueSuppressRef.current ||
      bansReturnToLobbyLatchRef.current ||
      bansNavStateRef.current.origin === 'result-cta' ||
      resultCtaBansOverlayOpenRef.current;

    if (shouldSkipResultQueueSync) {
      if (bansReturnToLobbyLatchRef.current) {
        const skipBanId =
          active?.kind === 'result'
            ? active.result.id
            : active?.kind === 'incoming' || active?.kind === 'check'
              ? active.ban.id
              : (resultRef.current?.id ?? null);
        window.__debug98log?.('[QUEUE SYNC SKIPPED]', {
          banId: skipBanId,
          bansReturnToLobbyLatchRef: true,
          source: 'syncDisplayFromQueue',
          reason: 'bansReturnToLobbyLatch',
          queueLen: queue.length,
        });
      }
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
        const blockedResultId = normalizeId(active.result.id);
        if (incomingOverboardAtomicBanIdRef.current === blockedResultId) {
          logResultCardStableHold({
            banId: blockedResultId,
            source: 'syncDisplayFromQueue-blocked-atomic',
          });
          resultOpenRef.current = true;
          return;
        }
        const held = heldUserCardOverlayRef.current;
        const isFreshOverboardResult =
          freshOverboardActionBanIdsRef.current.has(blockedResultId);
        const isHeldQueueHeadResult =
          (held?.kind === 'result' &&
            normalizeId(held.result.id) === blockedResultId) ||
          blockedResultId === normalizeId(active.result.id);
        if (isFreshOverboardResult && isHeldQueueHeadResult) {
          logResultCardStableHold({
            banId: blockedResultId,
            source: 'syncDisplayFromQueue-blocked-fresh-overboard',
          });
          resultOpenRef.current = true;
          if (normalizeId(resultRef.current?.id ?? '') !== blockedResultId) {
            resultRef.current = active.result;
            setResult(active.result);
          }
          return;
        }
        if (!directResultOverlayRef.current) {
          resultOpenRef.current = false;
          logResultStateCleared('syncDisplayFromQueue', {
            banId: active.result.id,
            resultId: active.result.id,
            reason: resultBlock.reason ?? 'queue-head-blocked',
          });
          emitResultAutoClearDecision({
            banId: active.result.id,
            reason: resultBlock.reason ?? 'queue-head-blocked',
            refMismatch: false,
            willClear: true,
          });
          emitResultClearCallsite({
            source: 'syncDisplayFromQueue',
            reason: resultBlock.reason ?? 'queue-head-blocked',
            resultIdBefore: active.result.id,
            willClearResult: true,
          });
          const gateBefore = snapshotDirectOverboardGate();
          setResult(null);
          setDirectResultOverlayActive(false);
          emitResultHeldStillPresentAfterClear(
            'syncDisplayFromQueue',
            resultBlock.reason ?? 'queue-head-blocked',
          );
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
        const normalizedResultId = normalizeId(resultId);
        if (incomingOverboardAtomicBanIdRef.current === normalizedResultId) {
          logResultCardStableHold({
            banId: normalizedResultId,
            source: 'syncDisplayFromQueue-atomic-hold',
          });
          resultOpenRef.current = true;
          if (resultRef.current?.id !== normalizedResultId) {
            resultRef.current = active.result;
            setResult(active.result);
          }
          return;
        }
        if (
          !freshOverboardActionBanIdsRef.current.has(normalizedResultId) &&
          !shouldPreserveFinalStatusResult(normalizedResultId, active.result) &&
          isResultBlockedForNotificationChain(resultId, 'syncDisplayFromQueue')
        ) {
          logResultStalePruneDecision({
            banId: resultId,
            willPrune: true,
            source: 'syncDisplayFromQueue-stale-prune',
            awaitingUser: notificationChainAwaitingUserRef.current,
            freshFinalStatus: freshFinalStatusBanIdsRef.current.has(
              normalizedResultId,
            ),
            outcome: active.result.outcome ?? null,
          });
          logResultCardAutoClearedBug({
            banId: resultId,
            source: 'syncDisplayFromQueue-stale-prune',
            awaitingUser: notificationChainAwaitingUserRef.current,
            handoff: notificationChainHandoffRef.current,
          });
          emitResultAutoClearDecision({
            banId: resultId,
            reason: 'syncDisplayFromQueue-stale-prune',
            refMismatch: false,
            willClear: true,
          });
          emitResultClearCallsite({
            source: 'syncDisplayFromQueue-stale-prune',
            reason: 'stale-prune-before',
            resultIdBefore: resultId,
            willClearResult: true,
            willPruneQueue: true,
          });
          console.log('[result-overlay-pruned-before-show]', {
            banId: resultId,
            source: 'syncDisplayFromQueue',
          });
          markResultOverlayConsumed(resultId, 'syncDisplayFromQueue-stale');
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
          emitResultHeldStillPresentAfterClear(
            'syncDisplayFromQueue-stale-prune',
            'stale-prune-after',
          );
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
        if (isSuccessCardMounted()) {
          deferResultWhileSuccessCardMounted(
            'syncDisplayFromQueue-setResult',
            active,
          );
          return;
        }
        if (
          deferPassiveResultQueueHeadOnLobby(
            'syncDisplayFromQueue',
            queue,
            active,
          )
        ) {
          return;
        }
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
        holdResultForActiveNotificationChain(
          active.result.id,
          'syncDisplayFromQueue-chain-applied',
          active.result,
        );
        setResult(active.result);
        logTransitionFromRefs('[OVERLAY STATE SET]', {
          kind: 'result',
          banId: active.result.id,
        });
        const deliveredId = normalizeId(active.result.id);
        const isFinalStatus = isFinalCheckStatusOutcome(active.result.outcome);
        if (
          !notificationChainAwaitingUserRef.current &&
          !notificationChainHandoffRef.current &&
          !isFinalStatus
        ) {
          resultDeliveredBanIdsRef.current.add(deliveredId);
          shownOverlayKeysRef.current.add(`result:${deliveredId}`);
        } else if (isFinalStatus) {
          logFinalStatusHoldDecision({
            banId: deliveredId,
            source: 'syncDisplayFromQueue-deferred-delivered',
            outcome: active.result.outcome,
            awaitingUser: notificationChainAwaitingUserRef.current,
            handoff: notificationChainHandoffRef.current,
          });
        }
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
        runChainLookaheadPrefetchRef.current(
          active.result.id,
          'result-overlay-prime',
        );
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
        emitResultClearCallsite({
          source: 'syncDisplayFromQueue-direct',
          reason: directBlock.reason ?? 'direct-blocked',
          willClearResult: true,
        });
        const gateBefore = snapshotDirectOverboardGate();
        clearDirectOverboardLayerRefs();
        setResult(null);
        setDirectResultOverlayActive(false);
        emitResultHeldStillPresentAfterClear(
          'syncDisplayFromQueue-direct',
          directBlock.reason ?? 'direct-blocked',
        );
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
      const mountedIncomingId =
        activeIncomingOverlayBanRef.current?.id?.trim() ??
        incomingBanRef.current?.id?.trim() ??
        '';
      const mountedCheckId = checkBanRef.current?.id?.trim() ?? '';
      const mountedResultId = resultRef.current?.id?.trim() ?? '';
      const hasMountedNotificationOverlay =
        mountedIncomingId.length > 0 ||
        mountedCheckId.length > 0 ||
        mountedResultId.length > 0;
      const headMatchesMounted =
        (headKind === 'incoming' && headBanId === mountedIncomingId) ||
        (headKind === 'check' && headBanId === mountedCheckId) ||
        (headKind === 'result' && headBanId === mountedResultId);
      const chainProtectsMounted =
        (notificationChainAwaitingUserRef.current ||
          chainAdvanceExplicitRef.current ||
          notificationChainHandoffRef.current) &&
        hasMountedNotificationOverlay &&
        (headKind === null || headMatchesMounted);
      const recentResultOpen =
        mountedResultId.length > 0 &&
        (resultOpenRef.current ||
          freshOverboardActionBanIdsRef.current.has(
            normalizeId(mountedResultId),
          ));
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
      } else if (chainProtectsMounted || recentResultOpen) {
        console.log('[overboard-reset-blocked-active-overlay]', {
          chainProtectsMounted,
          recentResultOpen,
          mountedIncomingId: mountedIncomingId || null,
          mountedCheckId: mountedCheckId || null,
          mountedResultId: mountedResultId || null,
          headKind,
          headBanId,
          chainAwaiting: notificationChainAwaitingUserRef.current,
          chainExplicit: chainAdvanceExplicitRef.current,
        });
        if (mountedResultId) {
          resultOpenRef.current = true;
        }
      } else {
      console.log('[overlay-state-before-reset]', {
        mountedIncomingId: mountedIncomingId || null,
        mountedCheckId: mountedCheckId || null,
        mountedResultId: mountedResultId || null,
        headKind,
        headBanId,
        resultOpen: resultOpenRef.current,
        chainAwaiting: notificationChainAwaitingUserRef.current,
      });
      const freshMountedId = normalizeId(mountedResultId);
      const heldFreshOverboard = heldUserCardOverlayRef.current;
      const stillHeldFreshOverboard =
        heldFreshOverboard?.kind === 'result' &&
        freshMountedId.length > 0 &&
        normalizeId(heldFreshOverboard.result.id) === freshMountedId;
      if (
        freshMountedId.length > 0 &&
        isHeldOverboardResultProtected(freshMountedId)
      ) {
        freshOverboardActionBanIdsRef.current.add(freshMountedId);
        logResultCardStableHold({
          banId: freshMountedId,
          source: 'syncDisplayFromQueue-not-result-held-overboard',
        });
        resultOpenRef.current = true;
        if (heldFreshOverboard?.kind === 'result') {
          if (normalizeId(resultRef.current?.id ?? '') !== freshMountedId) {
            resultRef.current = heldFreshOverboard.result;
            setResult(heldFreshOverboard.result);
          }
        }
        return;
      }
      if (
        freshMountedId.length > 0 &&
        freshOverboardActionBanIdsRef.current.has(freshMountedId) &&
        (stillHeldFreshOverboard || resultOpenRef.current)
      ) {
        logResultCardStableHold({
          banId: freshMountedId,
          source: 'syncDisplayFromQueue-not-result-fresh-overboard',
        });
        resultOpenRef.current = true;
        return;
      }
      const heldResultNorm =
        heldFreshOverboard?.kind === 'result'
          ? normalizeId(heldFreshOverboard.result.id)
          : '';
      if (
        shouldBlockAutoDismissAtomicOverboardResult(freshMountedId) ||
        shouldBlockAutoDismissAtomicOverboardResult(heldResultNorm) ||
        preserveAtomicOverboardResultDuringSync(
          'syncDisplayFromQueue-queue-head-not-result',
        )
      ) {
        return;
      }
      const resultIdBeforeClear = normalizeId(
        result?.id ?? resultRef.current?.id ?? '',
      );
      if (
        heldFreshOverboard?.kind === 'result' &&
        resultIdBeforeClear.length > 0 &&
        normalizeId(heldFreshOverboard.result.id) === resultIdBeforeClear
      ) {
        window.__debug98log?.('[RESULT CLEAR BLOCKED HELD RESULT]', {
          source: 'syncDisplayFromQueue',
          reason: 'queue-head-not-result',
          heldBanId: heldFreshOverboard.result.id,
          resultIdBefore: result?.id ?? null,
          resultRefIdBefore: resultRef.current?.id ?? null,
        });
        resultOpenRef.current = true;
        return;
      }
      resultOpenRef.current = false;
      logResultPath('syncDisplayFromQueue', 'state-cleared', {
        banId:
          getLocalOverboardBypassBanId() ?? overboardInFlightRef.current,
        allowed: false,
        reason: 'queue-head-not-result',
        extra: { headKind: active?.kind ?? null },
      });
      const gateBefore = snapshotDirectOverboardGate();
      emitResultClearCallsite({
        source: 'syncDisplayFromQueue',
        reason: 'queue-head-not-result',
        willClearResult: true,
      });
      setResult(null);
      setDirectResultOverlayActive(false);
      emitResultHeldStillPresentAfterClear(
        'syncDisplayFromQueue',
        'queue-head-not-result',
      );
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
      console.log('[overlay-state-after-reset]', {
        headKind,
        headBanId,
        clearedResult: true,
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
    if (
      notificationChainTransitioningRef.current &&
      active &&
      active.kind !== 'incoming' &&
      !isActiveUserCardHold()
    ) {
      setNotificationChainTransitioning(false);
    }
  }, [setNotificationChainTransitioning, snapshotDirectOverboardGate]);

  const applyOverlayQueue = useCallback(
    (next: QueuedOverlay[]) => {
      const prevHead = overlayQueueRef.current[0] ?? null;
      const nextHead = next[0] ?? null;
      const prevKey = prevHead ? overlayQueueKey(prevHead) : null;
      const nextKey = nextHead ? overlayQueueKey(nextHead) : null;
      if (
        isDeeplinkSingleCardModeActive() &&
        prevKey !== nextKey &&
        nextHead &&
        !chainAdvanceExplicitRef.current &&
        shouldBlockDeeplinkAutoDrain('applyOverlayQueue')
      ) {
        logDeeplinkSingleCardChainBlocked({
          nextKind: nextHead.kind,
          nextBanId:
            nextHead.kind === 'result'
              ? nextHead.result.id
              : nextHead.ban.id,
          source: 'applyOverlayQueue',
          reason: 'single-card-queue-advance-blocked',
        });
        return;
      }
      if (
        prevKey !== nextKey &&
        nextHead &&
        blockAndPreserveActiveUserCard('applyOverlayQueue', nextHead, {
          explicitUserAction: chainAdvanceExplicitRef.current,
        })
      ) {
        return;
      }
      if (
        notificationChainAwaitingUserRef.current &&
        prevKey &&
        nextKey &&
        prevKey !== nextKey &&
        !chainAdvanceExplicitRef.current
      ) {
        console.log('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          prevKey,
          nextKey,
        });
        window.__debug98log?.('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          prevKey,
          nextKey,
        });
        console.log('[chain-auto-advance-bug]', {
          previousShown: prevKey,
          nextShownSameTick: nextKey,
        });
        return;
      }
      if (
        (notificationChainReplyComposeActiveRef.current ||
          replyComposeActiveRef.current) &&
        prevKey &&
        nextKey &&
        prevKey !== nextKey
      ) {
        console.log('[chain-reply-block-next-notification]', {
          parentBanId: replyDeeplinkParentBanIdRef.current,
          reason: 'reply-compose',
          prevKey,
          nextKey,
        });
        console.log('[chain-reply-advance-blocked]', {
          parentBanId:
            chainReplyParentBanIdRef.current ??
            replyDeeplinkParentBanIdRef.current,
          reason: 'reply-compose',
          prevKey,
          nextKey,
        });
        console.log('[chain-reply-unexpected-advance]', {
          fromBanId: prevKey,
          nextBanId: nextKey,
          source: 'applyOverlayQueue',
        });
        return;
      }
      if (
        prevHead?.kind === 'check' &&
        prevHead.ban.id === checkBanRef.current?.id &&
        prevKey !== nextKey &&
        shouldBlockActiveCheckOverlayAutoClose('applyOverlayQueue', 'head-change')
      ) {
        return;
      }
      if (
        nextHead &&
        prevKey !== nextKey &&
        (nextHead.kind === 'check' ||
          nextHead.kind === 'incoming' ||
          nextHead.kind === 'result') &&
        blocksMountedNotificationOverlay(
          'applyOverlayQueue',
          nextHead.kind,
          nextHead.kind === 'result'
            ? nextHead.result.id
            : nextHead.ban.id,
        )
      ) {
        if (isSendComposeFlowActive()) {
          overlayQueueRef.current = next;
          setOverlayQueue(next);
          logNotificationDisplayBlockedDuringComposeGuard(
            'applyOverlayQueue',
            nextHead.kind,
          );
          console.log('[global-overlay-blocked-compose]', {
            active: true,
            queueLen: next.length,
          });
        }
        return;
      }
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
        if (nextHead?.kind === 'incoming') {
          logChainHeadSwitchTrace(
            'applyOverlayQueue',
            'incoming',
            nextHead.ban.id,
          );
        }
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
      if (!preserveAtomicOverboardResultDuringSync('applyOverlayQueue')) {
        syncDisplayFromQueue(next);
      }
      chainAdvanceExplicitRef.current = false;
      setOverlayQueue(next);
    },
    [syncDisplayFromQueue],
  );

  const markOverlayUserAction = useCallback((kind: string, banId?: string) => {
    setOverlayInputLockAfterAction(`${kind}:${banId ?? 'unknown'}`);
    const ts = overlayTs();
    overlayActionTsRef.current = ts;
    console.log('[OVERLAY ACTION CLICK]', { ts, kind, banId: banId ?? null });
  }, []);

  const reportOverlayRendered = useCallback(
    (kind: string, banId: string, buttonsReady = true) => {
      if (kind === 'incoming') {
        const viewerId = userIdRef.current?.trim() ?? '';
        const ban = activeIncomingOverlayBanRef.current ?? incomingBanRef.current;
        if (!ban?.id || normalizeId(ban.id) !== normalizeId(banId)) {
          logIncomingCardRenderBlockedBug({
            banId,
            reason: 'incoming-ban-ref-mismatch',
            refBanId: ban?.id ?? null,
            stableBanId: activeIncomingOverlayBanRef.current?.id ?? null,
          });
          logEmptyIncomingShellBug({
            banId,
            reason: 'card-mounted-without-incoming-state',
          });
          return;
        }
        if (!isIncomingCardDisplayReady(ban, viewerId)) {
          logIncomingCardRenderBlockedBug({
            banId,
            reason: getIncomingCardNotReadyReason(ban, viewerId),
          });
          logEmptyIncomingShellBug({
            banId,
            reason: 'card-mounted-without-payload',
          });
          return;
        }
        logIncomingCardMounted({
          banId,
          source: 'reportOverlayRendered',
          refBanId: ban.id,
        });
      }
      const ts = overlayTs();
      const delayFromAction = overlayDelayMs(overlayActionTsRef.current);
      const delayFromHandoff = overlayDelayMs(overlayHandoffTsRef.current);
      if (isBlockingUserOverlayKind(kind) && buttonsReady) {
        captureActiveUserCardHold(kind as BlockingUserOverlayKind, 'card-mounted');
        if (
          kind === 'check' &&
          answeredCheckRef.current.has(normalizeId(banId))
        ) {
          traceCheckCardHoldLifecycle('check-re-mounted-after-answer', {
            source: 'reportOverlayRendered',
            reason: 'card-mounted-after-answered',
            banId,
            checkBanId: banId,
          });
        }
      }
      logTransitionFromRefs('[CARD MOUNTED]', { kind, banId, buttonsReady });
      if (
        kind === 'check' &&
        resultPriorityBanIdsRef.current.has(normalizeId(banId))
      ) {
        logCheckCardMountedBug({
          banId,
          reason: 'result-priority-active',
        });
      }
      if (kind === 'result') {
        logResultCardMounted({ banId });
        const mounted = resultRef.current;
        const refMismatch =
          !mounted?.id || normalizeId(mounted.id) !== normalizeId(banId);
        if (refMismatch) {
          emitResultAutoClearDecision({
            banId,
            reason: 'result-ref-mismatch',
            refMismatch: true,
            willClear: false,
          });
          logResultCardAutoClearedBug({
            banId,
            reason: 'result-ref-mismatch',
            refBanId: mounted?.id ?? null,
            refMismatch: true,
          });
          return;
        }
        if (!isResultNotificationPayloadReady(mounted)) {
          emitResultAutoClearDecision({
            banId,
            reason: 'result-payload-not-ready',
            refMismatch: false,
            willClear: false,
          });
          logResultCardAutoClearedBug({
            banId,
            reason: 'result-payload-not-ready',
            outcome: mounted.outcome ?? null,
          });
          return;
        }
        if (isSuccessExitInstrumentationActive()) {
          logSuccessDrainResultCardMounted({
            banId,
            outcome: mounted.outcome,
            source: 'report-overlay-rendered',
          });
        }
        resultOverlayRenderedBanIdsRef.current.add(normalizeId(banId));
        checkAnswerPendingResultShowRef.current.delete(normalizeId(banId));
      }
      if (
        kind === 'check' &&
        checkDeepLinkBanIdRef.current &&
        normalizeId(checkDeepLinkBanIdRef.current) === normalizeId(banId)
      ) {
        logCheckCardMounted({ banId });
      }
      if (goToBansAdvancePendingRef.current) {
        goToBansAdvancePendingRef.current = false;
        setChainAdvanceWaiting(false);
        window.__debug98log?.('[GO TO BANS NEXT MOUNTED]', { kind, banId });
        console.log('[GO TO BANS NEXT MOUNTED]', { kind, banId });
      }
      if (isPostSuccessHandoffInProgress()) {
        completePostSuccessHandoffOnCardMounted(kind, banId, {
          buttonsReady,
        });
      }
      if (isSuccessExitInstrumentationActive()) {
        logFirstNotificationMounted({ kind, banId });
      }
      if (
        notificationChainAwaitingUserRef.current ||
        notificationChainHandoffRef.current
      ) {
        if (
          kind === 'check' &&
          resultPriorityBanIdsRef.current.has(normalizeId(banId))
        ) {
          logCheckPrimeSkipStaleBecauseResultExists({
            banId,
            source: `overlay-mounted:${kind}`,
          });
        } else {
          runChainLookaheadPrefetchRef.current(banId, `overlay-mounted:${kind}`);
        }
      }
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
        if (isActiveUserCardHold()) {
          logTransitionDelaySkippedActiveUserCard({
            kind,
            banId,
            delayMs: delayFromAction,
            cause: overlayDelayCause(delayFromAction, {
              handoffMs: delayFromHandoff,
            }),
          });
        } else {
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
          logTransitionFromRefs('[TRANSITION DELAY USED]', {
            source: 'reportOverlayRendered-action-to-mount',
            ms: delayFromAction,
            kind,
            banId,
            cause,
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
      }
    },
    [emitResultAutoClearDecision],
  );

  const isExplicitUserOverlayDismissReason = (
    reason: string,
    dismissKind: QueuedOverlay['kind'] | null,
    dismissBanId: string | null,
  ): boolean => {
    if (!dismissKind || !dismissBanId) return false;
    const held = heldUserCardOverlayRef.current;
    if (!held || heldUserCardBanId(held) !== normalizeId(dismissBanId)) {
      return false;
    }
    if (held.kind === 'incoming') {
      return (
        reason === 'incoming-dismiss' ||
        reason === 'incoming-seen' ||
        reason === 'reply-completed-route' ||
        reason === 'reply-deeplink-fast-abort'
      );
    }
    if (held.kind === 'check') {
      return isUserAllowedCheckOverlayCloseReason(reason);
    }
    if (held.kind === 'result') {
      return (
        reason === 'result-dismiss' || reason === 'result-cta-bans-close-pop'
      );
    }
    return false;
  };

  const dismissCurrentOverlay = useCallback(
    (reason: string, nextQueue?: QueuedOverlay[]) => {
      const prev = overlayQueueRef.current;
      const prevKey = prev[0] ? overlayQueueKey(prev[0]) : null;
      const dismissKind = prev[0]?.kind ?? null;
      const dismissBanId =
        prev[0]?.kind === 'result'
          ? prev[0].result.id
          : prev[0]?.kind === 'incoming' || prev[0]?.kind === 'check'
            ? prev[0].ban.id
            : null;
      const atomicBanId = incomingOverboardAtomicBanIdRef.current;
      if (
        atomicBanId &&
        dismissBanId === atomicBanId &&
        !isExplicitUserOverlayDismissReason(reason, dismissKind, dismissBanId)
      ) {
        logResultCardClearedBug({
          banId: atomicBanId,
          source: `dismissCurrentOverlay:${reason}`,
          attemptedKind: dismissKind,
        });
        logResultCardPreserveDomOk({
          banId: atomicBanId,
          source: `dismissCurrentOverlay-blocked:${reason}`,
        });
        return;
      }
      logTransitionFromRefs('[DISMISS START]', {
        kind: dismissKind,
        banId: dismissBanId,
        source: reason,
      });
      if (
        isActiveUserCardHold() &&
        !isExplicitUserOverlayDismissReason(reason, dismissKind, dismissBanId)
      ) {
        logActiveUserCardPreventOverlayClear({
          activeKind: heldUserCardOverlayRef.current?.kind ?? null,
          activeBanId: heldUserCardOverlayRef.current
            ? heldUserCardBanId(heldUserCardOverlayRef.current)
            : null,
          source: `dismissCurrentOverlay:${reason}`,
        });
        restoreHeldUserCardOverlay(`dismissCurrentOverlay-blocked:${reason}`);
        return;
      }
      if (
        prev[0]?.kind === 'check' &&
        prev[0].ban.id === checkBanRef.current?.id &&
        shouldBlockActiveCheckOverlayAutoClose('dismissCurrentOverlay', reason)
      ) {
        return;
      }
      const remaining = nextQueue ?? popOverlayHead(prev);

      if (
        isDeeplinkSingleCardModeActive() &&
        isDeeplinkSingleCardCompleting(dismissKind, dismissBanId)
      ) {
        if (remaining.length > 0) {
          pendingStartupInteractionsRef.current = mergeStartupPendingChain(
            pendingStartupInteractionsRef.current,
            remaining,
          );
          syncPendingStartupCount();
          primeLobbyBansAttentionHintSyncRef.current(
            `deeplink-single-card-defer:${reason}`,
          );
          logDeeplinkSingleCardChainBlocked({
            source: reason,
            banId: dismissBanId,
            deferredLen: remaining.length,
            deferredHeadKind: remaining[0]?.kind ?? null,
            reason: 'single-card-deferred-to-pending',
          });
        }
        overlayQueueRef.current = [];
        setOverlayQueue([]);
        clearActiveUserCardHold(`deeplink-single-card:${reason}`);
        clearActiveOverlayStateForDismiss(dismissKind, dismissBanId, {
          explicitUserAction: true,
        });
        completeDeeplinkSingleCardMode(`dismiss:${reason}`);
        logDeeplinkReturnLobby({
          reason,
          banId: dismissBanId,
          remainingLen: remaining.length,
        });
        overlayActionTsRef.current = null;
        overlayHandoffTsRef.current = null;
        notificationChainAwaitingUserRef.current = false;
        notificationChainHandoffRef.current = false;
        setNotificationChainTransitioning(false);
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        lobbyShownLoggedRef.current = false;
        logTransitionFromRefs('[DISMISS COMMIT DONE]', {
          source: `${reason}-deeplink-single-card`,
        });
        return;
      }

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

      if (remaining.length > 0) {
        setNotificationChainTransitioning(true);
      }

      const commit = () => {
        const userChainAdvance = prepareUserAnswerChainAdvance(
          reason,
          dismissKind,
          dismissBanId,
          remaining,
        );
        const beforeApplyQueue = userChainAdvance
          ? snapshotCheckAnswerAdvanceSide()
          : null;

        if (
          notificationChainAwaitingUserRef.current &&
          remaining.length > 0 &&
          !chainAdvanceExplicitRef.current
        ) {
          console.log('[chain-drain-continue-blocked]', {
            reason: 'active-overlay-mounted',
            source: 'dismissCurrentOverlay-commit',
            dismissReason: reason,
            remainingLen: remaining.length,
          });
          window.__debug98log?.('[chain-drain-continue-blocked]', {
            reason: 'active-overlay-mounted',
            source: 'dismissCurrentOverlay-commit',
            dismissReason: reason,
            remainingLen: remaining.length,
          });
          return;
        }
        if (
          (notificationChainReplyComposeActiveRef.current ||
            replyComposeActiveRef.current) &&
          remaining.length > 0
        ) {
          console.log('[chain-reply-block-next-notification]', {
            parentBanId: replyDeeplinkParentBanIdRef.current,
            reason: 'reply-compose',
            source: 'dismissCurrentOverlay-commit',
            dismissReason: reason,
            remainingLen: remaining.length,
          });
          return;
        }
        if (userChainAdvance && beforeApplyQueue) {
          emitCheckAnswerAdvanceTrace(
            'before-apply-queue',
            dismissBanId,
            remaining,
            beforeApplyQueue,
          );
        }
        const deferCheckAnswerEmptyRemainingApply =
          userChainAdvance &&
          shouldDeferCheckAnswerEmptyRemainingApplyQueue(
            reason,
            dismissBanId,
            remaining,
          );
        if (deferCheckAnswerEmptyRemainingApply) {
          const normalizedCheckBanId = normalizeId(dismissBanId ?? '');
          logCheckAnswerWaitingResultHold({
            checkBanId: dismissBanId,
            remainingLen: remaining.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            hasResultAnswer:
              normalizedCheckBanId.length > 0 &&
              checkAnswerInFlightRef.current.has(normalizedCheckBanId),
            chainAdvanceWaiting: chainAdvanceWaitingRef.current,
            notificationChainTransitioning:
              notificationChainTransitioningRef.current,
            reason: 'user-answer-empty-remaining-wait-result-poll',
          });
          if (normalizedCheckBanId) {
            setCheckAnswerWaitingResultHold(normalizedCheckBanId);
          }
          overlayQueueRef.current = [];
          activeOverlayLockRef.current = null;
          setOverlayQueue([]);
          setChainAdvancePlaceholderKind('check');
          setChainAdvanceWaiting(true);
          setNotificationChainTransitioning(true);
          setLobbyOpen(false);
        } else {
          applyOverlayQueue(remaining);
          if (userChainAdvance && beforeApplyQueue) {
            emitCheckAnswerAdvanceTrace(
              'after-apply-queue',
              dismissBanId,
              remaining,
              beforeApplyQueue,
            );
          }
        }
        const selectTs = overlayTs();
        if (remaining.length > 0) {
          const nextKey = remaining[0] ? overlayQueueKey(remaining[0]) : null;
          const nextHead = remaining[0] ?? null;
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
          if (userChainAdvance) {
            logChainDrainContinue({
              reason,
              remainingLen: remaining.length,
              nextKind: nextHead?.kind ?? null,
              nextBanId:
                nextHead?.kind === 'result'
                  ? nextHead.result.id
                  : nextHead?.kind === 'incoming' || nextHead?.kind === 'check'
                    ? nextHead.ban.id
                    : null,
            });
            logTransitionFromRefs('[SHOW NEXT SELECTED]', {
              source: reason,
              kind: nextHead?.kind ?? null,
              banId:
                nextHead?.kind === 'result'
                  ? nextHead.result.id
                  : nextHead?.kind === 'incoming' || nextHead?.kind === 'check'
                    ? nextHead.ban.id
                    : null,
            });
          }
        }
        if (remaining.length === 0) {
          overlayActionTsRef.current = null;
          overlayHandoffTsRef.current = null;
          if (isActiveUserCardHold()) {
            restoreHeldUserCardOverlay(
              'dismissCurrentOverlay-empty-remaining-hold',
            );
            logActiveUserCardPreventLobbyFallback({
              source: `dismissCurrentOverlay:${reason}`,
              dismissKind,
              dismissBanId,
            });
          } else if (userChainAdvance) {
            if (overlayQueueDrainActiveRef.current) {
              overlayQueueDrainActiveRef.current = false;
              console.log('[OVERLAY QUEUE DRAIN END]', { ts: selectTs });
            }
            const checkAnswerOwnsContinue =
              checkAnswerDismissChainOwnedRef.current &&
              isUserAllowedCheckOverlayCloseReason(reason);
            if (!checkAnswerOwnsContinue) {
              queueMicrotask(() => {
                void continueNotificationChainOrOpenLobbyRef.current(
                  `dismiss:${reason}`,
                  {
                    clearActiveHold: false,
                    prefetchSkipBanId: dismissBanId,
                  },
                );
              });
            }
          } else {
            notificationChainAwaitingUserRef.current = false;
            notificationChainHandoffRef.current = false;
            if (overlayQueueDrainActiveRef.current) {
              overlayQueueDrainActiveRef.current = false;
              console.log('[OVERLAY QUEUE DRAIN END]', { ts: selectTs });
            }
            if (bansReturnToLobbyLatchRef.current) {
              if (
                isPostSuccessHandoffInProgress() &&
                shouldBlockLobbyOpenForPostSuccessHandoff(
                  overlayQueueRef.current.length,
                  pendingStartupInteractionsRef.current.length,
                  'dismissCurrentOverlay-queue-empty',
                )
              ) {
                setNotificationChainTransitioning(false);
              } else {
                console.log('[notification-queue-final-base]', {
                  baseScreen: 'lobby',
                  lobbyOpen: lobbyOpenRef.current,
                });
                setBansReturnToLobbyLatch(false, {
                  source: 'dismissCurrentOverlay-queue-empty',
                });
                setNotificationChainTransitioning(false);
                queueMicrotask(() => {
                  void continueNotificationChainOrOpenLobbyRef.current(
                    `dismiss:${reason}-latch`,
                    { prefetchSkipBanId: dismissBanId },
                  );
                });
              }
            } else {
              setNotificationChainTransitioning(false);
            }
          }
        } else if (userChainAdvance) {
          queueMicrotask(() => {
            void continueNotificationChainOrOpenLobbyRef.current(
              `dismiss:${reason}`,
              {
                clearActiveHold: false,
                prefetchSkipBanId: dismissBanId,
              },
            );
          });
        }
        logTransitionFromRefs('[DISMISS COMMIT DONE]', {
          source: reason,
        });
      };

      if (remaining.length > 0) {
        flushSync(commit);
      } else {
        commit();
      }
    },
    [applyOverlayQueue, setChainAdvanceWaiting, setChainAdvancePlaceholderKind, setCheckAnswerWaitingResultHold, setLobbyOpen, setNotificationChainTransitioning],
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
      noteNotificationEnqueueSource(opts?.source ?? 'enqueueNotification');
      const normalizedItem = normalizeQueuedOverlay(item);
      const banId =
        normalizedItem.kind === 'result'
          ? normalizeId(normalizedItem.result.id)
          : normalizeId(normalizedItem.ban.id);
      const key = overlayQueueKey(normalizedItem);

      if (
        normalizedItem.kind === 'check' &&
        resultPriorityBanIdsRef.current.has(banId)
      ) {
        logCheckPrimeSkipStaleBecauseResultExists({
          banId,
          source: opts?.source ?? 'enqueueNotification',
        });
        return;
      }

      if (
        (normalizedItem.kind === 'check' ||
          normalizedItem.kind === 'incoming' ||
          normalizedItem.kind === 'result') &&
        (isSuccessCardMounted() || isActiveTimerOverlayMounted())
      ) {
        blocksMountedNotificationOverlay(
          'enqueueNotification',
          normalizedItem.kind,
          banId,
        );
        deferNotificationToPendingStartup(normalizedItem);
        return;
      }

      if (
        live &&
        isSendComposeFlowActive() &&
        (normalizedItem.kind === 'check' ||
          normalizedItem.kind === 'incoming' ||
          normalizedItem.kind === 'result')
      ) {
        logNotificationDisplayBlockedDuringComposeGuard(
          `enqueueNotification:${opts?.source ?? 'unknown'}`,
          normalizedItem.kind,
        );
        deferNotificationToPendingStartup(normalizedItem);
        return;
      }

      if (normalizedItem.kind === 'result') {
        const resultId = normalizedItem.result.id;
        const uid = userIdRef.current;
        if (isResultBlockedForNotificationChain(resultId, opts?.source ?? 'enqueueNotification')) {
          return;
        }

        const block = shouldBlockResultOpen({
          source: 'enqueueNotification',
          resultBanId: normalizedItem.result.id,
          overboardInFlightBanId: overboardInFlightRef.current,
        });
        logResultOpenAttempt('enqueueNotification', {
          resultId: normalizedItem.result.id,
          allowed: !block.blocked,
          blockReason: block.reason,
          bypassPriorityLock: block.bypassPriorityLock,
          extra: { enqueueSource: opts?.source ?? null, live },
        });
        if (block.blocked) {
          return;
        }
        if (
          shouldBlockPassiveResultOverlayOpenForBan(
            `enqueueNotification:${opts?.source ?? 'unknown'}`,
            normalizedItem.result.id,
          )
        ) {
          logPassiveResultOverlayBlocked({
            source: opts?.source ?? 'enqueueNotification',
            banId: normalizedItem.result.id,
            phase: 'enqueue-blocked',
            passiveSource: isPassiveResultOpenSource(
              opts?.source ?? 'enqueueNotification',
            ),
            lobbyOpen: lobbyOpenRef.current,
          });
          pendingStartupInteractionsRef.current = mergeStartupPendingSingle(
            pendingStartupInteractionsRef.current,
            normalizedItem,
          );
          syncPendingStartupCount();
          primeLobbyBansAttentionHintSyncRef.current(
            `passive-result-deferred:${opts?.source ?? 'unknown'}`,
          );
          return;
        }
      }

      const decision = evaluateOverlayEnqueue(normalizedItem, {
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
          { key, kind: normalizedItem.kind, banId, source: opts?.source ?? null },
        );
        return;
      }

      if (startupInteractionsHoldRef.current && !live) {
        const prevPending = pendingStartupInteractionsRef.current;
        const nextPending = replyDeeplinkChainHoldRef.current
          ? mergeStartupPendingChain(prevPending, [normalizedItem])
          : mergeStartupPendingSingle(prevPending, normalizedItem);
        pendingStartupInteractionsRef.current = nextPending;
        syncPendingStartupCount();
        primeLobbyBansAttentionHintSyncRef.current(
          `enqueue-pending:${opts?.source ?? 'unknown'}`,
        );
        logOverlayArbiter('enqueue', {
          key,
          kind: normalizedItem.kind,
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
      const { queue: next, changed, action } = enqueueWithActiveLock(
        prev,
        normalizedItem,
      );

      if (!changed) {
        if (normalizedItem.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: normalizedItem.ban.id,
            skipped: true,
            reason: 'dedup',
            source: opts?.source ?? null,
          });
        } else if (normalizedItem.kind === 'check') {
          console.log('[CHECK QUEUE DEDUP]', {
            banId: normalizedItem.ban.id,
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
          kind: normalizedItem.kind,
          source: opts?.source ?? null,
        });
      } else if (action === 'enqueue-waiting') {
        logOverlayArbiter('blocked-by-current-overlay', {
          activeKey,
          newKey,
          kind: normalizedItem.kind,
          source: opts?.source ?? null,
        });
        logOverlayArbiter('enqueue', {
          key: newKey,
          kind: normalizedItem.kind,
          banId,
          source: opts?.source ?? null,
          scope: 'queue-tail',
          queueLength: next.length,
        });
      } else if (action === 'display-new') {
        logOverlayArbiter('enqueue', {
          key: newKey,
          kind: normalizedItem.kind,
          banId,
          source: opts?.source ?? null,
          scope: 'display-new',
        });
        if (normalizedItem.kind === 'incoming') {
          console.log('INCOMING QUEUE PUSH', {
            banId: normalizedItem.ban.id,
            skipped: false,
            reason: 'display-new',
            source: opts?.source ?? null,
            live,
          });
        } else if (normalizedItem.kind === 'check') {
          console.log('[CHECK QUEUE PUSH]', {
            banId: normalizedItem.ban.id,
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
      if (
        blocksMountedNotificationOverlay(
          `unlockNotificationQueueAndFlush:${reason}`,
          null,
          null,
        )
      ) {
        return;
      }
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
          if (bansReturnToLobbyLatchRef.current) {
            if (
              isPostSuccessHandoffInProgress() &&
              shouldBlockLobbyOpenForPostSuccessHandoff(
                overlayQueueRef.current.length,
                pendingStartupInteractionsRef.current.length,
                'unlockNotificationQueueAndFlush-empty-queue',
              )
            ) {
              logPostSuccessEmptyQueueIfMisalignedRef.current?.(
                'unlockNotificationQueueAndFlush-empty-queue',
              );
              return;
            }
            console.log('[notification-queue-final-base]', {
              baseScreen: 'lobby',
              lobbyOpen: lobbyOpenRef.current,
            });
            setBansReturnToLobbyLatch(false, {
              source: 'unlockNotificationQueueAndFlush-empty-queue',
            });
            logSuccessExitLobbyOpenAttempt({
              source: 'unlockNotificationQueueAndFlush-empty-queue',
              via: 'setLobbyOpen(true)',
            });
            setLobbyOpen(true);
            lobbyOpenRef.current = true;
          }
        }

        if (head?.kind === 'result') {
          logOverlayPriority('pending-result-shown', {
            resultId: head.result.id,
          });
        } else if (!head && !replyDeeplinkChainHoldRef.current) {
          if (notificationChainAwaitingUserRef.current) {
            console.log('[reload-pending-deferred]', {
              reason: 'notification-chain-awaiting-user',
            });
          } else {
            void reloadPendingRef.current().catch(() => {});
          }
        }
      });
    },
    [enqueueNotification, syncDisplayFromQueue, syncPendingStartupCount],
  );

  const storeAcceptedParentActiveBan = useCallback(
    (ban: BanInteraction, source: string): BanInteraction | null => {
      const expectedParentBanId =
        acceptedParentBanAfterReplyRef.current?.trim() ?? '';
      if (!expectedParentBanId) return null;

      if (ban.id !== expectedParentBanId) {
        console.log('[reply-parent-active-wrong-id-skip]', {
          expectedParentBanId,
          candidateBanId: ban.id,
        });
        return null;
      }

      const enriched = enrichBanInteraction(ban);
      if (enriched.status !== 'active') return null;
      if (!hasActiveParentTimerFields(enriched)) {
        console.log('[reply-parent-active-missing]', {
          parentBanId: expectedParentBanId,
          reason: 'no-timer-fields',
        });
        return null;
      }

      acceptedParentBanActiveRef.current = enriched;
      console.log('[reply-parent-active-ready-before-success]', {
        parentBanId: enriched.id,
        status: enriched.status,
        expiresAt: enriched.expiresAt,
        checkDueAt: enriched.checkDueAt,
        source,
      });
      return enriched;
    },
    [],
  );

  const clearReplyParentActivePriority = useCallback((reason?: string) => {
    const parentBanId = acceptedParentBanAfterReplyRef.current;
    acceptedParentBanAfterReplyRef.current = null;
    acceptedParentBanActiveRef.current = null;
    acceptedParentIncomingSnapshotRef.current = null;
    replyParentAcceptPromiseRef.current = null;
    replyParentActivePriorityPendingRef.current = false;
    replyParentActivePriorityActiveRef.current = false;
    setReplyParentActivePriorityActive(false);
    if (parentBanId) {
      console.log('[reply-parent-active-priority-clear]', {
        parentBanId,
        reason: reason ?? null,
      });
    }
  }, []);

  const resolveReplyParentActiveBanImmediate = useCallback((): BanInteraction | null => {
    if (!replyParentActivePriorityPendingRef.current) {
      return null;
    }
    const parentBanId = acceptedParentBanAfterReplyRef.current?.trim() ?? '';
    if (!parentBanId) return null;

    const fromAccept = acceptedParentBanActiveRef.current;
    if (
      fromAccept?.id === parentBanId &&
      fromAccept.status === 'active' &&
      hasActiveParentTimerFields(fromAccept)
    ) {
      return enrichBanInteraction(fromAccept);
    }

    return null;
  }, []);

  const hasReplyParentActivePriorityPending = useCallback(
    () => replyParentActivePriorityPendingRef.current,
    [],
  );

  const getReplyParentActiveBanId = useCallback(
    () => acceptedParentBanAfterReplyRef.current?.trim() ?? null,
    [],
  );

  const fetchReplyParentActiveBanFallback = useCallback(
    async (parentBanId: string): Promise<BanInteraction | null> => {
      const token = tokenRef.current?.trim();
      if (!token) {
        console.log('[reply-parent-active-priority-skip]', {
          reason: 'no-token',
          parentBanId,
        });
        return null;
      }

      try {
        const { ban: fetched } = await api<{ ban: BanInteraction }>(
          `/bans/${parentBanId}/open`,
          { token },
        );
        if (!fetched || fetched.status !== 'active') {
          console.log('[reply-parent-active-priority-skip]', {
            reason: 'fetched-not-active',
            parentBanId,
            status: fetched?.status ?? null,
          });
          return null;
        }
        const enriched = storeAcceptedParentActiveBan(fetched, 'api-open-fallback');
        if (!enriched) {
          return null;
        }
        setActiveBans((prev) => {
          if (prev.some((row) => row.id === enriched.id)) {
            return prev.map((row) =>
              row.id === enriched.id ? enriched : row,
            );
          }
          return [enriched, ...prev];
        });
        return enriched;
      } catch (e) {
        console.log('[reply-parent-active-priority-skip]', {
          reason: 'api-open-failed',
          parentBanId,
          message: (e as Error).message,
        });
        return null;
      }
    },
    [storeAcceptedParentActiveBan],
  );

  const ensureReplyParentActiveBanForSuccess = useCallback(async (): Promise<
    BanInteraction | null
  > => {
    const parentBanId = acceptedParentBanAfterReplyRef.current?.trim() ?? '';
    if (!parentBanId || !replyParentActivePriorityPendingRef.current) {
      return null;
    }

    const immediate = resolveReplyParentActiveBanImmediate();
    if (immediate) return immediate;

    const acceptPromise = replyParentAcceptPromiseRef.current;
    if (acceptPromise) {
      try {
        await Promise.race([
          acceptPromise,
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('accept-timeout')), 3000);
          }),
        ]);
      } catch {
        // accept may still complete later; try ref again
      }
      const afterAccept = resolveReplyParentActiveBanImmediate();
      if (afterAccept) return afterAccept;
    }

    const snapshot = acceptedParentIncomingSnapshotRef.current;
    if (snapshot?.id === parentBanId) {
      const rebuilt = buildActiveParentBanForSuccess(snapshot);
      const stored = storeAcceptedParentActiveBan(
        rebuilt,
        'snapshot-rebuild-fallback',
      );
      if (stored) return stored;
    }

    console.log('[reply-parent-active-fallback-fetch]', {
      parentBanId,
      reason: 'ref-empty-after-accept',
    });

    const fetched = await Promise.race([
      fetchReplyParentActiveBanFallback(parentBanId),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3000);
      }),
    ]);
    if (!fetched) {
      console.log('[reply-parent-active-missing]', {
        parentBanId,
        reason: 'fallback-fetch-empty',
      });
    }
    return fetched;
  }, [
    fetchReplyParentActiveBanFallback,
    resolveReplyParentActiveBanImmediate,
    storeAcceptedParentActiveBan,
  ]);

  const refreshReplyParentActiveBanInBackground = useCallback(
    (parentBanId: string) => {
      const bid = parentBanId.trim();
      if (!bid) return;
      console.log('[reply-parent-active-fetch-background]', { parentBanId: bid });
      void fetchReplyParentActiveBanFallback(bid);
    },
    [fetchReplyParentActiveBanFallback],
  );

  const isReplyParentActivePriorityActive = useCallback(
    () => replyParentActivePriorityActiveRef.current,
    [],
  );

  const overlayQueueItemId = useCallback((item: QueuedOverlay): string => {
    return item.kind === 'result'
      ? `result:${normalizeId(item.result.id)}`
      : `${item.kind}:${normalizeId(item.ban.id)}`;
  }, []);

  const isFreshCheckAnswerResultPendingFirstShow = useCallback(
    (banId: string): boolean => {
      const key = normalizeId(banId);
      if (!key) return false;
      if (resultOverlayRenderedBanIdsRef.current.has(key)) return false;
      return (
        checkAnswerInFlightRef.current.has(key) ||
        checkAnswerPendingResultShowRef.current.has(key)
      );
    },
    [],
  );

  const snapshotFreshResultOverlayStack = useCallback(
    (freshBanId: string | null) => {
      const queueHead =
        overlayQueueRef.current[0] ?? overlayQueue[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      const heldResultId =
        held?.kind === 'result' ? normalizeId(heldUserCardBanId(held)) : null;
      const mountedResultBanId = normalizeId(
        resultRef.current?.id ?? result?.id ?? '',
      );
      return {
        freshBanId,
        mountedResultBanId: mountedResultBanId || null,
        heldKind: held?.kind ?? null,
        heldBanId: held ? heldUserCardBanId(held) : null,
        heldResultId,
        resultRefBanId: resultRef.current?.id ?? null,
        displayResultBanId: result?.id ?? null,
        activeResultPayloadBanId: null as string | null,
        queueHeadKind: queueHead?.kind ?? null,
        queueHeadBanId:
          queueHead?.kind === 'result'
            ? queueHead.result.id
            : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
              ? queueHead.ban.id
              : null,
        activeUserCardHold:
          held && notificationChainAwaitingUserRef.current ? held.kind : null,
      };
    },
    [overlayQueue, result?.id],
  );

  const suppressStaleResultOverlayForFreshCheckAnswer = useCallback(
    (freshBanId: string, freshPayload: BanResult, source: string) => {
      const freshNorm = normalizeId(freshBanId);
      if (!freshNorm || !isFreshCheckAnswerResultPendingFirstShow(freshNorm)) {
        return;
      }

      const held = heldUserCardOverlayRef.current;
      const heldResultNorm =
        held?.kind === 'result' ? normalizeId(heldUserCardBanId(held)) : '';
      const mountedNorm = normalizeId(
        resultRef.current?.id ?? result?.id ?? '',
      );
      const hasStaleHeldResult =
        held?.kind === 'result' &&
        heldResultNorm.length > 0 &&
        heldResultNorm !== freshNorm;
      const hasStaleMountedResult =
        mountedNorm.length > 0 && mountedNorm !== freshNorm;

      let decision: 'replace-stale-held' | 'keep-current' | 'suppress-stale' | 'unknown' =
        'unknown';
      if (!hasStaleHeldResult && !hasStaleMountedResult) {
        decision = 'keep-current';
      } else if (hasStaleHeldResult) {
        decision = 'replace-stale-held';
      } else {
        decision = 'suppress-stale';
      }

      const traceBase = snapshotFreshResultOverlayStack(freshNorm);

      if (decision === 'keep-current') {
        logFreshResultOverlayStackTrace({ ...traceBase, source, decision });
        return;
      }

      if (hasStaleHeldResult) {
        freshFinalStatusBanIdsRef.current.delete(heldResultNorm);
        clearActiveUserCardHold(
          `suppressStaleResultForFreshCheckAnswer:${source}`,
        );
      }

      if (hasStaleMountedResult) {
        freshFinalStatusBanIdsRef.current.delete(mountedNorm);
        freshOverboardActionBanIdsRef.current.delete(mountedNorm);
        resultOpenRef.current = false;
        emitResultClearCallsite({
          source: `suppressStaleResultForFreshCheckAnswer:${source}`,
          reason: 'stale-result-over-fresh-check-answer',
          resultIdBefore: mountedNorm,
          willClearResult: true,
        });
        setResult(null);
        resultRef.current = null;
      }

      resultRef.current = freshPayload;
      resultOpenRef.current = true;
      setResult(freshPayload);

      logFreshResultOverlayStackTrace({
        ...traceBase,
        source,
        decision,
        resultRefBanIdAfter: freshPayload.id,
        displayResultBanIdAfter: freshPayload.id,
      });
    },
    [
      clearActiveUserCardHold,
      isFreshCheckAnswerResultPendingFirstShow,
      snapshotFreshResultOverlayStack,
    ],
  );

  const clearStaleResultGuardForFreshCheckAnswer = useCallback(
    (banId: string, source: string, blockReason?: string) => {
      const key = normalizeId(banId);
      if (!key || !isFreshCheckAnswerResultPendingFirstShow(key)) return false;
      const viewerId = userIdRef.current?.trim() ?? '';
      resultCtaConsumedBanIdsRef.current.delete(key);
      resultDeliveredBanIdsRef.current.delete(key);
      shownOverlayKeysRef.current.delete(`result:${key}`);
      if (viewerId) {
        clearDismissedResultLocally(key, viewerId);
      }
      logResultStaleGuardBypassedFreshCheckAnswer({
        banId: key,
        blockReason: blockReason ?? 'fresh-check-answer-pending-first-show',
        source,
        checkAnswerInFlightBanId: checkAnswerInFlightRef.current.has(key)
          ? key
          : null,
        answeredFresh: checkAnswerPendingResultShowRef.current.has(key),
        resultAlreadyRendered: resultOverlayRenderedBanIdsRef.current.has(key),
      });
      return true;
    },
    [isFreshCheckAnswerResultPendingFirstShow],
  );

  const isResultBlockedForNotificationChain = useCallback(
    (banId: string, source: string, skipBanId?: string | null): boolean => {
      const key = normalizeId(banId);
      const normalizedSkip = normalizeId(skipBanId);
      const viewerId = userIdRef.current?.trim() ?? '';
      const consumed = resultCtaConsumedBanIdsRef.current.has(key);
      const delivered = resultDeliveredBanIdsRef.current.has(key);
      const dismissed =
        viewerId.length > 0 && isDismissedResultLocally(key, viewerId);
      const shown = shownOverlayKeysRef.current.has(`result:${key}`);
      const freshAction = freshOverboardActionBanIdsRef.current.has(key);
      const freshFinalStatus = freshFinalStatusBanIdsRef.current.has(key);

      const maybeBlockStale = (blockReason: string): boolean => {
        if (
          isFreshCheckAnswerResultPendingFirstShow(key) &&
          (blockReason === 'consumed' ||
            blockReason === 'delivered' ||
            blockReason === 'shown-overlay-key' ||
            blockReason === 'dismissed-local')
        ) {
          clearStaleResultGuardForFreshCheckAnswer(key, source, blockReason);
          return false;
        }
        logResultStaleGuardBlocked({
          banId: key,
          source,
          blockReason,
          freshAction,
          consumed,
          delivered,
          dismissed,
          shown,
        });
        return true;
      };

      console.log('[result-stale-guard-check]', {
        banId,
        key,
        freshAction,
        consumed,
        delivered,
        dismissed,
        shown,
      });

      if (!key) {
        console.log('[result-card-blocked]', { banId, reason: 'no-key', source });
        return maybeBlockStale('no-key');
      }
      if (
        incomingOverboardAtomicBanIdRef.current === key &&
        notificationChainAwaitingUserRef.current
      ) {
        return false;
      }
      if (freshAction) {
        console.log('[result-stale-guard-bypass-fresh]', {
          banId: key,
          source,
        });
        return false;
      }
      if (freshFinalStatus) {
        console.log('[result-stale-guard-bypass-final-status]', {
          banId: key,
          source,
        });
        return false;
      }
      if (normalizedSkip && key === normalizedSkip) {
        console.log('[result-overlay-enqueue-skip]', {
          banId: key,
          source,
          reason: 'skip-ban',
        });
        return maybeBlockStale('skip-ban');
      }
      if (consumed) {
        console.log('[result-stale-blocked]', { banId: key, key, source });
        console.log('[result-overlay-stale-blocked]', {
          banId: key,
          source,
          reason: 'consumed',
        });
        console.log('[result-overlay-enqueue-skip]', {
          banId: key,
          source,
          reason: 'consumed',
        });
        return maybeBlockStale('consumed');
      }
      if (delivered) {
        console.log('[result-stale-blocked]', { banId: key, key, source });
        console.log('[result-overlay-stale-blocked]', {
          banId: key,
          source,
          reason: 'delivered',
        });
        console.log('[result-overlay-enqueue-skip]', {
          banId: key,
          source,
          reason: 'delivered',
        });
        return maybeBlockStale('delivered');
      }
      if (shown) {
        console.log('[result-stale-blocked]', { banId: key, key, source });
        console.log('[result-overlay-stale-blocked]', {
          banId: key,
          source,
          reason: 'shown-overlay-key',
        });
        console.log('[result-overlay-enqueue-skip]', {
          banId: key,
          source,
          reason: 'shown-overlay-key',
        });
        return maybeBlockStale('shown-overlay-key');
      }
      if (dismissed) {
        console.log('[result-stale-blocked]', { banId: key, key, source });
        console.log('[result-overlay-stale-blocked]', {
          banId: key,
          source,
          reason: 'dismissed-local',
        });
        console.log('[result-overlay-enqueue-skip]', {
          banId: key,
          source,
          reason: 'dismissed-local',
        });
        return maybeBlockStale('dismissed-local');
      }
      return false;
    },
    [clearStaleResultGuardForFreshCheckAnswer, isFreshCheckAnswerResultPendingFirstShow],
  );

  const markResultOverlayConsumed = useCallback(
    (banId: string, source: string) => {
      const key = normalizeId(banId);
      if (!key) return;
      const viewerId = userIdRef.current;
      resultPriorityBanIdsRef.current.delete(key);
      freshOverboardActionBanIdsRef.current.delete(key);
      freshFinalStatusBanIdsRef.current.delete(key);
      resultCtaConsumedBanIdsRef.current.add(key);
      resultDeliveredBanIdsRef.current.add(key);
      shownOverlayKeysRef.current.add(`result:${key}`);
      dismissBanResultLocally(key, viewerId);
      console.log('[result-overlay-consumed]', { banId: key, source });
    },
    [],
  );

  const pruneResultFromNotificationChain = useCallback(
    (
      banId: string,
      source = 'prune',
      kinds: QueuedOverlay['kind'][] = ['result'],
    ): { removedOverlay: number; removedStartup: number } => {
      const norm = normalizeId(banId);
      const head = overlayQueueRef.current[0];
      if (
        norm &&
        head?.kind === 'result' &&
        normalizeId(head.result.id) === norm &&
        kinds.includes('result') &&
        (freshOverboardActionBanIdsRef.current.has(norm) ||
          isHeldOverboardResultProtected(norm) ||
          freshFinalStatusBanIdsRef.current.has(norm) ||
          isHeldFinalStatusResultProtected(norm))
      ) {
        return { removedOverlay: 0, removedStartup: 0 };
      }
      const beforeOverlay = overlayQueueRef.current;
      const beforeStartup = pendingStartupInteractionsRef.current;
      const nextOverlay = removeOverlaysForBan(beforeOverlay, banId, kinds);
      const nextStartup = removeOverlaysForBan(beforeStartup, banId, kinds);
      const removedOverlay = beforeOverlay.length - nextOverlay.length;
      const removedStartup = beforeStartup.length - nextStartup.length;
      if (removedOverlay > 0 || removedStartup > 0) {
        emitResultClearCallsite({
          source,
          reason: 'prune-result-from-notification-chain',
          resultIdBefore: banId,
          willPruneQueue: true,
        });
        console.log('[result-overlay-pruned-before-show]', {
          banId,
          source,
          removedOverlay,
          removedStartup,
        });
        overlayQueueRef.current = nextOverlay;
        pendingStartupInteractionsRef.current = nextStartup;
        setOverlayQueue(nextOverlay);
        syncPendingStartupCount();
        emitResultHeldStillPresentAfterClear(
          source,
          'prune-result-from-notification-chain',
        );
      }
      return { removedOverlay, removedStartup };
    },
    [emitResultClearCallsite, emitResultHeldStillPresentAfterClear, syncPendingStartupCount],
  );

  const sanitizeNotificationChainQueues = useCallback(
    (source: string) => {
      const skipBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;
      const overlayHeadFreshResultId =
        overlayQueueRef.current[0]?.kind === 'result'
          ? normalizeId(overlayQueueRef.current[0].result.id)
          : null;
      const filterQueue = (
        queue: QueuedOverlay[],
        preserveHeadFreshResultId: string | null,
      ) =>
        queue.filter((item) => {
          if (item.kind !== 'result') return true;
          const itemId = normalizeId(item.result.id);
          if (
            preserveHeadFreshResultId &&
            itemId === preserveHeadFreshResultId &&
            freshOverboardActionBanIdsRef.current.has(itemId)
          ) {
            return true;
          }
          if (
            preserveHeadFreshResultId &&
            itemId === preserveHeadFreshResultId &&
            freshFinalStatusBanIdsRef.current.has(itemId)
          ) {
            return true;
          }
          if (freshFinalStatusBanIdsRef.current.has(itemId)) {
            return true;
          }
          if (isHeldFinalStatusResultProtected(itemId)) {
            return true;
          }
          if (isHeldOverboardResultProtected(itemId)) {
            return true;
          }
          return !isResultBlockedForNotificationChain(
            item.result.id,
            source,
            skipBanId,
          );
        });
      const nextOverlay = filterQueue(
        overlayQueueRef.current,
        overlayHeadFreshResultId,
      );
      const nextStartup = filterQueue(pendingStartupInteractionsRef.current, null);
      if (
        nextOverlay.length !== overlayQueueRef.current.length ||
        nextStartup.length !== pendingStartupInteractionsRef.current.length
      ) {
        overlayQueueRef.current = nextOverlay;
        pendingStartupInteractionsRef.current = nextStartup;
        setOverlayQueue(nextOverlay);
        syncPendingStartupCount();
      }
    },
    [isResultBlockedForNotificationChain, syncPendingStartupCount],
  );

  const isNotificationChainPausedForReply = useCallback(() => {
    return (
      notificationChainReplyComposeActiveRef.current ||
      replyComposeActiveRef.current ||
      chainReplyParentBanIdRef.current != null
    );
  }, []);

  const clearNotificationChainReplyCompose = useCallback((source: string) => {
    if (
      !notificationChainReplyComposeActiveRef.current &&
      !chainReplyParentBanIdRef.current
    ) {
      return;
    }
    notificationChainReplyComposeActiveRef.current = false;
    chainReplyParentBanIdRef.current = null;
    console.log('[chain-reply-compose-end]', { source });
  }, []);

  const hasActiveNotificationOverlayMounted = useCallback(() => {
    if (heldUserCardOverlayRef.current && notificationChainAwaitingUserRef.current) {
      return true;
    }
    if (sendSuccessCardActiveRef.current) return true;
    if (activeBanCardVisibleRef.current) return true;
    if (replyParentActivePriorityActiveRef.current) return true;
    if (incomingBanRef.current?.id) return true;
    if (checkBanRef.current?.id) return true;
    if (resultRef.current?.id) return true;
    if (directResultOverlayRef.current || directResultOverlayActiveRef.current) {
      return true;
    }
    return false;
  }, []);

  const mergeStartupIntoOverlayQueueOnly = useCallback(
    (source: string) => {
      const queueLenBefore = overlayQueueRef.current.length;
      const pendingLenBefore = pendingStartupInteractionsRef.current.length;

      if (shouldBlockSingleCardChainContinuation(source)) {
        logDeeplinkSingleCardChainBlocked({
          source,
          reason: 'merge-startup-single-card',
        });
        logPendingStartupToOverlayMergeDecision({
          source,
          pendingLenBefore,
          queueLenBefore,
          mergedCount: 0,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
          skipReason: 'single-card-chain-blocked',
          startupHold: startupInteractionsHoldRef.current,
        });
        return 0;
      }
      if (
        shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        )
      ) {
        logNonExplicitDrainBlocked({
          source,
          reason: 'merge-startup-into-overlay',
          startupHold: startupInteractionsHoldRef.current,
        });
        logPendingStartupToOverlayMergeDecision({
          source,
          pendingLenBefore,
          queueLenBefore,
          mergedCount: 0,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
          skipReason: 'non-explicit-drain-blocked',
          startupHold: startupInteractionsHoldRef.current,
        });
        return 0;
      }
      if (
        blocksMountedNotificationOverlay(
          `mergeStartupIntoOverlayQueueOnly:${source}`,
          null,
          null,
        )
      ) {
        logPendingStartupToOverlayMergeDecision({
          source,
          pendingLenBefore,
          queueLenBefore,
          mergedCount: 0,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
          skipReason: 'mounted-overlay-blocks',
          startupHold: startupInteractionsHoldRef.current,
        });
        return 0;
      }
      const pending = pendingStartupInteractionsRef.current;
      if (pending.length === 0) {
        logPendingStartupToOverlayMergeDecision({
          source,
          pendingLenBefore: 0,
          queueLenBefore,
          mergedCount: 0,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: 0,
          skipReason: 'pending-empty',
          startupHold: startupInteractionsHoldRef.current,
        });
        return 0;
      }

      const skipBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;
      const viewerId = userIdRef.current?.trim() ?? null;
      const releasable = pending.filter((item) => {
        if (item.kind === 'check') {
          return shouldShowCheckOverlay(
            item.ban,
            viewerId,
            dismissedCheckSessionRef.current,
            answeredCheckRef.current,
            checkAnswerInFlightRef.current,
            resultOpenRef.current,
          );
        }
        if (item.kind !== 'result') return true;
        return !isResultBlockedForNotificationChain(
          item.result.id,
          source,
          skipBanId,
        );
      });

      if (releasable.length === 0) {
        logPendingStartupToOverlayMergeDecision({
          source,
          pendingLenBefore,
          queueLenBefore,
          mergedCount: 0,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
          skipReason: 'all-pending-results-blocked',
          startupHold: startupInteractionsHoldRef.current,
        });
        return 0;
      }

      if (overlayQueueRef.current.length === 0) {
        const wouldHead = releasable[0] ?? null;
        if (
          wouldHead &&
          blockAndPreserveActiveUserCard(
            'mergeStartupIntoOverlayQueueOnly',
            wouldHead,
          )
        ) {
          logPendingStartupToOverlayMergeDecision({
            source,
            pendingLenBefore,
            queueLenBefore,
            mergedCount: 0,
            queueLenAfter: queueLenBefore,
            pendingLenAfter: pendingLenBefore,
            skipReason: 'active-user-card-blocks-head',
            startupHold: startupInteractionsHoldRef.current,
          });
          return 0;
        }
      }

      startupInteractionsHoldRef.current = false;
      pendingStartupInteractionsRef.current = [];
      syncPendingStartupCount();

      let next = overlayQueueRef.current;
      for (const item of releasable) {
        next = enqueueWithActiveLock(next, item).queue;
      }
      overlayQueueRef.current = next;
      setOverlayQueue(next);

      logPendingStartupToOverlayMergeDecision({
        source,
        pendingLenBefore,
        queueLenBefore,
        mergedCount: releasable.length,
        queueLenAfter: overlayQueueRef.current.length,
        pendingLenAfter: pendingStartupInteractionsRef.current.length,
        skipReason: null,
        startupHold: startupInteractionsHoldRef.current,
      });
      return releasable.length;
    },
    [isResultBlockedForNotificationChain, syncPendingStartupCount],
  );

  const mergePendingSnapshotIntoOverlayQueue = useCallback(
    (snapshot: QueuedOverlay[], source: string): number => {
      if (snapshot.length === 0) return 0;
      if (
        shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        )
      ) {
        logNonExplicitDrainBlocked({
          source,
          reason: 'merge-pending-snapshot',
          startupHold: startupInteractionsHoldRef.current,
          snapshotLen: snapshot.length,
        });
        return 0;
      }

      const explicitLobbyDrain = source.includes('lobby-bans-cta');
      const skipBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;

      const releasable = snapshot.filter((item) => {
        if (item.kind !== 'result') return true;
        const banId = normalizeId(item.result.id);
        if (!banId) return false;
        if (explicitLobbyDrain) {
          freshOverboardActionBanIdsRef.current.add(banId);
          resultCtaConsumedBanIdsRef.current.delete(banId);
          resultDeliveredBanIdsRef.current.delete(banId);
          shownOverlayKeysRef.current.delete(`result:${banId}`);
          return true;
        }
        return !isResultBlockedForNotificationChain(
          item.result.id,
          source,
          skipBanId,
        );
      });

      if (releasable.length === 0) return 0;

      if (overlayQueueRef.current.length === 0) {
        const wouldHead = releasable[0] ?? null;
        if (
          wouldHead &&
          blockAndPreserveActiveUserCard(
            'mergePendingSnapshotIntoOverlayQueue',
            wouldHead,
            { explicitUserAction: true },
          )
        ) {
          return 0;
        }
      }

      let next = overlayQueueRef.current;
      for (const item of releasable) {
        let nextItem = item;
        if (item.kind === 'incoming') {
          const itemId = normalizeId(item.ban.id);
          const existing = next.find(
            (q) =>
              q.kind === 'incoming' && normalizeId(q.ban.id) === itemId,
          );
          if (existing?.kind === 'incoming') {
            nextItem = {
              kind: 'incoming',
              ban: pickRicherIncomingBan(existing.ban, item.ban),
            };
          }
        }
        next = enqueueWithActiveLock(next, nextItem).queue;
      }
      if (next.length === overlayQueueRef.current.length) {
        return 0;
      }

      overlayQueueRef.current = next;
      setOverlayQueue(next);
      chainAdvanceExplicitRef.current = true;
      syncDisplayFromQueue(next);
      return releasable.length;
    },
    [isResultBlockedForNotificationChain, syncDisplayFromQueue],
  );

  const releaseStartupInteractions = useCallback(
    (opts?: { requireBanSend?: boolean; force?: boolean }) => {
      if (opts?.force) {
        allowDeeplinkExplicitNotificationDrain('releaseStartupInteractions');
      }
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

      if (
        blocksMountedNotificationOverlay(
          'releaseStartupInteractions',
          null,
          null,
        )
      ) {
        if (pending.length > 0) {
          pendingStartupInteractionsRef.current = pending;
          syncPendingStartupCount();
        }
        return;
      }

      console.log('[startup-interactions-release]', {
        count: pending.length,
        requireBanSend: opts?.requireBanSend ?? false,
        force: opts?.force ?? false,
      });

      if (pending.length === 0) return;

      const skipBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;
      const releasable = pending.filter((item) => {
        if (item.kind !== 'result') return true;
        return !isResultBlockedForNotificationChain(
          item.result.id,
          'startup-release',
          skipBanId,
        );
      });

      if (
        notificationChainAwaitingUserRef.current &&
        hasActiveNotificationOverlayMounted()
      ) {
        console.log('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          source: 'releaseStartupInteractions',
          pendingCount: releasable.length,
        });
        window.__debug98log?.('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          source: 'releaseStartupInteractions',
          pendingCount: releasable.length,
        });
        pendingStartupInteractionsRef.current = releasable;
        syncPendingStartupCount();
        return;
      }
      if (isActiveCheckOverlayMounted()) {
        console.log('[check-overlay-close-blocked]', {
          banId: checkBanRef.current?.id ?? null,
          reason: 'no-user-action',
        });
        console.log('[chain-drain-continue-blocked]', {
          reason: 'active-check-mounted',
          source: 'releaseStartupInteractions',
          pendingCount: releasable.length,
        });
        window.__debug98log?.('[chain-drain-continue-blocked]', {
          reason: 'active-check-mounted',
          source: 'releaseStartupInteractions',
          pendingCount: releasable.length,
        });
        pendingStartupInteractionsRef.current = releasable;
        syncPendingStartupCount();
        return;
      }
      if (isNotificationChainPausedForReply()) {
        console.log('[chain-reply-block-next-notification]', {
          parentBanId: replyDeeplinkParentBanIdRef.current,
          reason: 'reply-compose',
          source: 'releaseStartupInteractions',
          pendingCount: releasable.length,
        });
        pendingStartupInteractionsRef.current = releasable;
        syncPendingStartupCount();
        return;
      }

      deepLinkBlockedRef.current = isNotificationQueueLocked();
      for (const item of releasable) {
        enqueueNotification(item, { source: 'session' });
      }
      syncDisplayFromQueue(overlayQueueRef.current);
    },
    [
      enqueueNotification,
      hasActiveNotificationOverlayMounted,
      isNotificationChainPausedForReply,
      isResultBlockedForNotificationChain,
      syncDisplayFromQueue,
      syncPendingStartupCount,
    ],
  );

  const hasPendingNotificationChain = useCallback(() => {
    if (overlayQueueRef.current.length > 0) return true;
    if (pendingStartupInteractionsRef.current.length > 0) return true;
    if (incomingBanRef.current?.id) return true;
    if (checkBanRef.current?.id) return true;
    if (notificationChainHandoffRef.current) return true;
    if (notificationChainAwaitingUserRef.current) return true;
    if (notificationChainReplyComposeActiveRef.current) return true;
    if (chainReplyParentBanIdRef.current) return true;
    if (replyComposeActiveRef.current) return true;
    if (
      directResultOverlayRef.current ||
      directResultOverlayActiveRef.current
    ) {
      return true;
    }
    const resultId = resultRef.current?.id ?? null;
    const viewerId = userIdRef.current?.trim() ?? '';
    if (
      resultId &&
      !resultCtaConsumedBanIdsRef.current.has(resultId) &&
      !(viewerId && isDismissedResultLocally(resultId, viewerId))
    ) {
      return true;
    }
    return false;
  }, []);

  hasPendingNotificationChainFnRef.current = hasPendingNotificationChain;

  const armPostSuccessHandoffEarlyIfPending = useCallback(
    (source = 'success-exit-early'): boolean => {
      const queueLen = overlayQueueRef.current.length;
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const hasPendingChain = hasPendingNotificationChain();
      return armPostSuccessHandoffEarly({
        source,
        queueLen,
        pendingLen,
        hasPendingChain,
      });
    },
    [hasPendingNotificationChain],
  );

  const getNotificationChainDebugSnapshot = useCallback(() => {
    const head = overlayQueueRef.current[0] ?? null;
    const activeKind =
      directResultOverlayRef.current || directResultOverlayActiveRef.current
        ? 'result-direct'
        : (head?.kind ??
          (incomingBanRef.current
            ? 'incoming'
            : checkBanRef.current
              ? 'check'
              : null));
    const activeBanId =
      head?.kind === 'result'
        ? head.result.id
        : head?.kind === 'incoming' || head?.kind === 'check'
          ? head.ban.id
          : (incomingBanRef.current?.id ??
            checkBanRef.current?.id ??
            resultRef.current?.id ??
            null);
    return {
      overlayLen: overlayQueueRef.current.length,
      startupLen: pendingStartupInteractionsRef.current.length,
      activeKind,
      activeBanId,
      incomingBanId: incomingBanRef.current?.id ?? null,
      checkBanId: checkBanRef.current?.id ?? null,
      resultId: resultRef.current?.id ?? null,
      handoff: notificationChainHandoffRef.current,
      awaitingUser: notificationChainAwaitingUserRef.current,
    };
  }, []);

  const clearNotificationChainReturnLatch = useCallback((source: string) => {
    if (!bansReturnToLobbyLatchRef.current) return;
    setBansReturnToLobbyLatch(false, {
      source: `clearNotificationChainReturnLatch:${source}`,
    });
    console.log('[notification-chain-latch-clear]', { source });
  }, [setBansReturnToLobbyLatch]);

  const prefetchPendingNotificationChain = useCallback(
    async (
      deeplinkBanId: string | null,
      source: string,
    ): Promise<boolean> => {
      const queueLenBefore = overlayQueueRef.current.length;
      const pendingLenBefore = pendingStartupInteractionsRef.current.length;

      if (shouldBlockPostSuccessPrefetchAfterEmpty(source)) {
        logQueueApiResultApplyDecision({
          source,
          endpoint: '/bans/incoming/pending-all',
          count: 0,
          banIds: [],
          willMergeToOverlayQueue: false,
          willMergeToPendingStartup: false,
          willOnlyPrimeIndicator: false,
          skipReason: 'post-success-prefetch-blocked-after-empty',
          queueLenBefore,
          pendingLenBefore,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
        });
        logIncomingPendingAllMergeSkipped({
          source,
          banIds: [],
          reason: 'post-success-prefetch-blocked-after-empty',
          ...buildMergeSkippedFlags(
            source,
            notificationChainTransitioningRef.current,
          ),
        });
        return false;
      }
      const token = tokenRef.current;
      const viewerId = userIdRef.current?.trim() ?? '';
      if (!token || !viewerId) {
        logQueueApiResultApplyDecision({
          source,
          endpoint: '/bans/incoming/pending-all',
          count: 0,
          banIds: [],
          willMergeToOverlayQueue: false,
          willMergeToPendingStartup: false,
          willOnlyPrimeIndicator: false,
          skipReason: 'no-token-or-viewer',
          queueLenBefore,
          pendingLenBefore,
          queueLenAfter: queueLenBefore,
          pendingLenAfter: pendingLenBefore,
        });
        return false;
      }

      console.log('[pending-chain-prefetch-start]', {
        source,
        deeplinkBanId,
      });

      pendingChainPrefetchInFlightRef.current += 1;
      try {
        const prefetched = await fetchPendingChainPrefetch(token, {
          source,
          telegramUserId: viewerId,
          reason: 'prefetchPendingNotificationChain',
          knownDirectBanId:
            deeplinkBanId?.trim() ||
            replyDeepLinkBanIdRef.current?.trim() ||
            readKnownDirectBanId(),
          hasLobbyBansAttentionHint: lobbyBansAttentionHint > 0,
          restoreStateFound:
            lobbyBansAttentionHint > 0 ||
            (viewerId
              ? readLobbyNotificationAttentionHint(viewerId) > 0
              : false) ||
            Boolean(lastSessionIncomingRef.current?.id) ||
            Boolean(bufferedIncomingRef.current?.id),
          rejectedPendingDiag: {
            queueLenBefore,
            pendingLenBefore,
            queueBanIds: overlayQueueRef.current.map((q) =>
              normalizeId(overlayBanId(q)),
            ),
            pendingBanIds: pendingStartupInteractionsRef.current.map((q) =>
              normalizeId(overlayBanId(q)),
            ),
            dismissedIncoming: [...dismissedIncomingRef.current],
            locallyAckedIncoming: [...locallyAckedIncomingRef.current],
            incomingConsumedAfterAnswer: [
              ...incomingConsumedAfterAnswerRef.current,
            ],
          },
        });
        if (
          tokenRef.current !== token ||
          userIdRef.current?.trim() !== viewerId
        ) {
          logQueueApiResultApplyDecision({
            source,
            endpoint: '/bans/incoming/pending-all',
            count: prefetched.incoming.length,
            banIds: prefetched.incoming.map((b) => b.id),
            willMergeToOverlayQueue: false,
            willMergeToPendingStartup: false,
            willOnlyPrimeIndicator: false,
            skipReason: 'stale-auth-after-fetch',
            queueLenBefore,
            pendingLenBefore,
            queueLenAfter: overlayQueueRef.current.length,
            pendingLenAfter: pendingStartupInteractionsRef.current.length,
          });
          return false;
        }

        const incomingIds = prefetched.incoming.map((b) => b.id);
        const checkIds = prefetched.check?.id ? [prefetched.check.id] : [];
        const resultIds = prefetched.result?.id ? [prefetched.result.id] : [];

        console.log('[pending-chain-prefetch-result]', {
          incomingIds,
          checkIds,
          resultIds,
        });

        const toEnqueue: QueuedOverlay[] = [];
        const enqueuedIds: string[] = [];
        const skipDetails: Array<{ banId: string; reason: string }> = [];
        const skipBanId = deeplinkBanId?.trim() ?? '';
        const prefetchedResultId = prefetched.result?.id
          ? normalizeId(prefetched.result.id)
          : '';

        for (const ban of prefetched.incoming) {
          const enriched = enrichBanInteraction(ban);
          if (skipBanId && enriched.id === skipBanId) {
            console.log('[pending-chain-skip-current]', {
              banId: enriched.id,
              reason: 'current-deeplink',
            });
            skipDetails.push({ banId: enriched.id, reason: 'current-deeplink' });
            continue;
          }
          if (dismissedIncomingRef.current.has(enriched.id)) {
            skipDetails.push({ banId: enriched.id, reason: 'dismissed-incoming' });
            continue;
          }
          if (incomingConsumedAfterAnswerRef.current.has(enriched.id)) {
            skipDetails.push({
              banId: enriched.id,
              reason: 'consumed-after-answer',
            });
            continue;
          }
          if (locallyAckedIncomingRef.current.has(enriched.id)) {
            skipDetails.push({ banId: enriched.id, reason: 'locally-acked' });
            continue;
          }
          toEnqueue.push({ kind: 'incoming', ban: enriched });
          enqueuedIds.push(enriched.id);
        }

        if (prefetched.check?.id) {
          const check = enrichBanInteraction(prefetched.check);
          const checkId = normalizeId(check.id);
          if (
            resultPriorityBanIdsRef.current.has(checkId) ||
            (prefetchedResultId && checkId === prefetchedResultId)
          ) {
            logCheckPrimeSkipStaleBecauseResultExists({
              banId: checkId,
              source: 'pending-chain-prefetch',
            });
          } else {
            const picked = pickCheckForOverlay(
              check,
              viewerId,
              dismissedCheckSessionRef.current,
              answeredCheckRef.current,
              checkAnswerInFlightRef.current,
              resultOpenRef.current,
            );
            if (picked) {
              toEnqueue.push({ kind: 'check', ban: picked });
              enqueuedIds.push(picked.id);
            } else {
              skipDetails.push({ banId: checkId, reason: 'check-not-picked' });
            }
          }
        }

        if (prefetched.result?.id) {
          const r = normalizeBanResult(prefetched.result);
          const resultNorm = normalizeId(r.id);
          if (
            source.includes('result-overlay-prime') &&
            shouldBlockPassiveResultLookaheadDisplay(
              source,
              buildPassiveResultGateContext(resultNorm),
            )
          ) {
            logPassiveResultLookaheadBlocked({
              source,
              banId: r.id,
              lobbyOpen: lobbyOpenRef.current,
              activeDrain:
                chainAdvanceExplicitRef.current ||
                notificationChainTransitioningRef.current,
              activeKind: heldUserCardOverlayRef.current?.kind ?? null,
            });
            skipDetails.push({
              banId: resultNorm,
              reason: 'passive-result-lookahead-blocked',
            });
          } else if (
            !isResultBlockedForNotificationChain(
              r.id,
              'pending-chain-prefetch',
              skipBanId,
            )
          ) {
            resultPriorityBanIdsRef.current.add(resultNorm);
            toEnqueue.push({ kind: 'result', result: r });
            enqueuedIds.push(r.id);
          } else {
            skipDetails.push({
              banId: resultNorm,
              reason: 'result-blocked-for-chain',
            });
          }
        }

        const indicatorPrimeOnly = isLobbyIndicatorPrefetchSource(source);
        const apiIncomingCount = prefetched.incoming.length;

        if (toEnqueue.length === 0) {
          const mergeSkipReason =
            skipDetails.length > 0
              ? skipDetails.map((s) => `${s.banId}:${s.reason}`).join(',')
              : apiIncomingCount === 0
                ? 'api-incoming-empty'
                : 'all-items-filtered-unknown';

          lastChainRejectOnlyPrefetchRef.current =
            prefetched.rejectDebug.length > 0 &&
            toEnqueue.length === 0 &&
            !prefetched.check?.id &&
            !prefetched.result?.id;

          if (prefetched.rejectDebug.length > 0) {
            const advanceWaitingBefore = chainAdvanceWaitingRef.current;
            if (advanceWaitingBefore) {
              setChainAdvanceWaiting(false);
              logChainAdvanceWaitingClearedRejectedOnly({
                reason: 'prefetch-rejected-only-no-enqueue',
                rejectCount: prefetched.rejectDebug.length,
                toEnqueueLen: 0,
                queueLen: overlayQueueRef.current.length,
                pendingLen: pendingStartupInteractionsRef.current.length,
                advanceWaitingBefore,
                advanceWaitingAfter: chainAdvanceWaitingRef.current,
              });
            }
          }

          const queueCounts = (() => {
            let incomingLen = 0;
            let checkLen = 0;
            let resultLen = 0;
            for (const item of overlayQueueRef.current) {
              if (item.kind === 'incoming') incomingLen += 1;
              else if (item.kind === 'check') checkLen += 1;
              else if (item.kind === 'result') resultLen += 1;
            }
            for (const item of pendingStartupInteractionsRef.current) {
              if (item.kind === 'incoming') incomingLen += 1;
              else if (item.kind === 'check') checkLen += 1;
              else if (item.kind === 'result') resultLen += 1;
            }
            return { incomingLen, checkLen, resultLen };
          })();
          logChainFinalizeDiag({
            source: `${source}-prefetch-empty`,
            reason: mergeSkipReason,
            queueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            incomingLen: queueCounts.incomingLen,
            checkLen: queueCounts.checkLen,
            resultLen: queueCounts.resultLen,
            hasPendingStartup:
              pendingStartupInteractionsRef.current.length > 0,
            hasOverlayQueue: overlayQueueRef.current.length > 0,
            hasRejectedOnly: lastChainRejectOnlyPrefetchRef.current,
            prefetchInFlight: pendingChainPrefetchInFlightRef.current > 0,
            pollInFlight:
              resultPollBurstTimersRef.current.length > 0 ||
              checkAnswerInFlightRef.current.size > 0,
            chainAdvanceWaiting: chainAdvanceWaitingRef.current,
            notificationChainTransitioning:
              notificationChainTransitioningRef.current,
            shouldOpenLobbyOrSection: false,
            rejectDebugCount: prefetched.rejectDebug.length,
            apiIncomingCount,
            skipDetails,
          });

          logIncomingPendingAllMergeSkipped({
            source,
            banIds: incomingIds,
            reason: mergeSkipReason,
            skipDetails,
            ...buildMergeSkippedFlags(
              source,
              notificationChainTransitioningRef.current,
            ),
          });
          logQueueApiResultApplyDecision({
            source,
            endpoint: '/bans/incoming/pending-all',
            count: apiIncomingCount,
            banIds: incomingIds,
            willMergeToOverlayQueue: false,
            willMergeToPendingStartup: false,
            willOnlyPrimeIndicator: indicatorPrimeOnly,
            skipReason: mergeSkipReason,
            queueLenBefore,
            pendingLenBefore,
            queueLenAfter: overlayQueueRef.current.length,
            pendingLenAfter: pendingStartupInteractionsRef.current.length,
            toEnqueueLen: 0,
            enqueuedIds: [],
          });
          return false;
        }

        if (indicatorPrimeOnly) {
          logLobbyIndicatorPrefetchNoOverlay({
            source,
            enqueuedIds,
            pendingOnly: true,
          });
        } else {
          startupInteractionsHoldRef.current = false;
        }

        const nextPending = mergeStartupPendingChain(
          pendingStartupInteractionsRef.current,
          toEnqueue,
        );
        pendingStartupInteractionsRef.current = nextPending;
        syncPendingStartupCount();

        const queueLenAfter = overlayQueueRef.current.length;
        const pendingLenAfter = pendingStartupInteractionsRef.current.length;

        logQueueApiResultApplyDecision({
          source,
          endpoint: '/bans/incoming/pending-all',
          count: apiIncomingCount,
          banIds: incomingIds,
          willMergeToOverlayQueue: false,
          willMergeToPendingStartup: true,
          willOnlyPrimeIndicator: indicatorPrimeOnly,
          skipReason: skipDetails.length > 0 ? 'partial-incoming-skipped' : null,
          queueLenBefore,
          pendingLenBefore,
          queueLenAfter,
          pendingLenAfter,
          toEnqueueLen: toEnqueue.length,
          enqueuedIds,
        });

        console.log('[pending-chain-enqueue-rest]', {
          deeplinkBanId: skipBanId || null,
          enqueuedIds,
          indicatorPrimeOnly,
        });

        return true;
      } catch {
        logQueueApiResultApplyDecision({
          source,
          endpoint: '/bans/incoming/pending-all',
          count: 0,
          banIds: [],
          willMergeToOverlayQueue: false,
          willMergeToPendingStartup: false,
          willOnlyPrimeIndicator: false,
          skipReason: 'prefetch-threw',
          queueLenBefore,
          pendingLenBefore,
          queueLenAfter: overlayQueueRef.current.length,
          pendingLenAfter: pendingStartupInteractionsRef.current.length,
        });
        return false;
      } finally {
        pendingChainPrefetchInFlightRef.current = Math.max(
          0,
          pendingChainPrefetchInFlightRef.current - 1,
        );
      }
    },
    [
      isResultBlockedForNotificationChain,
      lobbyBansAttentionHint,
      setChainAdvanceWaiting,
      syncPendingStartupCount,
    ],
  );

  const countLobbyPendingHasIncoming = useCallback((): boolean => {
    if (incomingBanRef.current?.id) return true;
    const hasInList = (items: QueuedOverlay[]) =>
      items.some((item) => item.kind === 'incoming');
    return (
      hasInList(pendingStartupInteractionsRef.current) ||
      hasInList(overlayQueueRef.current)
    );
  }, []);

  const primeLobbyBansAttentionHintSync = useCallback(
    (source: string) => {
      const uid = userIdRef.current?.trim() ?? '';
      if (!uid) return;

      syncPendingStartupCount();
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const queueLen = overlayQueueRef.current.length;
      let hint = pendingLen + queueLen;

      if (hint <= 0) {
        hint = readLobbyNotificationAttentionHint(uid);
      }
      if (hint <= 0) {
        let localSignals = 0;
        const countIncoming = (id: string | null | undefined) => {
          const norm = id?.trim() ?? '';
          if (!norm || dismissedIncomingRef.current.has(norm)) return;
          localSignals += 1;
        };
        countIncoming(incomingBanRef.current?.id);
        countIncoming(lastSessionIncomingRef.current?.id);
        countIncoming(bufferedIncomingRef.current?.id);
        hint = localSignals;
      }

      if (hint > 0) {
        noteLastBansIndicatorReason(source);
        setLobbyBansAttentionHint((prev) => Math.max(prev, hint));
        persistLobbyNotificationAttentionHint(uid, hint);
      }

      const payload = {
        pendingLen,
        queueLen,
        hasIncoming: countLobbyPendingHasIncoming(),
        source,
        hint,
      };
      const composePhase = sendComposePhaseRef.current;
      const composeFlowActive = isSendComposeFlowActive();
      if (composeFlowActive && isLobbyIndicatorPrimeOnlySource(source)) {
        logLobbyIndicatorDuringConfirm({
          ...payload,
          sendComposePhase: composePhase,
          replyComposeActive: replyComposeActiveRef.current,
          isPostSuccessHandoffInProgress: isPostSuccessHandoffInProgress(),
          selectedNextKind:
            getPostSuccessHandoffSelectedNext()?.kind ?? null,
          selectedNextBanId:
            getPostSuccessHandoffSelectedNext()?.banId ?? null,
        });
      }
      if (isLobbyIndicatorPrimeOnlySource(source)) {
        logLobbyIndicatorPrimeOnly(payload);
      } else {
        logLobbyIndicatorPrimeReady(payload);
      }
    },
    [countLobbyPendingHasIncoming, syncPendingStartupCount],
  );

  primeLobbyBansAttentionHintSyncRef.current = primeLobbyBansAttentionHintSync;

  const primeLobbyBansIndicator = useCallback(async () => {
    const uid = userIdRef.current?.trim() ?? '';
    const token = tokenRef.current;
    if (!uid || !token) return;
    if (lobbyIndicatorPrimedForUserRef.current === uid) return;
    lobbyIndicatorPrimedForUserRef.current = uid;

    logLobbyIndicatorPrimeStart();
    primeLobbyBansAttentionHintSync('lobby-indicator-prime-sync');

    let pendingLen = pendingStartupInteractionsRef.current.length;
    let queueLen = overlayQueueRef.current.length;
    let hasIncoming = countLobbyPendingHasIncoming();

    if (pendingLen > 0 || queueLen > 0) {
      return;
    }

    const prefetched = await prefetchPendingNotificationChain(
      null,
      'lobby-indicator-prime',
    );
    if (
      !uid ||
      !token ||
      userIdRef.current?.trim() !== uid ||
      tokenRef.current !== token
    ) {
      return;
    }

    primeLobbyBansAttentionHintSync('lobby-indicator-prime-after-prefetch');
    pendingLen = pendingStartupInteractionsRef.current.length;
    queueLen = overlayQueueRef.current.length;
    hasIncoming = countLobbyPendingHasIncoming();

    const hint = readLobbyNotificationAttentionHint(uid);
    if (hint > 0 && pendingLen === 0 && queueLen === 0 && !prefetched) {
      logLobbyIndicatorDelayBug({ hint, prefetched });
    }
  }, [
    countLobbyPendingHasIncoming,
    prefetchPendingNotificationChain,
    primeLobbyBansAttentionHintSync,
  ]);

  const runChainLookaheadPrefetch = useCallback(
    (skipBanId: string | null, source: string): void => {
      if (
        source.includes('result-overlay-prime') &&
        shouldBlockPassiveResultLookaheadDisplay(
          source,
          buildPassiveResultGateContext(skipBanId),
        )
      ) {
        const held = heldUserCardOverlayRef.current;
        logPassiveResultLookaheadBlocked({
          source,
          banId: skipBanId,
          lobbyOpen: lobbyOpenRef.current,
          activeDrain:
            chainAdvanceExplicitRef.current ||
            notificationChainTransitioningRef.current,
          activeKind: held?.kind ?? null,
        });
        primeLobbyBansAttentionHintSyncRef.current(
          'passive-result-lookahead-blocked',
        );
        return;
      }
      const mounted = getActiveUserCardForGuard();
      if (mounted) {
        logChainLookaheadOnlyActiveUserCard({
          activeKind: mounted.kind,
          activeBanId: mounted.banId,
          source,
          skipBanId,
        });
      }
      const normalizedSkip = normalizeId(skipBanId);
      if (
        source === 'check-overlay-prime' &&
        normalizedSkip &&
        resultPriorityBanIdsRef.current.has(normalizedSkip)
      ) {
        logCheckPrimeSkipStaleBecauseResultExists({
          banId: normalizedSkip,
          source,
        });
        return;
      }
      const key = skipBanId?.trim() || '__none__';
      const alreadyHasNext =
        overlayQueueRef.current.length > 1 ||
        pendingStartupInteractionsRef.current.length > 0;
      if (alreadyHasNext) {
        window.__debug98log?.('[CHAIN LOOKAHEAD READY]', {
          source,
          skipBanId,
          reason: 'already-queued',
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        return;
      }
      if (chainLookaheadInflightRef.current.has(key)) return;

      window.__debug98log?.('[CHAIN LOOKAHEAD START]', { source, skipBanId });
      console.log('[CHAIN LOOKAHEAD START]', { source, skipBanId });

      const task = (async () => {
        const prefetched = await prefetchPendingNotificationChain(
          skipBanId || null,
          source,
        );
        window.__debug98log?.('[CHAIN LOOKAHEAD READY]', {
          source,
          skipBanId,
          prefetched,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        console.log('[CHAIN LOOKAHEAD READY]', {
          source,
          skipBanId,
          prefetched,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        return prefetched;
      })().finally(() => {
        chainLookaheadInflightRef.current.delete(key);
      });

      chainLookaheadInflightRef.current.set(key, task);
    },
    [prefetchPendingNotificationChain],
  );
  runChainLookaheadPrefetchRef.current = runChainLookaheadPrefetch;

  const primePendingChainAfterResultAck = useCallback(
    async (consumedBanId: string | null, source: string): Promise<boolean> => {
      const hasNextAlready =
        overlayQueueRef.current.length > 1 ||
        pendingStartupInteractionsRef.current.length > 0;
      if (hasNextAlready) {
        console.log('[pending-chain-prime-skip]', {
          source,
          reason: 'next-already-queued',
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        return true;
      }

      const key = consumedBanId?.trim() ?? '';
      if (key) {
        console.log('[pending-chain-prime-ack]', { source, banId: key });
        await acknowledgeBanResultOnServer(key, tokenRef.current, source);
      }

      const prefetched = await prefetchPendingNotificationChain(
        key || null,
        source,
      );
      const ready =
        prefetched ||
        overlayQueueRef.current.length > 0 ||
        pendingStartupInteractionsRef.current.length > 0;
      console.log('[pending-chain-prime-ready]', {
        source,
        prefetched,
        ready,
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
      });
      return ready;
    },
    [prefetchPendingNotificationChain],
  );

  const openBanResult = useCallback(
    (r: BanResult | null | undefined, mode: ResultOpenMode) => {
      const queueHeadKind = overlayQueueRef.current[0]?.kind ?? null;
      const resultKey = r?.id ? `result:${r.id}` : null;

      if (
        r &&
        deferResultWhileSuccessCardMounted(`openBanResult:${mode}`, {
          kind: 'result',
          result: r,
        })
      ) {
        return;
      }

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

      if (
        mode === 'auto' &&
        shouldBlockPassiveResultOverlayOpenForBan('openBanResult:auto', r.id)
      ) {
        logPassiveResultOverlayBlocked({
          source: 'openBanResult:auto',
          banId: r.id,
          phase: 'open-blocked',
          passiveSource: true,
          lobbyOpen: lobbyOpenRef.current,
        });
        pendingStartupInteractionsRef.current = mergeStartupPendingSingle(
          pendingStartupInteractionsRef.current,
          { kind: 'result', result: r },
        );
        syncPendingStartupCount();
        primeLobbyBansAttentionHintSyncRef.current(
          'passive-result-openBanResult-blocked',
        );
        return;
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

      if (source === 'poll' && !fullOverlay) {
        logResultPollDoesNotHideLobby({
          banId: r.id,
          mode,
          queueLen: overlayQueueRef.current.length,
          headKind: head?.kind ?? null,
        });
      }

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
      window.__debug98log?.('[DISMISS RESULT SKIPPED]', {
        banId: result?.id ?? resultRef.current?.id ?? null,
        bansReturnToLobbyLatchRef: true,
        source: 'dismissBanResult',
        reason: 'bans-return-latch',
        queueLen: overlayQueueRef.current.length,
      });
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
    const dismissKind = head?.kind ?? 'result';
    const dismissBanId =
      head?.kind === 'result'
        ? head.result.id
        : head?.kind === 'incoming' || head?.kind === 'check'
          ? head.ban.id
          : (result?.id ?? resultRef.current?.id ?? null);

    const needsPrime =
      overlayQueueRef.current.length <= 1 &&
      pendingStartupInteractionsRef.current.length === 0;

    void (async () => {
      if (needsPrime && dismissBanId) {
        setNotificationChainTransitioning(true);
        await primePendingChainAfterResultAck(
          dismissBanId,
          'dismissBanResult-before-close',
        );
      }

      if (pendingStartupInteractionsRef.current.length > 0) {
        mergeStartupIntoOverlayQueueOnly('dismissBanResult-prime');
      }

      const hasMoreInChain =
        overlayQueueRef.current.length > 1 ||
        pendingStartupInteractionsRef.current.length > 0;

      logTransitionFromRefs('[DISMISS START]', {
        kind: dismissKind,
        banId: dismissBanId,
        source: 'dismissBanResult',
      });

      const runDismiss = () => {
        if (hasMoreInChain) {
          setNotificationChainTransitioning(true);
        }

        const headNow = overlayQueueRef.current[0];
        const wasDirect = directResultOverlayRef.current;
        const banId =
          headNow?.kind === 'result'
            ? headNow.result.id
            : (result?.id ?? null);
        if (banId) {
          if (incomingOverboardAtomicBanIdRef.current === banId) {
            incomingOverboardAtomicBanIdRef.current = null;
          }
          markResultOverlayConsumed(banId, 'dismissBanResult');
          void acknowledgeBanResultOnServer(banId, tokenRef.current);
        }
        clearLocalOverboardBypass();
        if (wasDirect) {
          overboardInFlightRef.current = null;
        }
        const gateBefore = snapshotDirectOverboardGate();
        clearDirectOverboardLayerRefs();
        setDirectResultOverlayActive(false);
        const clearsResult = wasDirect || headNow?.kind !== 'result';
        if (clearsResult) {
          logResultStateCleared('dismissBanResult', {
            banId,
            resultId: banId,
            wasDirect,
          });
          emitResultClearCallsite({
            source: 'dismissBanResult',
            reason: clearsResult ? 'dismiss-clear-result' : 'dismiss-keep-queue-result',
            resultIdBefore: banId,
            willClearResult: clearsResult,
          });
          setResult(null);
          emitResultHeldStillPresentAfterClear(
            'dismissBanResult',
            clearsResult ? 'dismiss-clear-result' : 'dismiss-keep-queue-result',
          );
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
        if (headNow?.kind === 'result') {
          dismissCurrentOverlay('result-dismiss');
        }
      };

      if (hasMoreInChain) {
        flushSync(runDismiss);
      } else {
        runDismiss();
      }
      await continueNotificationChainOrOpenLobbyRef.current(
        'dismissBanResult-after-close',
        {
          prefetchSkipBanId: dismissBanId,
        },
      );
    })();
  }, [
    clearDirectOverboardLayerRefs,
    dismissCurrentOverlay,
    mergeStartupIntoOverlayQueueOnly,
    primePendingChainAfterResultAck,
    result,
    setNotificationChainTransitioning,
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

    const mountedCheckId = checkBanRef.current?.id?.trim() ?? '';
    if (mountedCheckId && !hasCheckInQueue(next, mountedCheckId)) {
      const mountedCheckItem =
        prev.find(
          (q) => q.kind === 'check' && q.ban.id === mountedCheckId,
        ) ??
        (checkBanRef.current
          ? ({ kind: 'check' as const, ban: checkBanRef.current })
          : null);
      if (mountedCheckItem) {
        console.log('[check-overlay-auto-close-attempt]', {
          banId: mountedCheckId,
          source: 'pruneAndSyncOverlayQueue',
          reason: 'ttl-or-prune-removed-mounted-check',
        });
        console.log('[check-overlay-close-blocked]', {
          banId: mountedCheckId,
          reason: 'no-user-action',
        });
        const { queue: restoredQueue } = enqueueWithActiveLock(
          next,
          mountedCheckItem,
        );
        next = restoredQueue;
      }
    }

    if (
      blocksMountedNotificationOverlay('pruneAndSyncOverlayQueue', null, null)
    ) {
      return;
    }

    const nextHead = next[0] ?? null;
    const prevHead = prev[0] ?? null;
    if (
      nextHead &&
      prevHead &&
      overlayQueueKey(prevHead) !== overlayQueueKey(nextHead) &&
      blockAndPreserveActiveUserCard('pruneAndSyncOverlayQueue', nextHead)
    ) {
      return;
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
    checkAnswerPendingResultShowRef.current = new Set();
    resultOverlayRenderedBanIdsRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    resultCtaConsumedBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();
    if (!uid || auth.loading) return;
    for (const id of hydrateAnsweredCheckIds(uid)) {
      answeredCheckRef.current.add(id);
    }
    for (const id of hydrateDismissedResultIds(uid)) {
      const key = normalizeId(id);
      if (!key) continue;
      resultCtaConsumedBanIdsRef.current.add(key);
      resultDeliveredBanIdsRef.current.add(key);
      shownOverlayKeysRef.current.add(`result:${key}`);
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
      emitResultClearCallsite({
        source: 'providers-reset',
        reason: 'auth-user-changed',
        willClearResult: true,
      });
      setResult(null);
      clearDirectOverboardLayerRefs();
      setDirectResultOverlayActive(false);
      emitResultHeldStillPresentAfterClear(
        'providers-reset',
        'auth-user-changed',
      );
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
    traceSuccessHide('providers-auth-reset');
    traceSuccessCardUnmounted({ source: 'providers-auth-reset' });
    sendSuccessCardActiveRef.current = false;
    sendSuccessCardBanIdRef.current = null;
    setSendSuccessCardActiveState(false);
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
    checkAnswerPendingResultShowRef.current = new Set();
    resultOverlayRenderedBanIdsRef.current = new Set();
    resultDeliveredBanIdsRef.current = new Set();
    resultCtaConsumedBanIdsRef.current = new Set();
    checkSubmitAtRef.current = new Map();
    if (realUserChange) {
      checkDeeplinkPendingBanIdRef.current = null;
      checkDeeplinkCompletedRouteBanIdRef.current = null;
      checkDeepLinkBanIdRef.current = null;
      setCheckDeepLinkBanId(null);
      bufferedCheckDeepLinkRef.current = null;
      checkDeeplinkResumeInflightRef.current = null;
    } else {
      const checkBanId = readCheckDeepLinkBanIdFromStartParam();
      if (checkBanId) {
        checkDeeplinkPendingBanIdRef.current = checkBanId;
        checkDeepLinkBanIdRef.current = checkBanId;
        setCheckDeepLinkBanId(checkBanId);
      }
    }

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
      if (!payload) return;
      const normalized = normalizeBanResult(payload);
      const banId = normalizeId(normalized.id);
      const uid = userIdRef.current;
      if (!banId) return;

      if (
        source === 'poll' &&
        shouldDeferNotificationOverlayDisplay('receiveResult-poll')
      ) {
        enqueueNotification(
          { kind: 'result', result: normalized },
          { source: 'poll' },
        );
        primeLobbyBansAttentionHintSyncRef.current('receiveResult-poll-deferred');
        logResultPollDoesNotHideLobby({
          banId,
          source: 'receiveResult-poll',
          pendingLen: pendingStartupInteractionsRef.current.length,
          queueLen: overlayQueueRef.current.length,
        });
        return;
      }

      if (
        deferResultWhileSuccessCardMounted('receiveResult', {
          kind: 'result',
          result: normalized,
        })
      ) {
        return;
      }

      if (whatOrConfirmActiveRef.current) {
        console.log('[compose-flow-notification-blocked]', {
          source: 'receiveResult',
          kind: 'result',
          banId,
        });
        enqueueNotification(
          { kind: 'result', result: normalized },
          {
            live: source === 'ws' || source === 'http',
            source: source === 'poll' ? 'poll' : 'ws',
          },
        );
        return;
      }

      if (notificationChainAwaitingUserRef.current) {
        const head = overlayQueueRef.current[0];
        const mountedIncomingId = incomingBanRef.current?.id ?? null;
        const mountedCheckId = checkBanRef.current?.id ?? null;
        if (
          head?.kind === 'incoming' ||
          head?.kind === 'check' ||
          mountedIncomingId ||
          mountedCheckId
        ) {
          console.log('[receive-result-blocked]', {
            reason: 'notification-chain-non-result-active',
            banId,
            headKind: head?.kind ?? null,
            mountedIncomingId,
            mountedCheckId,
          });
          enqueueNotification(
            { kind: 'result', result: normalized },
            {
              live: source === 'ws' || source === 'http',
              source: source === 'poll' ? 'poll' : 'ws',
            },
          );
          return;
        }
      }

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

      const role = resultParticipantRole(uid, normalized);
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
      const decision = diagnoseResultShow(normalized, mode, uid, banId);

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
        dismissBanResultLocally(banId, normalized.viewerId ?? uid);
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
      if (
        shouldBlockPassiveResultOverlayOpenForBan(
          `receiveResult:${source}`,
          banId,
        )
      ) {
        logPassiveResultOverlayBlocked({
          source: `receiveResult:${source}`,
          banId,
          phase: 'receive-blocked',
          passiveSource: isPassiveResultOpenSource(`receiveResult:${source}`),
          lobbyOpen: lobbyOpenRef.current,
        });
        enqueueNotification(
          { kind: 'result', result: normalized },
          {
            live: false,
            source: source === 'poll' ? 'poll' : 'ws',
          },
        );
        primeLobbyBansAttentionHintSyncRef.current(
          `receiveResult-deferred:${source}`,
        );
        return;
      }
      openBanResult(normalized, mode);

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
    [openBanResult, enqueueNotification],
  );

  const buildResultPollComposeFields = () => {
    const sendComposePhase = sendComposePhaseRef.current;
    const replyBanId =
      chainReplyParentBanIdRef.current ??
      replyToBanIdPersistRef.current ??
      null;
    const queueHead = overlayQueueRef.current[0] ?? null;
    return {
      sendComposePhase,
      confirmActive: sendComposePhase === 'confirming',
      whatOrConfirmActive: whatOrConfirmActiveRef.current,
      instantBanOpen: sendFlowOpenRef.current,
      flowMode:
        replyComposeActiveRef.current && replyBanId
          ? 'incoming-reply'
          : replyComposeActiveRef.current
            ? 'reply'
            : 'standard',
      replyBanId,
      replyComposeActive: replyComposeActiveRef.current,
      activeOverlayKind: queueHead?.kind ?? null,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      notificationChainTransitioning: notificationChainTransitioningRef.current,
    };
  };

  const showCheckAnswerFinalResult = useCallback(
    (payload: BanResult, source: 'http' | 'poll'): boolean => {
      const normalized = normalizeBanResult(payload);
      const banId = normalizeId(normalized.id);
      const uid = userIdRef.current;
      const statusLabel = normalized.headline || normalized.outcome;
      if (!banId) {
        logCheckAnswerFinalResultMissing({ banId: null, reason: 'no-ban-id' });
        return false;
      }

      releaseCheckAnswerWaitingResultHold(
        banId,
        `showCheckAnswerFinalResult:${source}`,
      );

      if (
        deferResultWhileSuccessCardMounted('showCheckAnswerFinalResult', {
          kind: 'result',
          result: normalized,
        })
      ) {
        logCheckAnswerResultSkippedBug({
          banId,
          reason: 'success-card-mounted',
        });
        return false;
      }

      if (whatOrConfirmActiveRef.current) {
        logCheckAnswerResultSkippedBug({ banId, reason: 'compose-active' });
        logResultPollComposeDiagnostics(
          'showCheckAnswerFinalResult-compose-skipped',
          banId,
          statusLabel,
          buildResultPollComposeFields(),
          { resultSource: source, reason: 'compose-active' },
        );
        enqueueNotification(
          { kind: 'result', result: normalized },
          {
            live: source === 'http',
            source: source === 'poll' ? 'poll' : 'ws',
          },
        );
        return false;
      }

      if (
        !isFreshCheckAnswerResultPendingFirstShow(banId) &&
        !resultDeliveredBanIdsRef.current.has(banId) &&
        !resultCtaConsumedBanIdsRef.current.has(banId)
      ) {
        shownOverlayKeysRef.current.delete(`result:${banId}`);
      } else {
        clearStaleResultGuardForFreshCheckAnswer(
          banId,
          `showCheckAnswerFinalResult:${source}`,
        );
      }

      if (
        isResultBlockedForNotificationChain(banId, 'check-answer-final')
      ) {
        logCheckAnswerResultSkippedBug({
          banId,
          reason: 'notification-chain-blocked',
        });
        return false;
      }

      const block = shouldBlockResultOpen({
        resultBanId: banId,
        overboardInFlightBanId: overboardInFlightRef.current,
      });
      if (block.blocked) {
        logCheckAnswerResultSkippedBug({
          banId,
          reason: block.reason ?? 'priority-lock',
        });
        return false;
      }

      if (overboardInFlightRef.current === banId) {
        logCheckAnswerResultSkippedBug({ banId, reason: 'overboard-in-flight' });
        return false;
      }

      if (
        !isFreshCheckAnswerResultPendingFirstShow(banId) &&
        (resultCtaConsumedBanIdsRef.current.has(banId) ||
          (uid && isDismissedResultLocally(banId, uid)))
      ) {
        logCheckAnswerResultSkippedBug({
          banId,
          reason: 'consumed-or-dismissed',
        });
        return false;
      }

      const mode = source === 'poll' ? 'auto' : 'live';
      const decision = diagnoseResultShow(normalized, mode, uid, banId);
      if (!decision.shouldShow) {
        logCheckAnswerFinalResultMissing({
          banId,
          reason: decision.reason,
        });
        dismissBanResultLocally(banId, normalized.viewerId ?? uid);
        void acknowledgeBanResultOnServer(banId, tokenRef.current);
        return false;
      }

      chainAdvanceExplicitRef.current = true;

      if (shouldDeferNotificationOverlayDisplay('check-answer-final')) {
        enqueueNotification(
          { kind: 'result', result: normalized },
          { source: source === 'poll' ? 'poll' : 'ws' },
        );
        primeLobbyBansAttentionHintSyncRef.current(
          source === 'poll'
            ? 'result-poll-deferred'
            : 'showCheckAnswerFinalResult-deferred',
        );
        logResultPollDoesNotHideLobby({
          banId,
          source,
          pendingLen: pendingStartupInteractionsRef.current.length,
          queueLen: overlayQueueRef.current.length,
        });
        return false;
      }

      setLobbyOpen(false);
      resultPriorityBanIdsRef.current.add(banId);
      logResultPollPrioritySet({ banId });

      const staleInQueue = hasStaleCheckOverlayForBan(
        overlayQueueRef.current,
        banId,
      );
      const staleInPending = hasStaleCheckOverlayForBan(
        pendingStartupInteractionsRef.current,
        banId,
      );
      if (staleInQueue || staleInPending) {
        logResultPollDropStaleCheck({ banId });
      }

      const cleanedPending = removeOverlaysForBan(
        pendingStartupInteractionsRef.current,
        banId,
      );
      if (
        cleanedPending.length !== pendingStartupInteractionsRef.current.length
      ) {
        pendingStartupInteractionsRef.current = cleanedPending;
        syncPendingStartupCount();
      }

      const resultItem: QueuedOverlay = { kind: 'result', result: normalized };

      if (source === 'poll') {
        const pollGuardCtx = buildResultShellHeldCardGuardContext(
          overlayQueueRef.current[0] ?? null,
        );
        if (isHeldOrMountedIncomingOrCheckActive(pollGuardCtx)) {
          const nextQueue = buildResultPriorityQueue(
            overlayQueueRef.current,
            banId,
            resultItem,
          );
          logResultShellSuppressedNotReady({
            banId,
            reason: 'passive-result-blocked-over-held-incoming-check',
            source: 'showCheckAnswerFinalResult-poll-defer',
            heldKind: pollGuardCtx.heldKind,
            heldBanId: pollGuardCtx.heldBanId,
          });
          chainAdvanceExplicitRef.current = true;
          if (
            isFinalCheckStatusOutcome(normalized.outcome) ||
            normalized.outcome === 'overboard'
          ) {
            holdResultForActiveNotificationChain(
              banId,
              'showCheckAnswerFinalResult-poll-defer-pre-apply',
              normalized,
            );
          }
          logCheckAnswerFinalResultEnqueued({
            banId,
            queueLen: nextQueue.length,
            status: statusLabel,
          });
          logResultPayloadSelectionTrace({
            phase: 'showCheckAnswerFinalResult-poll-defer-priority-queue',
            freshPollPriorityBanId: banId,
            freshPriorityBanIds: [...resultPriorityBanIdsRef.current],
            checkCardBanId: checkBanRef.current?.id ?? null,
            resultRefBanId: resultRef.current?.id ?? null,
            displayResultBanId: result?.id ?? null,
            queueHeadKind: nextQueue[0]?.kind ?? null,
            queueHeadBanId:
              nextQueue[0]?.kind === 'result' ? nextQueue[0].result.id : null,
            freshPriorityRejectedBecause: null,
            heldKind: pollGuardCtx.heldKind,
            heldBanId: pollGuardCtx.heldBanId,
            passiveShellBlocked: true,
          });
          suppressStaleResultOverlayForFreshCheckAnswer(
            banId,
            normalized,
            `showCheckAnswerFinalResult:${source}-poll-defer`,
          );
          flushSync(() => {
            applyOverlayQueue(nextQueue);
          });
          const head = overlayQueueRef.current[0];
          const pollShown =
            head?.kind === 'result' && normalizeId(head.result.id) === banId;
          if (pollShown) {
            checkAnswerPendingResultShowRef.current.delete(banId);
          }
          return pollShown;
        }
      }

      const nextQueue = buildResultPriorityQueue(
        overlayQueueRef.current,
        banId,
        resultItem,
      );

      logCheckAnswerFinalResultEnqueued({
        banId,
        queueLen: nextQueue.length,
        status: statusLabel,
      });
      logQueueItemBuiltAfterOverboard({
        kind: 'result',
        banId,
        status: normalized.outcome ?? normalized.status ?? statusLabel,
        headline: getResultCardHeadline(normalized),
        verifyPhase: null,
        renderable: isValidBanResultPayload(normalized),
        source: `showCheckAnswerFinalResult:${source}`,
      });
      chainAdvanceExplicitRef.current = true;
      setNotificationChainTransitioning(true);
      if (whatOrConfirmActiveRef.current || sendComposePhaseRef.current !== 'idle') {
        logResultPollComposeDiagnostics(
          'showCheckAnswerFinalResult-chain-transition',
          banId,
          statusLabel,
          buildResultPollComposeFields(),
          { resultSource: source, reason: 'set-notification-chain-transitioning' },
        );
      }
      if (
        isFinalCheckStatusOutcome(normalized.outcome) ||
        normalized.outcome === 'overboard'
      ) {
        holdResultForActiveNotificationChain(
          banId,
          'showCheckAnswerFinalResult-pre-apply',
          normalized,
        );
      }
      suppressStaleResultOverlayForFreshCheckAnswer(
        banId,
        normalized,
        `showCheckAnswerFinalResult:${source}`,
      );
      flushSync(() => {
        applyOverlayQueue(nextQueue);
      });

      const head = overlayQueueRef.current[0];
      const shown = head?.kind === 'result' && normalizeId(head.result.id) === banId;
      if (shown) {
        checkAnswerPendingResultShowRef.current.delete(banId);
        holdResultForActiveNotificationChain(
          banId,
          'showCheckAnswerFinalResult-shown',
          normalized,
        );
        setChainAdvanceWaiting(false);
        if (source === 'poll') {
          logResultPollShowResultCard({ banId, status: statusLabel });
        } else {
          logCheckAnswerFinalResultShow({ banId, status: statusLabel });
        }
        logTransitionFromRefs('[OVERLAY STATE SET]', {
          kind: 'result',
          banId,
        });
        return true;
      }

      logCheckAnswerResultSkippedBug({
        banId,
        reason: 'apply-overlay-not-head',
      });
      return false;
    },
    [
      applyOverlayQueue,
      clearStaleResultGuardForFreshCheckAnswer,
      enqueueNotification,
      holdResultForActiveNotificationChain,
      isFreshCheckAnswerResultPendingFirstShow,
      isResultBlockedForNotificationChain,
      releaseCheckAnswerWaitingResultHold,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
      suppressStaleResultOverlayForFreshCheckAnswer,
      syncPendingStartupCount,
    ],
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
      const composeFields = buildResultPollComposeFields();
      if (shouldSkipResultPollDuringActiveCompose(composeFields)) {
        logResultPollSkippedDuringCompose({
          source: 'pollPendingResultOnce',
          stage: 'pre-api',
          pollSource: source,
          whatOrConfirmActive: composeFields.whatOrConfirmActive,
          sendComposePhase: composeFields.sendComposePhase,
          confirmActive: composeFields.confirmActive,
          instantBanOpen: composeFields.instantBanOpen,
          flowMode: composeFields.flowMode,
          replyBanId: composeFields.replyBanId,
          replyComposeActive: composeFields.replyComposeActive,
          reason: 'compose-active-pre-api',
        });
        logResultPath('pollPendingResultOnce', 'path-skip', {
          allowed: false,
          reason: 'compose-active-pre-api',
          extra: { pollSource: source },
        });
        return;
      }
      const pollBlockPre = shouldBlockResultOpen({
        overboardInFlightBanId: overboardInFlightRef.current,
      });
      logResultPollBlockerCheck({
        source: 'pollPendingResultOnce',
        pollSource: source,
        stage: 'pre-api',
        ...composeFields,
        guards: {
          hasAuth: true,
          successCardMounted: isSuccessCardMounted(),
          atomicResultHold: Boolean(
            incomingOverboardAtomicBanIdRef.current &&
              notificationChainAwaitingUserRef.current,
          ),
          resultAlreadyOpen: resultOpenRef.current,
          pollPriorityBlocked: pollBlockPre.blocked,
          pollPriorityBlockReason: pollBlockPre.reason ?? null,
          whatOrConfirmActiveGuardBeforeApi: true,
          whatOrConfirmActive: whatOrConfirmActiveRef.current,
          sendComposePhase: sendComposePhaseRef.current,
          instantBanOpen: sendFlowOpenRef.current,
          shouldDeferNotificationOverlay: shouldDeferNotificationOverlayDisplay(
            'pollPendingResultOnce',
          ),
          startupInteractionsHold: startupInteractionsHoldRef.current,
          composeActiveWouldBlockShow: whatOrConfirmActiveRef.current,
        },
        pollWillProceed:
          !isSuccessCardMounted() &&
          !(
            incomingOverboardAtomicBanIdRef.current &&
            notificationChainAwaitingUserRef.current
          ) &&
          !resultOpenRef.current &&
          !pollBlockPre.blocked,
      });
      if (isSuccessCardMounted()) {
        window.__debug98log?.('[RESULT POLL SKIPPED SUCCESS]', {
          pollSource: source,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        logResultPath('pollPendingResultOnce', 'path-skip', {
          allowed: false,
          reason: 'success-card-mounted',
          extra: { pollSource: source },
        });
        return;
      }
      if (
        incomingOverboardAtomicBanIdRef.current &&
        notificationChainAwaitingUserRef.current
      ) {
        logResultPath('pollPendingResultOnce', 'path-skip', {
          allowed: false,
          reason: 'atomic-result-hold',
          banId: incomingOverboardAtomicBanIdRef.current,
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
        const normalized = normalizeBanResult(pendingResult);
        const hitBanId = normalizeId(normalized.id);
        const statusLabel = normalized.headline || normalized.outcome;

        logResultPollHit({
          banId: hitBanId,
          pollSource: source,
          status: statusLabel,
        });
        window.__debug98log?.('[result-poll-hit]', {
          banId: hitBanId,
          pollSource: source,
        });

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
        logResultPollItemBuilt({
          banId: hitBanId,
          status: statusLabel,
        });
        logResultPollBlockerCheck({
          source: 'pollPendingResultOnce',
          pollSource: source,
          stage: 'post-api-hit',
          banId: hitBanId,
          status: statusLabel,
          ...composeFields,
          guards: {
            whatOrConfirmActive: whatOrConfirmActiveRef.current,
            shouldDeferNotificationOverlay: shouldDeferNotificationOverlayDisplay(
              'pollPendingResultOnce',
            ),
            composeActiveWouldBlockShow: whatOrConfirmActiveRef.current,
            showCheckAnswerFinalResultNext: !shouldDeferNotificationOverlayDisplay(
              'pollPendingResultOnce',
            ),
          },
        });
        logResultPollComposeDiagnostics(
          'pollPendingResultOnce-hit',
          hitBanId,
          statusLabel,
          composeFields,
          { pollSource: source },
        );
        logResultPath('pollPendingResultOnce', 'poll-hit', {
          banId: pendingResult.id,
          resultId: pendingResult.id,
          allowed: true,
          extra: { pollSource: source },
        });

        if (shouldDeferNotificationOverlayDisplay('pollPendingResultOnce')) {
          enqueueNotification(
            { kind: 'result', result: normalized },
            { source: 'poll' },
          );
          primeLobbyBansAttentionHintSyncRef.current('result-poll-pending-only');
          logResultPollComposeDiagnostics(
            'pollPendingResultOnce-deferred-pending',
            hitBanId,
            statusLabel,
            composeFields,
            { pollSource: source, deferred: true },
          );
          logResultPollDoesNotHideLobby({
            banId: hitBanId,
            pollSource: source,
            pendingLen: pendingStartupInteractionsRef.current.length,
            queueLen: overlayQueueRef.current.length,
          });
          return;
        }

        const shown = showCheckAnswerFinalResult(normalized, 'poll');
        if (!shown) {
          receiveResult(pendingResult, 'poll');
        }
      } catch {
        /* fallback only */
      }
    },
    [receiveResult, showCheckAnswerFinalResult],
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
      if (b !== null && whatOrConfirmActiveRef.current) {
        console.log('[compose-flow-notification-blocked]', {
          source: 'setCheckBanSafe',
          kind: 'check',
          banId: b.id,
        });
        enqueueNotification(
          { kind: 'check', ban: enrichBanInteraction(b) },
          { source: 'session' },
        );
        return;
      }
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

  const collectCheckStartupBlockers =
    useCallback((): CheckStartupBlockersSnapshot => {
      const checkDirectActive =
        checkDeepLinkBanIdRef.current != null &&
        overlayQueueRef.current[0]?.kind === 'check';
      const checkPending =
        Boolean(checkDeepLinkBanIdRef.current) &&
        Boolean(checkDeeplinkPendingBanIdRef.current);
      return {
        isBooting: isDeepLinkRouteBootPending(),
        isLobbyBootVisible: lobbyOpenRef.current && !checkDirectActive,
        isRouteTransitioning: isDeepLinkRouteBootPending(),
        isOverlayLocked: isNotificationQueueLocked(),
        isNotificationQueueLocked: isNotificationQueueLocked(),
        isAdvancingQueue:
          notificationChainTransitioningRef.current ||
          chainAdvanceWaitingRef.current,
        dimVisible:
          checkPending ||
          (notificationChainTransitioningRef.current && !checkDirectActive),
        blurVisible: checkPending && !checkDirectActive,
      };
    }, []);

  const clearStartupBlockingLayersForCheckCard = useCallback(
    (banId: string, source: string) => {
      logCheckStartupBlockers(collectCheckStartupBlockers(), {
        phase: 'before-clear',
        banId,
        source,
      });
      flushSync(() => {
        setStartupGraceActive(false);
        setNotificationChainTransitioning(false);
        notificationChainTransitioningRef.current = false;
        setChainAdvanceWaiting(false);
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
        if (isDeepLinkRouteBootPending()) {
          releaseDeepLinkRouteBoot('check-card-ready', banId);
        }
      });
      logCheckStartupBlockersClear({ banId, source });
      logCheckCardOverlaySet({ banId, source });
      logCheckStartupBlockers(collectCheckStartupBlockers(), {
        phase: 'after-clear',
        banId,
        source,
      });
    },
    [collectCheckStartupBlockers, setChainAdvanceWaiting, setNotificationChainTransitioning],
  );

  const applyCheckDeeplinkDirectOverlay = useCallback(
    (ban: BanInteraction): boolean => {
      const enriched = enrichBanInteraction(ban);
      const banId = enriched.id;
      logCheckCardSelected({ banId, source: 'applyCheckDeeplinkDirectOverlay' });
      clearStartupBlockingLayersForCheckCard(
        banId,
        'applyCheckDeeplinkDirectOverlay',
      );
      const item: QueuedOverlay = { kind: 'check', ban: enriched };
      startupInteractionsHoldRef.current = false;
      chainAdvanceExplicitRef.current = true;
      const next = buildCheckPriorityQueue(overlayQueueRef.current, banId, item);
      flushSync(() => {
        applyOverlayQueue(next);
      });
      const head = overlayQueueRef.current[0];
      const mounted = head?.kind === 'check' && head.ban.id === banId;
      if (mounted) {
        checkBanRef.current = enriched;
        setCheckBan(enriched);
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
        enableDeeplinkSingleCardMode('check', banId);
      }
      return mounted;
    },
    [
      applyOverlayQueue,
      clearStartupBlockingLayersForCheckCard,
    ],
  );

  const clearCheckDeepLinkRoute = useCallback((source: string) => {
    checkDeeplinkPendingBanIdRef.current = null;
    checkDeepLinkBanIdRef.current = null;
    setCheckDeepLinkBanId(null);
    bufferedCheckDeepLinkRef.current = null;
    console.log('[check-deeplink-route-clear]', { source });
  }, []);

  const finalizeCheckDismissAfterUserAnswer = useCallback(
    (banId: string, remaining: QueuedOverlay[]) => {
      const normalizedBanId = normalizeId(banId);
      if (!normalizedBanId) return;

      const wasCheckDeeplink =
        checkDeepLinkBanIdRef.current != null &&
        normalizeId(checkDeepLinkBanIdRef.current) === normalizedBanId;

      logCheckDismissStart({
        banId: normalizedBanId,
        remainingLen: remaining.length,
        checkDeeplink: wasCheckDeeplink,
      });

      if (wasCheckDeeplink) {
        checkDeeplinkCompletedRouteBanIdRef.current = normalizedBanId;
        checkDeeplinkPendingBanIdRef.current = null;
        checkDeeplinkResumeInflightRef.current = null;
        clearCheckDeepLinkRoute('user-answer');
        logCheckDismissCurrentConsumed({
          banId: normalizedBanId,
          kind: 'check',
        });
        if (isDeepLinkRouteBootPending()) {
          releaseDeepLinkRouteBoot('route-handled', normalizedBanId);
          logCheckDismissBootReleased({ banId: normalizedBanId });
        }
      }

      logCheckDismissRemainingQueue({
        banId: normalizedBanId,
        remainingLen: remaining.length,
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
      });

      if (remaining.length > 0) {
        logCheckDismissShowNext({
          banId: normalizedBanId,
          remainingLen: remaining.length,
          nextKind: remaining[0]?.kind ?? null,
          nextBanId:
            remaining[0]?.kind === 'result'
              ? remaining[0].result.id
              : remaining[0]?.kind === 'incoming' ||
                  remaining[0]?.kind === 'check'
                ? remaining[0].ban.id
                : null,
        });
      }
    },
    [clearCheckDeepLinkRoute],
  );

  const openLobbyAfterCheckDismissIfEmpty = useCallback(
    (reason: string, banId: string | null) => {
      queueMicrotask(() => {
        if (isActiveUserCardHold()) {
          logActiveUserCardPreventLobbyFallback({
            source: `openLobbyAfterCheckDismissIfEmpty:${reason}`,
            banId,
          });
          return;
        }
        if (checkAnswerInFlightRef.current.size > 0) {
          return;
        }
        if (isCheckAnswerWaitingResultHoldActive(banId)) {
          return;
        }
        const normalizedBanId = banId ? normalizeId(banId) : '';
        const completedDeeplinkCheck =
          normalizedBanId.length > 0 &&
          checkDeeplinkCompletedRouteBanIdRef.current === normalizedBanId;
        if (completedDeeplinkCheck || isDeeplinkSingleCardModeActive()) {
          logDeeplinkReturnLobby({
            reason: `check-dismiss-empty:${reason}`,
            banId: normalizedBanId || null,
            source: 'openLobbyAfterCheckDismissIfEmpty',
          });
          openLobbyRef.current(`check-dismiss-empty:${reason}`);
          return;
        }
        void continueNotificationChainOrOpenLobbyRef.current(
          `check-dismiss-empty:${reason}`,
          {
            clearActiveHold: false,
            prefetchSkipBanId: banId,
          },
        );
      });
    },
    [isCheckAnswerWaitingResultHoldActive],
  );
  openLobbyAfterCheckDismissIfEmptyRef.current =
    openLobbyAfterCheckDismissIfEmpty;
  finalizeCheckDismissAfterUserAnswerRef.current =
    finalizeCheckDismissAfterUserAnswer;

  const openCheckDeepLinkDirect = useCallback(
    async (
      banId: string,
      prefilled?: BanInteraction | null,
      source = 'check-deeplink-direct',
    ): Promise<boolean> => {
      const normalizedBanId = banId.trim();
      const token = tokenRef.current;
      const viewerId = userIdRef.current;
      if (!normalizedBanId) {
        logCheckDeeplinkFallbackLobby({ reason: 'no-ban-id' });
        clearCheckDeepLinkRoute(source);
        return false;
      }
      if (checkDeeplinkCompletedRouteBanIdRef.current === normalizedBanId) {
        logCheckDeeplinkResumeSkip({
          banId: normalizedBanId,
          reason: 'completed-route',
          source,
        });
        clearCheckDeepLinkRoute(source);
        return false;
      }
      if (
        answeredCheckRef.current.has(normalizedBanId) ||
        dismissedCheckSessionRef.current.has(normalizedBanId)
      ) {
        logCheckDeeplinkResumeSkip({
          banId: normalizedBanId,
          reason: 'already-answered',
          source,
        });
        clearCheckDeepLinkRoute(source);
        return false;
      }
      if (!viewerId || !token) {
        logCheckDeeplinkAuthWait({
          banId: normalizedBanId,
          userId: viewerId || null,
          hasToken: !!token,
        });
        if (prefilled) {
          bufferedCheckDeepLinkRef.current = enrichBanInteraction(prefilled);
        } else {
          checkDeeplinkPendingBanIdRef.current = normalizedBanId;
        }
        return false;
      }

      logCheckDeeplinkFetchStart({ banId: normalizedBanId, source });
      logCheckDeeplinkLobbySuppressed({
        banId: normalizedBanId,
        source: 'fetch-start',
      });
      try {
        let ban = prefilled ? enrichBanInteraction(prefilled) : null;
        if (!ban?.id || ban.id !== normalizedBanId) {
          const res = await api<{ ban: BanInteraction }>(
            `/bans/${normalizedBanId}/open`,
            { token, retries: 0 },
          );
          ban = res.ban ? enrichBanInteraction(res.ban) : null;
        }
        if (!ban) {
          logCheckDeeplinkFallbackLobby({
            banId: normalizedBanId,
            reason: 'fetch-empty',
          });
          clearCheckDeepLinkRoute(source);
          return false;
        }
        logCheckDeeplinkFetchOk({
          banId: normalizedBanId,
          status: ban.status,
        });

        const decision = checkShowDecision(
          ban,
          viewerId,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          resultOpenRef.current,
        );

        if (!decision.shouldShow) {
          if (
            ban.status !== 'checking' ||
            decision.reason === 'answered-locally'
          ) {
            try {
              const { result } = await api<{ result: BanResult | null }>(
                `/bans/${normalizedBanId}/result`,
                { token, retries: 0, timeoutMs: 5000 },
              );
              if (result) {
                const normalized = normalizeBanResult(result);
                let shown = showCheckAnswerFinalResult(normalized, 'http');
                if (!shown) {
                  openBanResult(normalized, 'explicit');
                  shown = true;
                }
                if (shown) {
                  clearCheckDeepLinkRoute(source);
                  resolvePendingDeepLinkRoute('result', normalizedBanId);
                  return true;
                }
              }
            } catch {
              /* fall through to lobby */
            }
          }
          logCheckDeeplinkFallbackLobby({
            banId: normalizedBanId,
            reason: decision.reason,
          });
          clearCheckDeepLinkRoute(source);
          setLobbyOpen(true);
          lobbyOpenRef.current = true;
          return false;
        }

        noteDeepLinkHandlerOpened('openCheckDeepLinkDirect', ban.id);
        setLobbyOpen(false);
        lobbyOpenRef.current = false;
        const mounted = applyCheckDeeplinkDirectOverlay(ban);
        if (mounted) {
          checkDeeplinkPendingBanIdRef.current = null;
          resolvePendingDeepLinkRoute('check', ban.id);
          logDeepLinkHandlerResult({
            type: 'check',
            banId: ban.id,
            instantBanOpen: false,
            sendFlowOpen: false,
            selectedBanId: ban.id,
            overlayQueueLength: overlayQueueRef.current.length,
            ok: true,
          });
          challengeLog('check:deeplink', { id: ban.id, status: ban.status });
          return true;
        }

        logCheckDeeplinkFallbackLobby({
          banId: normalizedBanId,
          reason: 'overlay-not-mounted',
        });
        clearCheckDeepLinkRoute(source);
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        return false;
      } catch (e) {
        logCheckDeeplinkFetchError({
          banId: normalizedBanId,
          error: e instanceof Error ? e.message : 'fetch-failed',
        });
        logCheckDeeplinkFallbackLobby({
          banId: normalizedBanId,
          reason: 'fetch-error',
        });
        clearCheckDeepLinkRoute(source);
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        return false;
      }
    },
    [
      applyCheckDeeplinkDirectOverlay,
      clearCheckDeepLinkRoute,
      openBanResult,
      showCheckAnswerFinalResult,
    ],
  );

  const resolvePendingCheckDeepLinkBanId = useCallback((): string => {
    return (
      checkDeeplinkPendingBanIdRef.current?.trim() ||
      readCheckDeepLinkBanIdFromStartParam() ||
      checkDeepLinkBanIdRef.current?.trim() ||
      ''
    );
  }, []);

  const resumeCheckDeepLinkAfterAuth = useCallback(
    async (source: string) => {
      const banId = resolvePendingCheckDeepLinkBanId();
      if (!banId) {
        logCheckDeeplinkResumeSkip({ reason: 'no-pending-banId', source });
        logCheckDeeplinkSkipNoUiChange({ reason: 'no-pending-banId', source });
        return;
      }
      if (checkDeeplinkCompletedRouteBanIdRef.current === banId) {
        logCheckDeeplinkResumeSkip({
          banId,
          reason: 'completed-route',
          source,
        });
        clearCheckDeepLinkRoute(source);
        return;
      }
      if (
        answeredCheckRef.current.has(banId) ||
        dismissedCheckSessionRef.current.has(banId)
      ) {
        logCheckDeeplinkResumeSkip({
          banId,
          reason: 'already-answered',
          source,
        });
        clearCheckDeepLinkRoute(source);
        return;
      }
      if (!checkDeeplinkPendingBanIdRef.current) {
        checkDeeplinkPendingBanIdRef.current = banId;
      }
      const viewerId = userIdRef.current?.trim() ?? auth.user?.id?.trim() ?? '';
      const token = tokenRef.current ?? auth.token ?? null;
      if (!viewerId || !token) {
        logCheckDeeplinkAuthWait({
          banId,
          userId: viewerId || null,
          hasToken: !!token,
          source,
        });
        return;
      }
      if (checkDeeplinkResumeInflightRef.current === banId) {
        logCheckDeeplinkResumeSkip({ banId, reason: 'resume-in-flight', source });
        return;
      }
      const head = overlayQueueRef.current[0];
      if (
        head?.kind === 'check' &&
        head.ban.id === banId &&
        checkBanRef.current?.id === banId
      ) {
        logCheckDeeplinkResumeSkip({ banId, reason: 'check-already-mounted', source });
        checkDeeplinkPendingBanIdRef.current = null;
        return;
      }
      checkDeeplinkResumeInflightRef.current = banId;
      logCheckDeeplinkAuthReadyResume({ banId, userId: viewerId, source });
      try {
        await openCheckDeepLinkDirect(
          banId,
          bufferedCheckDeepLinkRef.current,
          source,
        );
      } finally {
        if (checkDeeplinkResumeInflightRef.current === banId) {
          checkDeeplinkResumeInflightRef.current = null;
        }
      }
    },
    [
      auth.token,
      auth.user?.id,
      openCheckDeepLinkDirect,
      resolvePendingCheckDeepLinkBanId,
      clearCheckDeepLinkRoute,
    ],
  );

  const openDeepLinkCheck = useCallback(
    (b: BanInteraction) => {
      void openCheckDeepLinkDirect(b.id, b, 'openDeepLinkCheck');
    },
    [openCheckDeepLinkDirect],
  );

  useLayoutEffect(() => {
    void resumeCheckDeepLinkAfterAuth('check-deeplink-auth-layout');
  }, [auth.token, auth.user?.id, resumeCheckDeepLinkAfterAuth]);

  useLayoutEffect(() => {
    const banId = checkDeepLinkBanIdRef.current?.trim() ?? '';
    if (!banId || !checkDeepLinkBanId) return;
    const head = overlayQueueRef.current[0];
    const checkMounted =
      head?.kind === 'check' &&
      head.ban.id === banId &&
      checkBanRef.current?.id === banId;
    if (checkMounted) return;
    const answered =
      answeredCheckRef.current.has(banId) ||
      dismissedCheckSessionRef.current.has(banId) ||
      checkDeeplinkCompletedRouteBanIdRef.current === banId;
    if (!answered) return;
    logCheckDismissStuckOnBootBug({
      banId,
      reason: 'answered-but-deeplink-route-active',
      checkDeeplinkDirectPending: true,
    });
    checkDeeplinkCompletedRouteBanIdRef.current = banId;
    checkDeeplinkPendingBanIdRef.current = null;
    checkDeeplinkResumeInflightRef.current = null;
    clearCheckDeepLinkRoute('stuck-boot-heal');
    if (isDeepLinkRouteBootPending()) {
      releaseDeepLinkRouteBoot('route-handled', banId);
      logCheckDismissBootReleased({ banId, source: 'stuck-boot-heal' });
    }
    if (
      overlayQueueRef.current.length === 0 &&
      pendingStartupInteractionsRef.current.length === 0
    ) {
      setLobbyOpen(true);
      lobbyOpenRef.current = true;
      logLobbyOpenAfterCheckEmpty({
        reason: 'stuck-boot-heal',
        banId,
      });
    } else {
      void showNextNotificationFromChainSyncRef.current('stuck-boot-heal');
    }
  }, [checkDeepLinkBanId, clearCheckDeepLinkRoute]);

  useEffect(() => {
    void resumeCheckDeepLinkAfterAuth('check-deeplink-auth-effect');
  }, [auth.token, auth.user?.id, resumeCheckDeepLinkAfterAuth]);

  const clearDeepLinkRepeatBan = useCallback(() => {
    setDeepLinkRepeatBan(null);
    setDeepLinkRepeatGoToConfirm(true);
  }, []);

  const clearDeepLinkInviteToBan = useCallback(() => {
    setDeepLinkInviteToBanInviter(null);
  }, []);

  const openDeepLinkInviteToBan = useCallback(
    (inviter: UserPublic) => {
      noteDeepLinkHandlerOpened('openDeepLinkInviteToBan', inviter.id);
      if (!userIdRef.current || auth.loading) {
        bufferedInviteToBanInviterRef.current = inviter;
        console.log('[invite-to-ban-deeplink]', {
          inviterId: inviter.id,
          buffered: true,
          reason: 'auth-not-ready',
        });
        return;
      }
      openSendFlow();
      setDeepLinkInviteToBanInviter(inviter);
      console.log('[invite-to-ban-deeplink]', {
        inviterId: inviter.id,
        queued: true,
      });
    },
    [auth.loading, openSendFlow],
  );

  const openDeepLinkRepeat = useCallback(
    (b: BanInteraction, options?: { goToConfirm?: boolean }) => {
      const goToConfirm = options?.goToConfirm ?? true;
      noteDeepLinkHandlerOpened('openDeepLinkRepeat', b.id);
      lockNotificationQueue('repeat-ban-flow', b.id);
      logOverlayPriority('repeat-flow-start', { banId: b.id });
      suppressQueuedOverlayDisplay();
      const enriched = enrichBanInteraction(b);
      if (!userIdRef.current || auth.loading) {
        bufferedRepeatDeepLinkRef.current = enriched;
        bufferedRepeatGoToConfirmRef.current = goToConfirm;
        console.log('[repeat-deeplink]', {
          banId: b.id,
          buffered: true,
          goToConfirm,
          reason: 'auth-not-ready',
        });
        return;
      }
      openSendFlow();
      setDeepLinkRepeatGoToConfirm(goToConfirm);
      setDeepLinkRepeatBan(enriched);
      resolvePendingDeepLinkRoute('repeat', b.id);
      console.log('[repeat-deeplink]', {
        banId: b.id,
        queued: true,
        goToConfirm,
      });
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
    setDeepLinkRepeatGoToConfirm(bufferedRepeatGoToConfirmRef.current);
    console.log('[repeat-deeplink]', {
      banId: buffered.id,
      action: 'apply-buffered',
      goToConfirm: bufferedRepeatGoToConfirmRef.current,
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

  useEffect(() => {
    if (!auth.user?.id || auth.loading) return;
    const buffered = bufferedInviteToBanInviterRef.current;
    if (!buffered) return;
    bufferedInviteToBanInviterRef.current = null;
    console.log('[invite-to-ban-deeplink]', {
      inviterId: buffered.id,
      action: 'apply-buffered',
    });
    openSendFlow();
    setDeepLinkInviteToBanInviter(buffered);
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
    console.log('[active-timer-mounted]', { banId });
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

  const snapshotOverlayQueueForCheckDebug = (queue: QueuedOverlay[]) => ({
    overlayQueueIds: queue.map((q) => overlayQueueKey(q)),
    overlayQueueKinds: queue.map((q) => q.kind),
  });

  const snapshotPendingForCheckDebug = () => ({
    pendingIds: pendingStartupInteractionsRef.current.map((q) =>
      overlayQueueKey(q),
    ),
    pendingKinds: pendingStartupInteractionsRef.current.map((q) => q.kind),
  });

  const logCheckAnswerOverlayHostSnapshot = (source: string) => {
    const head = overlayQueueRef.current[0] ?? null;
    logOverlayHostVisibilityDecision({
      source,
      activeKind:
        head?.kind ??
        (checkBanRef.current
          ? 'check'
          : incomingBanRef.current
            ? 'incoming'
            : resultRef.current
              ? 'result'
              : null),
      heldKind: heldUserCardOverlayRef.current?.kind ?? null,
      checkBanId: checkBanRef.current?.id ?? null,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      chainAdvanceWaiting: chainAdvanceWaitingRef.current,
      notificationChainTransitioning:
        notificationChainTransitioningRef.current,
      lobbyOpen: lobbyOpenRef.current,
      checkAnswerInFlight: checkAnswerInFlightRef.current.size,
      checkDismissChainOwned: checkAnswerDismissChainOwnedRef.current,
      notificationChainAwaitingUser:
        notificationChainAwaitingUserRef.current,
    });
  };

  const resumeCheckAnswerChainAfterWaitingPartner = useCallback(
    (
      banId: string,
      remaining: QueuedOverlay[],
    ): ContinueNotificationChainOutcome => {
      const normalized = normalizeId(banId);
      const holdBefore = checkAnswerWaitingResultHoldBanIdRef.current;
      const chainAdvanceWaitingBefore = chainAdvanceWaitingRef.current;

      if (normalized) {
        releaseCheckAnswerWaitingResultHold(
          normalized,
          'check-answer-waiting-partner',
        );
      }
      if (checkAnswerWaitingResultHoldBanIdRef.current) {
        setCheckAnswerWaitingResultHold(null);
      }

      if (overlayQueueRef.current.length > 0) {
        const head = overlayQueueRef.current[0];
        const headBanId =
          head?.kind === 'result'
            ? head.result.id
            : head?.kind === 'incoming' || head?.kind === 'check'
              ? head.ban.id
              : null;
        const headMounted =
          !!head &&
          ((head.kind === 'check' &&
            normalizeId(checkBanRef.current?.id ?? '') ===
              normalizeId(headBanId ?? '')) ||
            (head.kind === 'incoming' &&
              normalizeId(incomingBanRef.current?.id ?? '') ===
                normalizeId(headBanId ?? '')) ||
            (head.kind === 'result' &&
              normalizeId(resultRef.current?.id ?? '') ===
                normalizeId(headBanId ?? '')));
        if (!headMounted) {
          applyOverlayQueue(overlayQueueRef.current);
        }
      } else if (remaining.length > 0) {
        applyOverlayQueue(remaining);
      }

      const outcome = continueNotificationChainOrOpenLobbyRef.current(
        'check-answer-waiting-partner',
        {
          clearActiveHold: false,
          prefetchSkipBanId: normalized || undefined,
        },
      );

      const headAfter = overlayQueueRef.current[0];
      const nextMounted =
        !headAfter ||
        (headAfter.kind === 'check' &&
          normalizeId(checkBanRef.current?.id ?? '') ===
            normalizeId(headAfter.ban.id)) ||
        (headAfter.kind === 'incoming' &&
          normalizeId(incomingBanRef.current?.id ?? '') ===
            normalizeId(headAfter.ban.id)) ||
        (headAfter.kind === 'result' &&
          normalizeId(resultRef.current?.id ?? '') ===
            normalizeId(headAfter.result.id));

      if (
        outcome === 'show-next' ||
        outcome === 'open-lobby' ||
        outcome === 'open-bans' ||
        nextMounted
      ) {
        setChainAdvanceWaiting(false);
        if (outcome === 'show-next' || nextMounted) {
          setNotificationChainTransitioning(false);
        }
      }

      logCheckAnswerWaitingHoldReleased({
        banId: normalized,
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        chainAdvanceWaitingBefore,
        chainAdvanceWaitingAfter: chainAdvanceWaitingRef.current,
        holdBefore,
        holdAfter: checkAnswerWaitingResultHoldBanIdRef.current,
      });

      return outcome;
    },
    [
      applyOverlayQueue,
      releaseCheckAnswerWaitingResultHold,
      setChainAdvanceWaiting,
      setCheckAnswerWaitingResultHold,
      setNotificationChainTransitioning,
    ],
  );

  const submitCheckAnswer = useCallback(
    async (banId: string, completed: boolean) => {
      const normalizedBanId = normalizeId(banId);
      const uid = userIdRef.current;
      const token = tokenRef.current;
      if (!uid || !token) {
        return { ok: false, error: 'Нет авторизации' };
      }
      if (!normalizedBanId) {
        return { ok: false, error: 'Некорректный запрет' };
      }

      const payload = { completed: Boolean(completed) };
      console.log('[check-submit-payload]', {
        banId: normalizedBanId,
        answer: completed,
        payloadTypes: {
          banId: typeof normalizedBanId,
          completed: typeof payload.completed,
        },
      });
      console.log('[check-overlay-submit-start]', {
        banId: normalizedBanId,
        answer: completed,
      });
      const queueBeforeRemove = overlayQueueRef.current;
      logCheckQueueBeforeRemove({
        activeBanId: normalizedBanId,
        ...snapshotOverlayQueueForCheckDebug(queueBeforeRemove),
        ...snapshotPendingForCheckDebug(),
        activeKind: queueBeforeRemove[0]?.kind ?? null,
        heldKind: heldUserCardOverlayRef.current?.kind ?? null,
        checkBanId: checkBanRef.current?.id ?? null,
      });
      const remaining = removeOverlaysForBan(
        queueBeforeRemove,
        normalizedBanId,
        ['check'],
      );
      const remainingKeys = new Set(remaining.map((q) => overlayQueueKey(q)));
      const removedItems = queueBeforeRemove.filter(
        (q) => !remainingKeys.has(overlayQueueKey(q)),
      );
      logCheckQueueAfterRemove({
        removedBanId: normalizedBanId,
        queueLenBefore: queueBeforeRemove.length,
        queueLenAfter: remaining.length,
        ...snapshotOverlayQueueForCheckDebug(remaining),
        remainingIds: remaining.map((q) => overlayQueueKey(q)),
        remainingKinds: remaining.map((q) => q.kind),
        removedIds: removedItems.map((q) => overlayQueueKey(q)),
        removedKinds: removedItems.map((q) => q.kind),
        overlayQueueRefLen: overlayQueueRef.current.length,
        note: 'overlayQueueRefLen is pre-dismiss ref; remainingLen is post-remove array',
      });
      const pendingHead = pendingStartupInteractionsRef.current[0] ?? null;
      const advanceHead = remaining[0] ?? pendingHead;
      const placeholderKind: 'incoming' | 'check' | 'result' =
        advanceHead?.kind === 'check' ||
        advanceHead?.kind === 'result' ||
        advanceHead?.kind === 'incoming'
          ? advanceHead.kind
          : 'incoming';
      checkAnswerDismissChainOwnedRef.current = remaining.length === 0;
      setChainAdvancePlaceholderKind(placeholderKind);
      setChainAdvanceWaiting(true);
      setNotificationChainTransitioning(true);
      dismissedCheckSessionRef.current.add(normalizedBanId);
      answeredCheckRef.current.add(normalizedBanId);
      markCheckAnsweredLocally(uid, normalizedBanId);
      checkAnswerInFlightRef.current.add(normalizedBanId);
      checkAnswerPendingResultShowRef.current.add(normalizedBanId);
      console.log('[check-overlay-user-answer]', {
        banId: normalizedBanId,
        answer: completed,
      });
      console.log('[CHECK OVERLAY DISMISSED]', {
        banId: normalizedBanId,
        reason: 'user-answer',
        completed,
      });
      finalizeCheckDismissAfterUserAnswerRef.current(normalizedBanId, remaining);
      const t0 = performance.now();
      checkSubmitAtRef.current.set(normalizedBanId, t0);
      const role = resultParticipantRole(uid, checkBanRef.current);
      logResultLatency('[result-click-answer]', {
        banId: normalizedBanId,
        authUserId: uid,
        role,
        elapsedMs: 0,
      });
      dismissCurrentOverlay('user-answer', remaining);
      setCheckWaiting(false);
      logCheckAnswerOverlayHostSnapshot('after-dismiss-user-answer');

      let chainContinuePromise: Promise<ContinueNotificationChainOutcome> | null =
        null;
      logCheckContinueDecision({
        source: 'check-answer-submit',
        remainingLen: remaining.length,
        overlayQueueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        chainAdvanceWaiting: chainAdvanceWaitingRef.current,
        notificationChainTransitioning:
          notificationChainTransitioningRef.current,
        lobbyOpen: lobbyOpenRef.current,
        checkDismissChainOwned: checkAnswerDismissChainOwnedRef.current,
        placeholderKind,
      });
      if (remaining.length === 0) {
        logCheckContinueCall({
          source: 'check-answer-submit',
          reason: 'remaining-empty-local-queue',
        });
        chainContinuePromise = continueNotificationChainOrOpenLobbyRef.current(
          'check-answer-submit',
          {
            clearActiveHold: false,
            prefetchSkipBanId: normalizedBanId,
          },
        );
      } else {
        checkAnswerDismissChainOwnedRef.current = false;
        queueMicrotask(() => {
          const head = overlayQueueRef.current[0];
          const nextReady =
            !head ||
            (head.kind === 'check' && !!checkBanRef.current?.id) ||
            (head.kind === 'result' && !!resultRef.current?.id) ||
            (head.kind === 'incoming' && !!incomingBanRef.current?.id);
          if (nextReady) {
            setChainAdvanceWaiting(false);
          } else if (head) {
            traceChainPlaceholderStuckRef.current(
              'check-answer-next-not-ready',
              'check-answer-submit-microtask',
              'queue-head-not-mounted',
              {
                headKind: head.kind,
                headBanId:
                  head.kind === 'result'
                    ? head.result.id
                    : head.kind === 'incoming' || head.kind === 'check'
                      ? head.ban.id
                      : null,
              },
            );
          }
        });
      }

      try {
        logResultLatency('[result-http-start]', {
          banId: normalizedBanId,
          authUserId: uid,
          role,
          elapsedMs: Math.round(performance.now() - t0),
        });
        const res = await api<{
          done: boolean;
          waiting?: boolean;
          result?: BanResult;
        }>(`/bans/${normalizedBanId}/check`, {
          method: 'POST',
          token,
          body: JSON.stringify(payload),
          retries: 0,
        });

        const elapsedMs = Math.round(performance.now() - t0);
        logResultLatency('[result-http-response]', {
          banId: normalizedBanId,
          authUserId: uid,
          role,
          source: 'http',
          elapsedMs,
          done: res.done,
          waiting: !!res.waiting,
          hasResult: !!res.result,
        });

        logCheckAnswerSubmitOk({
          banId: normalizedBanId,
          answer: completed,
          done: res.done,
          waiting: !!res.waiting,
          hasResult: !!res.result,
        });

        if (res.result) {
          const normalized = normalizeBanResult(res.result);
          logCheckAnswerFinalResultFound({
            banId: normalizedBanId,
            status: normalized.headline || normalized.outcome,
          });
          const shown = showCheckAnswerFinalResult(normalized, 'http');
          if (!shown && res.done) {
            scheduleResultPollBurst();
          }
        } else if (res.done) {
          logCheckAnswerFinalResultFetchStart({ banId: normalizedBanId });
          try {
            const fetched = await api<{ result: BanResult | null }>(
              `/bans/${normalizedBanId}/result`,
              { token, retries: 0, timeoutMs: 5000 },
            );
            if (fetched.result) {
              const normalized = normalizeBanResult(fetched.result);
              logCheckAnswerFinalResultFetchOk({
                banId: normalizedBanId,
                status: normalized.headline || normalized.outcome,
              });
              const shown = showCheckAnswerFinalResult(normalized, 'http');
              if (!shown) {
                scheduleResultPollBurst();
              }
            } else {
              logCheckAnswerFinalResultMissing({ banId: normalizedBanId });
              scheduleResultPollBurst();
            }
          } catch {
            logCheckAnswerFinalResultMissing({
              banId: normalizedBanId,
              reason: 'fetch-failed',
            });
            scheduleResultPollBurst();
          }
        } else if (res.waiting) {
          challengeLog('check:waiting-partner', { banId: normalizedBanId });
          scheduleResultPollBurst();
          const waitingOutcome = resumeCheckAnswerChainAfterWaitingPartner(
            normalizedBanId,
            remaining,
          );
          chainContinuePromise = Promise.resolve(waitingOutcome);
        }

        queueMicrotask(() => {
          void refreshUserRef.current().catch(() => {});
        });

        console.log('[check-submit-success]', { banId: normalizedBanId });
        console.log('[check-overlay-submit-success]', { banId: normalizedBanId });
        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка отправки';
        console.log('[check-submit-error]', { banId: normalizedBanId, error: message });
        console.log('[check-overlay-submit-error]', {
          banId: normalizedBanId,
          error: message,
        });
        challengeLog('check:submit-failed', {
          banId: normalizedBanId,
          message,
        });
        return { ok: false, error: message };
      } finally {
        checkAnswerInFlightRef.current.delete(normalizedBanId);
        if (chainContinuePromise) {
          try {
            const outcome = await chainContinuePromise;
            await handleCheckAnswerChainOutcomeRef.current(
              outcome,
              normalizedBanId,
              'check-answer-submit',
              0,
            );
            logCheckAnswerOverlayHostSnapshot('after-chain-continue-finally');
          } catch {
            // chain continue logs its own errors
          }
        } else if (
          !chainAdvanceWaitingRef.current &&
          overlayQueueRef.current.length === 0 &&
          pendingStartupInteractionsRef.current.length === 0 &&
          !resultRef.current?.id &&
          !checkBanRef.current?.id &&
          !incomingBanRef.current?.id
        ) {
          openLobbyAfterCheckDismissIfEmptyRef.current(
            'check-http-finally',
            normalizedBanId,
          );
        }
      }
    },
    [
      dismissCurrentOverlay,
      resumeCheckAnswerChainAfterWaitingPartner,
      showCheckAnswerFinalResult,
      scheduleResultPollBurst,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
    ],
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
        deferResultWhileSuccessCardMounted('forceOpenOverboardResult', {
          kind: 'result',
          result: payload,
        })
      ) {
        logForceOverboard('early-return', {
          banId,
          reason: 'success-card-mounted',
          guard: 'sendSuccessCardActiveRef',
        });
        return false;
      }

      const normalizedBanId = normalizeId(banId);
      if (isLocalForce) {
        freshOverboardActionBanIdsRef.current.add(normalizedBanId);
        resultCtaConsumedBanIdsRef.current.delete(normalizedBanId);
        resultDeliveredBanIdsRef.current.delete(normalizedBanId);
        shownOverlayKeysRef.current.delete(`result:${normalizedBanId}`);
        clearDismissedResultLocally(normalizedBanId, uid);
        console.log('[incoming-overboard-result-start]', { banId: normalizedBanId });
        console.log('[result-stale-guard-bypass-fresh]', {
          banId: normalizedBanId,
          source: 'overboard-action',
        });
        console.log('[incoming-overboard-result-fresh]', {
          banId: normalizedBanId,
          resultKey: `result:${normalizedBanId}`,
        });
      } else if (
        resultCtaConsumedBanIdsRef.current.has(normalizedBanId) ||
        isDismissedResultLocally(normalizedBanId, uid)
      ) {
        console.log('[overboard-repeat-debug] duplicate result blocked', {
          banId: normalizedBanId,
          source: 'forceOpenOverboardResult',
          consumed: resultCtaConsumedBanIdsRef.current.has(normalizedBanId),
          dismissedLocal: isDismissedResultLocally(normalizedBanId, uid),
        });
        console.log('[result-card-blocked]', {
          banId: normalizedBanId,
          reason: 'dismissed-after-result-cta',
        });
        console.log('[DIRECT RESULT REOPEN BLOCKED]', {
          reason: 'dismissed-after-result-cta',
          banId: normalizedBanId,
        });
        markVisibleOverboardTrace('[DIRECT RESULT REOPEN BLOCKED]', {
          reason: 'dismissed-after-result-cta',
          banId: normalizedBanId,
          source: 'forceOpenOverboardResult',
        });
        logForceOverboard('early-return', {
          banId: normalizedBanId,
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
      if (isLocalForce) {
        console.log('[result-card-mounted]', {
          banId: normalized.id,
          source: 'overboard-action',
        });
      }

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
      lastProcessedOverlayKindForBansRef.current = 'incoming';
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

      const uid = userIdRef.current?.trim();
      const parentBanId = banId.trim();
      if (uid && parentBanId) {
        if (answer === 'overboard') {
          markReplyDeeplinkOverboard(uid, parentBanId);
          clearReplyParentActivePriority('overboard');
        }
      }
      replyDeeplinkRepeatEntryRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastOpenedRef.current = false;

      chainAdvanceExplicitRef.current = true;
      notificationChainAwaitingUserRef.current = false;

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
    [applyOverlayQueue, clearReplyFastSessionAfterAnswer, clearReplyParentActivePriority],
  );

  const shouldBlockIncomingCardReopen = useCallback(
    (parentBanId: string): string | null => {
      const bid = parentBanId.trim();
      if (!bid) return null;
      if (replyFlowStartedForBanIdRef.current === bid) {
        return 'reply-flow-started';
      }
      if (incomingReplyComposeDismissedRef.current.has(bid)) {
        return 'reply-compose-dismissed';
      }
      if (
        replyComposeActiveRef.current &&
        replyToBanIdPersistRef.current === bid
      ) {
        return 'reply-compose-active';
      }
      return null;
    },
    [],
  );

  const dismissIncomingCardForReplyCompose = useCallback(
    (banId: string) => {
      incomingReplyComposeDismissedRef.current.add(banId);

      const beforeQueue = overlayQueueRef.current;
      const nextQueue = removeOverlaysForBan(beforeQueue, banId, ['incoming']);
      overlayQueueRef.current = nextQueue;
      setOverlayQueue(nextQueue);

      logIncomingReplyCleanupSnapshot({
        stage: 'before',
        step: 'clearActiveIncomingOverlayBanStable',
        banId,
        source: 'dismissIncomingCardForReplyCompose',
        ...buildIncomingReplyCleanupSnapshot(),
      });
      clearActiveIncomingOverlayBanStable('reply-compose', banId);
      logIncomingReplyCleanupSnapshot({
        stage: 'after',
        step: 'clearActiveIncomingOverlayBanStable',
        banId,
        source: 'dismissIncomingCardForReplyCompose',
        ...buildIncomingReplyCleanupSnapshot(),
      });
      incomingBanRef.current = null;
      checkBanRef.current = null;
      setIncomingBan(null);
      setCheckBan(null);

      clearReplyFastSessionAfterAnswer(banId, { preserveReplySendIds: true });

      console.log('[reply-card-close-before-what]', {
        parentBanId: banId,
        removedFromQueue: nextQueue.length !== beforeQueue.length,
        remainingIds: nextQueue.map((item) =>
          item.kind === 'result' ? `result:${item.result.id}` : `${item.kind}:${item.ban.id}`,
        ),
      });
      console.log('[INCOMING CARD DISMISSED FOR REPLY COMPOSE]', { banId });
      markVisibleOverboardTrace('[INCOMING CARD DISMISSED FOR REPLY COMPOSE]', {
        banId,
      });
    },
    [
      buildIncomingReplyCleanupSnapshot,
      clearReplyFastSessionAfterAnswer,
      clearActiveIncomingOverlayBanStable,
    ],
  );

  const releaseIncomingOverlayForReplyCompose = useCallback(
    (banId: string, source: string) => {
      const norm = normalizeId(banId);
      incomingReplyComposeDismissedRef.current.add(norm);
      logIncomingReplyCleanupSnapshot({
        stage: 'before',
        step: 'clearActiveUserCardHold',
        banId: norm,
        source,
        ...buildIncomingReplyCleanupSnapshot(),
      });
      emitResultClearCallsite({
        source,
        reason: 'release-incoming-overlay-for-reply-compose',
        willClearHeld: true,
      });
      heldUserCardOverlayRef.current = null;
      setHeldUserCardOverlay(null);
      emitResultHeldStillPresentAfterClear(
        source,
        'release-incoming-overlay-for-reply-compose',
      );
      notificationChainAwaitingUserRef.current = false;
      notificationChainHandoffRef.current = false;
      logIncomingReplyCleanupSnapshot({
        stage: 'after',
        step: 'clearActiveUserCardHold',
        banId: norm,
        source,
        ...buildIncomingReplyCleanupSnapshot(),
      });
      logIncomingReplyClearActiveHold({ banId: norm, source });
      chainAdvanceExplicitRef.current = false;
      clearNotificationChainTransitioningInline();
      setChainAdvanceWaiting(false);
      goToBansAdvancePendingRef.current = false;
      logIncomingReplyCleanupSnapshot({
        stage: 'before',
        step: 'clearIncomingOverlayRefs',
        banId: norm,
        source,
        ...buildIncomingReplyCleanupSnapshot(),
      });
      incomingBanRef.current = null;
      checkBanRef.current = null;
      setIncomingBan(null);
      setCheckBan(null);
      logIncomingReplyCleanupSnapshot({
        stage: 'after',
        step: 'clearIncomingOverlayRefs',
        banId: norm,
        source,
        ...buildIncomingReplyCleanupSnapshot(),
      });
      logIncomingReplyOverlayClosed({
        banId: norm,
        source,
        queueLen: overlayQueueRef.current.length,
      });
    },
    [buildIncomingReplyCleanupSnapshot, setChainAdvanceWaiting],
  );

  const finalizeIncomingReplyAfterSend = useCallback(
    (banId: string) => {
      const uid = userIdRef.current?.trim();
      const parentBanId = (replyDeeplinkParentBanIdRef.current ?? banId).trim();
      if (uid && parentBanId) {
        markReplyDeeplinkSent(uid, parentBanId);
      }
      replyFlowStartedForBanIdRef.current = null;
      replyDeeplinkRepeatEntryRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastOpenedRef.current = false;
      incomingConsumedAfterAnswerRef.current.add(parentBanId);
      dismissedIncomingRef.current.add(parentBanId);
      locallyAckedIncomingRef.current.add(parentBanId);
      incomingReplyComposeDismissedRef.current.delete(parentBanId);

      const beforeQueue = overlayQueueRef.current;
      const nextQueue = removeOverlaysForBan(beforeQueue, parentBanId, ['incoming']);
      if (nextQueue.length !== beforeQueue.length) {
        overlayQueueRef.current = nextQueue;
        setOverlayQueue(nextQueue);
      }

      if (incomingBanRef.current?.id === parentBanId) {
        incomingBanRef.current = null;
        setIncomingBan(null);
      }

      clearReplyFastSessionAfterAnswer(parentBanId);
      clearNotificationChainReplyCompose('reply-send-finalize');

      console.log('[INCOMING REPLY FINALIZED AFTER SEND]', { banId: parentBanId });
      markVisibleOverboardTrace('[INCOMING REPLY FINALIZED AFTER SEND]', {
        banId: parentBanId,
      });
    },
    [clearNotificationChainReplyCompose, clearReplyFastSessionAfterAnswer],
  );

  const queueHasIncomingForBan = useCallback((banId: string): boolean => {
    const norm = normalizeId(banId);
    if (!norm) return false;
    return (
      overlayQueueRef.current.some(
        (q) => q.kind === 'incoming' && normalizeId(q.ban.id) === norm,
      ) ||
      pendingStartupInteractionsRef.current.some(
        (q) => q.kind === 'incoming' && normalizeId(q.ban.id) === norm,
      )
    );
  }, []);

  const resolveIncomingOverboardPathPick = useCallback(
    (banId: string, stableIncomingBanIdBeforeClear: string | null) => {
      const norm = normalizeId(banId);
      const head = overlayQueueRef.current[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      const heldKind = held?.kind ?? null;
      const heldBanId = held ? normalizeId(heldUserCardBanId(held)) : null;
      const incomingBanId = incomingBanRef.current?.id ?? null;
      const incomingBanNorm = normalizeId(incomingBanId);
      const stableNorm = normalizeId(stableIncomingBanIdBeforeClear ?? '');
      const drainActive = overlayQueueDrainActiveRef.current;
      const awaitingUser = notificationChainAwaitingUserRef.current;
      const transitioning = notificationChainTransitioningRef.current;
      const queueLen = overlayQueueRef.current.length;
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const queueHasIncoming = queueHasIncomingForBan(banId);
      const replyDirectBanId =
        replyDeepLinkBanIdRef.current ?? replyDeeplinkPendingBanIdRef.current;
      const isReplyDirectOutsideQueue =
        replyDeeplinkFastOpenedRef.current &&
        normalizeId(replyDirectBanId ?? '') === norm &&
        !drainActive &&
        !queueHasIncoming &&
        queueLen === 0 &&
        pendingLen === 0 &&
        !awaitingUser &&
        !transitioning;

      const snapshot = {
        banId: norm,
        queueHeadKind: head?.kind ?? null,
        queueHeadBanId:
          head?.kind === 'result'
            ? head.result.id
            : head?.kind === 'incoming' || head?.kind === 'check'
              ? head.ban.id
              : null,
        heldKind,
        heldBanId: heldBanId || null,
        incomingBanId: incomingBanId ?? null,
        stableIncomingBanId: stableIncomingBanIdBeforeClear ?? null,
        drainActive,
        awaitingUser,
      };

      if (!norm) {
        return {
          path: 'direct' as const,
          reason: 'invalid-ban-id',
          ...snapshot,
        };
      }

      if (isReplyDirectOutsideQueue) {
        return {
          path: 'direct' as const,
          reason: 'reply-deeplink-outside-queue',
          ...snapshot,
        };
      }

      const reasons: string[] = [];

      if (
        awaitingUser &&
        held?.kind === 'incoming' &&
        heldBanId === norm
      ) {
        reasons.push('held-incoming-awaiting');
      }
      if (
        incomingBanNorm === norm &&
        (isActiveUserCardHold() || awaitingUser)
      ) {
        reasons.push('incoming-ban-ref-active-hold');
      }
      if (
        head?.kind === 'incoming' &&
        normalizeId(head.ban.id) === norm &&
        (awaitingUser || transitioning || queueLen > 0)
      ) {
        reasons.push('queue-head-incoming');
      }
      if (heldKind === 'incoming' && heldBanId === norm) {
        reasons.push('held-incoming');
      }
      if (
        incomingBanNorm === norm &&
        (queueHasIncoming ||
          drainActive ||
          awaitingUser ||
          transitioning ||
          queueLen > 0 ||
          pendingLen > 0 ||
          stableNorm === norm)
      ) {
        reasons.push('incoming-ban-ref-queue-context');
      }
      if (stableNorm === norm) {
        reasons.push('stable-incoming');
      }
      if (
        drainActive &&
        (queueHasIncoming ||
          stableNorm === norm ||
          heldBanId === norm ||
          incomingBanNorm === norm)
      ) {
        reasons.push('queue-drain-active');
      }
      if (queueHasIncoming) {
        reasons.push('queue-incoming-for-ban');
      }
      if (
        (queueLen > 0 || pendingLen > 0) &&
        (incomingBanNorm === norm ||
          heldBanId === norm ||
          stableNorm === norm ||
          queueHasIncoming)
      ) {
        reasons.push('displayed-queue-card');
      }

      const path = reasons.length > 0 ? ('atomic' as const) : ('direct' as const);
      return {
        path,
        reason: reasons.length > 0 ? reasons.join('+') : 'no-queue-context',
        ...snapshot,
      };
    },
    [queueHasIncomingForBan],
  );

  const replaceIncomingWithOverboardResultAtomic = useCallback(
    (optimistic: BanResult, banId: string): boolean => {
      const norm = normalizeId(banId);
      if (!norm) return false;

      incomingOverboardAtomicBanIdRef.current = norm;
      logIncomingOverboardAtomicResult({ banId: norm });

      const uid = userIdRef.current?.trim() ?? '';
      freshOverboardActionBanIdsRef.current.add(norm);
      resultCtaConsumedBanIdsRef.current.delete(norm);
      resultDeliveredBanIdsRef.current.delete(norm);
      shownOverlayKeysRef.current.delete(`result:${norm}`);
      if (uid) {
        clearDismissedResultLocally(norm, uid);
      }

      lastProcessedOverlayKindForBansRef.current = 'incoming';
      incomingConsumedAfterAnswerRef.current.add(norm);
      dismissedIncomingRef.current.add(norm);
      locallyAckedIncomingRef.current.add(norm);

      if (uid) {
        markReplyDeeplinkOverboard(uid, norm);
        clearReplyParentActivePriority('overboard-atomic');
      }
      replyDeeplinkRepeatEntryRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastOpenedRef.current = false;

      const cleaned = removeOverlaysForBan(
        overlayQueueRef.current,
        norm,
        ['incoming', 'check'],
      );
      const resultItem: QueuedOverlay = { kind: 'result', result: optimistic };
      const nextQueue = buildResultPriorityQueue(cleaned, norm, resultItem);
      resultPriorityBanIdsRef.current.add(norm);

      try {
        flushSync(() => {
          clearDirectOverboardLayerRefs();
          setDirectResultOverlayActive(false);
          setOverboardTransitionActive(false);
          setIncomingBan(null);
          incomingBanRef.current = null;
          setCheckBan(null);
          checkBanRef.current = null;
          overlayQueueRef.current = nextQueue;
          setOverlayQueue(nextQueue);
          setResult(optimistic);
          resultRef.current = optimistic;
          resultOpenRef.current = true;
          const held: HeldUserCardOverlay = { kind: 'result', result: optimistic };
          heldUserCardOverlayRef.current = held;
          setHeldUserCardOverlay(held);
          notificationChainAwaitingUserRef.current = true;
          notificationChainHandoffRef.current = false;
          chainAdvanceExplicitRef.current = false;
          setNotificationChainTransitioning(false);
          setChainAdvanceWaiting(false);
          setLobbyOpen(false);
          lobbyOpenRef.current = false;
          clearActiveIncomingOverlayBanStable('atomic-result');
        });
      } catch {
        incomingOverboardAtomicBanIdRef.current = null;
        return false;
      }

      resultDeliveredBanIdsRef.current.add(norm);
      shownOverlayKeysRef.current.add(`result:${norm}`);
      logResultCardStableHold({ banId: norm, source: 'incoming-overboard-atomic' });
      logOverboardActionResult({
        banId: norm,
        resultKind: 'result',
        resultStatus: optimistic.status ?? optimistic.outcome ?? null,
        resultBanId: norm,
        shouldEnqueueResult: true,
        shouldShowResultImmediately: true,
        source: 'replaceIncomingWithOverboardResultAtomic',
        atomic: true,
        ok: true,
      });
      logQueueItemBuiltAfterOverboard({
        kind: 'result',
        banId: norm,
        status: optimistic.status ?? optimistic.outcome ?? null,
        headline: getResultCardHeadline(optimistic),
        verifyPhase: null,
        renderable: isValidBanResultPayload(optimistic),
        source: 'replaceIncomingWithOverboardResultAtomic',
      });
      logActiveUserCardHoldState({
        source: 'replaceIncomingWithOverboardResultAtomic',
        activeUserCardHold: 'result',
        heldKind: 'result',
        heldBanId: norm,
        notificationChainWaitingUser: notificationChainAwaitingUserRef.current,
        willClear: false,
        willPreserve: true,
      });
      return true;
    },
    [
      clearActiveIncomingOverlayBanStable,
      clearDirectOverboardLayerRefs,
      clearReplyParentActivePriority,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
    ],
  );

  const openIncomingOverboardOptimistic = useCallback(
    (
      ban: BanInteraction,
      clickTs = performance.now(),
      opts?: { fallbackBans?: BanInteraction[] },
    ): boolean => {
      const banId = ban.id;
      const uid = userIdRef.current;
      const mounted = getActiveMountedUserCard();
      const stableIncomingBanIdBeforeClear =
        activeIncomingOverlayBanRef.current?.id ?? null;
      logOverboardActionStart({
        banId,
        activeKind: mounted?.kind ?? heldUserCardOverlayRef.current?.kind ?? null,
        activeBanId:
          mounted?.banId ??
          (heldUserCardOverlayRef.current
            ? heldUserCardBanId(heldUserCardOverlayRef.current)
            : null),
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        source: 'openIncomingOverboardOptimistic',
      });
      clearActiveIncomingOverlayBanStable('overboard', banId);
      console.log('[incoming-overboard-click]', { banId });
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

      const pathPick = resolveIncomingOverboardPathPick(
        banId,
        stableIncomingBanIdBeforeClear,
      );
      logOverboardPathPick({
        banId,
        path: pathPick.path,
        reason: pathPick.reason,
        queueHeadKind: pathPick.queueHeadKind,
        queueHeadBanId: pathPick.queueHeadBanId,
        heldKind: pathPick.heldKind,
        heldBanId: pathPick.heldBanId,
        incomingBanId: pathPick.incomingBanId,
        stableIncomingBanId: pathPick.stableIncomingBanId,
        drainActive: pathPick.drainActive,
        awaitingUser: pathPick.awaitingUser,
      });

      if (pathPick.path === 'atomic') {
        const atomicOk = replaceIncomingWithOverboardResultAtomic(
          optimistic,
          banId,
        );
        if (!atomicOk) {
          overboardInFlightRef.current = null;
          clearLocalOverboardBypass();
          return false;
        }
        traceOverboardFlow('optimistic-result-opened-atomic', { banId });
        logOverboardDirectState('after-atomic', readDirectOverboardSnapshot(), {
          banId,
          optimisticOpened: true,
        });
        return true;
      }

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
      clearActiveIncomingOverlayBanStable,
      consumeIncomingAfterAnswer,
      readDirectOverboardSnapshot,
      replaceIncomingWithOverboardResultAtomic,
      resolveIncomingOverboardPathPick,
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
          !isLocalOverboardBypassForBan(banId) &&
          overboardInFlightRef.current !== banId &&
          (resultCtaConsumedBanIdsRef.current.has(banId) ||
            isDismissedResultLocally(banId, uid))
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
          incomingOverboardAtomicBanIdRef.current === banId &&
          resultRef.current?.id === banId
        ) {
          const merged = mergeOverboardResultUsers(
            resultRef.current,
            normalized,
          );
          resultRef.current = merged;
          setResult(merged);
          const held: HeldUserCardOverlay = { kind: 'result', result: merged };
          heldUserCardOverlayRef.current = held;
          setHeldUserCardOverlay(held);
          const q = overlayQueueRef.current;
          const nextQ = q.map((item) =>
            item.kind === 'result' && item.result.id === banId
              ? { kind: 'result' as const, result: merged }
              : item,
          );
          overlayQueueRef.current = nextQ;
          setOverlayQueue(nextQ);
          traceOverboardFlow('optimistic-sync-api-atomic', { banId, source });
          logOverboardFinalState(banId, `sync-atomic-${source}`);
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
        logOverboardActionResult({
          banId,
          apiStatus: payload.status ?? null,
          resultKind: 'result',
          resultStatus: payload.outcome ?? payload.status ?? null,
          resultBanId: payload.id,
          shouldEnqueueResult:
            incomingOverboardAtomicBanIdRef.current === banId ||
            overlayQueueRef.current.some(
              (item) => item.kind === 'result' && item.result.id === banId,
            ),
          shouldShowResultImmediately: resultRef.current?.id === banId,
          source: `finishOverboardSuccess:${source}`,
          ok: true,
        });
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
        if (
          incomingOverboardAtomicBanIdRef.current === banId &&
          resultRef.current?.id === banId
        ) {
          setOverboardTransitionActive(false);
        } else if (!directResultOverlayRef.current) {
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
      if (b !== null && whatOrConfirmActiveRef.current) {
        console.log('[compose-flow-notification-blocked]', {
          source: 'setIncomingBanSafe',
          kind: 'incoming',
          banId: b.id,
        });
        enqueueNotification(
          { kind: 'incoming', ban: enrichBanInteraction(b) },
          { source: 'session' },
        );
        return;
      }
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
    (banId: string, opts?: { explicitUserAction?: boolean }) => {
      const prev = overlayQueueRef.current;
      const next = prev.filter(
        (q) => !(q.kind === 'incoming' && q.ban.id === banId),
      );
      const headWasTarget =
        prev[0]?.kind === 'incoming' && prev[0].ban.id === banId;
      if (
        headWasTarget &&
        notificationChainAwaitingUserRef.current &&
        !opts?.explicitUserAction
      ) {
        console.log('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          banId,
          source: 'removeIncomingFromQueue',
        });
        return;
      }
      if (headWasTarget) {
        chainAdvanceExplicitRef.current = true;
        clearActiveUserCardHold('removeIncomingFromQueue-explicit');
        notificationChainAwaitingUserRef.current = false;
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
      setReplyIncomingDisplayBan(null);
      replyIncomingDisplayBanRef.current = null;
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

  const routeReplyDeeplinkCompleted = useCallback(
    (kind: 'overboard' | 'sent', banId: string) => {
      const normalizedBanId = banId.trim();
      const viewerId = userIdRef.current?.trim() ?? '';
      const stored = viewerId
        ? getReplyDeeplinkActionResult(viewerId, normalizedBanId)
        : null;
      const isRepeatEntry = replyDeeplinkRepeatEntryRef.current;
      const isStoredCompleted =
        stored === 'reply_ban_overboard' || stored === 'reply_ban_sent';

      if (!isRepeatEntry && !isStoredCompleted) {
        console.log('[reply-toast-skip]', {
          source: 'routeReplyDeeplinkCompleted',
          reason: 'not-repeat-entry',
          kind,
          banId: normalizedBanId,
        });
        return;
      }

      const alreadyRouted =
        replyDeeplinkCompletedRouteBanIdRef.current === normalizedBanId;
      const shouldQueueToast = isRepeatEntry && !alreadyRouted;

      console.log('[reply-completed-route-start]', {
        kind,
        banId: normalizedBanId,
        isRepeatEntry,
        isStoredCompleted,
        alreadyRouted,
      });

      const clearedFastPath =
        replyDeeplinkFastOpenedRef.current || replyDeeplinkFastShellRef.current;
      const clearedBooting =
        deepLinkReplyBooting || replyDeeplinkPendingBanIdRef.current != null;
      const clearedShell = replyDeeplinkFastShellRef.current;

      replyDeeplinkCompletedRouteBanIdRef.current = normalizedBanId;

      abortReplyDeepLinkFast(`reply-deeplink-${kind}`);
      clearReplyDeeplinkFastTimeout();

      incomingConsumedAfterAnswerRef.current.add(normalizedBanId);
      dismissedIncomingRef.current.add(normalizedBanId);
      locallyAckedIncomingRef.current.add(normalizedBanId);

      const beforeQueue = overlayQueueRef.current;
      const nextQueue = removeOverlaysForBan(beforeQueue, normalizedBanId, [
        'incoming',
      ]);
      if (nextQueue.length !== beforeQueue.length) {
        if (isDeeplinkSingleCardModeActive()) {
          overlayQueueRef.current = nextQueue;
          setOverlayQueue(nextQueue);
          completeDeeplinkSingleCardMode('reply-completed-route');
          logDeeplinkReturnLobby({
            reason: 'reply-completed-route',
            banId: normalizedBanId,
            remainingLen: nextQueue.length,
          });
        } else {
          applyOverlayQueue(nextQueue);
        }
      } else if (
        overlayQueueRef.current[0]?.kind === 'incoming' &&
        overlayQueueRef.current[0].ban.id === normalizedBanId
      ) {
        dismissCurrentOverlay('reply-completed-route', nextQueue);
      }

      pinReplyToBanId(null);
      setReplyDeepLinkBanId(null);
      setIncomingReplyBanId(null);
      setDeepLinkReplyBan(null);
      setReplyHandoffLock(false);
      setReplyWhatReady(true);
      setDeepLinkReplyBooting(false);
      setReplyDeeplinkFastShell(false);
      setReplyIncomingDisplayBan(null);
      replyIncomingDisplayBanRef.current = null;
      replyFlowArmedBanIdRef.current = null;
      replyLockReleasedRef.current = false;
      replyDeeplinkPendingBanIdRef.current = null;
      replyDeeplinkFastOpenedRef.current = false;
      replyDeeplinkFastShellRef.current = false;
      replyDeeplinkPrefetchRef.current = false;
      replyDeeplinkFastHydratedRef.current = false;
      replyDeeplinkFastWrittenAtRef.current = null;
      replyDeeplinkFastWrittenBanIdRef.current = null;
      replyDeeplinkPrefillBanRef.current = null;
      replyDeepLinkBanIdRef.current = null;
      replyDeeplinkRepeatEntryRef.current = false;

      if (incomingBanRef.current?.id === normalizedBanId) {
        incomingBanRef.current = null;
      }
      setIncomingBan((prev) => (prev?.id === normalizedBanId ? null : prev));

      resolveActiveDeepLinkRouteBoot(normalizedBanId);
      releaseDeepLinkRouteBoot('reply-completed-route', normalizedBanId);

      if (!isLobbyBootIntroPrimed()) {
        markLobbyBootIntroPrimed(getLastKnownLobbyRingPercent(), 1);
        setLobbyIntroPrimedEpoch((n) => n + 1);
      }

      flushSync(() => {
        setLobbyOpen(true);
        lobbyOpenRef.current = true;
        lobbyShownLoggedRef.current = false;
      });
      openLobbyRef.current(`reply-deeplink-${kind}`);

      if (shouldQueueToast) {
        pendingReplyDeeplinkToastRef.current = { kind, banId: normalizedBanId };
      }

      setReplyCompletedRouteEpoch((n) => n + 1);

      console.log('[reply-completed-route-clear]', {
        clearedFastPath,
        clearedBooting,
        clearedShell,
      });
      console.log('[reply-completed-route-open-lobby]', {
        lobbyOpen: lobbyOpenRef.current,
        homeSnapshotReady,
        lobbyBootIntroPrimed: isLobbyBootIntroPrimed(),
      });
      console.log('[reply-deeplink]', {
        banId: normalizedBanId,
        action: 'completed-route',
        kind,
      });
    },
    [
      abortReplyDeepLinkFast,
      applyOverlayQueue,
      clearReplyDeeplinkFastTimeout,
      deepLinkReplyBooting,
      dismissCurrentOverlay,
      homeSnapshotReady,
      pinReplyToBanId,
    ],
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

  const collectReplyStartupBlockers =
    useCallback((): ReplyStartupBlockersSnapshot => {
      const replyDirectActive =
        replyDeepLinkBanIdRef.current != null &&
        (replyDeeplinkFastOpenedRef.current || replyHandoffLock);
      return {
        isBooting: deepLinkReplyBooting || replyDeeplinkFastShell,
        isLobbyBootVisible: lobbyOpenRef.current && !replyDirectActive,
        isRouteTransitioning: isDeepLinkRouteBootPending(),
        isOverlayLocked: isNotificationQueueLocked(),
        isNotificationQueueLocked: isNotificationQueueLocked(),
        isAdvancingQueue:
          notificationChainTransitioningRef.current ||
          chainAdvanceWaitingRef.current,
        dimVisible:
          replyDeeplinkFastShellRef.current ||
          deepLinkReplyBooting ||
          (notificationChainTransitioningRef.current &&
            !replyDirectActive),
        blurVisible:
          replyDeeplinkFastShellRef.current ||
          deepLinkReplyBooting ||
          replyHandoffLock,
      };
    }, [deepLinkReplyBooting, replyDeeplinkFastShell, replyHandoffLock]);

  const clearStartupBlockingLayersForIncomingCard = useCallback(
    (banId: string, source: string) => {
      logReplyStartupBlockers(collectReplyStartupBlockers(), {
        phase: 'before-clear',
        banId,
        source,
      });
      flushSync(() => {
        setDeepLinkReplyBooting(false);
        setReplyDeeplinkFastShell(false);
        replyDeeplinkFastShellRef.current = false;
        setStartupGraceActive(false);
        setNotificationChainTransitioning(false);
        notificationChainTransitioningRef.current = false;
        setChainAdvanceWaiting(false);
        if (isDeepLinkRouteBootPending()) {
          releaseDeepLinkRouteBoot('reply-card-ready', banId);
        }
      });
      logStartupBlockersClear({ banId, source });
      logReplyCardOverlaySet({ banId, source });
      logReplyStartupBlockers(collectReplyStartupBlockers(), {
        phase: 'after-clear',
        banId,
        source,
      });
    },
    [collectReplyStartupBlockers, setChainAdvanceWaiting, setNotificationChainTransitioning],
  );

  const commitReplyIncomingDisplayBan = useCallback(
    (ban: BanInteraction | null | undefined): boolean => {
      if (!ban?.id || isReplyDeeplinkShellBan(ban)) return false;
      const enriched = enrichBanInteraction(ban);
      replyIncomingDisplayBanRef.current = enriched;
      incomingBanRef.current = enriched;
      setReplyIncomingDisplayBan(enriched);
      setIncomingBan(enriched);
      if (isDeepLinkRouteBootPending()) {
        releaseDeepLinkRouteBoot('reply-card-ready', enriched.id);
      }
      if (
        replyDeeplinkFastOpenedRef.current ||
        replyDeepLinkBanIdRef.current === enriched.id
      ) {
        clearStartupBlockingLayersForIncomingCard(
          enriched.id,
          'commitReplyIncomingDisplayBan',
        );
      }
      return true;
    },
    [clearStartupBlockingLayersForIncomingCard],
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
        commitReplyIncomingDisplayBan(enriched);
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
    [commitReplyIncomingDisplayBan, hydrateReplyDeeplinkIncomingBan],
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
        const viewerId = userIdRef.current?.trim() ?? auth.user?.id ?? null;
        logDeeplinkBanSourceSnapshot({
          source: 'applyReplyDeeplinkFastOverlay',
          telegramUserId: viewerId,
          banId: ban.id,
          kind: 'incoming',
          apiEndpoint: null,
          loadedFrom: 'applyReplyDeeplinkFastOverlay-queue-head',
          ...buildBanViewerRoleFlags(ban, viewerId),
        });
        noteKnownDirectBanId(ban.id);
      }
      return mounted;
    },
    [applyOverlayQueue, isReplyFastQueueHeadValid, auth.user?.id],
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
      const normalizedBanId = banId.trim();
      if (replyDeeplinkCompletedRouteBanIdRef.current === normalizedBanId) {
        return false;
      }
      const viewerId = userIdRef.current?.trim() ?? null;
      if (viewerId && normalizedBanId) {
        const stored = getReplyDeeplinkActionResult(viewerId, normalizedBanId);
        if (stored === 'reply_ban_overboard' || stored === 'reply_ban_sent') {
          const routeKind =
            stored === 'reply_ban_overboard' ? 'overboard' : 'sent';
          console.log('[reply-deeplink-route]', {
            entry: stored === 'reply_ban_overboard'
              ? 'lobby_overboard'
              : 'lobby_sent',
            banId: normalizedBanId,
            path: 'openReplyDeepLinkFast-stored',
          });
          routeReplyDeeplinkCompleted(routeKind, normalizedBanId);
          return false;
        }
      }

      const token = tokenRef.current;
      if (!viewerId || !token || auth.loading) return false;

      if (replyDeeplinkFastOpenedRef.current) return false;
      const reopenBlockReason = shouldBlockIncomingCardReopen(normalizedBanId);
      if (reopenBlockReason) {
        console.log('[reply-card-reopen-blocked]', {
          parentBanId: normalizedBanId,
          reason: reopenBlockReason,
        });
        markVisibleOverboardTrace('[INCOMING REOPEN BLOCKED REPLY COMPOSE ACTIVE]', {
          banId: normalizedBanId,
          reason: reopenBlockReason,
        });
        return false;
      }

      console.log('[REPLY FAST SHELL OPEN ATTEMPT]', { banId });
      markVisibleOverboardTrace('[REPLY FAST SHELL OPEN ATTEMPT]', { banId });
      logReplyDeeplinkStart({ banId, source: 'openReplyDeepLinkFast' });
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
        : buildReplyDeeplinkShellBan(normalizedBanId, viewerId);
      const entry = resolveReplyDeeplinkEntry(
        openBan,
        viewerId,
        normalizedBanId,
      );
      console.log('[reply-deeplink-route]', {
        entry,
        banId: normalizedBanId,
        path: 'openReplyDeepLinkFast-resolve',
      });
      if (entry === 'lobby_overboard') {
        routeReplyDeeplinkCompleted('overboard', normalizedBanId);
        return false;
      }
      if (entry === 'lobby_sent') {
        routeReplyDeeplinkCompleted('sent', normalizedBanId);
        return false;
      }
      if (entry === 'reject') {
        return false;
      }

      prepareReplyDeeplinkReopen(normalizedBanId, viewerId, {
        dismissedIncoming: dismissedIncomingRef.current,
        consumedAfterAnswer: incomingConsumedAfterAnswerRef.current,
        locallyAckedIncoming: locallyAckedIncomingRef.current,
        replyComposeDismissed: incomingReplyComposeDismissedRef.current,
        fastOpenedRef: replyDeeplinkFastOpenedRef,
      });

      const usingPrefetch = cacheHit != null;

      replyDeeplinkFastOpenedRef.current = true;
      replyDeeplinkPendingBanIdRef.current = normalizedBanId;
      replyDeeplinkParentBanIdRef.current = normalizedBanId;
      replyDeeplinkFastHydratedRef.current = usingPrefetch;

      let cardMounted = false;
      flushSync(() => {
        cardMounted = applyReplyDeeplinkFastOverlay(openBan);

        replyDeepLinkBanIdRef.current = normalizedBanId;
        replyFlowArmedBanIdRef.current = normalizedBanId;
        pinReplyToBanId(normalizedBanId);
        setReplyDeepLinkBanId(normalizedBanId);
        setIncomingReplyBanId(normalizedBanId);
        setIncomingBan(openBan);
        setReplyWhatReady(false);
        setReplyHandoffLock(true);
        setDeepLinkReplyBooting(!usingPrefetch);
        setReplyDeeplinkFastShell(!usingPrefetch);
        replyDeeplinkFastShellRef.current = !usingPrefetch;
        replyDeeplinkPrefetchRef.current = usingPrefetch;
        setLobbyOpen(false);
        lobbyOpenRef.current = false;

        if (usingPrefetch) {
          commitReplyIncomingDisplayBan(openBan);
        }
      });

      if (!cardMounted) {
        console.log('[REPLY FAST DIRECT PATH WITHOUT QUEUE HEAD]', {
          banId,
          reason: 'queue-head-not-incoming',
        });
        markVisibleOverboardTrace('[REPLY FAST DIRECT PATH WITHOUT QUEUE HEAD]', {
          banId,
        });
        const viewerIdForLog =
          userIdRef.current?.trim() ?? auth.user?.id ?? null;
        logDeeplinkBanSourceSnapshot({
          source: 'openReplyDeepLinkFast',
          telegramUserId: viewerIdForLog,
          banId: openBan.id,
          kind: 'incoming',
          apiEndpoint: usingPrefetch ? null : `/bans/${normalizedBanId}/open`,
          loadedFrom:
            cacheHit?.source ?? 'reply-deeplink-shell-no-queue-head',
          ...buildBanViewerRoleFlags(openBan, viewerIdForLog),
        });
        noteKnownDirectBanId(openBan.id);
      } else {
        logReplyCardSelected({
          banId: normalizedBanId,
          usingPrefetch,
          source: 'openReplyDeepLinkFast',
        });
        const viewerIdForLog =
          userIdRef.current?.trim() ?? auth.user?.id ?? null;
        logDeeplinkBanSourceSnapshot({
          source: 'openReplyDeepLinkFast',
          telegramUserId: viewerIdForLog,
          banId: openBan.id,
          kind: 'incoming',
          apiEndpoint: usingPrefetch ? null : `/bans/${normalizedBanId}/open`,
          loadedFrom: cacheHit?.source ?? 'reply-deeplink-shell',
          ...buildBanViewerRoleFlags(openBan, viewerIdForLog),
        });
        noteKnownDirectBanId(openBan.id);
        if (!usingPrefetch) {
          clearStartupBlockingLayersForIncomingCard(
            normalizedBanId,
            'openReplyDeepLinkFast-shell',
          );
        }
      }

      replyDeeplinkFastWrittenAtRef.current = performance.now();
      replyDeeplinkFastWrittenBanIdRef.current = normalizedBanId;

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

      scheduleReplyFastTimeout(normalizedBanId);

      replyDeeplinkChainHoldRef.current = true;
      enableDeeplinkSingleCardMode('reply', normalizedBanId);
      void prefetchPendingNotificationChain(normalizedBanId, 'reply-deeplink');

      return true;
    },
    [
      applyReplyDeeplinkFastOverlay,
      auth.boot?.claimedIncoming,
      auth.loading,
      buildReplyFastLookupCtx,
      clearStartupBlockingLayersForIncomingCard,
      commitReplyIncomingDisplayBan,
      routeReplyDeeplinkCompleted,
      scheduleReplyFastTimeout,
      shouldBlockIncomingCardReopen,
      prefetchPendingNotificationChain,
    ],
  );

  useLayoutEffect(() => {
    const banId = replyDeeplinkPendingBanIdRef.current?.trim() ?? '';
    const viewerId = auth.user?.id?.trim() ?? '';
    if (!banId || !viewerId || auth.loading || !auth.token) {
      replyDeeplinkPrefillBanRef.current = null;
      return;
    }

    const stored = getReplyDeeplinkActionResult(viewerId, banId);
    if (stored === 'reply_ban_overboard' || stored === 'reply_ban_sent') {
      const routeKind =
        stored === 'reply_ban_overboard' ? 'overboard' : 'sent';
      routeReplyDeeplinkCompleted(routeKind, banId);
      return;
    }

    if (incomingConsumedAfterAnswerRef.current.has(banId)) {
      replyDeeplinkPrefillBanRef.current = null;
      return;
    }
    if (
      replyFlowStartedForBanIdRef.current === banId ||
      incomingReplyComposeDismissedRef.current.has(banId)
    ) {
      console.log('[reply-card-reopen-blocked]', {
        parentBanId: banId,
        reason: 'prefill-effect-compose-active',
      });
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
      flushSync(() => {
        commitReplyIncomingDisplayBan(enriched);
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
        hydratedInPlace,
      });
      markVisibleOverboardTrace('[INCOMING CARD OPENED WITH PREFILL]', {
        banId,
        source: prefill.source,
        late: true,
        hydratedInPlace,
      });
    }
  }, [
    auth.loading,
    auth.token,
    auth.user?.id,
    auth.boot?.claimedIncoming,
    auth.boot?.replyDeeplinkPreview,
    buildReplyFastLookupCtx,
    commitReplyIncomingDisplayBan,
    hydrateReplyDeeplinkIncomingBan,
    overlayQueue.length,
    incomingBan?.id,
    sessionBootstrapped,
    routeReplyDeeplinkCompleted,
    pinReplyToBanId,
  ]);

  useLayoutEffect(() => {
    const banId = replyDeeplinkPendingBanIdRef.current?.trim() ?? '';
    const viewerId = auth.user?.id?.trim() ?? '';
    if (!banId || replyDeeplinkFastOpenedRef.current) return;
    if (!viewerId || auth.loading || !auth.token) return;
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
      const viewerId = userIdRef.current?.trim() ?? null;
      const deeplinkBanId = (
        replyDeeplinkParentBanIdRef.current ??
        replyDeeplinkPendingBanIdRef.current ??
        enriched.id
      ).trim();
      const entry = resolveReplyDeeplinkEntry(
        enriched,
        viewerId,
        deeplinkBanId,
      );
      const routeDecision =
        entry === 'lobby_overboard'
          ? 'completed_overboard'
          : entry === 'lobby_sent'
            ? 'completed_sent'
            : entry === 'open_card'
              ? 'open_card'
              : 'reject';
      console.log('[reply-route-decision]', {
        decision: routeDecision,
        deeplinkBanId,
        banId: enriched.id,
      });
      console.log('[reply-deeplink-route]', {
        entry,
        banId: deeplinkBanId,
        path: 'openDeepLinkReply',
      });
      if (entry === 'lobby_overboard') {
        routeReplyDeeplinkCompleted('overboard', deeplinkBanId);
        logDeepLinkHandlerResult({
          type: 'reply',
          banId: b.id,
          instantBanOpen: false,
          sendFlowOpen: false,
          selectedBanId: b.id,
          overlayQueueLength: overlayQueueRef.current.length,
          ok: true,
          reason: 'reply-deeplink-overboard',
        });
        return;
      }
      if (entry === 'lobby_sent') {
        routeReplyDeeplinkCompleted('sent', deeplinkBanId);
        logDeepLinkHandlerResult({
          type: 'reply',
          banId: b.id,
          instantBanOpen: false,
          sendFlowOpen: false,
          selectedBanId: b.id,
          overlayQueueLength: overlayQueueRef.current.length,
          ok: true,
          reason: 'reply-deeplink-sent',
        });
        return;
      }
      if (entry === 'reject') {
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

      const reopenBlockReason = shouldBlockIncomingCardReopen(deeplinkBanId);
      if (reopenBlockReason) {
        console.log('[reply-card-reopen-blocked]', {
          parentBanId: deeplinkBanId,
          reason: reopenBlockReason,
        });
        logDeepLinkHandlerResult({
          type: 'reply',
          banId: b.id,
          instantBanOpen: false,
          sendFlowOpen: false,
          selectedBanId: b.id,
          overlayQueueLength: overlayQueueRef.current.length,
          ok: true,
          reason: `reply-compose-blocked:${reopenBlockReason}`,
        });
        return;
      }

      prepareReplyDeeplinkReopen(deeplinkBanId, viewerId!, {
        dismissedIncoming: dismissedIncomingRef.current,
        consumedAfterAnswer: incomingConsumedAfterAnswerRef.current,
        locallyAckedIncoming: locallyAckedIncomingRef.current,
        replyComposeDismissed: incomingReplyComposeDismissedRef.current,
        fastOpenedRef: replyDeeplinkFastOpenedRef,
      });
      pinReplyToBanId(null);
      setIncomingReplyBanId(null);

      const wasShell = replyDeeplinkFastShellRef.current;
      const wasPrefetch = replyDeeplinkPrefetchRef.current;
      const onReplyRoute =
        replyDeepLinkBanIdRef.current === enriched.id ||
        replyFlowArmedBanIdRef.current === enriched.id ||
        replyDeeplinkPendingBanIdRef.current === enriched.id ||
        wasShell ||
        wasPrefetch;
      setLobbyOpen(false);
      lobbyOpenRef.current = false;
      challengeLog('incoming:reply-deeplink', { id: b.id, status: b.status });

        logDeeplinkBanSourceSnapshot({
          source: 'openDeepLinkReply',
          telegramUserId: viewerId,
          banId: enriched.id,
          kind: 'incoming',
          apiEndpoint: `/bans/${enriched.id}/open`,
          loadedFrom: wasShell
            ? 'openDeepLinkReply-api-hydrate-shell'
            : wasPrefetch
              ? 'openDeepLinkReply-api-hydrate-prefetch'
              : 'openDeepLinkReply-api-hydrate',
          ...buildBanViewerRoleFlags(enriched, viewerId),
        });
      noteKnownDirectBanId(enriched.id);

      const prevHead = overlayQueueRef.current.find(
        (q) => q.kind === 'incoming' && q.ban.id === enriched.id,
      );
      const prevText =
        prevHead?.kind === 'incoming' ? prevHead.ban.text : null;
      let hydratedInPlace = hydrateReplyDeeplinkIncomingBan(enriched);
      if (!hydratedInPlace && !onReplyRoute) {
        enqueueNotification(
          { kind: 'incoming', ban: enriched },
          { live: true, source: 'deeplink' },
        );
      }
      replyDeeplinkFastHydratedRef.current = true;
      clearReplyDeeplinkFastTimeout();
      flushSync(() => {
        commitReplyIncomingDisplayBan(enriched);
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
        onReplyRoute,
        selectedBanId: replyDeepLinkBanId ?? b.id,
        queueHeadKind: headBan?.kind ?? null,
        queueHeadText: enriched.text ?? null,
      });
      markVisibleOverboardTrace('[INCOMING CARD DATA READY]', {
        banId: b.id,
        hydratedInPlace,
        wasPrefetch,
        onReplyRoute,
      });
      console.log('[INCOMING CARD HYDRATED FROM API]', {
        banId: b.id,
        hydratedInPlace,
        wasShell,
        wasPrefetch,
        onReplyRoute,
        textChanged: prevText !== enriched.text,
        senderId: enriched.sender?.id ?? null,
        textLen: enriched.text?.length ?? 0,
      });
      markVisibleOverboardTrace('[INCOMING CARD HYDRATED FROM API]', {
        banId: b.id,
        hydratedInPlace,
        wasPrefetch,
        onReplyRoute,
      });
      logReplyFlow('incoming-visible', {
        banId: b.id,
        lockActive: true,
        activeOverlayKind: 'incoming',
        selectedBanId: b.id,
        lobbyOpen: false,
        hydratedFromShell: wasShell,
        hydratedFromPrefetch: wasPrefetch,
        hydratedInPlace,
        onReplyRoute,
      });
      console.log('[reply-deeplink]', {
        banId: b.id,
        direct: onReplyRoute,
        queued: onReplyRoute ? 'reply-direct' : 'incoming-overlay',
      });
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
      commitReplyIncomingDisplayBan,
      enqueueNotification,
      hydrateReplyDeeplinkIncomingBan,
      replyDeepLinkBanId,
      routeReplyDeeplinkCompleted,
      shouldBlockIncomingCardReopen,
    ],
  );

  useEffect(() => {
    return subscribeLobbyBootIntroSession(() => {
      setLobbyIntroPrimedEpoch((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    const pending = pendingReplyDeeplinkToastRef.current;
    if (!pending) return;

    const lobbyBootIntroPrimed = isLobbyBootIntroPrimed();
    const bootPending = isDeepLinkRouteBootPending();
    const replyBootActive =
      replyDeepLinkBanId != null ||
      deepLinkReplyBooting ||
      replyDeeplinkFastShell ||
      replyHandoffLock;

    if (
      !lobbyOpen ||
      !lobbyBootIntroPrimed ||
      bootPending ||
      replyBootActive
    ) {
      console.log('[reply-toast-skip]', {
        reason: !lobbyOpen
          ? 'lobby-closed'
          : !lobbyBootIntroPrimed
            ? 'intro-not-primed'
            : bootPending
              ? 'deeplink-boot-pending'
              : 'reply-boot-active',
        kind: pending.kind,
        banId: pending.banId,
        lobbyOpen,
        homeSnapshotReady,
        lobbyBootIntroPrimed,
      });
      return;
    }

    const toast =
      pending.kind === 'overboard'
        ? REPLY_DEEPLINK_TOAST_OVERBOARD
        : REPLY_DEEPLINK_TOAST_SENT;
    console.log('[reply-toast-show]', {
      kind: pending.kind,
      banId: pending.banId,
    });
    setLobbyDeeplinkToast(toast);
    pendingReplyDeeplinkToastRef.current = null;
  }, [
    lobbyOpen,
    lobbyIntroPrimedEpoch,
    replyCompletedRouteEpoch,
    replyDeepLinkBanId,
    deepLinkReplyBooting,
    replyDeeplinkFastShell,
    replyHandoffLock,
    homeSnapshotReady,
  ]);

  useEffect(() => {
    if (!lobbyDeeplinkToast) return;
    const timer = window.setTimeout(() => setLobbyDeeplinkToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [lobbyDeeplinkToast]);

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

      if (resultPriorityBanIdsRef.current.has(normalizeId(b.id))) {
        logCheckPrimeSkipStaleBecauseResultExists({
          banId: b.id,
          source: `receiveCheckBan:${source}`,
        });
        return;
      }

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

      if (
        blocksMountedNotificationOverlay('receiveCheckBan', 'check', check.id)
      ) {
        deferNotificationToPendingStartup({ kind: 'check', ban: check });
        return;
      }

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
    window.__debug98log?.('[result-poll-start]', { userId });

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        console.log('[result-poll-skip]', { reason: 'hidden' });
        return;
      }
      if (sendSuccessCardActiveRef.current) {
        window.__debug98log?.('[RESULT POLL SKIPPED SUCCESS]', {
          pollSource: 'interval',
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        return;
      }
      if (notificationChainTransitioningRef.current) {
        console.log('[result-poll-skip]', { reason: 'chain-transitioning' });
        return;
      }
      if (
        overlayQueueRef.current.length > 0 ||
        pendingStartupInteractionsRef.current.length > 0
      ) {
        console.log('[result-poll-skip]', { reason: 'pending-chain-queued' });
        return;
      }
      if (result?.id || resultRef.current?.id || resultOpenRef.current) {
        console.log('[result-poll-skip]', {
          reason: 'already-open',
          banId: result?.id ?? resultRef.current?.id ?? null,
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

    if (sendSuccessCardActiveRef.current) {
      console.log('[notification-flush-blocked]', {
        reason: 'success-card-mounted',
        source: 'applySession',
      });
      return;
    }

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
    const parentId = acceptedParentBanAfterReplyRef.current?.trim();
    if (parentId && replyParentActivePriorityPendingRef.current) {
      const fromSession = nextActive.find(
        (row) => row.id === parentId && row.status === 'active',
      );
      if (fromSession) {
        storeAcceptedParentActiveBan(fromSession, 'session-sync');
      }
    }
    resolveOptimisticFromSession(nextActive);
    pruneAndSyncOverlayQueue();
    if (!nextIncoming) {
      setViralOnboarding(false);
    }
    setDataOwnerUserId(viewerId);
    primeLobbyBansAttentionHintSyncRef.current('apply-session');
  }, [
    resolveOptimisticFromSession,
    auth.user?.id,
    receiveIncomingBan,
    receiveCheckBan,
    pruneAndSyncOverlayQueue,
    storeAcceptedParentActiveBan,
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
    if (sendSuccessCardActiveRef.current) {
      console.log('[notification-flush-blocked]', {
        reason: 'success-card-mounted',
        source: 'reloadPending',
      });
      return;
    }
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
      logQueueApiFetchStart({
        source: 'reloadPending',
        endpoint: '/bans/session',
        telegramUserId: requestUserId,
        reason: 'reloadPending-session-bootstrap',
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
      const sessionItems: Array<{
        id: string;
        status: string | null;
        kind: string;
      }> = [];
      if (session.incoming?.id) {
        sessionItems.push({
          id: session.incoming.id,
          status: session.incoming.status ?? null,
          kind: 'incoming',
        });
      }
      if (session.check?.id) {
        sessionItems.push({
          id: session.check.id,
          status: session.check.status ?? null,
          kind: 'check',
        });
      }
      logQueueApiFetchResult({
        source: 'reloadPending',
        endpoint: '/bans/session',
        telegramUserId: requestUserId,
        count: sessionItems.length,
        incomingCount: session.incoming?.id ? 1 : 0,
        checkCount: session.check?.id ? 1 : 0,
        resultCount: session.pendingResultId ? 1 : 0,
        banIds: [
          ...sessionItems.map((i) => i.id),
          ...(session.pendingResultId ? [session.pendingResultId] : []),
        ],
        statuses: sessionItems.map((i) => i.status),
        kinds: [
          ...sessionItems.map((i) => i.kind),
          ...(session.pendingResultId ? ['result-pending-id'] : []),
        ],
      });
      maybeLogQueueApiEmptyButDirectBanExists(
        '/bans/session',
        sessionItems.length,
        {
          source: 'reloadPending',
          telegramUserId: requestUserId,
          knownDirectBanId:
            replyDeepLinkBanIdRef.current?.trim() || readKnownDirectBanId(),
          hasLobbyBansAttentionHint: lobbyBansAttentionHint > 0,
          restoreStateFound:
            lobbyBansAttentionHint > 0 ||
            readLobbyNotificationAttentionHint(requestUserId) > 0 ||
            Boolean(lastSessionIncomingRef.current?.id) ||
            Boolean(bufferedIncomingRef.current?.id),
        },
      );
      applySession(session);

      if (session.pendingResultId) {
        const pendingId = session.pendingResultId;
        if (notificationChainAwaitingUserRef.current) {
          console.log('[reload-pending-result-blocked]', {
            reason: 'notification-chain-awaiting-user',
            pendingId,
          });
        } else {
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
      } else {
        clearReplyParentActivePriority('reply-cleared');
      }
      pinReplyToBanId(null);
      setIncomingReplyBanId(null);
      setDeepLinkReplyBan(null);
    },
    [clearReplyParentActivePriority, finalizeIncomingReplyAfterSend, pinReplyToBanId],
  );

  const registerResetSendUiForBansNavigation = useCallback(
    (fn: (() => void) | null) => {
      resetSendUiForBansNavigationRef.current = fn;
    },
    [],
  );

  const isBansNavigationChainSource = (source: string): boolean =>
    [
      'active-timer-close',
      'active-timer-card-close',
      'status-cta',
      'overboard-status-direct',
      'navigateFromResult',
      'finalizeResultForGoToBans',
      'go-to-bans',
      'result-status',
      'result-timer-go-to-bans',
      'lobby-bans-cta',
      'lobby-bans',
      'timer-go-to-bans',
      'reply-parent-active-timer',
    ].some((marker) => source.includes(marker));

  const clearStaleComposeStateBeforeBansNavigation = useCallback(
    (source: string) => {
      if (sendSuccessCardActiveRef.current) {
        return;
      }
      const sendComposePhaseBefore = sendComposePhaseRef.current;
      const replyComposePhaseBefore = replyComposeActiveRef.current;
      const hadStaleCompose =
        sendComposePhaseBefore !== 'idle' || replyComposePhaseBefore;
      const queueHead = overlayQueueRef.current[0] ?? null;
      const held = heldUserCardOverlayRef.current;
      const activeKind =
        held?.kind ?? queueHead?.kind ?? null;
      const activeBanId =
        held != null
          ? heldUserCardBanId(held)
          : queueHead?.kind === 'result'
            ? queueHead.result.id
            : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
              ? queueHead.ban.id
              : null;
      if (hadStaleCompose) {
        logStaleComposeClearedBeforeBansNav({
          source,
          sendComposePhaseBefore,
          replyComposePhaseBefore,
          activeKind,
          activeBanId,
          lobbyOpen: lobbyOpenRef.current,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        closeSendFlow();
        clearIncomingReply();
        setReplyComposeActive(false);
        setComposeFlowState({
          phase: 'idle',
          source: `clearStaleComposeBeforeBansNav:${source}`,
        });
      }
      resetSendUiForBansNavigationRef.current?.();
    },
    [clearIncomingReply, closeSendFlow, setComposeFlowState],
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
    openBansOverlayTabRequestRef.current = null;
    setOpenBansOverlayTabRequest(null);
    bansNavStateRef.current = DEFAULT_BANS_NAV;
    setBansNavState(DEFAULT_BANS_NAV);
    setBansReturnToLobbyLatch(false, {
      source: `clearBansOverlayNavigationIntent:${source}`,
    });
    setCloseBansOverlayRequest((n) => n + 1);
  }, [setBansReturnToLobbyLatch]);

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
        const key = normalizeId(banId);
        if (
          key &&
          !resultCtaConsumedBanIdsRef.current.has(key) &&
          !resultDeliveredBanIdsRef.current.has(key)
        ) {
          freshOverboardActionBanIdsRef.current.delete(key);
          dismissBanResultLocally(banId, viewerId);
        }
      }

      if (overboardInFlightRef.current === banId) {
        overboardInFlightRef.current = null;
      }
      clearLocalOverboardBypass();
      clearDirectOverboardLayerRefs();
      resultOpenRef.current = false;
      setDirectResultOverlayActive(false);
      console.log('[chain-debug-clear-overlay]', {
        source: 'applyDirectOverboardCloseState',
        banId,
        kind: 'result',
      });
      emitResultClearCallsite({
        source: 'applyDirectOverboardCloseState',
        reason: 'direct-overboard-close',
        resultIdBefore: banId,
        willClearResult: true,
      });
      setResult(null);
      resultRef.current = null;
      emitResultHeldStillPresentAfterClear(
        'applyDirectOverboardCloseState',
        'direct-overboard-close',
      );
    },
    [clearDirectOverboardLayerRefs],
  );

  const collectIncomingBanCandidatesForId = useCallback(
    (banId: string): BanInteraction[] => {
      const norm = normalizeId(banId);
      if (!norm) return [];
      const out: BanInteraction[] = [];
      const add = (ban: BanInteraction | null | undefined) => {
        if (!ban?.id || normalizeId(ban.id) !== norm) return;
        if (out.some((row) => row.id === ban.id)) return;
        out.push(ban);
      };
      add(incomingBanRef.current);
      for (const item of overlayQueueRef.current) {
        if (item.kind === 'incoming') add(item.ban);
      }
      for (const item of pendingStartupInteractionsRef.current) {
        if (item.kind === 'incoming') add(item.ban);
      }
      const held = heldUserCardOverlayRef.current;
      if (held?.kind === 'incoming') add(held.ban);
      return out;
    },
    [],
  );

  const applyIncomingBanToQueueHead = useCallback(
    (ban: BanInteraction): BanInteraction => {
      const norm = normalizeId(ban.id);
      const head = overlayQueueRef.current[0];
      const enriched = enrichBanInteraction(ban);
      const richer =
        head?.kind === 'incoming' && normalizeId(head.ban.id) === norm
          ? pickRicherIncomingBan(head.ban, enriched)
          : enriched;
      if (
        head?.kind === 'incoming' &&
        normalizeId(head.ban.id) === norm &&
        (richer !== head.ban ||
          incomingBanRef.current?.id !== richer.id ||
          incomingBanRef.current.text !== richer.text)
      ) {
        const next = [...overlayQueueRef.current];
        next[0] = { kind: 'incoming', ban: richer };
        overlayQueueRef.current = next;
        setOverlayQueue(next);
      }
      incomingBanRef.current = richer;
      logChainHeadSwitchTrace(
        'applyIncomingBanToQueueHead:setIncomingBan',
        'incoming',
        richer.id,
      );
      setIncomingBan(richer);
      return richer;
    },
    [],
  );

  const upgradeIncomingQueueHeadFromMemory = useCallback(
    (banId: string, source: string): BanInteraction | null => {
      const viewerId = userIdRef.current?.trim() ?? '';
      const candidates = collectIncomingBanCandidatesForId(banId);
      if (candidates.length === 0) return null;
      let best = candidates[0]!;
      for (let i = 1; i < candidates.length; i++) {
        best = pickRicherIncomingBan(best, candidates[i]!);
      }
      const richer = applyIncomingBanToQueueHead(best);
      const ready = isIncomingCardDisplayReady(richer, viewerId);
      logIncomingNextPayloadReady({
        banId: richer.id,
        hasBan: true,
        hasSender: hasIncomingSenderIdentity(richer.sender),
        hasText: hasReplyFastDisplayText(richer),
        source,
        ready,
        reason: ready
          ? 'memory-upgrade'
          : getIncomingCardNotReadyReason(richer, viewerId),
      });
      if (ready) {
        setActiveIncomingOverlayBanStable(richer, source);
      }
      return richer;
    },
    [
      applyIncomingBanToQueueHead,
      collectIncomingBanCandidatesForId,
      setActiveIncomingOverlayBanStable,
    ],
  );

  const beginIncomingNextHydrate = useCallback(
    (banId: string, source: string): void => {
      const norm = normalizeId(banId);
      const token = tokenRef.current;
      if (!norm || !token) return;
      if (incomingNextHydrateInflightRef.current.has(norm)) return;

      logIncomingNextHydrateStart({ banId: norm, source });
      setIncomingNextHydrateBanId(norm);

      const task = (async () => {
        try {
          const fetched = await verifyIncomingChallenge(token, norm);
          if (tokenRef.current !== token) return null;
          const enriched = enrichBanInteraction(fetched);
          const head = overlayQueueRef.current[0];
          if (
            head?.kind !== 'incoming' ||
            normalizeId(head.ban.id) !== norm
          ) {
            return null;
          }
          const richer = applyIncomingBanToQueueHead(enriched);
          const viewerId = userIdRef.current?.trim() ?? '';
          const ready = isIncomingCardDisplayReady(richer, viewerId);
          logIncomingNextHydrateOk({
            banId: norm,
            hasBan: true,
            hasSender: hasIncomingSenderIdentity(richer.sender),
            hasText: hasReplyFastDisplayText(richer),
            ready,
            source,
          });
          if (ready) {
            setActiveIncomingOverlayBanStable(richer, source);
            setIncomingNextHydrateBanId((cur) => (cur === norm ? null : cur));
            syncDisplayFromQueue(overlayQueueRef.current);
          } else {
            logEmptyIncomingShellBug({
              banId: norm,
              source,
              reason: 'hydrate-incomplete',
            });
            setIncomingNextHydrateBanId((cur) => (cur === norm ? null : cur));
          }
          return richer;
        } catch (e) {
          logEmptyIncomingShellBug({
            banId: norm,
            source,
            reason: 'hydrate-failed',
            error: e instanceof Error ? e.message : String(e),
          });
          setIncomingNextHydrateBanId((cur) => (cur === norm ? null : cur));
          return null;
        } finally {
          incomingNextHydrateInflightRef.current.delete(norm);
        }
      })();

      incomingNextHydrateInflightRef.current.set(norm, task);
    },
    [applyIncomingBanToQueueHead, setActiveIncomingOverlayBanStable, syncDisplayFromQueue],
  );

  const showNextNotificationFromChainSync = useCallback(
    (source: string): boolean => {
      if (isSendComposeFlowActive()) {
        logNotificationDisplayBlockedDuringComposeGuard(source, null);
        return false;
      }
      if (
        shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        )
      ) {
        logNonExplicitDrainBlocked({
          source,
          reason: 'show-next',
          startupHold: startupInteractionsHoldRef.current,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        logStartupAutoShowCardBug({
          source,
          reason: 'non-explicit-show-next',
          startupHold: startupInteractionsHoldRef.current,
        });
        return false;
      }
      if (shouldBlockSingleCardChainContinuation(source)) {
        const cardMode = getDeeplinkSingleCardMode();
        logDeeplinkSingleCardChainBlocked({
          source,
          reason: 'show-next-single-card',
          modeKind: cardMode?.kind ?? null,
          modeBanId: cardMode?.banId ?? null,
        });
        return false;
      }
      if (
        startupInteractionsHoldRef.current &&
        !isExplicitNotificationDrainSource(source)
      ) {
        logLobbyIndicatorOpenedCardBug({
          source,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
          reason: 'startup-hold-blocks-auto-drain',
        });
        return false;
      }
      if (shouldBlockDeeplinkAutoDrain(source)) {
        const head = overlayQueueRef.current[0] ?? null;
        const startupHead = pendingStartupInteractionsRef.current[0] ?? null;
        const nextKind = head?.kind ?? startupHead?.kind ?? null;
        const nextBanId =
          head?.kind === 'result'
            ? head.result.id
            : head?.kind === 'incoming' || head?.kind === 'check'
              ? head.ban.id
              : startupHead?.kind === 'result'
                ? startupHead.result.id
                : startupHead?.kind === 'incoming' ||
                    startupHead?.kind === 'check'
                  ? startupHead.ban.id
                  : null;
        logDeeplinkAutoDrainBlocked({
          source,
          nextKind,
          nextBanId,
          queueLen: overlayQueueRef.current.length,
          startupLen: pendingStartupInteractionsRef.current.length,
        });
        return false;
      }
      if (
        blocksMountedNotificationOverlay(
          `showNextNotificationFromChainSync:${source}`,
          null,
          null,
        )
      ) {
        console.log('[success-exit-drain-attempt]', {
          source,
          blocked: true,
          reason: 'mounted-overlay-blocks',
        });
        window.__debug98log?.('[success-exit-drain-attempt]', {
          source,
          blocked: true,
          reason: 'mounted-overlay-blocks',
        });
        return false;
      }
      if (isPendingAtomicOverboardResultAwaitingDismiss(source)) {
        const atomicBanId = incomingOverboardAtomicBanIdRef.current;
        logResultCardPreserveDomOk({
          banId: atomicBanId,
          source: `showNextNotificationFromChainSync:${source}`,
        });
        console.log('[show-next-blocked-atomic-overboard]', {
          source,
          banId: atomicBanId,
        });
        window.__debug98log?.('[show-next-blocked-atomic-overboard]', {
          source,
          banId: atomicBanId,
        });
        return false;
      }
      if (
        notificationChainAwaitingUserRef.current &&
        (hasActiveNotificationOverlayMounted() || isActiveUserCardHold())
      ) {
        if (isExplicitNotificationDrainSource(source)) {
          logResultGoToBansEmptyScreenBug({
            source,
            reason: 'active-user-card-blocks-explicit-drain',
            activeKind: heldUserCardOverlayRef.current?.kind ?? null,
            queueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
          });
          return false;
        }
        console.log('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          source,
          ...getNotificationChainDebugSnapshot(),
        });
        window.__debug98log?.('[chain-drain-continue-blocked]', {
          reason: 'active-overlay-mounted',
          source,
          ...getNotificationChainDebugSnapshot(),
        });
        return true;
      }
      if (isNotificationChainPausedForReply()) {
        console.log('[chain-reply-block-next-notification]', {
          parentBanId:
            chainReplyParentBanIdRef.current ??
            replyDeeplinkParentBanIdRef.current,
          reason: 'reply-compose',
          source: 'showNextNotificationFromChainSync',
        });
        console.log('[chain-reply-advance-blocked]', {
          parentBanId:
            chainReplyParentBanIdRef.current ??
            replyDeeplinkParentBanIdRef.current,
          reason: 'reply-compose-active',
          source: 'showNextNotificationFromChainSync',
        });
        return false;
      }

      logTransitionFromRefs('[SHOW NEXT START]', { source });

      const skipBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;

      const heldProtectResultId =
        heldUserCardOverlayRef.current?.kind === 'result'
          ? normalizeId(heldUserCardOverlayRef.current.result.id)
          : '';
      const protectHeldOverboardResult =
        heldProtectResultId.length > 0 &&
        isHeldOverboardResultProtected(heldProtectResultId);
      const protectHeldFinalStatusResult =
        heldProtectResultId.length > 0 &&
        isHeldFinalStatusResultProtected(heldProtectResultId);

      while (true) {
        sanitizeNotificationChainQueues(source);
        const blockedHead = overlayQueueRef.current[0];
        if (
          blockedHead?.kind === 'result' &&
          isResultBlockedForNotificationChain(
            blockedHead.result.id,
            source,
            skipBanId,
          )
        ) {
          if (
            isExplicitNotificationDrainSource(source) ||
            isSuccessExitDrainSource(source)
          ) {
            const consumedHeadId = normalizeId(blockedHead.result.id);
            if (
              consumedHeadId &&
              resultCtaConsumedBanIdsRef.current.has(consumedHeadId)
            ) {
              const prunePayload = {
                banId: consumedHeadId,
                source,
                overlayLenBefore: overlayQueueRef.current.length,
                pendingLenBefore: pendingStartupInteractionsRef.current.length,
              };
              console.log('[RESULT CONSUMED HEAD PRUNED]', prunePayload);
              window.__debug98log?.('[RESULT CONSUMED HEAD PRUNED]', prunePayload);
              const nextOverlay = removeOverlaysForBan(
                overlayQueueRef.current,
                consumedHeadId,
                ['result'],
              );
              const nextPending = removeOverlaysForBan(
                pendingStartupInteractionsRef.current,
                consumedHeadId,
                ['result'],
              );
              if (nextOverlay.length !== overlayQueueRef.current.length) {
                overlayQueueRef.current = nextOverlay;
                setOverlayQueue(nextOverlay);
              }
              if (
                nextPending.length !==
                pendingStartupInteractionsRef.current.length
              ) {
                pendingStartupInteractionsRef.current = nextPending;
                syncPendingStartupCount();
              }
              continue;
            }
            holdResultForActiveNotificationChain(
              blockedHead.result.id,
              `${source}-preflight`,
            );
            break;
          }
          if (
            protectHeldOverboardResult &&
            normalizeId(blockedHead.result.id) === heldProtectResultId
          ) {
            freshOverboardActionBanIdsRef.current.add(heldProtectResultId);
            break;
          }
          if (
            protectHeldFinalStatusResult &&
            normalizeId(blockedHead.result.id) === heldProtectResultId
          ) {
            freshFinalStatusBanIdsRef.current.add(heldProtectResultId);
            logFinalStatusHoldDecision({
              banId: heldProtectResultId,
              source: `${source}-preflight-final-status`,
              outcome: blockedHead.result.outcome ?? null,
            });
            break;
          }
          pruneResultFromNotificationChain(blockedHead.result.id, source);
          continue;
        }
        const candidate = overlayQueueRef.current[0] ?? null;
        const candidateBanId =
          candidate?.kind === 'result'
            ? candidate.result.id
            : candidate?.kind === 'incoming' || candidate?.kind === 'check'
              ? candidate.ban.id
              : null;
        const candidateAllowed =
          candidate?.kind !== 'result' ||
          !isResultBlockedForNotificationChain(
            candidate.result.id,
            source,
            skipBanId,
          );
        console.log('[notification-next-candidate]', {
          kind: candidate?.kind ?? null,
          banId: candidateBanId,
          source,
          allowed: candidateAllowed,
        });
        break;
      }

      const overlayIds = overlayQueueRef.current.map(overlayQueueItemId);
      const startupIds =
        pendingStartupInteractionsRef.current.map(overlayQueueItemId);
      const overlayLen = overlayQueueRef.current.length;
      const startupLen = pendingStartupInteractionsRef.current.length;
      const hold = startupInteractionsHoldRef.current;
      const head = overlayQueueRef.current[0] ?? null;
      const startupHead =
        pendingStartupInteractionsRef.current.find(
          (item) => item.kind !== 'result',
        ) ??
        pendingStartupInteractionsRef.current[0] ??
        null;
      const hasNext = overlayLen > 0 || startupLen > 0;
      const nextKind = head?.kind ?? startupHead?.kind ?? null;
      const nextBanId =
        head?.kind === 'result'
          ? head.result.id
          : head?.kind === 'incoming' || head?.kind === 'check'
            ? head.ban.id
            : startupHead?.kind === 'incoming' || startupHead?.kind === 'check'
              ? startupHead.ban.id
              : startupHead?.kind === 'result'
                ? startupHead.result.id
                : null;

      console.log('[chain-drain-start]', {
        source,
        overlayIds,
        startupIds,
      });
      console.log('[notification-chain-next-check]', {
        source,
        overlayLen,
        startupLen,
        hold,
        hasNext,
        overlayIds,
        startupIds,
      });

      if (!hasNext) return false;

      setNotificationChainTransitioning(true);

      console.log('[pending-chain-next-ready-before-close]', {
        source,
        nextKind,
        nextBanId,
      });
      console.log('[pending-chain-no-poll-needed]', { source, nextBanId });
      console.log('[notification-chain-next-show]', {
        source: 'status-cta',
        nextKind,
        nextBanId,
      });

      clearNotificationChainReturnLatch(source);

      const mountedResultIdForProtect = normalizeId(resultRef.current?.id ?? '');
      const protectFreshDirect =
        mountedResultIdForProtect.length > 0 &&
        (freshOverboardActionBanIdsRef.current.has(mountedResultIdForProtect) ||
          isLocalOverboardBypassForBan(mountedResultIdForProtect) ||
          overboardInFlightRef.current === mountedResultIdForProtect);
      const protectMountedOverboardResult =
        protectFreshDirect || protectHeldOverboardResult;
      const mountedResultId = resultRef.current?.id?.trim() ?? '';

      notificationChainHandoffRef.current = true;
      notificationChainAwaitingUserRef.current = true;
      chainAdvanceExplicitRef.current = true;
      console.log('[notification-next-selected]', {
        source,
        nextKind,
        nextBanId,
      });
      window.__debug98log?.('[notification-next-selected]', {
        source,
        nextKind,
        nextBanId,
      });
      logTransitionFromRefs('[SHOW NEXT SELECTED]', {
        source,
        kind: nextKind,
        banId: nextBanId,
        queueLenAfter: overlayQueueRef.current.length,
      });
      if (isSuccessExitDrainSource(source)) {
        setPostSuccessHandoffSelectedNext(nextKind, nextBanId, {
          source,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
      }
      setLobbyOpen(false);
      lobbyOpenRef.current = false;
      const nextHead: QueuedOverlay | null = head ?? startupHead;
      clearStaleUserCardHoldForNextHead(nextHead, source);
      flushSync(() => {
        if (
          isPendingAtomicOverboardResultAwaitingDismiss(
            `${source}:showNext-flushSync`,
          )
        ) {
          return;
        }
        logChainHeadSwitchTrace(
          `${source}:showNext-flushSync`,
          nextKind,
          nextBanId,
        );
        if (protectHeldOverboardResult) {
          freshOverboardActionBanIdsRef.current.add(heldProtectResultId);
        }
        if (startupLen > 0) {
          mergeStartupIntoOverlayQueueOnly(source);
        }
        sanitizeNotificationChainQueues(source);

        const headAfterMerge = overlayQueueRef.current[0];
        let deferIncomingDisplaySync = false;

        if (headAfterMerge?.kind === 'incoming') {
          const incomingBanId = headAfterMerge.ban.id;
          const viewerId = userIdRef.current?.trim() ?? '';
          const richer = upgradeIncomingQueueHeadFromMemory(
            incomingBanId,
            `${source}-flush`,
          );
          const payload = richer ?? headAfterMerge.ban;
          const payloadReady =
            isIncomingCardDisplayReady(payload, viewerId) &&
            shouldShowIncomingBanModal(
              payload,
              viewerId,
              dismissedIncomingRef.current,
            );
          if (!payloadReady) {
            logIncomingNextPayloadMissingBug({
              banId: incomingBanId,
              source: `${source}-flush`,
              queueItem: {
                kind: 'incoming',
                id: payload.id,
                textLen: payload.text?.length ?? 0,
                senderId: payload.sender?.id ?? null,
                reason: getIncomingCardNotReadyReason(payload, viewerId),
              },
            });
            beginIncomingNextHydrate(incomingBanId, `${source}-flush`);
            deferIncomingDisplaySync = true;
            if (heldUserCardOverlayRef.current?.kind === 'result') {
              restoreHeldUserCardOverlay(
                `${source}-flush-defer-incoming-hydrate`,
              );
            }
          } else {
            setActiveIncomingOverlayBanStable(payload, `${source}-flush-payload-ready-pre-sync`);
            logIncomingOverlayStateSet({
              banId: incomingBanId,
              source: `${source}-flush-payload-ready-pre-sync`,
              payloadReady: true,
              incomingBanRefId: incomingBanRef.current?.id ?? null,
              stableBanId: activeIncomingOverlayBanRef.current?.id ?? null,
            });
          }
        } else if (headAfterMerge?.kind === 'result') {
          const resultRow = headAfterMerge.result;
          holdResultForActiveNotificationChain(
            resultRow.id,
            `${source}-flush`,
          );
          if (isResultNotificationPayloadReady(resultRow)) {
            logResultNextPayloadReady({
              banId: resultRow.id,
              hasResult: true,
              status: resultRow.outcome,
              source,
            });
          } else {
            logResultNextPayloadMissingBug({
              banId: resultRow.id,
              source,
              queueItem: {
                id: resultRow.id,
                outcome: resultRow.outcome ?? null,
                viewerId: resultRow.viewerId ?? null,
              },
            });
          }
        }

        if (!deferIncomingDisplaySync) {
          const queueHeadBeforeClose = overlayQueueRef.current[0] ?? null;
          const willShowQueueResult = queueHeadBeforeClose?.kind === 'result';
          const willShowQueueResultId =
            willShowQueueResult && queueHeadBeforeClose.kind === 'result'
              ? normalizeId(queueHeadBeforeClose.result.id)
              : '';
          if (
            (directResultOverlayRef.current ||
              directResultOverlayActiveRef.current ||
              resultRef.current) &&
            !protectMountedOverboardResult
          ) {
            const mountedId = normalizeId(resultRef.current?.id ?? '');
            if (
              !willShowQueueResult ||
              (mountedId && mountedId !== willShowQueueResultId)
            ) {
              applyDirectOverboardCloseState(resultRef.current?.id ?? null);
            }
          }
          if (
            mountedResultId &&
            !protectMountedOverboardResult &&
            isResultBlockedForNotificationChain(
              mountedResultId,
              source,
              skipBanId,
            )
          ) {
            const headAfterSanitize = overlayQueueRef.current[0];
            const headResultId =
              headAfterSanitize?.kind === 'result'
                ? normalizeId(headAfterSanitize.result.id)
                : '';
            if (
              !headResultId ||
              headResultId !== normalizeId(mountedResultId)
            ) {
              markResultOverlayConsumed(
                mountedResultId,
                `${source}-mounted-result`,
              );
              resultOpenRef.current = false;
              emitResultAutoClearDecision({
                banId: mountedResultId,
                reason: `${source}-mounted-result-stale`,
                refMismatch: false,
                willClear: true,
              });
              emitResultClearCallsite({
                source,
                reason: 'mounted-result-stale-clear',
                resultIdBefore: mountedResultId,
                willClearResult: true,
              });
              setResult(null);
              setDirectResultOverlayActive(false);
              emitResultHeldStillPresentAfterClear(
                source,
                'mounted-result-stale-clear',
              );
            }
          }
          syncDisplayFromQueue(overlayQueueRef.current);
        }
      });
      chainAdvanceExplicitRef.current = false;
      logTransitionFromRefs('[DISMISS COMMIT DONE]', {
        source: `${source}-showNext-flushSync`,
      });

      const remainingIds = overlayQueueRef.current
        .slice(1)
        .map(overlayQueueItemId);
      console.log('[chain-show-one]', {
        source,
        shownKind: nextKind,
        shownBanId: nextBanId,
        remainingIds,
      });
      console.log('[chain-drain-stop-active-mounted]', {
        activeKind: nextKind,
        activeBanId: nextBanId,
        remainingIds,
      });
      console.log('[chain-debug-next-mounted]', {
        source,
        nextKind,
        nextBanId,
      });
      console.log('[chain-debug-after-sync]', {
        source,
        ...getNotificationChainDebugSnapshot(),
      });
      return true;
    },
    [
      applyDirectOverboardCloseState,
      beginIncomingNextHydrate,
      clearNotificationChainReturnLatch,
      getNotificationChainDebugSnapshot,
      hasActiveNotificationOverlayMounted,
      holdResultForActiveNotificationChain,
      isNotificationChainPausedForReply,
      isResultBlockedForNotificationChain,
      isResultNotificationPayloadReady,
      markResultOverlayConsumed,
      mergeStartupIntoOverlayQueueOnly,
      overlayQueueItemId,
      pruneResultFromNotificationChain,
      restoreHeldUserCardOverlay,
      sanitizeNotificationChainQueues,
      setActiveIncomingOverlayBanStable,
      setNotificationChainTransitioning,
      syncDisplayFromQueue,
      upgradeIncomingQueueHeadFromMemory,
    ],
  );
  showNextNotificationFromChainSyncRef.current =
    showNextNotificationFromChainSync;

  const countNotificationChainKinds = useCallback((items: QueuedOverlay[]) => {
    let incomingLen = 0;
    let checkLen = 0;
    let resultLen = 0;
    for (const item of items) {
      if (item.kind === 'incoming') incomingLen += 1;
      else if (item.kind === 'check') checkLen += 1;
      else if (item.kind === 'result') resultLen += 1;
    }
    return { incomingLen, checkLen, resultLen };
  }, []);

  const absorbBufferedIncomingIntoPending = useCallback(
    (source: string): boolean => {
      const buffered = bufferedIncomingRef.current;
      const banId = buffered?.id?.trim() ?? '';
      if (!banId) return false;
      const norm = normalizeId(banId);
      if (
        dismissedIncomingRef.current.has(norm) ||
        incomingConsumedAfterAnswerRef.current.has(norm) ||
        locallyAckedIncomingRef.current.has(norm)
      ) {
        return false;
      }
      const inOverlay = overlayQueueRef.current.some(
        (item) => item.kind === 'incoming' && normalizeId(item.ban.id) === norm,
      );
      const inPending = pendingStartupInteractionsRef.current.some(
        (item) => item.kind === 'incoming' && normalizeId(item.ban.id) === norm,
      );
      if (inOverlay || inPending) return false;
      const enriched = enrichBanInteraction(buffered);
      pendingStartupInteractionsRef.current = mergeStartupPendingChain(
        pendingStartupInteractionsRef.current,
        [{ kind: 'incoming', ban: enriched }],
      );
      syncPendingStartupCount();
      bufferedIncomingRef.current = null;
      console.log('[chain-continue-buffered-incoming]', {
        source,
        banId: norm,
      });
      return true;
    },
    [syncPendingStartupCount],
  );

  const snapshotPendingNotificationChain =
    useCallback((): NotificationChainCollectedSnapshot => {
      const queueLen = overlayQueueRef.current.length;
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const queueCounts = countNotificationChainKinds(overlayQueueRef.current);
      const pendingCounts = countNotificationChainKinds(
        pendingStartupInteractionsRef.current,
      );
      const bufferedIncomingId = bufferedIncomingRef.current?.id?.trim() ?? null;
      const held = heldUserCardOverlayRef.current;
      const heldNextKind = held?.kind ?? null;
      let heldIncoming = 0;
      let heldCheck = 0;
      let heldResult = 0;
      if (held?.kind === 'incoming') heldIncoming = 1;
      else if (held?.kind === 'check') heldCheck = 1;
      else if (held?.kind === 'result') heldResult = 1;

      return {
        queueLen,
        pendingLen,
        incomingLen:
          queueCounts.incomingLen +
          pendingCounts.incomingLen +
          (bufferedIncomingId ? 1 : 0) +
          heldIncoming,
        checkLen: queueCounts.checkLen + pendingCounts.checkLen + heldCheck,
        resultLen: queueCounts.resultLen + pendingCounts.resultLen + heldResult,
        bufferedIncomingId,
        heldNextKind,
        mergedFromPending: 0,
        finalQueueLen: queueLen,
        finalPendingLen: pendingLen,
      };
    }, [countNotificationChainKinds]);

  const buildPostSuccessQueueDiagnosticSnapshot = useCallback(
    (source: string): PostSuccessQueueSnapshotFields => {
      const chainSnap = snapshotPendingNotificationChain();
      const head = overlayQueueRef.current[0] ?? null;
      const selectedNext = getPostSuccessHandoffSelectedNext();
      const headBanId =
        head?.kind === 'result'
          ? head.result.id
          : head?.kind === 'incoming' || head?.kind === 'check'
            ? head.ban.id
            : null;
      return buildPostSuccessQueueSnapshotBase({
        source,
        telegramUserId: userIdRef.current?.trim() ?? auth.user?.id ?? null,
        queueLen: chainSnap.queueLen,
        pendingLen: chainSnap.pendingLen,
        bufferedIncomingLen: chainSnap.bufferedIncomingId ? 1 : 0,
        incomingLen: chainSnap.incomingLen,
        checkLen: chainSnap.checkLen,
        resultLen: chainSnap.resultLen,
        startupLen: pendingStartupInteractionsRef.current.length,
        selectedKind: selectedNext?.kind ?? head?.kind ?? null,
        selectedBanId: selectedNext?.banId ?? headBanId,
        heldNextKind: chainSnap.heldNextKind,
        hasPendingNotificationChain: hasPendingNotificationChain(),
        shouldBlockNonExplicitDrain: shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        ),
        bufferedIncomingId: chainSnap.bufferedIncomingId,
      });
    },
    [hasPendingNotificationChain, snapshotPendingNotificationChain, auth.user?.id],
  );

  const logPostSuccessEmptyQueueIfMisaligned = useCallback(
    (source: string) => {
      const uid = userIdRef.current?.trim() ?? '';
      const pendingSnapshot = pendingStartupInteractionsRef.current;
      const hasLobbyIndicator =
        lobbyBansAttentionHint > 0 ||
        (uid ? readLobbyNotificationAttentionHint(uid) > 0 : false) ||
        hasPendingNotificationChain();
      if (!hasLobbyIndicator) return;

      logPostSuccessEmptyQueueButUserHasBansIndicator({
        source,
        traceId: getPostSuccessHandoffTraceId(),
        telegramUserId: uid || auth.user?.id || null,
        hasLobbyIndicator: true,
        pendingStartupInteractions: {
          len: pendingSnapshot.length,
          kinds: pendingSnapshot.map((item) => item.kind),
        },
        lastBansIndicatorReason: readLastBansIndicatorReason(),
        lastNotificationSources: readLastNotificationSources(),
        restoreFlags: {
          sessionBootstrapped: sessionBootstrappedRef.current,
          startupInteractionsHold: startupInteractionsHoldRef.current,
          persistedAttentionHint: uid
            ? readLobbyNotificationAttentionHint(uid)
            : 0,
          lobbyBansAttentionHint,
          lastSessionIncomingId: lastSessionIncomingRef.current?.id ?? null,
          bufferedIncomingId: bufferedIncomingRef.current?.id ?? null,
          heldNextKind: heldUserCardOverlayRef.current?.kind ?? null,
          hasPendingNotificationChain: hasPendingNotificationChain(),
        },
      });
    },
    [hasPendingNotificationChain, lobbyBansAttentionHint, auth.user?.id],
  );
  logPostSuccessEmptyQueueIfMisalignedRef.current =
    logPostSuccessEmptyQueueIfMisaligned;

  const buildQueueSourceComparisonSnapshot = useCallback(
    (source: string) => {
      const chainSnap = snapshotPendingNotificationChain();
      const uid = userIdRef.current?.trim() ?? auth.user?.id ?? null;
      const queueLen = chainSnap.queueLen;
      const pendingLen = chainSnap.pendingLen;
      const hasPendingChain = hasPendingNotificationChain();
      const persistedHint = uid ? readLobbyNotificationAttentionHint(uid) > 0 : false;
      const restoreStateFound =
        persistedHint ||
        lobbyBansAttentionHint > 0 ||
        Boolean(lastSessionIncomingRef.current?.id) ||
        Boolean(bufferedIncomingRef.current?.id) ||
        Boolean(bufferedReplyDeepLinkRef.current?.id) ||
        Boolean(incomingBanRef.current?.id) ||
        Boolean(replyDeepLinkBanIdRef.current);
      return {
        source,
        telegramUserId: uid,
        queueLen,
        pendingLen,
        incomingLen: chainSnap.incomingLen,
        checkLen: chainSnap.checkLen,
        resultLen: chainSnap.resultLen,
        bufferedIncomingLen: chainSnap.bufferedIncomingId ? 1 : 0,
        lastSessionIncomingLen: lastSessionIncomingRef.current?.id ? 1 : 0,
        hasIncomingBanRef: Boolean(incomingBanRef.current?.id),
        incomingBanRefId: incomingBanRef.current?.id ?? null,
        resultRefId: resultRef.current?.id ?? null,
        checkRefId: checkBanRef.current?.id ?? null,
        hasPendingNotificationChain: hasPendingChain,
        hasLobbyBansAttentionHint: lobbyBansAttentionHint > 0,
        needAttention: pendingLen > 0 || queueLen > 0 || hasPendingChain,
        restoreStateFound,
      };
    },
    [
      auth.user?.id,
      hasPendingNotificationChain,
      lobbyBansAttentionHint,
      snapshotPendingNotificationChain,
    ],
  );

  const logPostSuccessQueueSnapshotBeforeRelease = useCallback(
    (source: string) => {
      const snap = buildPostSuccessQueueDiagnosticSnapshot(source);
      postSuccessReleaseBeforeRef.current = snap;
      emitPostSuccessQueueSnapshotBeforeRelease(snap);
      logQueueSourceComparisonSnapshot(
        buildQueueSourceComparisonSnapshot(source),
      );
    },
    [buildPostSuccessQueueDiagnosticSnapshot, buildQueueSourceComparisonSnapshot],
  );

  const logPostSuccessReleaseStartupResult = useCallback(
    (source: string, reason: string) => {
      const before = postSuccessReleaseBeforeRef.current;
      const after = buildPostSuccessQueueDiagnosticSnapshot(source);
      const beforePending = before?.pendingLen ?? 0;
      const beforeQueue = before?.queueLen ?? 0;
      emitPostSuccessReleaseStartupResult({
        source,
        traceId: getPostSuccessHandoffTraceId(),
        beforeQueueLen: beforeQueue,
        beforePendingLen: beforePending,
        afterQueueLen: after.queueLen,
        afterPendingLen: after.pendingLen,
        movedCount: Math.max(0, beforePending - after.pendingLen),
        bufferedCount: before?.bufferedIncomingLen ?? 0,
        selectedKind: after.selectedKind,
        selectedBanId: after.selectedBanId,
        reason,
      });
      logQueueSourceComparisonSnapshot(
        buildQueueSourceComparisonSnapshot(`${source}-after-release`),
      );
      if (
        after.queueLen === 0 &&
        after.pendingLen === 0 &&
        (source.includes('success-exit') ||
          reason.includes('send-success') ||
          reason.includes('unlockNotificationQueueAndFlush-empty-queue'))
      ) {
        logPostSuccessEmptyQueueIfMisaligned(source);
      }
    },
    [
      buildPostSuccessQueueDiagnosticSnapshot,
      buildQueueSourceComparisonSnapshot,
      logPostSuccessEmptyQueueIfMisaligned,
    ],
  );

  const logQueueSourceComparisonSnapshotContext = useCallback(
    (source: string) => {
      logQueueSourceComparisonSnapshot(buildQueueSourceComparisonSnapshot(source));
    },
    [buildQueueSourceComparisonSnapshot],
  );

  const collectPendingNotificationChain = useCallback(
    (source: string): NotificationChainCollectedSnapshot => {
      if (shouldBlockSingleCardChainContinuation(source)) {
        logDeeplinkSingleCardChainBlocked({
          source,
          reason: 'collect-pending-single-card',
        });
        return snapshotPendingNotificationChain();
      }
      if (
        shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        )
      ) {
        logNonExplicitDrainBlocked({
          source,
          reason: 'collect-pending',
          startupHold: startupInteractionsHoldRef.current,
        });
        return snapshotPendingNotificationChain();
      }

      sanitizeNotificationChainQueues(`${source}-collect`);
      const queueLen = overlayQueueRef.current.length;
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const queueCounts = countNotificationChainKinds(overlayQueueRef.current);
      const pendingCounts = countNotificationChainKinds(
        pendingStartupInteractionsRef.current,
      );
      const bufferedIncomingId = bufferedIncomingRef.current?.id?.trim() ?? null;
      const held = heldUserCardOverlayRef.current;
      const heldNextKind = held?.kind ?? null;
      let heldIncoming = 0;
      let heldCheck = 0;
      let heldResult = 0;
      if (held?.kind === 'incoming') heldIncoming = 1;
      else if (held?.kind === 'check') heldCheck = 1;
      else if (held?.kind === 'result') heldResult = 1;

      absorbBufferedIncomingIntoPending(source);
      startupInteractionsHoldRef.current = false;

      let mergedFromPending = 0;
      if (pendingStartupInteractionsRef.current.length > 0) {
        mergedFromPending = mergeStartupIntoOverlayQueueOnly(
          `${source}-collect-merge`,
        );
      }

      return {
        queueLen,
        pendingLen,
        incomingLen:
          queueCounts.incomingLen +
          pendingCounts.incomingLen +
          (bufferedIncomingId ? 1 : 0) +
          heldIncoming,
        checkLen: queueCounts.checkLen + pendingCounts.checkLen + heldCheck,
        resultLen: queueCounts.resultLen + pendingCounts.resultLen + heldResult,
        bufferedIncomingId,
        heldNextKind,
        mergedFromPending,
        finalQueueLen: overlayQueueRef.current.length,
        finalPendingLen: pendingStartupInteractionsRef.current.length,
      };
    },
    [
      absorbBufferedIncomingIntoPending,
      countNotificationChainKinds,
      mergeStartupIntoOverlayQueueOnly,
      sanitizeNotificationChainQueues,
      snapshotPendingNotificationChain,
    ],
  );

  const buildChainEmptyFinalizeSnapshot = useCallback(
    (extra?: Record<string, unknown>) => ({
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      lobbyOpen: lobbyOpenRef.current,
      notificationChainTransitioning:
        notificationChainTransitioningRef.current,
      activeOverlayKind:
        overlayQueueRef.current[0]?.kind ??
        heldUserCardOverlayRef.current?.kind ??
        null,
      ...extra,
    }),
    [],
  );

  const emitChainFinalizeDiag = useCallback(
    (
      source: string,
      reason: string,
      extra?: Record<string, unknown>,
    ) => {
      const queueCounts = countNotificationChainKinds(overlayQueueRef.current);
      const pendingCounts = countNotificationChainKinds(
        pendingStartupInteractionsRef.current,
      );
      logChainFinalizeDiag({
        source,
        reason,
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        incomingLen:
          queueCounts.incomingLen + pendingCounts.incomingLen,
        checkLen: queueCounts.checkLen + pendingCounts.checkLen,
        resultLen: queueCounts.resultLen + pendingCounts.resultLen,
        hasPendingStartup: pendingStartupInteractionsRef.current.length > 0,
        hasOverlayQueue: overlayQueueRef.current.length > 0,
        hasRejectedOnly: lastChainRejectOnlyPrefetchRef.current,
        prefetchInFlight: pendingChainPrefetchInFlightRef.current > 0,
        pollInFlight:
          resultPollBurstTimersRef.current.length > 0 ||
          checkAnswerInFlightRef.current.size > 0,
        chainAdvanceWaiting: chainAdvanceWaitingRef.current,
        notificationChainTransitioning:
          notificationChainTransitioningRef.current,
        shouldOpenLobbyOrSection: false,
        ...extra,
      });
    },
    [countNotificationChainKinds],
  );

  const logChainEmptyFinalizeWithDiag = useCallback(
    (
      snapshot: Record<string, unknown>,
      diag: {
        source: string;
        reason: string;
        shouldOpenLobbyOrSection?: boolean;
        hasRejectedOnly?: boolean;
      },
    ) => {
      logChainEmptyFinalizeCheck(snapshot);
      emitChainFinalizeDiag(diag.source, diag.reason, {
        shouldOpenLobbyOrSection: diag.shouldOpenLobbyOrSection ?? false,
        hasRejectedOnly: diag.hasRejectedOnly,
        stage: snapshot.stage,
        outcome: snapshot.outcome,
      });
    },
    [emitChainFinalizeDiag],
  );

  const prepareNotificationChainContinue = useCallback(
    (source: string, opts?: ContinueNotificationChainOptions) => {
      logChainContinueStart({ source });
      if (
        opts?.clearActiveHold !== false &&
        !isPendingAtomicOverboardResultAwaitingDismiss(source)
      ) {
        clearActiveUserCardHold(`continueNotificationChain:${source}`);
      }
      notificationChainAwaitingUserRef.current = false;
      notificationChainHandoffRef.current = false;
      chainAdvanceExplicitRef.current = true;
      clearNotificationChainReturnLatch(source);
      allowDeeplinkExplicitNotificationDrain(source);
      if (isNotificationQueueLocked()) {
        unlockNotificationQueue(source);
      }
      deepLinkBlockedRef.current = false;
      startupInteractionsHoldRef.current = false;
    },
    [clearActiveUserCardHold, clearNotificationChainReturnLatch],
  );

  const continueNotificationChainOrOpenLobbySync = useCallback(
    (
      source: string,
      opts?: ContinueNotificationChainOptions,
    ):     ContinueNotificationChainOutcome => {
      const isCheckAnswerChainSource =
        source.includes('check-answer') || source.includes('check-dismiss');
      const traceContinueBlocked = (blockReason: string) => {
        traceChainPlaceholderStuckRef.current(
          'chain-continue-blocked',
          source,
          blockReason,
        );
      };
      if (checkAnswerWaitingResultHoldBanIdRef.current) {
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'waiting-result-hold',
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('waiting-result-hold');
        return 'blocked';
      }
      if (isCheckAnswerChainSource) {
        logCheckContinueCall({ source, reason: 'continue-sync-enter' });
      }
      if (isBansNavigationChainSource(source)) {
        clearStaleComposeStateBeforeBansNavigation(source);
      }
      if (isSendComposeFlowActive()) {
        logNotificationDisplayBlockedDuringComposeGuard(source, null);
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'compose-flow-active',
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('compose-flow-active');
        return 'blocked';
      }
      if (
        shouldBlockNonExplicitNotificationDrain(
          source,
          startupInteractionsHoldRef.current,
        )
      ) {
        logChainContinueBlockedNonExplicitStartup({
          source,
          startupHold: startupInteractionsHoldRef.current,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'non-explicit-drain',
            startupHold: startupInteractionsHoldRef.current,
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('non-explicit-drain');
        return 'blocked';
      }
      if (shouldBlockSingleCardChainContinuation(source)) {
        const cardMode = getDeeplinkSingleCardMode();
        logDeeplinkSingleCardChainBlocked({
          source,
          reason: 'continue-single-card',
          modeKind: cardMode?.kind ?? null,
          modeBanId: cardMode?.banId ?? null,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'single-card-mode',
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('single-card-mode');
        return 'blocked';
      }
      if (shouldBlockPostSuccessEmptyRetry(source)) {
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'post-success-empty-retry',
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('post-success-empty-retry');
        return 'blocked';
      }
      if (isPendingAtomicOverboardResultAwaitingDismiss(source)) {
        const atomicBanId = incomingOverboardAtomicBanIdRef.current;
        logResultCardPreserveDomOk({
          banId: atomicBanId,
          source: `continueNotificationChain:${source}`,
        });
        console.log('[chain-continue-blocked-atomic-overboard]', {
          source,
          banId: atomicBanId,
        });
        window.__debug98log?.('[chain-continue-blocked-atomic-overboard]', {
          source,
          banId: atomicBanId,
        });
        if (isCheckAnswerChainSource) {
          logCheckContinueBlocked({
            source,
            reason: 'atomic-overboard-awaiting-dismiss',
            activeKind: 'result',
            heldKind: heldUserCardOverlayRef.current?.kind ?? null,
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
            lobbyOpen: lobbyOpenRef.current,
          });
        }
        traceContinueBlocked('atomic-overboard-awaiting-dismiss');
        return 'blocked';
      }

      prepareNotificationChainContinue(source, opts);
      const collected = collectPendingNotificationChain(source);
      logChainContinueCollected({
        source,
        queueLen: collected.queueLen,
        pendingLen: collected.pendingLen,
        incomingLen: collected.incomingLen,
        checkLen: collected.checkLen,
        resultLen: collected.resultLen,
        bufferedIncomingId: collected.bufferedIncomingId,
        heldNextKind: collected.heldNextKind,
        mergedFromPending: collected.mergedFromPending,
        finalQueueLen: collected.finalQueueLen,
        finalPendingLen: collected.finalPendingLen,
      });

      const hasLocalItems =
        collected.finalQueueLen > 0 || collected.finalPendingLen > 0;

      if (!hasLocalItems) {
        if (isCheckAnswerChainSource) {
          logCheckNextEmpty({
            source,
            reason: 'queue-and-pending-empty-after-collect',
            overlayQueueLen: collected.finalQueueLen,
            pendingLen: collected.finalPendingLen,
          });
        }
        logChainEmptyFinalizeWithDiag(
          buildChainEmptyFinalizeSnapshot({
            source,
            stage: 'after-collected-empty',
            outcome: 'pending-routing',
            notificationChainTransitioningBefore:
              notificationChainTransitioningRef.current,
            notificationChainTransitioningAfter:
              notificationChainTransitioningRef.current,
            openLobbyCalled: false,
            overlayHostMounted: null,
            reason: 'queue-and-pending-empty-after-collect',
            collectedQueueLen: collected.queueLen,
            collectedPendingLen: collected.pendingLen,
          }),
          {
            source,
            reason: 'queue-and-pending-empty-after-collect',
          },
        );
      }

      if (hasLocalItems) {
        const shown = showNextNotificationFromChainSync(source);
        if (shown) {
          const head = overlayQueueRef.current[0];
          if (isCheckAnswerChainSource) {
            logCheckNextSelected({
              source,
              kind: head?.kind ?? null,
              banId:
                head?.kind === 'result'
                  ? head.result.id
                  : head?.kind === 'incoming' || head?.kind === 'check'
                    ? head.ban.id
                    : null,
            });
          }
          logChainContinueShowNext({
            source,
            finalQueueLen: overlayQueueRef.current.length,
            finalPendingLen: pendingStartupInteractionsRef.current.length,
            headKind: overlayQueueRef.current[0]?.kind ?? null,
          });
          if (!isCheckAnswerChainSource) {
            setChainAdvanceWaiting(false);
          }
          goToBansAdvancePendingRef.current = false;
          return 'show-next';
        }

        syncDisplayFromQueue(overlayQueueRef.current);
        const retryShown = showNextNotificationFromChainSync(`${source}-retry`);
        if (retryShown) {
          logChainContinueShowNext({
            source,
            retry: true,
            finalQueueLen: overlayQueueRef.current.length,
            finalPendingLen: pendingStartupInteractionsRef.current.length,
            headKind: overlayQueueRef.current[0]?.kind ?? null,
          });
          if (!isCheckAnswerChainSource) {
            setChainAdvanceWaiting(false);
          }
          goToBansAdvancePendingRef.current = false;
          return 'show-next';
        }

        const finalQueueLen = overlayQueueRef.current.length;
        const finalPendingLen = pendingStartupInteractionsRef.current.length;
        if (finalQueueLen > 0 || finalPendingLen > 0) {
          logChainContinueLostPendingBug({
            source,
            finalQueueLen,
            finalPendingLen,
            queueLen: collected.queueLen,
            pendingLen: collected.pendingLen,
          });
          if (isCheckAnswerChainSource) {
            logCheckContinueBlocked({
              source,
              reason: 'show-next-failed-lost-pending',
              overlayQueueLen: finalQueueLen,
              pendingLen: finalPendingLen,
              lobbyOpen: lobbyOpenRef.current,
            });
          }
          setNotificationChainTransitioning(true);
          logChainEmptyFinalizeWithDiag(
            buildChainEmptyFinalizeSnapshot({
              source,
              stage: 'lost-pending',
              outcome: 'lost-pending',
              notificationChainTransitioningBefore: false,
              notificationChainTransitioningAfter: true,
              openLobbyCalled: false,
              overlayHostMounted: null,
              reason: 'show-next-failed-with-remaining-items',
              finalQueueLen,
              finalPendingLen,
            }),
            {
              source,
              reason: 'show-next-failed-with-remaining-items',
            },
          );
          traceChainPlaceholderStuckRef.current(
            'chain-continue-lost-pending',
            source,
            'show-next-failed-with-remaining-items',
            { finalQueueLen, finalPendingLen },
          );
          return 'lost-pending';
        }
      }

      if (opts?.prefetchIfEmpty !== false) {
        if (isCheckAnswerChainSource) {
          logCheckNextEmpty({
            source,
            reason: 'needs-prefetch',
            overlayQueueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
          });
        }
        logChainEmptyFinalizeWithDiag(
          buildChainEmptyFinalizeSnapshot({
            source,
            stage: 'needs-prefetch',
            outcome: 'needs-prefetch',
            notificationChainTransitioningBefore:
              notificationChainTransitioningRef.current,
            notificationChainTransitioningAfter:
              notificationChainTransitioningRef.current,
            openLobbyCalled: false,
            overlayHostMounted: null,
            reason: 'prefetch-if-empty',
          }),
          {
            source,
            reason: 'prefetch-if-empty',
          },
        );
        traceChainPlaceholderStuckRef.current(
          'chain-continue-needs-prefetch',
          source,
          'prefetch-if-empty',
        );
        return 'needs-prefetch';
      }

      if (opts?.openLobbyIfEmpty === false) {
        logChainEmptyFinalizeWithDiag(
          buildChainEmptyFinalizeSnapshot({
            source,
            stage: 'open-lobby-blocked',
            outcome: 'blocked',
            notificationChainTransitioningBefore:
              notificationChainTransitioningRef.current,
            notificationChainTransitioningAfter:
              notificationChainTransitioningRef.current,
            openLobbyCalled: false,
            overlayHostMounted: null,
            reason: 'openLobbyIfEmpty-false',
          }),
          {
            source,
            reason: 'openLobbyIfEmpty-false',
          },
        );
        return 'blocked';
      }

      return finalizeNotificationChainContinueEmpty(source, opts, collected);
    },
    [
      buildChainEmptyFinalizeSnapshot,
      clearStaleComposeStateBeforeBansNavigation,
      collectPendingNotificationChain,
      logChainEmptyFinalizeWithDiag,
      prepareNotificationChainContinue,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
      showNextNotificationFromChainSync,
      syncDisplayFromQueue,
    ],
  );

  const finalizeNotificationChainContinueEmpty = useCallback(
    (
      source: string,
      opts: ContinueNotificationChainOptions | undefined,
      collected: NotificationChainCollectedSnapshot,
    ): ContinueNotificationChainOutcome => {
      if (checkAnswerWaitingResultHoldBanIdRef.current) {
        logChainEmptyFinalizeWithDiag(
          buildChainEmptyFinalizeSnapshot({
            source,
            stage: 'waiting-result-hold',
            outcome: 'blocked',
            notificationChainTransitioningBefore:
              notificationChainTransitioningRef.current,
            notificationChainTransitioningAfter:
              notificationChainTransitioningRef.current,
            openLobbyCalled: false,
            overlayHostMounted: null,
            reason: 'waiting-result-hold-active',
            finalQueueLen: overlayQueueRef.current.length,
            finalPendingLen: pendingStartupInteractionsRef.current.length,
          }),
          {
            source,
            reason: 'waiting-result-hold-active',
          },
        );
        return 'blocked';
      }
      const transitioningBefore = notificationChainTransitioningRef.current;
      const finalQueueLen = overlayQueueRef.current.length;
      const finalPendingLen = pendingStartupInteractionsRef.current.length;
      if (finalQueueLen > 0 || finalPendingLen > 0) {
        logChainContinueLostPendingBug({
          source,
          reason: 'empty-fallback-with-items',
          finalQueueLen,
          finalPendingLen,
        });
        setNotificationChainTransitioning(true);
        logChainEmptyFinalizeWithDiag(
          buildChainEmptyFinalizeSnapshot({
            source,
            stage: 'finalize-empty-blocked',
            outcome: 'lost-pending',
            notificationChainTransitioningBefore: transitioningBefore,
            notificationChainTransitioningAfter: true,
            openLobbyCalled: false,
            overlayHostMounted: null,
            reason: 'empty-fallback-with-items',
            finalQueueLen,
            finalPendingLen,
          }),
          {
            source,
            reason: 'empty-fallback-with-items',
          },
        );
        return 'lost-pending';
      }

      setNotificationChainTransitioning(false);
      setChainAdvanceWaiting(false);
      goToBansAdvancePendingRef.current = false;
      overlayQueueDrainActiveRef.current = false;
      notificationChainAwaitingUserRef.current = false;
      notificationChainHandoffRef.current = false;

      logChainContinueEmptyOpenLobby({
        source,
        finalQueueLen,
        finalPendingLen,
        queueLen: collected.queueLen,
        pendingLen: collected.pendingLen,
      });

      const emptyFallback = opts?.emptyFallback ?? 'lobby';
      let outcome: ContinueNotificationChainOutcome = 'open-lobby';
      let openLobbyCalled = false;
      if (emptyFallback === 'none') {
        outcome = 'blocked';
      } else if (emptyFallback === 'bans-section') {
        const targetTab = opts?.openBansTab ?? 'yours';
        armOpenBansOverlayFromResultCtaRef.current(
          opts?.openBansBanId ?? null,
          targetTab,
        );
        outcome = 'open-bans';
      } else if (isPostSuccessHandoffInProgress()) {
        completePostSuccessHandoffEmptyOpenLobby({
          source,
          reason: 'chain-continue-empty',
          queueLen: finalQueueLen,
          pendingLen: finalPendingLen,
        });
        openLobbyCalled = true;
      } else {
        openLobbyRef.current(source);
        openLobbyCalled = true;
      }

      logChainEmptyFinalizeWithDiag(
        buildChainEmptyFinalizeSnapshot({
          source,
          stage: 'finalize-empty-done',
          outcome,
          notificationChainTransitioningBefore: transitioningBefore,
          notificationChainTransitioningAfter: false,
          openLobbyCalled,
          overlayHostMounted: null,
          reason: 'chain-continue-empty-finalized',
          emptyFallback,
          finalQueueLen,
          finalPendingLen,
        }),
        {
          source,
          reason: 'chain-continue-empty-finalized',
          shouldOpenLobbyOrSection: openLobbyCalled,
          hasRejectedOnly: lastChainRejectOnlyPrefetchRef.current,
        },
      );

      return outcome;
    },
    [
      buildChainEmptyFinalizeSnapshot,
      logChainEmptyFinalizeWithDiag,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
    ],
  );

  const continueNotificationChainOrOpenLobby = useCallback(
    async (
      source: string,
      opts?: ContinueNotificationChainOptions,
    ): Promise<ContinueNotificationChainOutcome> => {
      let outcome = continueNotificationChainOrOpenLobbySync(source, opts);
      if (outcome !== 'needs-prefetch') {
        return outcome;
      }

      if (opts?.prefetchIfEmpty === false) {
        return finalizeNotificationChainContinueEmpty(
          source,
          opts,
          snapshotPendingNotificationChain(),
        );
      }

      await prefetchPendingNotificationChain(
        opts?.prefetchSkipBanId ?? null,
        `${source}-prefetch`,
      );
      outcome = continueNotificationChainOrOpenLobbySync(
        `${source}-after-prefetch`,
        {
          ...opts,
          clearActiveHold: false,
          prefetchIfEmpty: false,
        },
      );
      if (outcome !== 'needs-prefetch') {
        return outcome;
      }
      return finalizeNotificationChainContinueEmpty(
        source,
        opts,
        snapshotPendingNotificationChain(),
      );
    },
    [
      continueNotificationChainOrOpenLobbySync,
      finalizeNotificationChainContinueEmpty,
      prefetchPendingNotificationChain,
      snapshotPendingNotificationChain,
    ],
  );
  continueNotificationChainOrOpenLobbyRef.current =
    continueNotificationChainOrOpenLobby;

  const formatCheckAnswerContinueOutcomeLog = (
    outcome: ContinueNotificationChainOutcome,
  ): string => {
    if (outcome === 'show-next') return 'shown-next';
    if (outcome === 'open-lobby') return 'opened-lobby-empty';
    return outcome;
  };

  const hasCheckAnswerNextCardMounted = (): boolean => {
    const head = overlayQueueRef.current[0];
    if (!head) {
      return Boolean(
        checkBanRef.current?.id ||
          incomingBanRef.current?.id ||
          resultRef.current?.id,
      );
    }
    if (head.kind === 'check') {
      return normalizeId(checkBanRef.current?.id ?? '') === normalizeId(head.ban.id);
    }
    if (head.kind === 'incoming') {
      return (
        normalizeId(incomingBanRef.current?.id ?? '') === normalizeId(head.ban.id)
      );
    }
    if (head.kind === 'result') {
      return (
        normalizeId(resultRef.current?.id ?? '') === normalizeId(head.result.id)
      );
    }
    return false;
  };

  const releaseCheckAnswerTransition = useCallback(
    (reason: string, outcome: ContinueNotificationChainOutcome) => {
      logCheckAnswerTransitionReleased({
        reason,
        outcome: formatCheckAnswerContinueOutcomeLog(outcome),
      });
      if (checkAnswerChainRetryTimerRef.current) {
        clearTimeout(checkAnswerChainRetryTimerRef.current);
        checkAnswerChainRetryTimerRef.current = null;
      }
      setChainAdvanceWaiting(false);
      checkAnswerDismissChainOwnedRef.current = false;
    },
    [setChainAdvanceWaiting],
  );

  const handleCheckAnswerChainOutcome = useCallback(
    async (
      outcome: ContinueNotificationChainOutcome,
      banId: string,
      source: string,
      retryCount = 0,
    ) => {
      logCheckAnswerContinueOutcome({
        source,
        outcome: formatCheckAnswerContinueOutcomeLog(outcome),
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        chainAdvanceWaiting: chainAdvanceWaitingRef.current,
        lobbyOpen: lobbyOpenRef.current,
        retryCount,
      });

      if (outcome === 'show-next' || hasCheckAnswerNextCardMounted()) {
        releaseCheckAnswerTransition('shown-next', outcome);
        return;
      }

      if (outcome === 'open-lobby' || outcome === 'open-bans') {
        if (isCheckAnswerWaitingResultHoldActive(banId)) {
          logCheckAnswerKeepTransition({
            reason: 'waiting-result-hold',
            outcome: formatCheckAnswerContinueOutcomeLog(outcome),
            retryCount,
          });
          return;
        }
        releaseCheckAnswerTransition('opened-lobby-empty', outcome);
        return;
      }

      if (
        outcome === 'needs-prefetch' ||
        outcome === 'lost-pending' ||
        outcome === 'blocked'
      ) {
        if (
          outcome === 'blocked' &&
          !isCheckAnswerWaitingResultHoldActive(banId)
        ) {
          const retryOutcome = continueNotificationChainOrOpenLobbyRef.current(
            `${source}-blocked-hold-cleared`,
            {
              clearActiveHold: false,
              prefetchSkipBanId: normalizeId(banId) || undefined,
            },
          );
          await handleCheckAnswerChainOutcomeRef.current(
            retryOutcome,
            banId,
            `${source}-blocked-hold-cleared`,
            retryCount,
          );
          return;
        }
        logCheckAnswerKeepTransition({
          reason: outcome,
          outcome: formatCheckAnswerContinueOutcomeLog(outcome),
          retryCount,
        });
        logCheckAnswerWaitingForNext({
          source,
          banId,
          retryCount,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
          waitingForResult:
            Boolean(resultRef.current?.id) ||
            overlayQueueRef.current[0]?.kind === 'result',
          waitingForIncoming:
            overlayQueueRef.current[0]?.kind === 'incoming' ||
            pendingStartupInteractionsRef.current[0]?.kind === 'incoming',
          waitingForPrefetch:
            outcome === 'needs-prefetch' || outcome === 'lost-pending',
        });
        setChainAdvanceWaiting(true);
        setNotificationChainTransitioning(true);
        traceChainPlaceholderStuckRef.current(
          'chain-advance-kept-waiting',
          source,
          outcome,
          { retryCount },
        );

        if (retryCount >= CHECK_ANSWER_CHAIN_RETRY_MAX) {
          logCheckAnswerRetryExhaustedOpenLobby({
            retryCount,
            outcome: formatCheckAnswerContinueOutcomeLog(outcome),
            queueLen: overlayQueueRef.current.length,
            pendingLen: pendingStartupInteractionsRef.current.length,
          });
          if (isCheckAnswerWaitingResultHoldActive(banId)) {
            logCheckAnswerKeepTransition({
              reason: 'waiting-result-hold-retry-exhausted',
              outcome: formatCheckAnswerContinueOutcomeLog(outcome),
              retryCount,
            });
            return;
          }
          releaseCheckAnswerTransition('retry-exhausted', outcome);
          if (!hasCheckAnswerNextCardMounted()) {
            openLobbyRef.current('check-answer-retry-exhausted');
          }
          return;
        }

        const nextRetry = retryCount + 1;
        logCheckAnswerRetryContinue({
          retryCount: nextRetry,
          source: 'check-answer-retry',
        });
        if (checkAnswerChainRetryTimerRef.current) {
          clearTimeout(checkAnswerChainRetryTimerRef.current);
        }
        checkAnswerChainRetryTimerRef.current = setTimeout(() => {
          checkAnswerChainRetryTimerRef.current = null;
          void (async () => {
            const retrySource = `check-answer-retry-${nextRetry}`;
            const retryOutcome = await continueNotificationChainOrOpenLobbyRef.current(
              retrySource,
              {
                clearActiveHold: false,
                prefetchSkipBanId: banId,
              },
            );
            await handleCheckAnswerChainOutcomeRef.current(
              retryOutcome,
              banId,
              retrySource,
              nextRetry,
            );
          })();
        }, CHECK_ANSWER_CHAIN_RETRY_MS);
      }
    },
    [
      isCheckAnswerWaitingResultHoldActive,
      releaseCheckAnswerTransition,
      setChainAdvanceWaiting,
      setNotificationChainTransitioning,
    ],
  );
  handleCheckAnswerChainOutcomeRef.current = handleCheckAnswerChainOutcome;

  const startLobbyBansNotificationDrain =
    useCallback(async (): Promise<LobbyBansNotificationDrainOutcome> => {
      clearStaleComposeStateBeforeBansNavigation('lobby-bans-cta');
      let queueLenBefore = overlayQueueRef.current.length;
      let pendingLen = pendingStartupInteractionsRef.current.length;

      if (pendingLen === 0 && queueLenBefore === 0) {
        await prefetchPendingNotificationChain(null, 'lobby-bans-cta');
        queueLenBefore = overlayQueueRef.current.length;
        pendingLen = pendingStartupInteractionsRef.current.length;
      }

      const pendingSnapshot = [...pendingStartupInteractionsRef.current];
      const chainSnap = snapshotPendingNotificationChain();
      const needAttention =
        pendingLen > 0 || queueLenBefore > 0 || hasPendingNotificationChain();
      const hasPendingChain = hasPendingNotificationChain();
      const hasLobbyIndicator =
        lobbyBansAttentionHint > 0 ||
        needAttention ||
        (userIdRef.current?.trim()
          ? readLobbyNotificationAttentionHint(userIdRef.current.trim()) > 0
          : false);

      logLobbyBansPendingFetchMissing({
        reason:
          pendingLen === 0 && queueLenBefore === 0
            ? 'lobby-bans-cta-refs-only-no-pending-all-fetch'
            : 'lobby-bans-cta-uses-existing-refs-no-pending-all-fetch',
        queueLen: queueLenBefore,
        pendingLen,
        hasLobbyBansAttentionHint: lobbyBansAttentionHint > 0,
        needAttention,
      });

      logLobbyBansDrainEntered({
        telegramUserId: userIdRef.current?.trim() ?? auth.user?.id ?? null,
        source: 'lobby-bans-cta',
        pendingSnapshotLen: pendingSnapshot.length,
        queueLenBefore,
        pendingLenBefore: pendingLen,
        incomingLen: chainSnap.incomingLen,
        checkLen: chainSnap.checkLen,
        resultLen: chainSnap.resultLen,
        needAttention,
        hasLobbyIndicator,
        hasPendingNotificationChain: hasPendingChain,
        hasLobbyBansAttentionHint: lobbyBansAttentionHint > 0,
      });
      logQueueSourceComparisonSnapshot(
        buildQueueSourceComparisonSnapshot('lobby-bans-drain-entered'),
      );

      logLobbyBansCtaClick({
        queueLen: queueLenBefore,
        pendingLen,
        lobbyBansNeedAttention: needAttention,
        lobbyOpen: lobbyOpenRef.current,
      });

      if (!needAttention) {
        const comparison = buildQueueSourceComparisonSnapshot(
          'lobby-bans-cta-need-attention-false',
        );
        logLobbyBansDrainNotEntered({
          reason: 'need-attention-false',
          telegramUserId: userIdRef.current?.trim() ?? auth.user?.id ?? null,
          source: 'lobby-bans-cta',
          queueLen: comparison.queueLen,
          pendingLen: comparison.pendingLen,
          hasPendingNotificationChain: comparison.hasPendingNotificationChain,
          hasLobbyBansAttentionHint: comparison.hasLobbyBansAttentionHint,
          needAttention: comparison.needAttention,
          restoreStateFound: comparison.restoreStateFound,
        });
        logLobbyBansCtaEmptyOpenSection({
          queueLen: queueLenBefore,
          pendingLen,
        });
        return 'empty';
      }

      logLobbyBansCtaHasNotifications({
        queueLen: queueLenBefore,
        pendingLen,
        startupHold: startupInteractionsHoldRef.current,
      });
      logLobbyBansCtaPendingSnapshot({
        pendingLen,
        queueLen: queueLenBefore,
        kinds: pendingSnapshot.map((item) => item.kind),
      });

      allowDeeplinkExplicitNotificationDrain('lobby-bans-cta');
      logLobbyBansCtaStartDrain({
        queueLen: queueLenBefore,
        pendingLen,
      });

      logOverlayPriority('explicit-bans-open-unlock', {
        source: 'lobby-bans-cta',
      });
      clearNotificationChainReturnLatch('lobby-bans-cta');

      chainAdvanceExplicitRef.current = true;
      startupInteractionsHoldRef.current = false;
      if (isNotificationQueueLocked()) {
        unlockNotificationQueue('lobby-bans-cta');
      }
      deepLinkBlockedRef.current = false;

      const mergedCount = mergePendingSnapshotIntoOverlayQueue(
        pendingSnapshot,
        'lobby-bans-cta',
      );
      if (mergedCount > 0) {
        pendingStartupInteractionsRef.current = [];
        syncPendingStartupCount();
      }

      const queueLenAfter = overlayQueueRef.current.length;
      const pendingLenAfter = pendingStartupInteractionsRef.current.length;
      const chainSnapAfter = snapshotPendingNotificationChain();
      const head = overlayQueueRef.current[0] ?? null;
      const headBanId =
        head?.kind === 'result'
          ? head.result.id
          : head?.kind === 'incoming' || head?.kind === 'check'
            ? head.ban.id
            : null;
      logLobbyBansQueueStartSnapshot({
        telegramUserId: userIdRef.current?.trim() ?? auth.user?.id ?? null,
        queueLenBefore,
        pendingLenBefore: pendingLen,
        queueLenAfter,
        pendingLenAfter,
        incomingLen: chainSnapAfter.incomingLen,
        checkLen: chainSnapAfter.checkLen,
        resultLen: chainSnapAfter.resultLen,
        selectedKind: head?.kind ?? null,
        selectedBanId: headBanId,
        source: 'lobby-bans-cta',
      });
      logLobbyBansCtaPendingMerged({
        pendingLen,
        mergedCount,
        queueLenAfter,
        queueLenBefore,
      });

      if (pendingLen > 0 && mergedCount === 0) {
        logLobbyBansCtaPendingLostBug({
          pendingLen,
          queueLenAfter,
          mergedCount,
          kinds: pendingSnapshot.map((item) => item.kind),
        });
        return 'drain-failed';
      }

      const shown = showNextNotificationFromChainSync('lobby-bans-cta');
      if (shown) {
        logLobbyBansCtaShowNext({
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
          headKind: overlayQueueRef.current[0]?.kind ?? null,
          pendingSnapshotLen: pendingLen,
          mergedCount,
        });
        return 'drained';
      }

      if (queueLenAfter > 0 || pendingLen > 0) {
        syncDisplayFromQueue(overlayQueueRef.current);
        logLobbyBansCtaPendingLostBug({
          reason: 'show-next-failed-after-merge',
          queueLen: overlayQueueRef.current.length,
          pendingLen,
          mergedCount,
        });
        logLobbyBansCtaDrainBug({
          reason: 'show-next-failed',
          queueLen: overlayQueueRef.current.length,
          pendingLen,
          mergedCount,
        });
        return 'drain-failed';
      }

      logLobbyBansCtaEmptyOpenSection({
        queueLen: 0,
        pendingLen: 0,
        reason: 'drain-consumed-queue',
      });
      return 'empty';
    }, [
      auth.user?.id,
      buildQueueSourceComparisonSnapshot,
      clearNotificationChainReturnLatch,
      clearStaleComposeStateBeforeBansNavigation,
      hasPendingNotificationChain,
      lobbyBansAttentionHint,
      mergePendingSnapshotIntoOverlayQueue,
      prefetchPendingNotificationChain,
      showNextNotificationFromChainSync,
      snapshotPendingNotificationChain,
      syncDisplayFromQueue,
      syncPendingStartupCount,
    ]);

  const armOpenBansOverlayFromResultCta = useCallback(
    (banId: string | null, targetTab: BansOverlayTabTarget = 'yours') => {
      allowDeeplinkExplicitNotificationDrain('armOpenBansOverlayFromResultCta');
      const chainSnapshot = getNotificationChainDebugSnapshot();
      if (hasPendingNotificationChain()) {
        console.log('[chain-debug-bans-open-called]', {
          source: 'armOpenBansOverlayFromResultCta',
          reason: 'chain-active',
          ...chainSnapshot,
        });
        console.log('[notification-chain-open-bans-deferred]', {
          source: 'armOpenBansOverlayFromResultCta',
          reason: 'queue-not-empty',
          queueLength: overlayQueueRef.current.length,
          startupPending: pendingStartupInteractionsRef.current.length,
        });
        clearNotificationChainReturnLatch('armOpenBansOverlayFromResultCta');
        if (pendingStartupInteractionsRef.current.length > 0) {
          releaseStartupInteractions({ force: true });
        }
        if (showNextNotificationFromChainSync('armOpenBansOverlayFromResultCta')) {
          return;
        }
        syncDisplayFromQueue(overlayQueueRef.current);
        return;
      }

      console.log('[chain-debug-bans-open-called]', {
        source: 'armOpenBansOverlayFromResultCta-final',
        banId,
        ...chainSnapshot,
      });

      closeSendFlow();
      clearIncomingReply();
      clearDeepLinkReplyBan();
      replyDeeplinkChainHoldRef.current = false;
      notificationChainHandoffRef.current = false;
      notificationChainAwaitingUserRef.current = false;
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
        setOpenBansOverlayTabRequest(targetTab);
        openBansOverlayTabRequestRef.current = targetTab;
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
        targetTab,
        resultCtaBansOverlayOpen: true,
        bansCtaQueueSuppress: true,
      });
      console.log('[BANS OPEN REQUESTED]', {
        openBansOverlayRequest: nextBansRequest,
        targetTab,
        resultCtaBansOverlayOpen: true,
        lobbyOpen: lobbyOpenRef.current,
      });
    },
    [clearDeepLinkReplyBan, clearIncomingReply, closeSendFlow, getNotificationChainDebugSnapshot, hasPendingNotificationChain, releaseStartupInteractions, showNextNotificationFromChainSync, syncDisplayFromQueue, clearNotificationChainReturnLatch],
  );

  const primeNextNotificationAfterStatusCta = useCallback(
    async (source: string): Promise<boolean> => {
      if (showNextNotificationFromChainSync(source)) return true;

      console.log('[pending-chain-fallback-poll]', {
        source,
        reason: 'queue-empty-prefetch',
      });

      const deeplinkBanId =
        replyDeeplinkParentBanIdRef.current?.trim() ??
        replyDeepLinkBanIdRef.current?.trim() ??
        null;
      await prefetchPendingNotificationChain(deeplinkBanId, source);

      if (showNextNotificationFromChainSync(source)) return true;

      console.log('[pending-chain-empty-final]', { source });
      replyDeeplinkChainHoldRef.current = false;
      notificationChainHandoffRef.current = false;
      notificationChainAwaitingUserRef.current = false;
      return false;
    },
    [
      prefetchPendingNotificationChain,
      showNextNotificationFromChainSync,
    ],
  );

  const drainNextNotificationAfterSuccess = useCallback(
    async (successBanId?: string | null): Promise<boolean> => {
      if (!canDrainNotificationAfterSuccess()) {
        logSuccessExitRetryBlockedBeforeCard({
          successBanId: successBanId ?? null,
          successCardMounted: isSuccessCardMounted(),
          queueLen: overlayQueueRef.current.length,
          startupLen: pendingStartupInteractionsRef.current.length,
        });
        logSuccessExitDrainResult({
          drained: false,
          queueLenAfter: overlayQueueRef.current.length,
          pendingLenAfter: pendingStartupInteractionsRef.current.length,
          reason: 'success-exit-not-authorized',
        });
        return false;
      }
      if (isSuccessCardMounted()) {
        logSuccessDrainOnlyAfterExit({
          successBanId: successBanId ?? null,
          queueLen: overlayQueueRef.current.length,
        });
        logSuccessExitDrainResult({
          drained: false,
          queueLenAfter: overlayQueueRef.current.length,
          pendingLenAfter: pendingStartupInteractionsRef.current.length,
          reason: 'success-card-still-mounted',
        });
        return false;
      }

      allowDeeplinkExplicitNotificationDrain('drainNextNotificationAfterSuccess');
      const queueLen = overlayQueueRef.current.length;
      const startupLen = pendingStartupInteractionsRef.current.length;
      const composeActive = whatOrConfirmActiveRef.current;

      logSuccessExitDrainStart();

      console.log('[success-exit-notification-check]', {
        banId: successBanId ?? null,
        queueLen,
        startupLen,
        composeActive,
      });

      const logDrainResult = (
        drained: boolean,
        extra?: {
          selectedKind?: string | null;
          selectedBanId?: string | null;
          reason?: string;
        },
      ) => {
        logSuccessExitDrainResult({
          drained,
          queueLenAfter: overlayQueueRef.current.length,
          pendingLenAfter: pendingStartupInteractionsRef.current.length,
          selectedKind: extra?.selectedKind ?? null,
          selectedBanId: extra?.selectedBanId ?? null,
          reason: extra?.reason,
        });
      };

      if (composeActive) {
        console.log('[success-exit-no-notifications]', {
          reason: 'compose-active',
        });
        window.__debug98log?.('[success-exit-no-notifications]', {
          reason: 'compose-active',
        });
        logDrainResult(false, { reason: 'compose-active' });
        return false;
      }

      const tryDrain = async (source: string): Promise<boolean> => {
        if (
          blocksMountedNotificationOverlay(
            `drainNextNotificationAfterSuccess:${source}`,
            null,
            null,
          )
        ) {
          console.log('[success-exit-no-notifications]', {
            reason: 'overlay-blocked',
            source,
          });
          window.__debug98log?.('[success-exit-no-notifications]', {
            reason: 'overlay-blocked',
            source,
          });
          return false;
        }

        beginPostSuccessHandoff({
          source,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
        });
        const shown =
          (await continueNotificationChainOrOpenLobbyRef.current(source, {
            prefetchIfEmpty: false,
            openLobbyIfEmpty: false,
          })) === 'show-next';
        if (!shown) {
          return false;
        }

        const head = overlayQueueRef.current[0] ?? null;
        const nextKind = head?.kind ?? null;
        const nextBanId =
          head?.kind === 'result'
            ? head.result.id
            : head?.kind === 'incoming' || head?.kind === 'check'
              ? head.ban.id
              : null;
        if (source === 'success-exit' || source === 'success-exit-retry') {
          logFirstNotificationSelected({
            kind: nextKind,
            banId: nextBanId,
            source,
          });
        }
        console.log('[notification-next-selected]', {
          source,
          nextKind,
          nextBanId,
        });
        window.__debug98log?.('[notification-next-selected]', {
          source,
          nextKind,
          nextBanId,
        });
        console.log('[success-exit-drain-success]', { nextKind, nextBanId, source });
        window.__debug98log?.('[success-exit-drain-success]', {
          nextKind,
          nextBanId,
          source,
        });
        console.log('[success-exit-drain-one]', { nextKind, nextBanId });
        logDrainResult(true, {
          selectedKind: nextKind,
          selectedBanId: nextBanId,
        });
        return true;
      };

      if (await tryDrain('success-exit')) return true;

      const primaryEmptySnapshot = snapshotPendingNotificationChain();
      if (isSuccessExitChainFullyEmpty(primaryEmptySnapshot)) {
        if (isPostSuccessHandoffInProgress()) {
          finalizePostSuccessHandoffEmptyNoRetry({
            source: 'success-exit',
            queueLen: primaryEmptySnapshot.queueLen,
            pendingLen: primaryEmptySnapshot.pendingLen,
            incomingLen: primaryEmptySnapshot.incomingLen,
            checkLen: primaryEmptySnapshot.checkLen,
            resultLen: primaryEmptySnapshot.resultLen,
            bufferedIncomingId: primaryEmptySnapshot.bufferedIncomingId,
            heldNextKind: primaryEmptySnapshot.heldNextKind,
            finalQueueLen: primaryEmptySnapshot.finalQueueLen,
            finalPendingLen: primaryEmptySnapshot.finalPendingLen,
          });
        }
        logDrainResult(false, { reason: 'success-exit-empty-no-retry' });
        return false;
      }

      await prefetchPendingNotificationChain(null, 'success-exit');
      if (shouldBlockPostSuccessEmptyRetry('success-exit-retry')) {
        logDrainResult(false, { reason: 'success-exit-retry-blocked-empty' });
        return false;
      }
      if (await tryDrain('success-exit-retry')) return true;

      const finalCollected = snapshotPendingNotificationChain();
      const finalQueueLen = finalCollected.finalQueueLen;
      const finalStartupLen = finalCollected.finalPendingLen;
      const drainMissReason =
        finalQueueLen === 0 && finalStartupLen === 0
          ? 'queue-empty-after-prefetch'
          : 'drain-not-shown';
      console.log('[success-exit-no-notifications]', {
        reason: drainMissReason,
        queueLen: finalQueueLen,
        startupLen: finalStartupLen,
      });
      window.__debug98log?.('[success-exit-no-notifications]', {
        reason: drainMissReason,
        queueLen: finalQueueLen,
        startupLen: finalStartupLen,
      });
      logDrainResult(false, { reason: drainMissReason });
      if (finalQueueLen === 0 && finalStartupLen === 0) {
        completePostSuccessHandoffEmptyOpenLobby({
          reason: drainMissReason,
          queueLen: finalQueueLen,
          pendingLen: finalStartupLen,
        });
      } else if (isPostSuccessHandoffInProgress()) {
        logPostSuccessHandoffLostBug({
          reason: drainMissReason,
          queueLen: finalQueueLen,
          pendingLen: finalStartupLen,
        });
      }
      return false;
    },
    [
      blocksMountedNotificationOverlay,
      prefetchPendingNotificationChain,
      snapshotPendingNotificationChain,
    ],
  );

  const releaseNotificationQueueAfterReplyParentActive = useCallback(() => {
    const hadPriority = replyParentActivePriorityActiveRef.current;
    console.log('[active-timer-user-close]', {
      banId: getActiveTimerBanId(),
      hadPriority,
    });
    clearStaleComposeStateBeforeBansNavigation('active-timer-close');
    clearReplyParentActivePriority('queue-release');
    activeBanCardVisibleRef.current = false;
    setActiveBanCardReady(false);
    activeBanDeepLinkBanIdRef.current = null;
    setActiveBanDeepLinkBanId(null);
    deepLinkBlockedRef.current = false;
    console.log('[notification-queue-release-after-parent-active]', {
      hadPriority,
    });

    if (isNotificationQueueLocked()) {
      unlockNotificationQueue('notification-queue-release-after-parent-active');
    }

    void continueNotificationChainOrOpenLobbyRef.current('active-timer-close', {
      clearActiveHold: true,
    });
  }, [clearReplyParentActivePriority, clearStaleComposeStateBeforeBansNavigation]);

  const markReplyParentActivePriorityShown = useCallback((parentBanId: string) => {
    replyParentActivePriorityPendingRef.current = false;
    replyParentActivePriorityActiveRef.current = true;
    setReplyParentActivePriorityActive(true);
    clearOverlayInputLock('reply-parent-active-shown');
    void prefetchPendingNotificationChain(parentBanId, 'reply-parent-active-shown');
    console.log('[reply-parent-active-priority-show]', {
      parentBanId,
      baseScreen: 'lobby',
    });
  }, [prefetchPendingNotificationChain]);

  const finalizeResultForGoToBans = useCallback(
    (banId: string) => {
      clearStaleComposeStateBeforeBansNavigation('finalizeResultForGoToBans');
      const key = normalizeId(banId);
      if (!key) return;
      const outcome = resultRef.current?.outcome ?? result?.outcome ?? null;

      const heldBefore = heldUserCardOverlayRef.current;
      chainAdvanceExplicitRef.current = true;
      notificationChainAwaitingUserRef.current = false;
      notificationChainHandoffRef.current = false;
      if (incomingOverboardAtomicBanIdRef.current === key) {
        incomingOverboardAtomicBanIdRef.current = null;
      }
      if (heldBefore) {
        logResultGoToBansClearActiveHold({
          banId: key,
          heldKind: heldBefore.kind,
          heldBanId: heldUserCardBanId(heldBefore),
        });
      }
      clearActiveUserCardHold('finalizeResultForGoToBans');

      markResultOverlayConsumed(key, 'go-to-bans');
      cancelResultPollBurst();
      void acknowledgeBanResultOnServer(key, tokenRef.current, 'go-to-bans');

      if (
        outcome === 'overboard' &&
        !incomingConsumedAfterAnswerRef.current.has(key)
      ) {
        consumeIncomingAfterAnswer(key, 'go-to-bans');
      }

      pruneResultFromNotificationChain(key, 'go-to-bans', ['check', 'result']);
      sanitizeNotificationChainQueues('go-to-bans');

      const beforeQueue = overlayQueueRef.current;
      const nextQueue = removeOverlaysForBan(beforeQueue, key, ['check', 'result']);
      if (nextQueue.length !== beforeQueue.length) {
        overlayQueueRef.current = nextQueue;
        setOverlayQueue(nextQueue);
      }
      const beforePending = pendingStartupInteractionsRef.current;
      const nextPending = removeOverlaysForBan(beforePending, key, [
        'check',
        'result',
      ]);
      if (nextPending.length !== beforePending.length) {
        pendingStartupInteractionsRef.current = nextPending;
        syncPendingStartupCount();
      }

      const remainingLen = overlayQueueRef.current.length;
      const pendingLen = pendingStartupInteractionsRef.current.length;
      logResultGoToBansRemainingQueue({ banId: key, remainingLen, pendingLen });

      const hasNextInChain = remainingLen > 0 || pendingLen > 0;
      if (hasNextInChain) {
        setNotificationChainTransitioning(true);
      }

      if (overboardInFlightRef.current === key) {
        overboardInFlightRef.current = null;
      }
      freshOverboardActionBanIdsRef.current.delete(key);
      freshFinalStatusBanIdsRef.current.delete(key);
      clearLocalOverboardBypass();
      clearDirectOverboardLayerRefs();
      resultOpenRef.current = false;
      setDirectResultOverlayActive(false);
      emitResultClearCallsite({
        source: 'finalizeResultForGoToBans',
        reason: 'go-to-bans-finalize',
        resultIdBefore: key,
        willClearResult: true,
      });
      setResult(null);
      resultRef.current = null;
      emitResultHeldStillPresentAfterClear(
        'finalizeResultForGoToBans',
        'go-to-bans-finalize',
      );

      lastProcessedOverlayKindForBansRef.current = 'result';
    },
    [
      cancelResultPollBurst,
      clearDirectOverboardLayerRefs,
      clearStaleComposeStateBeforeBansNavigation,
      consumeIncomingAfterAnswer,
      markResultOverlayConsumed,
      pruneResultFromNotificationChain,
      result?.outcome,
      sanitizeNotificationChainQueues,
      setNotificationChainTransitioning,
      syncPendingStartupCount,
    ],
  );

  const consumeResultBanForResultCta = useCallback(
    (banId: string) => {
      finalizeResultForGoToBans(banId);
    },
    [finalizeResultForGoToBans],
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
    clearStaleComposeStateBeforeBansNavigation('navigateFromResult');
    const generation = ++statusCtaNavigateGenerationRef.current;
    const banId = result?.id ?? resultRef.current?.id ?? null;
    const wasDirect =
      directResultOverlayRef.current ||
      directResultOverlayActiveRef.current ||
      directResultOverlayActive;

    logResultGoToBansClick({
      banId,
      wasDirect,
      generation,
      atomicBanId: incomingOverboardAtomicBanIdRef.current,
      heldKind: heldUserCardOverlayRef.current?.kind ?? null,
    });

    console.log('[chain-debug-status-cta-start]', { banId, generation });
    console.log('[go-to-bans-click]', {
      source: 'result-status',
      banId,
      wasDirect,
    });
    window.__debug98log?.('[go-to-bans-click]', {
      source: 'result-status',
      banId,
      wasDirect,
    });
    logCardCloseClick({
      kind: 'result',
      banId,
      source: 'go-to-bans',
    });

    const beforeConsume = {
      overlayLen: overlayQueueRef.current.length,
      startupLen: pendingStartupInteractionsRef.current.length,
      overlayIds: overlayQueueRef.current.map(overlayQueueItemId),
      startupIds: pendingStartupInteractionsRef.current.map(overlayQueueItemId),
    };

    console.log('[overboard-repeat-debug] to bans clicked', {
      banId,
      wasDirect,
      queueLength: beforeConsume.overlayLen,
    });
    console.log('[overboard-status-debug] to bans clicked', {
      banId,
      wasDirect,
      queueLength: beforeConsume.overlayLen,
    });

    markVisibleOverboardTrace('RESULT CTA OPEN BANS click', {
      action: wasDirect ? 'open-bans' : 'open-bans-queue',
      direct: wasDirect,
      banId,
      wasDirect,
      queueLength: beforeConsume.overlayLen,
    });
    logResultNav('to-bans', {
      action: 'open-bans',
      direct: wasDirect,
      banId,
      queueLength: beforeConsume.overlayLen,
      wasDirect,
    });
    markOverlayUserAction('result-nav', banId ?? undefined);

    clearBansOverlayNavigationIntent(
      wasDirect ? 'overboard-status-direct' : 'navigate-from-result-queue',
    );

    const chainSource = wasDirect ? 'overboard-status-direct' : 'status-cta';

    const lookaheadReady =
      overlayQueueRef.current.length > 1 ||
      pendingStartupInteractionsRef.current.length > 0;

    window.__debug98log?.('[GO TO BANS CLICK]', {
      source: 'result-status',
      banId,
      wasDirect,
      lookaheadReady,
      queueLen: beforeConsume.overlayLen,
      pendingLen: beforeConsume.startupLen,
    });
    goToBansAdvancePendingRef.current = true;
    const placeholderKind: 'incoming' | 'check' | 'result' = checkBanRef.current
      ? 'check'
      : incomingBanRef.current
        ? 'incoming'
        : 'result';
    if (lookaheadReady) {
      window.__debug98log?.('[GO TO BANS NEXT READY]', {
        banId,
        queueLen: beforeConsume.overlayLen,
        pendingLen: beforeConsume.startupLen,
      });
    } else {
      window.__debug98log?.('[GO TO BANS NEXT WAITING]', { banId });
      setChainAdvancePlaceholderKind(placeholderKind);
      setChainAdvanceWaiting(true);
    }

    setNotificationChainTransitioning(true);

    if (banId) {
      flushSync(() => {
        finalizeResultForGoToBans(banId);
      });
    } else if (wasDirect) {
      flushSync(() => {
        cancelResultPollBurst();
        applyDirectOverboardCloseState(null);
      });
    }

    const afterConsume = {
      overlayLen: overlayQueueRef.current.length,
      startupLen: pendingStartupInteractionsRef.current.length,
      overlayIds: overlayQueueRef.current.map(overlayQueueItemId),
      startupIds:
        pendingStartupInteractionsRef.current.map(overlayQueueItemId),
    };
    if (
      beforeConsume.overlayIds.some((id) => id.startsWith('result:')) &&
      !afterConsume.overlayIds.some((id) => id.startsWith('result:')) &&
      beforeConsume.startupIds.join(',') === afterConsume.startupIds.join(',')
    ) {
      console.log('[notification-chain-queue-lost]', {
        source: 'status-cta',
        beforeIds: {
          overlay: beforeConsume.overlayIds,
          startup: beforeConsume.startupIds,
        },
        afterIds: {
          overlay: afterConsume.overlayIds,
          startup: afterConsume.startupIds,
        },
      });
    }

    const queueHead = overlayQueueRef.current[0] ?? null;
    const queueHeadKind = queueHead?.kind ?? null;
    const queueHeadBanId =
      queueHead?.kind === 'result'
        ? queueHead.result.id
        : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
          ? queueHead.ban.id
          : null;
    console.log('[go-to-bans-queue-check]', {
      chainSource,
      queueLen: overlayQueueRef.current.length,
      startupLen: pendingStartupInteractionsRef.current.length,
      queueHeadKind,
      queueHeadBanId,
    });

    clearNotificationChainReturnLatch('navigateFromResult');

    const lastProcessedKind = lastProcessedOverlayKindForBansRef.current;
    const previousTab = openBansOverlayTabRequestRef.current;
    const targetTab: BansOverlayTabTarget =
      previousTab === 'history' || previousTab === 'archive'
        ? previousTab
        : lastProcessedKind === 'incoming'
          ? 'toYou'
          : 'yours';

    void (async () => {
      const shown =
        (await continueNotificationChainOrOpenLobbyRef.current(chainSource, {
          clearActiveHold: false,
          prefetchSkipBanId: banId,
          emptyFallback: 'bans-section',
          openBansTab: targetTab,
          openBansBanId: banId,
        })) === 'show-next';
      if (statusCtaNavigateGenerationRef.current !== generation) return;
      setChainAdvanceWaiting(false);
      goToBansAdvancePendingRef.current = false;
      if (shown) {
        logResultGoToBansShowNext({
          banId,
          chainSource,
          queueLen: overlayQueueRef.current.length,
          pendingLen: pendingStartupInteractionsRef.current.length,
          headKind: overlayQueueRef.current[0]?.kind ?? null,
        });
        console.log('[go-to-bans-show-next-overlay]', {
          source: 'chain-continue',
          chainSource,
        });
        return;
      }

      const collected = snapshotPendingNotificationChain();
      if (collected.finalQueueLen > 0 || collected.finalPendingLen > 0) {
        logResultGoToBansEmptyScreenBug({
          banId,
          chainSource,
          reason: 'continue-lost-pending',
          finalQueueLen: collected.finalQueueLen,
          finalPendingLen: collected.finalPendingLen,
        });
        return;
      }

      logResultGoToBansOpenBansSection({
        banId,
        targetTab,
        lastProcessedKind,
        previousTab,
      });
      console.log('[go-to-bans-target-tab]', {
        source: 'navigateFromResult',
        targetTab,
        lastProcessedKind,
        previousTab,
      });
      console.log('[go-to-bans-open-section]', {
        source: 'status-cta',
        targetTab,
        lastProcessedKind,
        previousTab,
      });
      logResultNav('open-bans-overlay', { direct: wasDirect, banId, wasDirect });
    })();
  }, [
    applyDirectOverboardCloseState,
    cancelResultPollBurst,
    clearBansOverlayNavigationIntent,
    clearNotificationChainReturnLatch,
    snapshotPendingNotificationChain,
    directResultOverlayActive,
    clearStaleComposeStateBeforeBansNavigation,
    finalizeResultForGoToBans,
    logCardCloseClick,
    markOverlayUserAction,
    overlayQueueItemId,
    result?.id,
    setChainAdvanceWaiting,
    setNotificationChainTransitioning,
  ]);

  const startIncomingReply = useCallback(
    (ban: BanInteraction) => {
      const enriched = enrichBanInteraction(ban);
      pinReplyToBanId(ban.id);
      replyComposeActiveRef.current = true;
      setReplyComposeActive(true);
      setIncomingReplyBanId(ban.id);
      setReplyDeepLinkBanId(ban.id);
      replyDeepLinkBanIdRef.current = ban.id;
      setDeepLinkReplyBan(enriched);
      setLobbyOpen(false);
      openSendFlow();
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
    [pinReplyToBanId, openSendFlow],
  );

  const acknowledgeIncomingSeen = useCallback(async (banId: string) => {
    lastProcessedOverlayKindForBansRef.current = 'incoming';
    dismissedIncomingRef.current.add(banId);
    setViralOnboarding(false);
    removeIncomingFromQueue(banId, { explicitUserAction: true });
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
      const senderId = ban.sender?.id ?? null;
      const viewerId = userIdRef.current?.trim() ?? null;
      logIncomingReplyActionStart({ banId, senderId, viewerId });
      abortPostSuccessHandoffForReplyCompose('incoming-reply-click', banId, {
        pendingLen: pendingStartupInteractionsRef.current.length,
        queueLen: overlayQueueRef.current.length,
      });
      logIncomingReplyCleanupSnapshot({
        stage: 'before',
        step: 'reply-compose-cleanup-start',
        banId,
        source: 'incoming-reply-click',
        incomingOverlayVisible:
          incomingBanRef.current != null ||
          heldUserCardOverlayRef.current?.kind === 'incoming',
        activeOverlayKind:
          heldUserCardOverlayRef.current?.kind ??
          (incomingBanRef.current ? 'incoming' : null),
        ...buildIncomingReplyCleanupSnapshot(),
      });
      console.log('[chain-incoming-reply-click]', { banId, senderId });
      console.log('[reply-card-action]', {
        action: 'reply',
        parentBanId: banId,
        viewerId,
      });
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

      chainReplyParentBanIdRef.current = banId;
      notificationChainReplyComposeActiveRef.current = true;
      chainAdvanceExplicitRef.current = false;
      replyDeeplinkParentBanIdRef.current = banId;
      replyFlowStartedForBanIdRef.current = banId;
      acceptedParentBanAfterReplyRef.current = banId;
      replyParentActivePriorityPendingRef.current = true;
      acceptedParentIncomingSnapshotRef.current = enrichBanInteraction(ban);
      const optimisticActive = buildActiveParentBanForSuccess(ban);
      storeAcceptedParentActiveBan(optimisticActive, 'optimistic-on-reply-click');

      releaseIncomingOverlayForReplyCompose(banId, 'incoming-reply-click');
      logIncomingReplyCleanupSnapshot({
        stage: 'after',
        step: 'releaseIncomingOverlayForReplyCompose',
        banId,
        source: 'incoming-reply-click',
        incomingOverlayVisible:
          incomingBanRef.current != null ||
          heldUserCardOverlayRef.current?.kind === 'incoming',
        activeOverlayKind:
          heldUserCardOverlayRef.current?.kind ??
          (incomingBanRef.current ? 'incoming' : null),
        ...buildIncomingReplyCleanupSnapshot(),
      });
      logIncomingReplyCleanupSnapshot({
        stage: 'before',
        step: 'dismissIncomingCardForReplyCompose',
        banId,
        source: 'incoming-reply-click',
        ...buildIncomingReplyCleanupSnapshot(),
      });
      dismissIncomingCardForReplyCompose(banId);
      logIncomingReplyCleanupSnapshot({
        stage: 'after',
        step: 'dismissIncomingCardForReplyCompose',
        banId,
        source: 'incoming-reply-click',
        incomingOverlayVisible:
          incomingBanRef.current != null ||
          heldUserCardOverlayRef.current?.kind === 'incoming',
        activeOverlayKind:
          heldUserCardOverlayRef.current?.kind ??
          (incomingBanRef.current ? 'incoming' : null),
        ...buildIncomingReplyCleanupSnapshot(),
      });

      console.log('[reply-parent-active-priority-set]', { parentBanId: banId });
      console.log('[chain-reply-handoff-start]', {
        parentBanId: banId,
        stopChain: true,
      });
      console.log('[chain-reply-advance-blocked]', {
        parentBanId: banId,
        reason: 'reply-compose-armed',
      });

      startIncomingReply(ban);
      beginReplyHandoff(banId);
      logIncomingReplyFlowStart({
        banId,
        parentBanId: banId,
        recipientId: senderId,
      });

      console.log('[chain-reply-open-what]', {
        parentBanId: banId,
        recipientId: senderId,
      });
      console.log('[chain-reply-compose-active]', { parentBanId: banId });

      if (process.env.NODE_ENV === 'development') {
        console.log('[reply-click]', {
          incomingBanId: banId,
          senderId: ban.sender?.id ?? null,
          setPhaseWhat: 'composingBan',
          selectedTarget:
            ban.sender?.id ??
            ban.sender?.username ??
            null,
        });
        console.log('[reply-click] hide route overlay / showBansLayer false', {
          replyComposeActive: true,
          routeOverlayAboveBoot: false,
        });
      }

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
        console.log('[reply-parent-accept-start]', { parentBanId: banId });
        const acceptPromise = (async (): Promise<BanInteraction | null> => {
          try {
            const { ban: acceptedBan, session } = await api<{
              ban: BanInteraction;
              session?: SessionState;
            }>(`/bans/${banId}/accept`, {
              method: 'POST',
              token,
            });
            console.log('[reply-parent-accept-response]', {
              parentBanId: banId,
              hasBan: !!acceptedBan,
              status: acceptedBan?.status ?? null,
              expiresAt: acceptedBan?.expiresAt ?? null,
              checkDueAt: acceptedBan?.checkDueAt ?? null,
            });
            if (acceptedBan) {
              const mergedActive = buildActiveParentBanForSuccess(ban, {
                serverBan: acceptedBan,
              });
              const enrichedAccepted = storeAcceptedParentActiveBan(
                mergedActive,
                'accept-api',
              );
              if (enrichedAccepted) {
                setActiveBans((prev) => {
                  if (prev.some((row) => row.id === enrichedAccepted.id)) {
                    return prev.map((row) =>
                      row.id === enrichedAccepted.id ? enrichedAccepted : row,
                    );
                  }
                  return [enrichedAccepted, ...prev];
                });
              }
              if (session) {
                applySession(session);
              }
              patchReplyHandoffDebug({
                acceptPending: false,
                acceptDone: true,
              });
              return enrichedAccepted;
            }
            patchReplyHandoffDebug({
              acceptPending: false,
              acceptDone: false,
            });
            return null;
          } catch (e) {
            challengeLog('incoming:accept-failed', {
              banId,
              message: (e as Error).message,
            });
            patchReplyHandoffDebug({
              acceptPending: false,
              acceptDone: false,
            });
            return null;
          }
        })();
        replyParentAcceptPromiseRef.current = acceptPromise;
        void acceptPromise;
      } else {
        patchReplyHandoffDebug({ acceptPending: false, acceptDone: false });
      }
    },
    [
      applySession,
      beginReplyHandoff,
      buildIncomingReplyCleanupSnapshot,
      clearBansOverlayNavigationIntent,
      dismissIncomingCardForReplyCompose,
      releaseIncomingOverlayForReplyCompose,
      startIncomingReply,
      storeAcceptedParentActiveBan,
    ],
  );

  const dismissIncomingSoft = useCallback(
    (banId: string) => {
      removeIncomingFromQueue(banId, { explicitUserAction: true });
      setViralOnboarding(false);
      clearActiveIncomingOverlayBanStable('soft-dismiss', banId);
      if (incomingBanRef.current?.id === banId) {
        setIncomingBan(null);
      }
      challengeLog('incoming:soft-dismiss', { banId });
    },
    [clearActiveIncomingOverlayBanStable, removeIncomingFromQueue],
  );

  const dismissIncoming = useCallback(
    (banId?: string) => {
      if (banId) {
        if (
          notificationChainAwaitingUserRef.current &&
          incomingBanRef.current?.id === banId
        ) {
          console.log('[chain-drain-continue-blocked]', {
            reason: 'active-overlay-mounted',
            banId,
            source: 'dismissIncoming-auto',
          });
          window.__debug98log?.('[chain-drain-continue-blocked]', {
            reason: 'active-overlay-mounted',
            banId,
            source: 'dismissIncoming-auto',
          });
          return;
        }
        void acknowledgeIncomingSeen(banId);
        return;
      }
      challengeLog('incoming:dismiss', { banId: null });
      setViralOnboarding(false);
      clearActiveUserCardHold('dismissIncoming');
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
          if (!banSentOpenRef.current && !sendSuccessCardActiveRef.current) {
            reloadPending();
          }
          break;
        case 'friends:updated': {
          if (banSentOpenRef.current || sendSuccessCardActiveRef.current) break;
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

  useLayoutEffect(() => {
    const uid = auth.user?.id;
    const token = auth.token;
    if (!uid || !token || auth.loading) return;
    primeLobbyBansAttentionHintSync('auth-ready-layout');
    void primeLobbyBansIndicator();
  }, [auth.user?.id, auth.token, auth.loading, primeLobbyBansAttentionHintSync, primeLobbyBansIndicator]);

  useEffect(() => {
    lobbyIndicatorPrimedForUserRef.current = null;
  }, [auth.user?.id]);

  useEffect(() => {
    sessionBootstrappedRef.current = sessionBootstrapped;
    if (sessionBootstrapped) {
      syncPendingStartupCount();
    }
  }, [sessionBootstrapped, syncPendingStartupCount]);

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
      if (blockAutoDismissAtomicOverboardResult(result.id, 'janitor-useEffect')) {
        return;
      }
      if (blockAutoDismissTerminalFinalStatus(result.id, 'janitor-useEffect')) {
        return;
      }
      dismissBanResult();
    }
  }, [
    result,
    dismissBanResult,
    blockAutoDismissAtomicOverboardResult,
    blockAutoDismissTerminalFinalStatus,
  ]);

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
  const displayResult =
    priorityBlocksResult || sendSuccessCardActive ? null : result;

  useLayoutEffect(() => {
    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const heldResult =
      heldUserCardOverlay?.kind === 'result' ? heldUserCardOverlay.result : null;
    const queueHeadResult =
      queueHead?.kind === 'result' ? queueHead.result : null;
    const refResult = resultRef.current;
    const fromDisplayResult = displayResult != null;
    const fromHeldResult = heldResult != null;
    const fromQueueHeadResult = queueHeadResult != null;
    const fromResultRef = refResult != null;

    let sourcePicked = 'none';
    if (displayResult) {
      sourcePicked = 'displayResult-via-result-state';
    } else if (priorityBlocksResult) {
      sourcePicked = 'blocked-priorityBlocksResult';
    } else if (sendSuccessCardActive) {
      sourcePicked = 'blocked-sendSuccessCardActive';
    } else if (!result) {
      sourcePicked = 'no-result-state';
    }

    const finalPayload = displayResult ?? refResult ?? heldResult ?? queueHeadResult;
    logResultDisplaySourcePick({
      sourcePicked,
      fromDisplayResult,
      fromHeldResult,
      fromQueueHeadResult,
      fromResultRef,
      finalExists: finalPayload != null,
      finalBanId: finalPayload?.id ?? null,
      finalStatus: finalPayload?.status ?? null,
      finalOutcome: finalPayload?.outcome ?? null,
      displayResultBanId: displayResult?.id ?? null,
      resultRefBanId: refResult?.id ?? null,
      heldResultBanId: heldResult?.id ?? null,
      queueHeadResultBanId: queueHeadResult?.id ?? null,
      queueHeadKind: queueHead?.kind ?? null,
      freshPriorityBanIds: [...resultPriorityBanIdsRef.current],
      priorityBlocksResult,
      sendSuccessCardActive,
    });
  }, [
    displayResult,
    heldUserCardOverlay,
    overlayQueue,
    priorityBlocksResult,
    result,
    sendSuccessCardActive,
  ]);

  const showDirectOverboardLayer =
    directResultOverlayActive && displayResult != null && !sendSuccessCardActive;

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
    : heldUserCardOverlay?.kind ??
      (replyFastIncomingActive
        ? 'incoming'
        : (overlayQueue[0]?.kind ?? overlayQueueRef.current[0]?.kind ?? null));
  const displayActiveOverlayKind =
    priorityBlocksResult && !replyFastIncomingActive
      ? null
      : activeOverlayKind;
  const queueHeadKind =
    overlayQueue[0]?.kind ?? overlayQueueRef.current[0]?.kind ?? null;
  const notificationShellSuppressedForBansLobby =
    bansCtaQueueSuppressRef.current;
  const incomingAnswerBlockId =
    replyDeepLinkBanId ?? replyDeeplinkPendingBanIdRef.current;
  const incomingBlockedAfterAnswer =
    incomingAnswerBlockId != null &&
    incomingConsumedAfterAnswerRef.current.has(incomingAnswerBlockId);
  const notificationChainReplyComposePaused =
    notificationChainReplyComposeActiveRef.current ||
    replyComposeActiveRef.current ||
    replyComposeActive ||
    chainReplyParentBanIdRef.current != null;
  const shouldRenderIncomingOverlay =
    !showDirectOverboardLayer &&
    !notificationShellSuppressedForBansLobby &&
    !incomingBlockedAfterAnswer &&
    !notificationChainReplyComposePaused &&
    !replyParentActivePriorityActive &&
    (stableIncomingOverlayBan?.id ||
      heldUserCardOverlay?.kind === 'incoming' ||
      displayActiveOverlayKind === 'incoming' ||
      activeOverlayKind === 'incoming' ||
      queueHeadKind === 'incoming' ||
      replyFastIncomingActive ||
      (replyDeepLinkBanId != null &&
        (replyDeeplinkFastShell || replyHandoffLock) &&
        !incomingReplyComposeDismissedRef.current.has(replyDeepLinkBanId)));
  const incomingOverlayDisplayKind = shouldRenderIncomingOverlay
    ? 'incoming'
    : displayActiveOverlayKind;
  const replyIncomingDirectPath = Boolean(
    replyDeepLinkBanId != null ||
      replyDeeplinkFastShell ||
      replyHandoffLock ||
      deepLinkReplyBooting,
  );
  const checkDeeplinkDirectPath = Boolean(checkDeepLinkBanId);
  const replyIncomingQueueShellDeferred =
    replyIncomingDirectPath &&
    (replyDeeplinkFastShell || deepLinkReplyBooting);
  const hasQueuedOverlayShell =
    !notificationChainReplyComposePaused &&
    !replyIncomingQueueShellDeferred &&
    (overlayQueue.length > 0 ||
      replyFastIncomingActive ||
      shouldRenderIncomingOverlay ||
      heldUserCardOverlay != null) &&
    (incomingOverlayDisplayKind != null || heldUserCardOverlay != null);

  const composeBlocksNotificationHost =
    sendComposePhase !== 'idle' || replyComposeActive;

  const incomingGateActive = useMemo(() => {
    if (composeBlocksNotificationHost) return false;
    if (notificationChainReplyComposePaused) return false;
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
    composeBlocksNotificationHost,
    notificationChainReplyComposePaused,
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
      if (composeBlocksNotificationHost) return false;
      if (sendSuccessCardActive) return false;
      if (activeBanCardReady || replyParentActivePriorityActive) {
        return false;
      }
      if (priorityBlocksResult) return false;
      if (checkDeepLinkBanId && checkDeeplinkPendingBanIdRef.current) {
        return true;
      }
      if (activeOverlayKind === 'check' && checkBan) {
        return shouldShowCheckOverlay(
          checkBan,
          auth.user?.id ?? null,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          !!result,
        );
      }
      return shouldShowCheckOverlay(
        checkBan,
        auth.user?.id ?? null,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        !!result,
      );
    },
    [composeBlocksNotificationHost, priorityBlocksResult, activeOverlayKind, checkBan, auth.user?.id, result, activeBanCardReady, sendSuccessCardActive, replyParentActivePriorityActive, checkDeepLinkBanId],
  );

  const checkOverlayMounted =
    !composeBlocksNotificationHost &&
    !!checkBan?.id &&
    queueHeadKind === 'check';

  const checkDeeplinkDirectPending =
    checkDeeplinkDirectPath &&
    !checkOverlayMounted &&
    (checkDeeplinkPendingBanIdRef.current != null ||
      isDeepLinkRouteBootPending());
  const showCheckOverlayDirect =
    checkDeeplinkDirectPath &&
    checkBan != null &&
    checkOverlayMounted &&
    !showDirectOverboardLayer &&
    Boolean(auth.user?.id ?? userIdRef.current);

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

  const setDeepLinkReplyBootingGuarded = useCallback((value: boolean) => {
    if (value && replyDeeplinkCompletedRouteBanIdRef.current) {
      console.log('[reply-completed-route]', {
        action: 'skip-set-reply-booting',
        banId: replyDeeplinkCompletedRouteBanIdRef.current,
      });
      return;
    }
    setDeepLinkReplyBooting(value);
  }, []);

  const openLobby = useCallback((source?: string) => {
    const snapshot = getNotificationChainDebugSnapshot();
    if (isPostSuccessHandoffInProgress()) {
      if (
        shouldBlockLobbyOpenForPostSuccessHandoff(
          overlayQueueRef.current.length,
          pendingStartupInteractionsRef.current.length,
          source ?? 'openLobby',
        )
      ) {
        return;
      }
      completePostSuccessHandoffEmptyOpenLobby({
        source: source ?? 'openLobby',
        reason: 'empty-queue-lobby-open',
      });
    }
    if (shouldSuppressLobbyOpenDuringSuccessExit()) {
      if (isSuccessExitInstrumentationActive()) {
        logSuccessExitLobbyOpenAttempt({
          source: source ?? 'default',
          via: 'openLobby',
          blocked: 'success-exit-in-progress',
        });
      }
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'success-exit-in-progress',
        ...snapshot,
      });
      return;
    }
    if (isSuccessExitInstrumentationActive()) {
      logSuccessExitLobbyOpenAttempt({
        source: source ?? 'default',
        via: 'openLobby',
      });
    }
    if (isSuccessCardMounted()) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'success-card-mounted',
        successBanId: sendSuccessCardBanIdRef.current,
        ...snapshot,
      });
      return;
    }
    if (notificationChainTransitioningRef.current) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'chain-transitioning',
        ...snapshot,
      });
      return;
    }
    if (isActiveTimerOverlayMounted()) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'active-timer-mounted',
        activeBanId: getActiveTimerBanId(),
        ...snapshot,
      });
      return;
    }
    if (isActiveCheckOverlayMounted()) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'active-check-mounted',
        checkBanId: checkBanRef.current?.id ?? null,
        ...snapshot,
      });
      return;
    }
    const resultId = resultRef.current?.id ?? null;
    const viewerId = userIdRef.current?.trim() ?? '';
    const hasMountedOverlayForLobbyBlock =
      !!notificationChainHandoffRef.current ||
      !!notificationChainAwaitingUserRef.current ||
      !!notificationChainReplyComposeActiveRef.current ||
      !!chainReplyParentBanIdRef.current ||
      !!replyComposeActiveRef.current ||
      !!(
        directResultOverlayRef.current || directResultOverlayActiveRef.current
      ) ||
      !!incomingBanRef.current?.id ||
      !!checkBanRef.current?.id ||
      !!(
        resultId &&
        !resultCtaConsumedBanIdsRef.current.has(resultId) &&
        !(viewerId && isDismissedResultLocally(resultId, viewerId))
      );
    if (
      shouldBlockLobbyOpenForQueuedNotifications({
        chainTransitioning: notificationChainTransitioningRef.current,
        hasMountedOverlay: hasMountedOverlayForLobbyBlock,
        startupHold: startupInteractionsHoldRef.current,
        pendingLen: pendingStartupInteractionsRef.current.length,
        queueLen: overlayQueueRef.current.length,
      })
    ) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'active-overlay-mounted-or-queue-not-empty',
        ...snapshot,
      });
      console.log('[chain-debug-final-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'chain-active',
        ...snapshot,
      });
      return;
    }
    if (overlayQueueDrainActiveRef.current) {
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'overlay-queue-drain-active',
        ...snapshot,
      });
      return;
    }
    if (checkDeeplinkPendingBanIdRef.current) {
      logCheckFullLobbyFlashBug({
        reason: 'openLobby-while-check-deeplink-pending',
        banId: checkDeeplinkPendingBanIdRef.current,
        source: source ?? 'default',
      });
      return;
    }
    if (isActiveUserCardHold()) {
      logActiveUserCardPreventLobbyFallback({
        source: source ?? 'openLobby',
      });
      console.log('[chain-open-lobby-blocked]', {
        source: source ?? 'default',
        reason: 'active-user-card-hold',
        ...snapshot,
      });
      return;
    }
    if (startupInteractionsHoldRef.current) {
      const pendingLen = pendingStartupInteractionsRef.current.length;
      const queueLen = overlayQueueRef.current.length;
      if (pendingLen > 0 || queueLen > 0) {
        logLobbyIndicatorOnlyNoCard({
          source: source ?? 'openLobby',
          queueLen,
          pendingLen,
          startupHold: true,
        });
      }
    }
    console.log('[chain-debug-open-lobby-called]', {
      source: source ?? 'default',
      stackHint: 'openLobby',
      ...snapshot,
    });
    setLobbyOpen(true);
    lobbyOpenRef.current = true;
    lobbyShownLoggedRef.current = false;
    console.log('[lobby-opened]', {
      userId: userIdRef.current ?? null,
      source: source ?? 'default',
      lobbyOpen: true,
    });
  }, [getNotificationChainDebugSnapshot]);

  useLayoutEffect(() => {
    openLobbyRef.current = openLobby;
  }, [openLobby]);

  useLayoutEffect(() => {
    armOpenBansOverlayFromResultCtaRef.current =
      armOpenBansOverlayFromResultCta;
  }, [armOpenBansOverlayFromResultCta]);

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
    setReplyIncomingDisplayBan(null);
    replyIncomingDisplayBanRef.current = null;
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
    (_banId: string | null) => {
      navigateFromResult();
    },
    [navigateFromResult],
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
        setBansReturnToLobbyLatch(true, {
          source: `completeBansOverlayCloseFromResultCta:${lobbySource}`,
          banId: resultRef.current?.id ?? result?.id ?? null,
        });
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
        emitResultClearCallsite({
          source: 'completeBansOverlayCloseFromResultCta',
          reason: 'result-cta-bans-close',
          willClearResult: true,
        });
        setResult(null);
        resultRef.current = null;
        emitResultHeldStillPresentAfterClear(
          'completeBansOverlayCloseFromResultCta',
          'result-cta-bans-close',
        );
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
          setBansReturnToLobbyLatch(false, {
            source: `completeBansOverlayCloseFromResultCta-timeout:${closeSource}`,
            banId: resultRef.current?.id ?? null,
          });
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
    openBansOverlayTabRequestRef.current = openBansOverlayTabRequest;
  }, [openBansOverlayTabRequest]);

  useEffect(() => {
    bansCtaQueueSuppressRef.current = bansCtaQueueSuppress;
  }, [bansCtaQueueSuppress]);

  useEffect(() => {
    bansReturnToLobbyLatchRef.current = bansReturnToLobbyLatch;
  }, [bansReturnToLobbyLatch]);

  useEffect(() => {
    registerDebug98LatchSnapshot(() => ({
      bansReturnToLobbyLatchRef: bansReturnToLobbyLatchRef.current,
      queueLen: overlayQueueRef.current.length,
    }));
    return () => registerDebug98LatchSnapshot(null);
  }, []);

  const openNewBanWhoFlow = useCallback(() => {
    if (hasPendingNotificationChain()) {
      console.log('[success-exit-open-what-blocked]', {
        reason: 'pending-notifications',
        source: 'openNewBanWhoFlow',
      });
      void flushDeferredSync().then(() => {
        releaseStartupInteractions({ force: true });
        unlockNotificationQueueAndFlush('new-ban-who-provider-drain');
      });
      return;
    }
    traceSuccessStateReset('openNewBanWhoFlow-provider');
    closeLobby();
    setNewBanWhoFlowRequest((n) => n + 1);
  }, [
    closeLobby,
    flushDeferredSync,
    hasPendingNotificationChain,
    releaseStartupInteractions,
    unlockNotificationQueueAndFlush,
  ]);

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

  const incomingCardDisplayBan = useMemo(() => {
    const viewerId = auth.user?.id ?? userIdRef.current;
    if (stableIncomingOverlayBan?.id) {
      logIncomingStableBanUsed({
        banId: stableIncomingOverlayBan.id,
        source: 'incomingCardDisplayBan',
      });
      return stableIncomingOverlayBan;
    }
    if (isSendComposeFlowActive()) {
      return null;
    }
    if (!viewerId) return null;

    if (
      notificationChainReplyComposeActiveRef.current ||
      replyComposeActiveRef.current ||
      chainReplyParentBanIdRef.current
    ) {
      return null;
    }

    const acceptReplyDisplay = (ban: BanInteraction | null | undefined) => {
      if (!ban?.id) return false;
      if (isIncomingCardDisplayReady(ban, viewerId)) return true;
      return (
        replyIncomingDirectPath && isReplyIncomingDisplayBan(ban, viewerId)
      );
    };

    if (heldUserCardOverlay?.kind === 'incoming' && heldUserCardOverlay.ban.id) {
      const heldBan = heldUserCardOverlay.ban;
      if (isIncomingCardDisplayReady(heldBan, viewerId)) {
        return heldBan;
      }
    }

    if (acceptReplyDisplay(replyIncomingDisplayBan)) {
      return replyIncomingDisplayBan;
    }
    if (acceptReplyDisplay(replyIncomingDisplayBanRef.current)) {
      return replyIncomingDisplayBanRef.current;
    }

    if (auth.loading && !replyIncomingDirectPath) return null;

    const fastBanId =
      replyDeepLinkBanId ?? replyDeeplinkPendingBanIdRef.current;
    const candidates: BanInteraction[] = [];
    const addCandidate = (ban: BanInteraction | null | undefined) => {
      if (!ban?.id) return;
      if (candidates.some((row) => row.id === ban.id)) return;
      candidates.push(ban);
    };

    addCandidate(replyIncomingDisplayBanRef.current);
    addCandidate(incomingBan);
    addCandidate(incomingBanRef.current);
    if (scopedIncomingBan && !isReplyDeeplinkShellBan(scopedIncomingBan)) {
      addCandidate(scopedIncomingBan);
    }

    if (fastBanId) {
      for (const q of overlayQueue) {
        if (
          q.kind === 'incoming' &&
          q.ban.id === fastBanId &&
          !isReplyDeeplinkShellBan(q.ban)
        ) {
          addCandidate(q.ban);
        }
      }
      for (const q of overlayQueueRef.current) {
        if (
          q.kind === 'incoming' &&
          q.ban.id === fastBanId &&
          !isReplyDeeplinkShellBan(q.ban)
        ) {
          addCandidate(q.ban);
        }
      }
    } else {
      const head = overlayQueue[0] ?? overlayQueueRef.current[0];
      if (head?.kind === 'incoming' && !isReplyDeeplinkShellBan(head.ban)) {
        addCandidate(head.ban);
      }
    }

    const picked = pickIncomingCardDisplayBan(candidates, viewerId);
    if (picked) return picked;

    if (replyIncomingDirectPath) {
      for (const ban of candidates) {
        if (acceptReplyDisplay(ban)) return ban;
      }
    }

    return null;
  }, [
    stableIncomingOverlayBan,
    auth.user?.id,
    auth.loading,
    incomingBan,
    overlayQueue,
    replyDeepLinkBanId,
    replyIncomingDisplayBan,
    replyIncomingDirectPath,
    scopedIncomingBan,
    heldUserCardOverlay,
  ]);

  const incomingCardFullyReady = incomingCardDisplayBan != null;

  const incomingShellHydrating = useMemo(() => {
    const hydrateId = incomingNextHydrateBanId?.trim() ?? '';
    if (!hydrateId) return false;
    if (heldUserCardOverlay?.kind === 'result') return false;
    const head = overlayQueue[0] ?? overlayQueueRef.current[0];
    return (
      head?.kind === 'incoming' &&
      normalizeId(head.ban.id) === normalizeId(hydrateId)
    );
  }, [heldUserCardOverlay, incomingNextHydrateBanId, overlayQueue]);

  const shouldSuppressPassiveLobbyResultBan = (
    banId: string | null | undefined,
  ): boolean =>
    shouldBlockPassiveResultShellDisplay(buildPassiveResultGateContext(banId));

  const checkResultShellDisplayReady = useCallback(
    (payload: BanResult | null | undefined, source: string): boolean => {
      if (!payload?.id?.trim()) return false;
      const ready = isResultDisplayReady({
        result: payload,
        viewerId: userIdRef.current ?? auth.user?.id ?? null,
        atomicOverboardShowable: isAtomicOverboardShellReady(payload, {
          freshOverboardBanId: freshOverboardActionBanIdsRef.current.has(
            normalizeId(payload.id),
          ),
          atomicOverboardBanId:
            incomingOverboardAtomicBanIdRef.current ===
            normalizeId(payload.id),
        }),
      });
      const snap = getResultDisplayReadySnapshot(payload);
      const payloadStatus =
        (payload as BanResult & { status?: string | null }).status ?? null;
      const readyReason = ready
        ? 'ready'
        : snap.waiting
          ? 'waiting-or-partial'
          : !snap.hasOutcome
            ? 'missing-outcome'
            : !snap.hasTitle
              ? 'missing-title'
              : !snap.hasBody &&
                  !(
                    Boolean(payload.sender?.id?.trim()) &&
                    Boolean(payload.receiver?.id?.trim())
                  )
                ? 'missing-content'
                : 'not-display-ready';
      logResultDisplayReadyCheck({
        source,
        banId: snap.banId || null,
        resultId: snap.resultId || null,
        status: payloadStatus,
        outcome: payload.outcome ?? null,
        hasTitle: snap.hasTitle,
        hasBody: snap.hasBody,
        hasOutcome: snap.hasOutcome,
        hasStatus: snap.hasStatus,
        waiting: snap.waiting,
        isReady: ready,
        reason: readyReason,
      });
      if (!ready && chainAdvanceWaitingRef.current) {
        logResultShellSuppressedNotReady({
          source,
          banId: snap.banId || null,
          resultId: snap.resultId || null,
          chainAdvanceWaiting: true,
          reason: snap.waiting
            ? 'waiting-or-partial'
            : !snap.hasBody
              ? 'missing-body'
              : !snap.hasOutcome
                ? 'missing-outcome'
                : 'not-display-ready',
        });
      }
      return ready;
    },
    [auth.user?.id],
  );

  const activeResultPayload = useMemo(() => {
    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const guardCtx = buildResultShellHeldCardGuardContext(queueHead);
    const pickResultPayloadWithReason = (
      payload: BanResult | null | undefined,
      logSource: string,
    ): {
      payload: BanResult | null;
      rejectReason: string | null;
      banId: string | null;
    } => {
      const banId = payload?.id?.trim() ?? null;
      if (!banId) {
        return { payload: null, rejectReason: 'missing-id', banId: null };
      }
      if (shouldSuppressPassiveLobbyResultBan(banId)) {
        return {
          payload: null,
          rejectReason: 'suppressed-passive-lobby-ban',
          banId,
        };
      }
      if (shouldBlockPassiveResultShell(payload, guardCtx, logSource)) {
        return {
          payload: null,
          rejectReason: 'passive-shell-blocked-over-held-incoming-check',
          banId,
        };
      }
      return { payload: payload ?? null, rejectReason: null, banId };
    };
    const displayPick = pickResultPayloadWithReason(
      displayResult,
      'activeResult-display',
    );
    const heldPick =
      heldUserCardOverlay?.kind === 'result'
        ? pickResultPayloadWithReason(
            heldUserCardOverlay.result,
            'activeResult-held',
          )
        : {
            payload: null,
            rejectReason: heldUserCardOverlay
              ? `held-kind-${heldUserCardOverlay.kind}`
              : 'no-held-state',
            banId:
              heldUserCardOverlay && heldUserCardOverlay.kind !== 'result'
                ? heldUserCardBanId(heldUserCardOverlay)
                : null,
          };
    const queueHeadPick =
      queueHead?.kind === 'result'
        ? pickResultPayloadWithReason(queueHead.result, 'activeResult-queueHead')
        : {
            payload: null,
            rejectReason: queueHead
              ? `queue-head-kind-${queueHead.kind}`
              : 'empty-queue',
            banId:
              queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
                ? queueHead.ban.id
                : null,
          };
    const refPick = pickResultPayloadWithReason(
      resultRef.current,
      'activeResult-ref',
    );
    const statePick = pickResultPayloadWithReason(result, 'activeResult-state');

    type WinnerSource = 'display' | 'held' | 'queueHead' | 'ref' | 'state' | 'none';
    let winnerSource: WinnerSource = 'none';
    let winner: BanResult | null = null;

    const freshCheckAnswerBanId = [...checkAnswerPendingResultShowRef.current]
      .map((id) => normalizeId(id))
      .find((id) => id.length > 0) ?? null;
    if (
      freshCheckAnswerBanId &&
      queueHead?.kind === 'result' &&
      normalizeId(queueHead.result.id) === freshCheckAnswerBanId &&
      queueHeadPick.payload
    ) {
      const hasStaleOverlaySource =
        (displayPick.payload &&
          normalizeId(displayPick.payload.id) !== freshCheckAnswerBanId) ||
        (heldPick.payload &&
          normalizeId(heldPick.payload.id) !== freshCheckAnswerBanId) ||
        (refPick.payload &&
          normalizeId(refPick.payload.id) !== freshCheckAnswerBanId) ||
        (statePick.payload &&
          normalizeId(statePick.payload.id) !== freshCheckAnswerBanId);
      if (hasStaleOverlaySource) {
        logFreshResultOverlayStackTrace({
          ...snapshotFreshResultOverlayStack(freshCheckAnswerBanId),
          activeResultPayloadBanId: queueHeadPick.payload.id,
          source: 'activeResultPayload-fresh-check-answer-override',
          decision:
            heldPick.payload &&
            normalizeId(heldPick.payload.id) !== freshCheckAnswerBanId
              ? 'replace-stale-held'
              : 'suppress-stale',
        });
        return queueHeadPick.payload;
      }
    }

    for (const [source, pick] of [
      ['display', displayPick],
      ['held', heldPick],
      ['queueHead', queueHeadPick],
      ['ref', refPick],
      ['state', statePick],
    ] as const) {
      if (pick.payload) {
        winnerSource = source;
        winner = pick.payload;
        break;
      }
    }

    const freshPriorityBanIds = [...resultPriorityBanIdsRef.current];
    const freshPollPriorityBanId =
      freshPriorityBanIds.length > 0
        ? freshPriorityBanIds[freshPriorityBanIds.length - 1]!
        : null;
    const priorityNorm = freshPollPriorityBanId
      ? normalizeId(freshPollPriorityBanId)
      : '';
    const winnerNorm = winner?.id ? normalizeId(winner.id) : '';
    const queueHasPriorityResult =
      priorityNorm.length > 0 &&
      (overlayQueue.some(
        (q) => q.kind === 'result' && normalizeId(q.result.id) === priorityNorm,
      ) ||
        overlayQueueRef.current.some(
          (q) =>
            q.kind === 'result' && normalizeId(q.result.id) === priorityNorm,
        ));
    const queueHeadIsPriorityResult =
      queueHead?.kind === 'result' &&
      priorityNorm.length > 0 &&
      normalizeId(queueHead.result.id) === priorityNorm;

    let freshPriorityRejectedBecause: string | null = null;
    if (priorityNorm && winnerNorm && priorityNorm !== winnerNorm) {
      if (!queueHasPriorityResult) {
        freshPriorityRejectedBecause =
          'poll-priority-set-but-result-not-enqueued-in-queue';
      } else if (!queueHeadIsPriorityResult) {
        freshPriorityRejectedBecause = 'poll-priority-result-not-queue-head';
      } else if (displayPick.payload && normalizeId(displayPick.payload.id) !== priorityNorm) {
        freshPriorityRejectedBecause =
          'activeResultPayload-pick-order-displayResult-before-queueHead';
      } else if (heldPick.payload && normalizeId(heldPick.payload.id) !== priorityNorm) {
        freshPriorityRejectedBecause =
          'activeResultPayload-pick-order-heldResult-before-queueHead';
      } else if (queueHeadPick.rejectReason) {
        freshPriorityRejectedBecause = `queueHead-priority-blocked:${queueHeadPick.rejectReason}`;
      } else if (refPick.payload && normalizeId(refPick.payload.id) !== priorityNorm) {
        freshPriorityRejectedBecause =
          'activeResultPayload-pick-order-resultRef-before-priority-queueHead';
      } else {
        freshPriorityRejectedBecause =
          'priority-banId-lost-to-earlier-activeResultPayload-source';
      }
    } else if (priorityNorm && !winnerNorm && queueHasPriorityResult) {
      freshPriorityRejectedBecause =
        queueHeadPick.rejectReason ??
        displayPick.rejectReason ??
        refPick.rejectReason ??
        'priority-result-in-queue-but-all-candidates-rejected';
    }

    const heldRef = heldUserCardOverlayRef.current;
    logResultPayloadSelectionTrace({
      checkCardBanId: checkBanRef.current?.id ?? null,
      checkCardStateBanId: checkBan?.id ?? null,
      checkAnswerInFlightBanIds: [...checkAnswerInFlightRef.current],
      answeredCheckBanIds: [...answeredCheckRef.current],
      freshPollPriorityBanId,
      freshPriorityBanIds,
      resultRefBanId: resultRef.current?.id ?? null,
      resultOpenRef: resultOpenRef.current,
      displayResultBanId: displayResult?.id ?? null,
      resultStateBanId: result?.id ?? null,
      activeResultPayloadBanId: winner?.id ?? null,
      heldUserCardOverlayKind: heldUserCardOverlay?.kind ?? null,
      heldUserCardOverlayBanId: heldUserCardOverlay
        ? heldUserCardBanId(heldUserCardOverlay)
        : null,
      heldUserCardOverlayRefKind: heldRef?.kind ?? null,
      heldUserCardOverlayRefBanId: heldRef ? heldUserCardBanId(heldRef) : null,
      queueHeadKind: queueHead?.kind ?? null,
      queueHeadBanId:
        queueHead?.kind === 'result'
          ? queueHead.result.id
          : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
            ? queueHead.ban.id
            : null,
      queueHasPriorityResult,
      queueHeadIsPriorityResult,
      sourcePicked: winnerSource,
      winnerBanId: winner?.id ?? null,
      winnerPickReason:
        winnerSource === 'none'
          ? 'all-candidates-null-or-blocked'
          : `activeResultPayload-pick-order-${winnerSource}`,
      freshPriorityRejectedBecause,
      candidateRejectReasons: {
        display: displayPick.rejectReason,
        held: heldPick.rejectReason,
        queueHead: queueHeadPick.rejectReason,
        ref: refPick.rejectReason,
        state: statePick.rejectReason,
      },
      candidateBanIds: {
        display: displayPick.banId,
        held: heldPick.banId,
        queueHead: queueHeadPick.banId,
        ref: refPick.banId,
        state: statePick.banId,
      },
      guardCtx: {
        heldKind: guardCtx.heldKind,
        heldBanId: guardCtx.heldBanId,
        awaitingUser: guardCtx.awaitingUser,
        chainAdvanceExplicit: guardCtx.chainAdvanceExplicit,
        freshFinalStatusBanIds: [...freshFinalStatusBanIdsRef.current],
      },
    });

    return winner;
  }, [displayResult, heldUserCardOverlay, overlayQueue, result, checkBan, snapshotFreshResultOverlayStack]);

  const incomingNotificationShellKind = useMemo(() => {
    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const guardCtx = buildResultShellHeldCardGuardContext(queueHead);
    const heldIsResult = heldUserCardOverlay?.kind === 'result';
    const queueHeadIsResult = queueHead?.kind === 'result';
    const atomicNorm = normalizeId(incomingOverboardAtomicBanIdRef.current ?? '');
    const refResultNorm = normalizeId(resultRef.current?.id ?? '');
    const heldResultNorm =
      heldIsResult
        ? normalizeId(heldUserCardOverlay!.result.id)
        : heldUserCardOverlayRef.current?.kind === 'result'
          ? normalizeId(heldUserCardOverlayRef.current.result.id)
          : '';
    const atomicOverboardResultLive =
      Boolean(atomicNorm) &&
      !shouldSuppressPassiveLobbyResultBan(atomicNorm) &&
      (refResultNorm === atomicNorm ||
        heldResultNorm === atomicNorm ||
        freshOverboardActionBanIdsRef.current.has(atomicNorm));

    const queueHeadResultSuppressed =
      queueHeadIsResult &&
      shouldSuppressPassiveLobbyResultBan(
        queueHead?.kind === 'result' ? queueHead.result.id : null,
      );
    const heldResultSuppressed =
      heldIsResult &&
      shouldSuppressPassiveLobbyResultBan(
        heldUserCardOverlay!.result.id,
      );

    const activePayloadShellReady = checkResultShellDisplayReady(
      activeResultPayload,
      'incomingShell-activeResultPayload',
    );
    const heldResultShellReady =
      heldIsResult &&
      !heldResultSuppressed &&
      !shouldBlockPassiveResultShell(
        heldUserCardOverlay!.result,
        guardCtx,
        'incomingShell-held',
      ) &&
      checkResultShellDisplayReady(
        heldUserCardOverlay!.result,
        'incomingShell-held',
      );
    const queueHeadResultShellReady =
      queueHeadIsResult &&
      !queueHeadResultSuppressed &&
      !shouldBlockPassiveResultShell(
        queueHead?.kind === 'result' ? queueHead.result : null,
        guardCtx,
        'incomingShell-queueHead',
      ) &&
      checkResultShellDisplayReady(
        queueHead?.kind === 'result' ? queueHead.result : null,
        'incomingShell-queueHead',
      );
    const atomicOverboardShellReady =
      atomicOverboardResultLive &&
      (refResultNorm === atomicNorm
        ? checkResultShellDisplayReady(
            resultRef.current,
            'incomingShell-atomicOverboardRef',
          )
        : heldResultNorm === atomicNorm
          ? checkResultShellDisplayReady(
              heldIsResult
                ? heldUserCardOverlay!.result
                : heldUserCardOverlayRef.current?.kind === 'result'
                  ? heldUserCardOverlayRef.current.result
                  : null,
              'incomingShell-atomicOverboardHeld',
            )
          : isQueueAtomicOverboardResultShowable(atomicNorm));

    if (
      !showDirectOverboardLayer &&
      (activePayloadShellReady || atomicOverboardShellReady) &&
      (heldResultShellReady ||
        queueHeadResultShellReady ||
        atomicOverboardShellReady ||
        (incomingOverlayDisplayKind === 'result' && activePayloadShellReady))
    ) {
      return 'result' as const;
    }
    if (
      stableIncomingOverlayBan?.id &&
      !showDirectOverboardLayer &&
      !replyIncomingDirectPath &&
      !heldIsResult &&
      !queueHeadIsResult
    ) {
      return 'incoming' as const;
    }
    if (
      (incomingCardDisplayBan || incomingShellHydrating) &&
      effectiveShouldRenderIncoming &&
      !showDirectOverboardLayer &&
      !heldIsResult &&
      !queueHeadIsResult
    ) {
      return 'incoming' as const;
    }
    const queueHeadCheckShowable =
      queueHeadKind === 'check' &&
      Boolean(checkBan) &&
      shouldShowCheckOverlay(
        checkBan,
        auth.user?.id ?? null,
        dismissedCheckSessionRef.current,
        answeredCheckRef.current,
        checkAnswerInFlightRef.current,
        !!result,
      );
    if (
      incomingOverlayDisplayKind === 'check' &&
      checkBan &&
      (checkGateActive || queueHeadCheckShowable)
    ) {
      return 'check' as const;
    }
    return null;
  }, [
    incomingCardDisplayBan,
    incomingShellHydrating,
    effectiveShouldRenderIncoming,
    overlayQueue,
    replyIncomingDirectPath,
    showDirectOverboardLayer,
    stableIncomingOverlayBan?.id,
    incomingOverlayDisplayKind,
    checkGateActive,
    displayResult,
    heldUserCardOverlay,
    checkBan,
    queueHeadKind,
    auth.user?.id,
    result,
    activeResultPayload,
    checkResultShellDisplayReady,
    isQueueAtomicOverboardResultShowable,
  ]);

  const notificationQueueShellKind = useMemo(() => {
    if (composeBlocksNotificationHost) return null;
    if (checkAnswerWaitingResultHoldBanId) {
      return 'check' as const;
    }
    if (chainAdvanceWaiting && chainAdvancePlaceholderKind) {
      return chainAdvancePlaceholderKind;
    }
    if (!incomingNotificationShellKind) return null;
    if (
      incomingNotificationShellKind === 'incoming' &&
      replyIncomingDirectPath
    ) {
      return null;
    }
    return incomingNotificationShellKind;
  }, [
    chainAdvancePlaceholderKind,
    chainAdvanceWaiting,
    checkAnswerWaitingResultHoldBanId,
    composeBlocksNotificationHost,
    displayResult,
    heldUserCardOverlay,
    incomingNotificationShellKind,
    replyIncomingDirectPath,
  ]);

  const effectiveNotificationQueueShellKind = useMemo(() => {
    if (composeBlocksNotificationHost) return null;

    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const guardCtx = buildResultShellHeldCardGuardContext(queueHead);
    const atomicNorm = normalizeId(incomingOverboardAtomicBanIdRef.current ?? '');
    const refResultNorm = normalizeId(resultRef.current?.id ?? '');
    const heldResultNorm =
      heldUserCardOverlay?.kind === 'result'
        ? normalizeId(heldUserCardOverlay.result.id)
        : heldUserCardOverlayRef.current?.kind === 'result'
          ? normalizeId(heldUserCardOverlayRef.current.result.id)
          : '';
    const atomicOverboardResultLive =
      Boolean(atomicNorm) &&
      !shouldSuppressPassiveLobbyResultBan(atomicNorm) &&
      (refResultNorm === atomicNorm ||
        heldResultNorm === atomicNorm ||
        freshOverboardActionBanIdsRef.current.has(atomicNorm));
    const queueHeadResultSuppressed =
      queueHead?.kind === 'result' &&
      shouldSuppressPassiveLobbyResultBan(queueHead.result.id);
    const heldResultSuppressed =
      heldUserCardOverlay?.kind === 'result' &&
      shouldSuppressPassiveLobbyResultBan(heldUserCardOverlay.result.id);
    const activePayloadShellReady = checkResultShellDisplayReady(
      activeResultPayload,
      'effectiveShell-activeResultPayload',
    );
    const heldResultShellReady =
      heldUserCardOverlay?.kind === 'result' &&
      !heldResultSuppressed &&
      !shouldBlockPassiveResultShell(
        heldUserCardOverlay.result,
        guardCtx,
        'effectiveShell-held',
      ) &&
      checkResultShellDisplayReady(
        heldUserCardOverlay.result,
        'effectiveShell-held',
      );
    const queueHeadResultShellReady =
      queueHead?.kind === 'result' &&
      !queueHeadResultSuppressed &&
      !shouldBlockPassiveResultShell(
        queueHead.result,
        guardCtx,
        'effectiveShell-queueHead',
      ) &&
      checkResultShellDisplayReady(queueHead.result, 'effectiveShell-queueHead');
    const refResultShellReady =
      Boolean(resultRef.current?.id) &&
      !shouldSuppressPassiveLobbyResultBan(resultRef.current?.id) &&
      !chainAdvanceWaiting &&
      !shouldBlockPassiveResultShell(
        resultRef.current,
        guardCtx,
        'effectiveShell-resultRef',
      ) &&
      checkResultShellDisplayReady(resultRef.current, 'effectiveShell-resultRef');
    const atomicOverboardShellReady =
      atomicOverboardResultLive &&
      (refResultNorm === atomicNorm
        ? checkResultShellDisplayReady(
            resultRef.current,
            'effectiveShell-atomicOverboardRef',
          )
        : heldResultNorm === atomicNorm
          ? checkResultShellDisplayReady(
              heldUserCardOverlay?.kind === 'result'
                ? heldUserCardOverlay.result
                : heldUserCardOverlayRef.current?.kind === 'result'
                  ? heldUserCardOverlayRef.current.result
                  : null,
              'effectiveShell-atomicOverboardHeld',
            )
          : isQueueAtomicOverboardResultShowable(atomicNorm));
    const queueResultActive =
      !showDirectOverboardLayer &&
      (activePayloadShellReady ||
        heldResultShellReady ||
        queueHeadResultShellReady ||
        refResultShellReady ||
        atomicOverboardShellReady);

    if (queueResultActive) {
      return 'result' as const;
    }

    return notificationQueueShellKind;
  }, [
    activeResultPayload,
    chainAdvanceWaiting,
    checkResultShellDisplayReady,
    composeBlocksNotificationHost,
    heldUserCardOverlay,
    isQueueAtomicOverboardResultShowable,
    notificationQueueShellKind,
    overlayQueue,
    showDirectOverboardLayer,
  ]);

  const queueResultShellContentReady = useMemo((): boolean | undefined => {
    if (effectiveNotificationQueueShellKind !== 'result' || !activeResultPayload) {
      return undefined;
    }
    if (
      !checkResultShellDisplayReady(
        activeResultPayload,
        'queueResultShellContentReady',
      )
    ) {
      return undefined;
    }
    if (isQueueAtomicOverboardResultShowable(activeResultPayload.id)) {
      return Boolean(activeResultPayload.id?.trim());
    }
    return isQueueResultShellVisibleContentReady(activeResultPayload);
  }, [
    activeResultPayload,
    checkResultShellDisplayReady,
    effectiveNotificationQueueShellKind,
    isQueueAtomicOverboardResultShowable,
    isQueueResultShellVisibleContentReady,
  ]);

  useLayoutEffect(() => {
    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const heldResult =
      heldUserCardOverlay?.kind === 'result' ? heldUserCardOverlay.result : null;
    const activeOverlayBanId =
      activeOverlayKind === 'result'
        ? displayResult?.id ??
          heldResult?.id ??
          (queueHead?.kind === 'result' ? queueHead.result.id : null) ??
          resultRef.current?.id ??
          null
        : activeOverlayKind === 'incoming'
          ? incomingBan?.id ?? null
          : activeOverlayKind === 'check'
            ? checkBan?.id ?? null
            : null;

    logResultOverlayJsxDecision({
      shellKind: notificationQueueShellKind,
      effectiveKind: effectiveNotificationQueueShellKind,
      willRenderResultOverlay:
        effectiveNotificationQueueShellKind === 'result' &&
        Boolean(activeResultPayload),
      displayResultExists: Boolean(displayResult),
      displayResultStatus: displayResult?.status ?? null,
      displayResultOutcome: displayResult?.outcome ?? null,
      heldKind: heldUserCardOverlay?.kind ?? null,
      heldResultExists: Boolean(heldResult),
      heldResultStatus: heldResult?.status ?? null,
      resultRefExists: Boolean(resultRef.current),
      resultRefStatus: resultRef.current?.status ?? null,
      activeOverlayKind,
      activeOverlayBanId,
    });
  }, [
    activeOverlayKind,
    activeResultPayload,
    checkBan?.id,
    displayResult,
    effectiveNotificationQueueShellKind,
    heldUserCardOverlay,
    incomingBan?.id,
    notificationQueueShellKind,
    overlayQueue,
  ]);

  useLayoutEffect(() => {
    const held = heldUserCardOverlayRef.current;
    const shellKind = effectiveNotificationQueueShellKind;
    if (shellKind == null && held?.kind !== 'result') return;

    const resultBan =
      activeResultPayload ??
      displayResult ??
      (held?.kind === 'result' ? held.result : null) ??
      (result?.id ? result : null);
    const incomingBanId =
      incomingCardDisplayBan?.id ?? stableIncomingOverlayBan?.id ?? null;

    if (shellKind === 'result' || held?.kind === 'result') {
      logResultCardRenderDecision({
        kind: 'result',
        banId: resultBan?.id ?? null,
        status: resultBan?.outcome ?? resultBan?.status ?? null,
        shouldRender: shellKind === 'result' && Boolean(activeResultPayload),
        returnNullReason:
          shellKind === 'result' && !activeResultPayload
            ? priorityBlocksResult
              ? 'displayResult-null-priorityBlocksResult'
              : sendSuccessCardActive
                ? 'displayResult-null-success-card-active'
                : 'activeResultPayload-null'
            : shellKind !== 'result'
              ? 'shell-kind-not-result'
              : null,
        isInNotificationQueue: overlayQueue.length > 0,
        activeOverlayKind,
        activeUserCardHold: heldUserCardOverlay?.kind ?? null,
        source: 'notification-shell-layout',
        shellKind,
        displayResultBlocked: result != null && displayResult == null,
        priorityBlocksResult,
      });
    }

    if (shellKind === 'incoming') {
      logResultCardRenderDecision({
        kind: 'incoming',
        banId: incomingBanId,
        verifyPhase: null,
        shouldRender: Boolean(
          incomingCardDisplayBan || stableIncomingOverlayBan?.id,
        ),
        returnNullReason: !incomingCardDisplayBan && !stableIncomingOverlayBan?.id
          ? 'incoming-card-not-ready'
          : null,
        isInNotificationQueue: overlayQueue.length > 0,
        activeOverlayKind,
        activeUserCardHold: heldUserCardOverlay?.kind ?? null,
        source: 'notification-shell-layout-incoming',
        shellKind,
      });
    }
  }, [
    activeOverlayKind,
    activeResultPayload,
    displayResult,
    effectiveNotificationQueueShellKind,
    heldUserCardOverlay,
    incomingCardDisplayBan,
    overlayQueue.length,
    priorityBlocksResult,
    result,
    sendSuccessCardActive,
    stableIncomingOverlayBan?.id,
  ]);

  const replyDirectOverlayBan =
    incomingCardDisplayBan ??
    replyIncomingDisplayBan ??
    replyIncomingDisplayBanRef.current;
  const showReplyIncomingOverlayDirect =
    replyIncomingDirectPath &&
    replyDirectOverlayBan != null &&
    !showDirectOverboardLayer &&
    !replyComposeActive &&
    Boolean(auth.user?.id ?? userIdRef.current);

  const notificationOverlayMounted = useMemo(() => {
    if (composeBlocksNotificationHost) return false;
    if (sendSuccessCardActive) return false;
    if (showDirectOverboardLayer) return true;
    if (heldUserCardOverlay != null) return true;
    if (chainAdvanceWaiting && chainAdvancePlaceholderKind) return true;
    if (showReplyIncomingOverlayDirect && incomingCardFullyReady) return true;
    if (showCheckOverlayDirect) return true;
    if (checkOverlayMounted) return true;
    if (
      notificationQueueShellKind === 'incoming' &&
      (incomingCardDisplayBan || incomingShellHydrating) &&
      (incomingCardFullyReady || incomingShellHydrating)
    ) {
      return true;
    }
    if (notificationQueueShellKind === 'result' && displayResult) return true;
    if (notificationQueueShellKind === 'check' && checkBan?.id) return true;
    return false;
  }, [
    chainAdvancePlaceholderKind,
    chainAdvanceWaiting,
    checkBan?.id,
    checkOverlayMounted,
    composeBlocksNotificationHost,
    displayResult,
    heldUserCardOverlay,
    incomingCardDisplayBan,
    incomingCardFullyReady,
    incomingShellHydrating,
    notificationQueueShellKind,
    sendSuccessCardActive,
    showCheckOverlayDirect,
    showDirectOverboardLayer,
    showReplyIncomingOverlayDirect,
  ]);

  const notificationSessionActive =
    notificationOverlayMounted &&
    !priorityBlocksResult &&
    !notificationShellSuppressedForBansLobby &&
    !(replyIncomingDirectPath && replyDeepLinkBanId != null) &&
    !(checkDeeplinkDirectPath && checkDeepLinkBanId != null) &&
    !(
      overlayQueue.length === 0 &&
      pendingStartupInteractionsCount === 0 &&
      !chainAdvanceWaiting &&
      !notificationChainTransitioning &&
      !heldUserCardOverlay &&
      !showDirectOverboardLayer &&
      !overboardTransitionActive &&
      (replyParentActivePriorityActive || activeBanCardReady)
    );

  notificationSessionActiveForDebugRef.current = notificationSessionActive;

  const lobbyBansNeedAttention =
    pendingStartupInteractionsCount > 0 ||
    overlayQueue.length > 0 ||
    lobbyBansAttentionHint > 0;

  const replyIncomingOverlayBlockReason = useMemo(() => {
    if (!replyIncomingDirectPath) return 'not-reply-route';
    if (!(auth.user?.id ?? userIdRef.current)) return 'no-viewer';
    if (auth.loading && !replyDirectOverlayBan) return 'auth-not-ready';
    if (showDirectOverboardLayer) return 'direct-overboard-active';
    if (!replyDirectOverlayBan) {
      const probe =
        replyIncomingDisplayBanRef.current ??
        incomingBanRef.current ??
        incomingBan ??
        scopedIncomingBan;
      return getIncomingCardNotReadyReason(probe, auth.user?.id ?? null);
    }
    if (!(auth.user?.id ?? userIdRef.current)) return 'no-viewer';
    if (!showReplyIncomingOverlayDirect) return 'overlay-gate-false';
    return 'ok';
  }, [
    replyIncomingDirectPath,
    auth.user?.id,
    auth.loading,
    showDirectOverboardLayer,
    incomingCardDisplayBan,
    replyDirectOverlayBan,
    showReplyIncomingOverlayDirect,
    incomingBan,
    scopedIncomingBan,
  ]);

  useEffect(() => {
    const viewerId = auth.user?.id ?? null;
    const probeBan =
      replyIncomingDisplayBanRef.current ??
      incomingBan ??
      scopedIncomingBan ??
      incomingBanRef.current ??
      null;
    logIncomingCardDisplayState(incomingCardDisplayBan, probeBan, viewerId);
    updateIncomingDirectDebug({
      routeReply: replyIncomingDirectPath,
      displayBan: replyDirectOverlayBan != null,
      ready: incomingCardFullyReady,
      reason: replyIncomingOverlayBlockReason,
    });
  }, [
    incomingCardDisplayBan,
    incomingCardFullyReady,
    replyIncomingDirectPath,
    replyIncomingOverlayBlockReason,
    replyDirectOverlayBan,
    scopedIncomingBan,
    incomingBan,
    auth.user?.id,
  ]);

  const scopedCheckBan =
    checkGateActive || checkOverlayMounted ? checkBan : null;

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
      checkDeepLinkBanId ??
      replyDeepLinkBanId ??
      deepLinkReplyBan?.id ??
      deepLinkActiveBan?.id ??
      deepLinkRepeatBan?.id ??
      scopedCheckBan?.id ??
      scopedIncomingBan?.id ??
      result?.id ??
      null,
    [
      checkDeepLinkBanId,
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
      incomingCardFullyReady &&
      replyDeepLinkBanId != null &&
      incomingCardDisplayBan?.id === replyDeepLinkBanId,
    [incomingCardFullyReady, incomingCardDisplayBan?.id, replyDeepLinkBanId],
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

  const routeOverlayAboveBoot = useMemo(
    () =>
      shouldBootYieldToRouteOverlay({
        replyDeepLinkBanId,
        checkDeepLinkBanId,
        replyDeeplinkFastShell,
        deepLinkReplyBooting,
        replyHandoffLock,
        replyUiShellActive,
        activeBanDeepLinkBanId,
        activeBanUiShellActive,
        incomingGateActive,
        checkGateActive,
        incomingCardFullyReady,
        incomingCardDisplayBan,
      activeIncomingOverlayBan,
        checkBan: scopedCheckBan,
        displayResult,
        activeBanCardReady,
        showReplyIncomingOverlayDirect,
        replyComposeActive,
      }),
    [
      replyDeepLinkBanId,
      checkDeepLinkBanId,
      replyDeeplinkFastShell,
      deepLinkReplyBooting,
      replyHandoffLock,
      replyUiShellActive,
      activeBanDeepLinkBanId,
      activeBanUiShellActive,
      incomingGateActive,
      checkGateActive,
      incomingCardFullyReady,
      incomingCardDisplayBan,
      activeIncomingOverlayBan,
      scopedCheckBan,
      displayResult,
      activeBanCardReady,
      showReplyIncomingOverlayDirect,
      replyComposeActive,
    ],
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

  useLayoutEffect(() => {
    registerSuccessExitDebugSnapshot(() => ({
      banId: sendSuccessCardBanIdRef.current,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      notificationSessionActive: notificationSessionActiveForDebugRef.current,
      hasPendingNotificationChain: hasPendingNotificationChainFnRef.current(),
      latch: bansReturnToLobbyLatchRef.current,
      successExitDraining: false,
    }));
    return () => registerSuccessExitDebugSnapshot(null);
  }, []);

  useEffect(() => {
    if (!auth.user?.id) return;
    if (isPostSuccessHandoffInProgress()) return;
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
      sendSuccessCardActive ||
      isPostSuccessHandoffInProgress() ||
      notificationChainTransitioning ||
      incomingGateActive ||
      checkGateActive ||
      checkDeeplinkDirectPending ||
      shouldBlockLobbyOpenForQueuedNotifications({
        chainTransitioning: notificationChainTransitioning,
        hasMountedOverlay: false,
        startupHold: startupInteractionsHoldRef.current,
        pendingLen: pendingStartupInteractionsRef.current.length,
        queueLen: overlayQueueRef.current.length,
      }) ||
      result
    ) {
      return;
    }
    console.log('[chain-debug-session-ended]', {
      source: 'providers-auto-lobby-effect',
      ...getNotificationChainDebugSnapshot(),
    });
    openLobby('providers-auto-lobby-effect');
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
    sendSuccessCardActive,
    notificationChainTransitioning,
    incomingGateActive,
    checkGateActive,
    checkDeeplinkDirectPending,
    getNotificationChainDebugSnapshot,
    openLobby,
    result,
  ]);

  useEffect(() => {
    if (!deepLinkReplyBooting || !replyIncomingReady) return;
    setDeepLinkReplyBooting(false);
  }, [deepLinkReplyBooting, replyIncomingReady]);

  useLayoutEffect(() => {
    const banId = replyDirectOverlayBan?.id ?? replyDeepLinkBanId ?? null;
    if (!showReplyIncomingOverlayDirect || !banId) {
      delete document.documentElement.dataset.replyIncomingDirect;
      return;
    }
    document.documentElement.dataset.replyIncomingDirect = banId;
    logReplyCardTopLayerOk({ banId, source: 'reply-direct-overlay-visible' });
    clearStartupBlockingLayersForIncomingCard(
      banId,
      'reply-direct-overlay-visible',
    );
    return () => {
      delete document.documentElement.dataset.replyIncomingDirect;
    };
  }, [
    clearStartupBlockingLayersForIncomingCard,
    replyDeepLinkBanId,
    replyDirectOverlayBan?.id,
    showReplyIncomingOverlayDirect,
  ]);

  useLayoutEffect(() => {
    const banId = checkBan?.id ?? checkDeepLinkBanId ?? null;
    if (!showCheckOverlayDirect || !banId) {
      delete document.documentElement.dataset.checkDirect;
      return;
    }
    document.documentElement.dataset.checkDirect = banId;
    logCheckCardTopLayerOk({ banId, source: 'check-direct-overlay-visible' });
    clearStartupBlockingLayersForCheckCard(
      banId,
      'check-direct-overlay-visible',
    );
    return () => {
      delete document.documentElement.dataset.checkDirect;
    };
  }, [
    checkBan?.id,
    checkDeepLinkBanId,
    clearStartupBlockingLayersForCheckCard,
    showCheckOverlayDirect,
  ]);

  const incomingJsxRenderSource =
    isReplyFastShellRequested || isReplyFastPendingOpen
      ? 'reply-fast-shell-fallback'
      : shouldRenderIncomingOverlay
        ? 'normal'
        : null;

  const queueShellShowsResult =
    effectiveNotificationQueueShellKind === 'result' &&
    activeResultPayload != null &&
    checkResultShellDisplayReady(
      activeResultPayload,
      'queueShellShowsResult',
    ) &&
    isQueueResultShellVisibleContentReady(activeResultPayload);

  const renderableResultShell =
    effectiveNotificationQueueShellKind === 'result' &&
    queueShellShowsResult &&
    activeResultPayload != null;

  const isCheckAnswerWaitingResultPath =
    Boolean(checkAnswerWaitingResultHoldBanId) ||
    checkAnswerPendingResultShowRef.current.size > 0 ||
    (chainAdvanceWaiting && checkAnswerInFlightRef.current.size > 0);

  const resultShellKindBlockedUntilChild =
    effectiveNotificationQueueShellKind === 'result' && !renderableResultShell;

  const resultShellBlockedWithoutChild =
    resultShellKindBlockedUntilChild && isCheckAnswerWaitingResultPath;

  const notificationQueueShellDisplayKind = renderableResultShell
    ? ('result' as const)
    : effectiveNotificationQueueShellKind === 'result'
      ? checkAnswerWaitingResultHoldBanId
        ? ('check' as const)
        : notificationQueueShellKind === 'result'
          ? ('check' as const)
          : notificationQueueShellKind
      : effectiveNotificationQueueShellKind;

  const checkShellBanId =
    checkBan?.id?.trim() || checkBanRef.current?.id?.trim() || '';
  const checkShellKindWithoutBan =
    notificationQueueShellDisplayKind === 'check' && !checkShellBanId;
  const notificationQueueShellAdvanceWaiting = queueShellShowsResult
    ? false
    : chainAdvanceWaiting ||
      incomingShellHydrating ||
      (checkShellKindWithoutBan && isCheckAnswerWaitingResultPath);

  useLayoutEffect(() => {
    const queueHead =
      overlayQueue[0] ?? overlayQueueRef.current[0] ?? null;
    const queueHeadBanId =
      queueHead?.kind === 'result'
        ? queueHead.result.id
        : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
          ? queueHead.ban.id
          : null;
    if (resultShellKindBlockedUntilChild) {
      logResultShellKindBlockedUntilChild({
        effectiveKind: effectiveNotificationQueueShellKind,
        displayKind: notificationQueueShellDisplayKind,
        queueShellShowsResult,
        hasActiveResultPayload: Boolean(activeResultPayload),
        activeResultPayloadBanId: activeResultPayload?.id ?? null,
        queueHeadKind: queueHead?.kind ?? null,
        queueHeadBanId,
        chainAdvanceWaiting,
        checkAnswerWaitingResultHoldBanId,
        isCheckAnswerWaitingResultPath,
      });
    }
    if (resultShellBlockedWithoutChild) {
      logResultShellWaitingChildBlocked({
        effectiveKind: effectiveNotificationQueueShellKind,
        queueShellShowsResult,
        hasActiveResultPayload: Boolean(activeResultPayload),
        queueHeadKind: queueHead?.kind ?? null,
        queueHeadBanId,
        chainAdvanceWaiting,
        checkAnswerWaitingResultHoldBanId,
        reason: 'result-shell-without-child',
      });
    }
    if (queueShellShowsResult && activeResultPayload) {
      logResultShellReleasedWithChild({
        effectiveKind: effectiveNotificationQueueShellKind,
        displayKind: notificationQueueShellDisplayKind,
        queueShellShowsResult,
        activeResultPayloadBanId: activeResultPayload.id,
        queueHeadKind: queueHead?.kind ?? null,
        queueHeadBanId,
        chainAdvanceWaiting,
        checkAnswerWaitingResultHoldBanId,
      });
    }
    logResultPayloadSelectionTrace({
      phase: 'queueShellShowsResult-eval',
      checkCardBanId: checkBanRef.current?.id ?? checkBan?.id ?? null,
      freshPollPriorityBanId:
        [...resultPriorityBanIdsRef.current].at(-1) ?? null,
      resultRefBanId: resultRef.current?.id ?? null,
      displayResultBanId: displayResult?.id ?? null,
      activeResultPayloadBanId: activeResultPayload?.id ?? null,
      heldUserCardOverlayRefBanId: heldUserCardOverlayRef.current
        ? heldUserCardBanId(heldUserCardOverlayRef.current)
        : null,
      queueHeadKind: queueHead?.kind ?? null,
      queueHeadBanId,
      effectiveNotificationQueueShellKind,
      notificationQueueShellKind,
      queueShellShowsResult,
      queueShellBlockedBecause: queueShellShowsResult
        ? null
        : effectiveNotificationQueueShellKind !== 'result'
          ? `effectiveKind-${effectiveNotificationQueueShellKind ?? 'null'}`
          : !activeResultPayload
            ? 'activeResultPayload-null'
            : !checkResultShellDisplayReady(
                  activeResultPayload,
                  'queueShellShowsResult-trace',
                )
              ? 'display-ready-false'
              : !isQueueResultShellVisibleContentReady(activeResultPayload)
                ? 'visible-content-not-ready'
                : 'unknown',
    });
  }, [
    activeResultPayload,
    checkAnswerWaitingResultHoldBanId,
    checkBan?.id,
    chainAdvanceWaiting,
    checkResultShellDisplayReady,
    displayResult?.id,
    effectiveNotificationQueueShellKind,
    isQueueResultShellVisibleContentReady,
    notificationQueueShellDisplayKind,
    notificationQueueShellKind,
    overlayQueue,
    queueShellShowsResult,
    resultShellBlockedWithoutChild,
    resultShellKindBlockedUntilChild,
  ]);

  const incomingJsxWillRender =
    !queueShellShowsResult &&
    !composeBlocksNotificationHost &&
    !showDirectOverboardLayer &&
    !replyComposeActive &&
    (incomingCardDisplayBan != null || stableIncomingOverlayBan?.id) &&
    (showReplyIncomingOverlayDirect ||
      stableIncomingOverlayBan?.id ||
      (notificationQueueShellKind === 'incoming' &&
        !replyIncomingDirectPath));

  const notificationOverlayVisible = useMemo(() => {
    if (composeBlocksNotificationHost) return false;
    if (checkAnswerWaitingResultHoldBanId) return true;
    if (stableIncomingOverlayBan?.id) return true;
    if (sendSuccessCardActive) return false;

    const replyParentTimerOwnsTop =
      replyParentActivePriorityActive &&
      !showDirectOverboardLayer &&
      !checkOverlayMounted &&
      heldUserCardOverlay == null;

    if (replyParentTimerOwnsTop) {
      logEmptyOverlayHostBlockedState({
        reason: 'reply-parent-active-timer-owns-top',
        queueLen: overlayQueue.length,
        startupLen: pendingStartupInteractionsCount,
        shellKind: notificationQueueShellKind,
        chainAdvanceWaiting,
        notificationChainTransitioning,
      });
      return false;
    }

    const queueEmpty =
      overlayQueue.length === 0 && pendingStartupInteractionsCount === 0;
    const timerCardOwnsNotificationTop =
      activeBanCardReady &&
      !chainAdvanceWaiting &&
      heldUserCardOverlay == null &&
      !checkOverlayMounted &&
      !showDirectOverboardLayer &&
      notificationQueueShellKind == null;

    if (timerCardOwnsNotificationTop) {
      logEmptyOverlayHostBlockedState({
        reason: queueEmpty
          ? 'timer-card-top-empty-queue'
          : 'timer-card-top-pending-queue',
        activeBanCardReady,
        queueLen: overlayQueue.length,
        startupLen: pendingStartupInteractionsCount,
      });
      return false;
    }

    if (heldUserCardOverlay != null) return true;
    // Reply deeplink renders IncomingBanOverlay outside GlobalOverlayHost — empty host + session backdrop would sit on top.
    if (showReplyIncomingOverlayDirect && replyDirectOverlayBan != null) {
      return false;
    }
    if (showCheckOverlayDirect && checkBan?.id) {
      return false;
    }
    if (chainAdvanceWaiting) return true;
    if (notificationChainTransitioning) {
      if (replyParentActivePriorityActive && heldUserCardOverlay == null) {
        logEmptyOverlayHostBlockedState({
          reason: 'reply-parent-timer-blocks-chain-transition-overlay',
          queueLen: overlayQueue.length,
        });
        return false;
      }
      const hasRenderableCard =
        stableIncomingOverlayBan?.id != null ||
        heldUserCardOverlay != null ||
        showDirectOverboardLayer ||
        checkOverlayMounted ||
        incomingShellHydrating ||
        (notificationQueueShellKind === 'check' && !!checkBan?.id) ||
        (notificationQueueShellKind === 'result' && !!displayResult) ||
        (notificationQueueShellKind === 'incoming' &&
          !!incomingCardDisplayBan &&
          incomingCardFullyReady);
      if (!hasRenderableCard) {
        if (startupInteractionsHoldRef.current) {
          logLobbyIndicatorOpenedEmptyHostBug({
            reason: 'chain-transitioning-without-card-startup-hold',
            queueLen: overlayQueue.length,
            pendingLen: pendingStartupInteractionsCount,
            shellKind: notificationQueueShellKind,
          });
        } else {
          logResultPollOpenedEmptyHostBug({
            reason: 'chain-transitioning-without-renderable-card',
            queueLen: overlayQueue.length,
            pendingLen: pendingStartupInteractionsCount,
            shellKind: notificationQueueShellKind,
          });
          if (
            whatOrConfirmActiveRef.current ||
            sendComposePhaseRef.current === 'composingBan' ||
            sendComposePhaseRef.current === 'confirming'
          ) {
            logConfirmOrbAfterResultPoll({
              source: 'resultPollOpenedEmptyHostBug',
              reason: 'chain-transitioning-without-renderable-card',
              ...buildResultPollComposeFields(),
            });
          }
        }
        logEmptyOverlayHostBlockedState({
          reason: 'chain-transitioning-without-renderable-card',
          queueLen: overlayQueue.length,
          pendingLen: pendingStartupInteractionsCount,
          shellKind: notificationQueueShellKind,
          notificationChainTransitioning,
          activeOverlayKind: displayActiveOverlayKind ?? activeOverlayKind,
          hasRenderableOverlay: hasRenderableCard,
          lobbyOpen: lobbyOpenRef.current,
          emptyOverlayHostBlocked: true,
        });
        return false;
      }
      return true;
    }
    if (showDirectOverboardLayer) return true;
    if (checkOverlayMounted) return true;
    if (notificationQueueShellKind === 'check' && checkBan?.id) return true;
    if (notificationQueueShellKind === 'result' && displayResult) return true;
    if (
      notificationQueueShellKind === 'incoming' &&
      (incomingCardDisplayBan || incomingShellHydrating) &&
      (incomingCardFullyReady || incomingShellHydrating)
    ) {
      return true;
    }
    return false;
  }, [
    activeBanCardReady,
    checkAnswerWaitingResultHoldBanId,
    stableIncomingOverlayBan?.id,
    chainAdvanceWaiting,
    checkBan?.id,
    checkOverlayMounted,
    composeBlocksNotificationHost,
    displayResult,
    heldUserCardOverlay,
    incomingCardDisplayBan,
    incomingCardFullyReady,
    incomingShellHydrating,
    notificationQueueShellKind,
    overlayQueue.length,
    pendingStartupInteractionsCount,
    replyDirectOverlayBan,
    replyParentActivePriorityActive,
    sendSuccessCardActive,
    notificationChainTransitioning,
    showDirectOverboardLayer,
    showReplyIncomingOverlayDirect,
    showCheckOverlayDirect,
  ]);

  useLayoutEffect(() => {
    if (!chainAdvanceWaiting && !notificationChainTransitioning) return;
    const head = overlayQueueRef.current[0];
    const hasRenderableCard =
      Boolean(checkBan?.id) ||
      Boolean(incomingCardDisplayBan?.id) ||
      Boolean(displayResult?.id) ||
      Boolean(stableIncomingOverlayBan?.id);
    const shouldShowPlaceholder =
      chainAdvanceWaiting &&
      !queueShellShowsResult &&
      effectiveNotificationQueueShellKind != null;
    logEmptyOverlayShellDiag({
      source: 'chain-transition-active',
      notificationOverlayVisible,
      chainAdvanceWaiting,
      notificationChainTransitioning,
      activeKind: activeOverlayKind,
      heldKind: heldUserCardOverlay?.kind ?? null,
      shellKind: notificationQueueShellKind,
      effectiveKind: effectiveNotificationQueueShellKind,
      checkBanId: checkBan?.id ?? null,
      incomingBanId: incomingCardDisplayBan?.id ?? incomingBan?.id ?? null,
      resultBanId: result?.id ?? resultRef.current?.id ?? null,
      displayResultId: displayResult?.id ?? null,
      queueLen: overlayQueue.length,
      pendingLen: pendingStartupInteractionsCount,
      hasRenderableCard,
      hasPlaceholder: shouldShowPlaceholder,
      queueShellShowsResult,
      chainAdvancePlaceholderKind,
    });
    logCheckTransitionPlaceholderDecision({
      source: 'chain-transition-active',
      chainAdvanceWaiting,
      notificationChainTransitioning,
      shouldShowPlaceholder,
      reason: queueShellShowsResult
        ? 'queueShellShowsResult-blocks-advanceWaiting'
        : !chainAdvanceWaiting
          ? 'chainAdvanceWaiting-false'
          : effectiveNotificationQueueShellKind == null
            ? 'shellKind-null'
            : 'placeholder-eligible',
    });
    if (effectiveNotificationQueueShellKind === 'result') {
      const payload = activeResultPayload;
      logResultShellWithoutPayload({
        source: 'chain-transition-active',
        shellKind: notificationQueueShellKind,
        effectiveKind: effectiveNotificationQueueShellKind,
        resultId: result?.id ?? resultRef.current?.id ?? null,
        displayResultId: displayResult?.id ?? null,
        heldResultId:
          heldUserCardOverlay?.kind === 'result'
            ? heldUserCardOverlay.result.id
            : null,
        queueHeadKind: head?.kind ?? null,
        queueHeadBanId:
          head?.kind === 'result'
            ? head.result.id
            : head?.kind === 'incoming' || head?.kind === 'check'
              ? head.ban.id
              : null,
        hasTitle: Boolean(
          payload?.headline?.trim() || payload?.outcome?.trim(),
        ),
        hasBody: Boolean(payload?.text?.trim()),
        outcome: payload?.outcome ?? null,
        status:
          (payload as { status?: string | null } | null)?.status ?? null,
        queueShellShowsResult,
      });
    }
  }, [
    activeOverlayKind,
    activeResultPayload,
    chainAdvancePlaceholderKind,
    chainAdvanceWaiting,
    checkBan?.id,
    displayResult?.id,
    effectiveNotificationQueueShellKind,
    heldUserCardOverlay,
    incomingBan?.id,
    incomingCardDisplayBan?.id,
    notificationChainTransitioning,
    notificationOverlayVisible,
    notificationQueueShellKind,
    overlayQueue.length,
    pendingStartupInteractionsCount,
    queueShellShowsResult,
    result?.id,
    stableIncomingOverlayBan?.id,
  ]);

  const shouldMountNotificationOverlayHost = useMemo(() => {
    if (composeBlocksNotificationHost) {
      return false;
    }
    if (checkAnswerWaitingResultHoldBanId) {
      return true;
    }
    if (
      replyParentActivePriorityActive &&
      !showDirectOverboardLayer &&
      heldUserCardOverlay == null
    ) {
      logEmptyOverlayHostBlockedState({
        reason: 'reply-parent-active-timer-no-host',
        queueLen: overlayQueue.length,
        shellKind: notificationQueueShellKind,
      });
      return false;
    }
    if (stableIncomingOverlayBan?.id) {
      return true;
    }
    if (!notificationOverlayVisible) return false;
    if (heldUserCardOverlay != null) return true;
    if (chainAdvanceWaiting) return true;
    if (checkOverlayMounted) return true;
    if (showDirectOverboardLayer) return true;
    if (notificationQueueShellKind === 'check' && checkBan?.id) return true;
    if (notificationQueueShellKind === 'result' && displayResult) return true;
    if (
      notificationQueueShellKind === 'incoming' &&
      (incomingCardDisplayBan || incomingShellHydrating) &&
      (incomingCardFullyReady || incomingShellHydrating)
    ) {
      return true;
    }
    if (notificationChainTransitioning) {
      logEmptyOverlayHostBlockedState({
        reason: 'transitioning-without-renderable-shell',
        shellKind: notificationQueueShellKind,
        queueLen: overlayQueue.length,
        pendingLen: pendingStartupInteractionsCount,
      });
      return false;
    }
        logEmptyOverlayHostBlockedState({
      reason: 'no-renderable-shell-content',
      shellKind: notificationQueueShellKind,
      queueLen: overlayQueue.length,
    });
    return false;
  }, [
    composeBlocksNotificationHost,
    checkAnswerWaitingResultHoldBanId,
    stableIncomingOverlayBan?.id,
    chainAdvanceWaiting,
    checkBan?.id,
    checkOverlayMounted,
    displayResult,
    heldUserCardOverlay,
    incomingCardDisplayBan,
    incomingCardFullyReady,
    incomingShellHydrating,
    notificationChainTransitioning,
    notificationOverlayVisible,
    notificationQueueShellKind,
    overlayQueue.length,
    pendingStartupInteractionsCount,
    replyParentActivePriorityActive,
    showDirectOverboardLayer,
  ]);

  const buildChainPlaceholderStuckSnapshot = useCallback((): Record<string, unknown> => {
    const queueHead = overlayQueueRef.current[0] ?? null;
    const pendingHead = pendingStartupInteractionsRef.current[0] ?? null;
    const held = heldUserCardOverlayRef.current;
    const activeKind =
      held?.kind ??
      (checkBanRef.current
        ? 'check'
        : incomingBanRef.current
          ? 'incoming'
          : resultRef.current
            ? 'result'
            : null);
    const activeBanId =
      (held ? heldUserCardBanId(held) : null) ??
      checkBanRef.current?.id ??
      incomingBanRef.current?.id ??
      resultRef.current?.id ??
      null;
    return {
      chainAdvanceWaiting: chainAdvanceWaitingRef.current,
      notificationChainTransitioning: notificationChainTransitioningRef.current,
      notificationQueueShellKind,
      effectiveNotificationQueueShellKind,
      queueLen: overlayQueueRef.current.length,
      pendingLen: pendingStartupInteractionsRef.current.length,
      activeKind,
      activeBanId,
      activeUserCardHoldKind: held?.kind ?? null,
      activeUserCardHoldBanId: held ? heldUserCardBanId(held) : null,
      checkAnswerWaitingResultHoldBanId:
        checkAnswerWaitingResultHoldBanIdRef.current,
      checkAnswerInFlightBanIds: [...checkAnswerInFlightRef.current],
      checkAnswerPendingResultShowIds: [
        ...checkAnswerPendingResultShowRef.current,
      ],
      overlayQueueHeadKind: queueHead?.kind ?? null,
      overlayQueueHeadBanId:
        queueHead?.kind === 'result'
          ? queueHead.result.id
          : queueHead?.kind === 'incoming' || queueHead?.kind === 'check'
            ? queueHead.ban.id
            : null,
      pendingStartupHeadKind: pendingHead?.kind ?? null,
      pendingStartupHeadBanId:
        pendingHead?.kind === 'result'
          ? pendingHead.result.id
          : pendingHead?.kind === 'incoming' || pendingHead?.kind === 'check'
            ? pendingHead.ban.id
            : null,
      shouldMountNotificationOverlayHost,
      shouldShowCheckOverlay: Boolean(checkBan?.id),
      shouldShowIncomingOverlay: shouldRenderIncomingOverlay,
      shouldShowResultOverlay: queueShellShowsResult,
      notificationQueueShellAdvanceWaiting,
      checkShellKindWithoutBan,
      isCheckAnswerWaitingResultPath,
      chainAdvancePlaceholderKind,
      checkAnswerDismissChainOwned: checkAnswerDismissChainOwnedRef.current,
    };
  }, [
    chainAdvancePlaceholderKind,
    checkBan?.id,
    checkShellKindWithoutBan,
    effectiveNotificationQueueShellKind,
    isCheckAnswerWaitingResultPath,
    notificationQueueShellAdvanceWaiting,
    notificationQueueShellKind,
    queueShellShowsResult,
    shouldMountNotificationOverlayHost,
    shouldRenderIncomingOverlay,
  ]);

  useLayoutEffect(() => {
    chainPlaceholderStuckSnapshotRef.current = buildChainPlaceholderStuckSnapshot;
    traceChainPlaceholderStuckRef.current = (
      phase,
      source,
      blockReason,
      extra,
    ) => {
      logChainPlaceholderStuckTrace({
        phase,
        source,
        blockReason: blockReason ?? null,
        ...buildChainPlaceholderStuckSnapshot(),
        ...extra,
      });
    };
  }, [buildChainPlaceholderStuckSnapshot]);

  const replyParentTimerOwnsTopLayer =
    replyParentActivePriorityActive &&
    !showDirectOverboardLayer &&
    heldUserCardOverlay == null;

  useLayoutEffect(() => {
    if (!replyParentTimerOwnsTopLayer) {
      delete document.documentElement.dataset.replyParentActivePriorityActive;
      return;
    }
    document.documentElement.dataset.replyParentActivePriorityActive = 'true';
    return () => {
      delete document.documentElement.dataset.replyParentActivePriorityActive;
    };
  }, [replyParentTimerOwnsTopLayer]);

  const checkOverlayInteractive = checkOverlayMounted;
  const notificationHostLayerActive =
    notificationOverlayVisible && !replyParentTimerOwnsTopLayer;
  const notificationHostPointerActive =
    notificationOverlayVisible && !replyParentTimerOwnsTopLayer;
  const notificationHostSessionBackdrop =
    !replyParentTimerOwnsTopLayer &&
    (notificationChainTransitioning ||
      (notificationOverlayVisible && notificationSessionActive));

  useLayoutEffect(() => {
    if (!notificationChainTransitioning) return;
    if (heldUserCardOverlay != null) return;
    if (chainAdvanceWaiting) return;
    const hasRenderableCard =
      showDirectOverboardLayer ||
      checkOverlayMounted ||
      stableIncomingOverlayBan?.id ||
      (notificationQueueShellKind === 'check' && !!checkBan?.id) ||
      (notificationQueueShellKind === 'result' && !!displayResult) ||
      (notificationQueueShellKind === 'incoming' &&
        !!incomingCardDisplayBan &&
        incomingCardFullyReady);
    if (hasRenderableCard) return;
    if (
      startupInteractionsHoldRef.current &&
      !chainAdvanceExplicitRef.current
    ) {
      logResultPollOpenedEmptyHostBug({
        reason: 'clear-stale-transitioning-startup-hold',
        queueLen: overlayQueueRef.current.length,
        pendingLen: pendingStartupInteractionsRef.current.length,
        shellKind: notificationQueueShellKind,
      });
      setNotificationChainTransitioning(false);
      return;
    }
    if (overlayQueueRef.current.length > 0 && !hasRenderableCard) {
      logResultPollOpenedEmptyHostBug({
        reason: 'clear-stale-transitioning-queued-without-card',
        queueLen: overlayQueueRef.current.length,
        shellKind: notificationQueueShellKind,
      });
      setNotificationChainTransitioning(false);
    }
  }, [
    chainAdvanceWaiting,
    checkBan?.id,
    checkOverlayMounted,
    displayResult,
    heldUserCardOverlay,
    incomingCardDisplayBan,
    incomingCardFullyReady,
    notificationChainTransitioning,
    notificationQueueShellKind,
    setNotificationChainTransitioning,
    showDirectOverboardLayer,
    stableIncomingOverlayBan?.id,
  ]);

  useLayoutEffect(() => {
    if (!notificationChainTransitioningRef.current) return;
    if (isActiveUserCardHold()) return;
    const head = overlayQueueRef.current[0];
    if (!head) {
      setNotificationChainTransitioning(false);
      return;
    }
    const headBanId =
      head.kind === 'result' ? head.result.id : head.ban.id;
    const mountedId =
      resultRef.current?.id ??
      activeIncomingOverlayBanRef.current?.id ??
      incomingBanRef.current?.id ??
      checkBanRef.current?.id ??
      null;
    if (mountedId === headBanId) {
      setNotificationChainTransitioning(false);
      if (chainAdvanceWaitingRef.current) {
        setChainAdvanceWaiting(false);
      }
    }
  }, [
    checkBan?.id,
    incomingBan?.id,
    notificationChainTransitioning,
    overlayQueue,
    result?.id,
    setChainAdvanceWaiting,
    setNotificationChainTransitioning,
    stableIncomingOverlayBan?.id,
  ]);

  useLayoutEffect(() => {
    console.log('[lobby-interactive-state]', {
      source: 'providers-host',
      notificationHostActive: notificationHostLayerActive,
      notificationPointerActive: notificationHostPointerActive,
      notificationOverlayVisible,
      shouldMountNotificationOverlayHost,
      successMounted: sendSuccessCardActiveRef.current,
      composeActive: whatOrConfirmActiveRef.current,
      sendComposeActive: sendComposeActiveRef.current,
      activeTimerMounted: isActiveTimerOverlayMounted(),
      queueLen: overlayQueue.length,
      startupLen: pendingStartupInteractionsRef.current.length,
    });
    if (notificationOverlayVisible) {
      console.log('[global-overlay-host-render]', {
        active: notificationHostPointerActive,
        pointerActive: notificationHostPointerActive,
        backdropActive: notificationHostSessionBackdrop,
        queueLen: overlayQueue.length,
        activeKind: notificationQueueShellKind,
        shouldMount: shouldMountNotificationOverlayHost,
      });
    } else if (
      overlayQueue.length > 0 ||
      pendingStartupInteractionsRef.current.length > 0
    ) {
      console.log('[queue-only-no-overlay]', { queueLen: overlayQueue.length });
      console.log('[global-overlay-host-suppressed]', {
        reason: 'lobby-idle',
        queueLen: overlayQueue.length,
        startupLen: pendingStartupInteractionsRef.current.length,
        activeKind: notificationQueueShellKind,
      });
    }
  }, [
    notificationHostLayerActive,
    notificationHostPointerActive,
    notificationHostSessionBackdrop,
    notificationOverlayVisible,
    notificationQueueShellKind,
    overlayQueue.length,
    shouldMountNotificationOverlayHost,
  ]);

  useLayoutEffect(() => {
    const queueLen = overlayQueue.length;
    if (
      replyParentActivePriorityActive &&
      queueLen === 0 &&
      pendingStartupInteractionsCount === 0 &&
      !notificationOverlayVisible &&
      !shouldMountNotificationOverlayHost
    ) {
      logSuccessExitTimerCardTopOk({
        activeBanCardReady,
        replyParentActive: true,
        queueLen,
      });
    }

    if (
      (notificationOverlayVisible || notificationHostSessionBackdrop) &&
      shouldMountNotificationOverlayHost === false &&
      notificationQueueShellKind == null &&
      !chainAdvanceWaiting &&
      heldUserCardOverlay == null &&
      queueLen === 0
    ) {
      logEmptyBackdropBug({
        notificationOverlayVisible,
        sessionBackdrop: notificationHostSessionBackdrop,
        shellKind: notificationQueueShellKind,
        queueLen,
        replyParentActive: replyParentActivePriorityActive,
      });
    }
  }, [
    activeBanCardReady,
    chainAdvanceWaiting,
    heldUserCardOverlay,
    notificationHostSessionBackdrop,
    notificationOverlayVisible,
    notificationQueueShellKind,
    overlayQueue.length,
    pendingStartupInteractionsCount,
    replyParentActivePriorityActive,
    shouldMountNotificationOverlayHost,
  ]);

  useLayoutEffect(() => {
    if (!checkOverlayMounted || !checkBan?.id) return;
    const host = document.querySelector('[data-notification-layer]');
    const hostStyle = host ? window.getComputedStyle(host) : null;
    console.log('[check-overlay-layer-debug]', {
      banId: checkBan.id,
      hostActive: notificationHostPointerActive,
      backdropActive: notificationHostSessionBackdrop,
      topLayer: 'GlobalOverlayHost',
      pointerEvents: hostStyle?.pointerEvents ?? null,
    });
  }, [
    activeBanCardReady,
    checkBan?.id,
    checkOverlayMounted,
    notificationHostPointerActive,
    notificationHostSessionBackdrop,
    replyParentActivePriorityActive,
  ]);

  const prevSendComposeActiveRef = useRef(false);
  useEffect(() => {
    const active = sendComposeActiveRef.current;
    const wasActive = prevSendComposeActiveRef.current;
    prevSendComposeActiveRef.current = active;
    if (wasActive && !active) {
      const queueLen = overlayQueueRef.current.length;
      const startupLen = pendingStartupInteractionsRef.current.length;
      if (queueLen > 0 || startupLen > 0) {
        console.log('[compose-exit-flush-queue]', { queueLen, startupLen });
        unlockNotificationQueueAndFlush('compose-exit');
      }
    }
  }, [sendComposePhase, replyComposeActive, unlockNotificationQueueAndFlush]);

  useLayoutEffect(() => {
    if (!notificationChainReplyComposePaused) return;
    console.log('[chain-reply-overlay-suppressed]', {
      parentBanId: chainReplyParentBanIdRef.current,
      notificationSessionActive,
      notificationHostLayerActive,
      notificationHostSessionBackdrop,
      queueLen: overlayQueue.length,
      overlayQueueHead: overlayQueue[0]
        ? overlayQueueItemId(overlayQueue[0])
        : null,
    });
  }, [
    notificationChainReplyComposePaused,
    notificationSessionActive,
    notificationHostLayerActive,
    notificationHostSessionBackdrop,
    overlayQueue,
  ]);

  useLayoutEffect(() => {
    if (queueShellShowsResult) {
      return;
    }
    const jsxBranch = {
      activeOverlayKind: effectiveIncomingOverlayDisplayKind,
      selectedBanId: effectiveIncomingBanId,
      queueHeadKind,
      willRender: incomingJsxWillRender,
      source: incomingJsxRenderSource,
      hasIncomingBan: incomingCardDisplayBan != null,
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
    if (showReplyIncomingOverlayDirect) {
      console.log('[notification-shell-debug] reply direct IncomingBanOverlay', {
        banId: incomingCardDisplayBan?.id ?? null,
      });
    }
    if (incomingJsxWillRender && (incomingCardDisplayBan?.id || stableIncomingOverlayBan?.id)) {
      const jsxBanId =
        stableIncomingOverlayBan?.id ?? incomingCardDisplayBan?.id ?? null;
      console.log('[INCOMING JSX RENDER CARD]', {
        banId: jsxBanId,
        source: incomingJsxRenderSource,
        replyDirect: showReplyIncomingOverlayDirect,
        stableBanId: stableIncomingOverlayBan?.id ?? null,
      });
      logIncomingOverlayJsxReturn({
        banId: jsxBanId,
        source: incomingJsxRenderSource,
        willRender: true,
        stableBanId: stableIncomingOverlayBan?.id ?? null,
      });
      markVisibleOverboardTrace('[INCOMING JSX RENDER CARD]', {
        banId: jsxBanId,
        source: incomingJsxRenderSource,
        stableBanId: stableIncomingOverlayBan?.id ?? null,
      });
      if (isDeepLinkRouteBootPending()) {
        releaseDeepLinkRouteBoot(
          'reply-card-ready',
          jsxBanId ?? undefined,
        );
      }
      return;
    }
    const nullReason = !effectiveShouldRenderIncoming
      ? 'incoming-overlay-not-requested'
      : showDirectOverboardLayer
        ? 'direct-overboard-active'
        : effectiveIncomingOverlayDisplayKind !== 'incoming'
          ? 'display-kind-not-incoming'
          : !incomingCardDisplayBan
            ? 'incoming-card-not-ready'
            : 'unknown';
    logIncomingOverlayReturnNull({
      reason: nullReason,
      ...jsxBranch,
      incomingBanId: incomingBan?.id ?? null,
      incomingBanRefId: incomingBanRef.current?.id ?? null,
      heldUserCardKind: heldUserCardOverlay?.kind ?? null,
      heldUserCardBanId:
        heldUserCardOverlay?.kind === 'incoming'
          ? heldUserCardOverlay.ban.id
          : heldUserCardOverlay?.kind === 'check'
            ? heldUserCardOverlay.ban.id
            : heldUserCardOverlay?.kind === 'result'
              ? heldUserCardOverlay.result.id
              : null,
      notificationQueueShellKind,
      shouldMountNotificationOverlayHost,
      notificationOverlayVisible,
      sendSuccessCardActive,
    });
    console.log('[INCOMING JSX RETURN NULL]', { reason: nullReason, ...jsxBranch });
    markVisibleOverboardTrace('[INCOMING JSX RETURN NULL]', {
      reason: nullReason,
      ...jsxBranch,
    });
  }, [
    effectiveIncomingBanId,
    effectiveIncomingOverlayDisplayKind,
    effectiveNotificationQueueShellKind,
    activeResultPayload,
    queueShellShowsResult,
    incomingBan,
    incomingCardDisplayBan,
    effectiveShouldRenderIncoming,
    heldUserCardOverlay,
    incomingJsxRenderSource,
    incomingJsxWillRender,
    isReplyFastPendingOpen,
    isReplyFastShellRequested,
    notificationOverlayVisible,
    notificationQueueShellKind,
    notificationSessionActive,
    queueHeadKind,
    sendSuccessCardActive,
    shouldMountNotificationOverlayHost,
    shouldRenderIncomingOverlay,
    showDirectOverboardLayer,
    showReplyIncomingOverlayDirect,
    stableIncomingOverlayBan?.id,
  ]);

  useLayoutEffect(() => {
    const readyBanId = peekLastIncomingPayloadReadyBanId();
    if (!readyBanId) return;
    const displayBanId =
      incomingCardDisplayBan?.id ?? stableIncomingOverlayBan?.id ?? null;
    if (displayBanId === readyBanId) {
      return;
    }
    logIncomingReadyButStableBanLostBug({
      readyBanId,
      incomingCardDisplayBanId: incomingCardDisplayBan?.id ?? null,
      activeIncomingOverlayBanId: stableIncomingOverlayBan?.id ?? null,
      incomingBanId: incomingBan?.id ?? null,
      incomingBanRefId: incomingBanRef.current?.id ?? null,
      notificationQueueShellKind,
      shouldMountNotificationOverlayHost,
      notificationOverlayVisible,
    });
    logIncomingReadyButBanLostBug({
      readyBanId,
      incomingCardDisplayBanId: incomingCardDisplayBan?.id ?? null,
      activeIncomingOverlayBanId: stableIncomingOverlayBan?.id ?? null,
      incomingBanId: incomingBan?.id ?? null,
      incomingBanRefId: incomingBanRef.current?.id ?? null,
      heldUserCardKind: heldUserCardOverlay?.kind ?? null,
      notificationQueueShellKind,
      shouldMountNotificationOverlayHost,
      notificationOverlayVisible,
      effectiveShouldRenderIncoming,
      incomingJsxWillRender,
      sendSuccessCardActive,
      notificationChainTransitioning,
    });
  }, [
    stableIncomingOverlayBan?.id,
    effectiveShouldRenderIncoming,
    heldUserCardOverlay,
    incomingBan,
    incomingCardDisplayBan,
    incomingJsxWillRender,
    notificationChainTransitioning,
    notificationOverlayVisible,
    notificationQueueShellKind,
    sendSuccessCardActive,
    shouldMountNotificationOverlayHost,
  ]);

  useLayoutEffect(() => {
    if (!isDeepLinkRouteBootPending()) return;
    if (!checkGateActive || !checkBan?.id) return;
    releaseDeepLinkRouteBoot('check-queued', checkBan.id);
  }, [checkGateActive, checkBan?.id]);

  useLayoutEffect(() => {
    if (!isDeepLinkRouteBootPending()) return;
    if (activeOverlayKind !== 'result' || !displayResult?.id) return;
    releaseDeepLinkRouteBoot('result-queued', displayResult.id);
  }, [activeOverlayKind, displayResult?.id]);

  const contextValue = useMemo<AppContextValue>(
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
      notificationOverlayMounted,
      lobbyBansNeedAttention,
      notificationChainTransitioning,
      setNotificationChainTransitioning,
      clearNotificationOverlayForEmptyQueueAfterSuccessExit,
      notificationOverlayVisible,
      activeOverlayKind: incomingOverlayDisplayKind,
    logCardCloseClick,
    markOverlayUserAction,
    reportOverlayRendered,
      overlayHandoffDebug,
      error: auth.error,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
      incomingBan: incomingCardDisplayBan,
      incomingCardDisplayBan,
      activeIncomingOverlayBan,
      incomingCardFullyReady,
      routeOverlayAboveBoot,
      checkDeepLinkBanId,
      checkOverlayMounted,
      checkDeeplinkDirectPending,
      setIncomingBan: setIncomingBanSafe,
      dismissIncoming,
      dismissIncomingSoft,
      checkBan: scopedCheckBan,
      checkGateActive,
      setCheckBan: setCheckBanSafe,
      openDeepLinkCheck,
      deepLinkRepeatBan,
      deepLinkRepeatGoToConfirm,
      openDeepLinkRepeat,
      clearDeepLinkRepeatBan,
      deepLinkInviteToBanInviter,
      openDeepLinkInviteToBan,
      clearDeepLinkInviteToBan,
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
      sendComposePhase,
      setComposeFlowState,
      registerResetSendUiForBansNavigation,
      clearStaleComposeStateBeforeBansNavigation,
      isWhatOrConfirmActive,
      isSendComposeActive,
      deepLinkReplyBooting,
      setDeepLinkReplyBooting: setDeepLinkReplyBootingGuarded,
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
      blockAutoDismissAtomicOverboardResult,
      blockAutoDismissTerminalFinalStatus,
      isQueueAtomicOverboardResultShowable,
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
      flushDeferredSync,
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
      lobbyDeeplinkToast,
      clearReplyDeepLinkState,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      openBansOverlayRequest,
      openBansOverlayTabRequest,
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
      hasPendingNotificationChain,
      armPostSuccessHandoffEarlyIfPending,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
      armActiveBanDeepLinkEarly,
      unlockNotificationQueueAndFlush,
      startLobbyBansNotificationDrain,
      drainNextNotificationAfterSuccess,
      resolveReplyParentActiveBanImmediate,
      ensureReplyParentActiveBanForSuccess,
      refreshReplyParentActiveBanInBackground,
      hasReplyParentActivePriorityPending,
      getReplyParentActiveBanId,
      fetchReplyParentActiveBanFallback,
      markReplyParentActivePriorityShown,
      isReplyParentActivePriorityActive,
      releaseNotificationQueueAfterReplyParentActive,
      getConfirmHoldDebugSnapshot,
      getConfirmOrbQueueDebugSnapshot,
      logPostSuccessQueueSnapshotBeforeRelease,
      logPostSuccessReleaseStartupResult,
      logQueueSourceComparisonSnapshot: logQueueSourceComparisonSnapshotContext,
      setSendSuccessCardMounted,
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
      notificationOverlayMounted,
      lobbyBansNeedAttention,
      notificationChainTransitioning,
      setNotificationChainTransitioning,
      clearNotificationOverlayForEmptyQueueAfterSuccessExit,
      notificationOverlayVisible,
      incomingOverlayDisplayKind,
    logCardCloseClick,
    markOverlayUserAction,
    reportOverlayRendered,
      overlayHandoffDebug,
      auth.error,
      auth.refreshUser,
      auth.onboard,
      scopedIncomingBan,
      effectiveScopedIncomingBan,
      incomingCardDisplayBan,
      activeIncomingOverlayBan,
      incomingCardFullyReady,
      routeOverlayAboveBoot,
      checkDeepLinkBanId,
      checkOverlayMounted,
      checkDeeplinkDirectPending,
      setIncomingBanSafe,
      dismissIncoming,
      dismissIncomingSoft,
      scopedCheckBan,
      checkGateActive,
      setCheckBanSafe,
      openDeepLinkCheck,
      deepLinkRepeatBan,
      deepLinkRepeatGoToConfirm,
      openDeepLinkRepeat,
      clearDeepLinkRepeatBan,
      deepLinkInviteToBanInviter,
      openDeepLinkInviteToBan,
      clearDeepLinkInviteToBan,
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
      sendComposePhase,
      setComposeFlowState,
      registerResetSendUiForBansNavigation,
      clearStaleComposeStateBeforeBansNavigation,
      isWhatOrConfirmActive,
      isSendComposeActive,
      deepLinkReplyBooting,
      setDeepLinkReplyBootingGuarded,
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
      blockAutoDismissAtomicOverboardResult,
      blockAutoDismissTerminalFinalStatus,
      isQueueAtomicOverboardResultShowable,
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
      flushDeferredSync,
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
      lobbyDeeplinkToast,
      clearReplyDeepLinkState,
      newBanWhoFlowRequest,
      openNewBanWhoFlow,
      openBansOverlayRequest,
      openBansOverlayTabRequest,
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
      hasPendingNotificationChain,
      armPostSuccessHandoffEarlyIfPending,
      releaseStartupInteractions,
      markSessionBanSendSuccess,
      armActiveBanDeepLinkEarly,
      unlockNotificationQueueAndFlush,
      startLobbyBansNotificationDrain,
      drainNextNotificationAfterSuccess,
      resolveReplyParentActiveBanImmediate,
      ensureReplyParentActiveBanForSuccess,
      refreshReplyParentActiveBanInBackground,
      hasReplyParentActivePriorityPending,
      getReplyParentActiveBanId,
      fetchReplyParentActiveBanFallback,
      markReplyParentActivePriorityShown,
      isReplyParentActivePriorityActive,
      releaseNotificationQueueAfterReplyParentActive,
      setSendSuccessCardMounted,
      getConfirmHoldDebugSnapshot,
      getConfirmOrbQueueDebugSnapshot,
      logPostSuccessQueueSnapshotBeforeRelease,
      logPostSuccessReleaseStartupResult,
      logQueueSourceComparisonSnapshotContext,
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
      <RouteOverlayBootPriorityMarker active={routeOverlayAboveBoot} />
      <ShellErrorBoundary name="app">
        {children}
        {!showDirectOverboardLayer ? (
          <>
            {showCheckOverlayDirect && checkBan ? (
              <ChallengeErrorBoundary
                name="check-deeplink-direct"
                onRecover={() => clearCheckOverlay()}
              >
                <CheckOverlay checkDirect />
              </ChallengeErrorBoundary>
            ) : null}
            {showReplyIncomingOverlayDirect && replyDirectOverlayBan ? (
              <ChallengeErrorBoundary
                name="incoming-reply-direct"
                onRecover={() => dismissIncoming()}
              >
                <IncomingBanOverlay
                  ban={replyDirectOverlayBan}
                  replyDirect
                />
              </ChallengeErrorBoundary>
            ) : null}
            {!composeBlocksNotificationHost && shouldMountNotificationOverlayHost ? (
            <GlobalOverlayHost
              active={notificationHostPointerActive}
              queueSessionActive={notificationHostSessionBackdrop}
              checkInteractive={checkOverlayMounted}
              activeOverlayKind={
                showReplyIncomingOverlayDirect
                  ? 'incoming'
                  : notificationQueueShellDisplayKind
              }
              activeIncomingBanId={
                showReplyIncomingOverlayDirect ||
                notificationQueueShellDisplayKind === 'incoming'
                  ? (stableIncomingOverlayBan?.id ??
                      incomingCardDisplayBan?.id ??
                      null)
                  : null
              }
            >
              <NotificationQueueShell
                kind={notificationQueueShellDisplayKind}
                shellContentReady={
                  renderableResultShell ? queueResultShellContentReady : undefined
                }
                renderTrace={{
                  effectiveNotificationQueueShellKind,
                  notificationQueueShellKind,
                  queueShellShowsResult,
                  activeResultPayloadBanId: activeResultPayload?.id ?? null,
                  chainAdvanceWaiting,
                  checkAnswerWaitingResultHoldBanId:
                    checkAnswerWaitingResultHoldBanId ?? null,
                  checkAnswerInFlight: [...checkAnswerInFlightRef.current],
                  checkAnswerInFlightContainsBanId: (() => {
                    const bid = normalizeId(
                      checkBanRef.current?.id ?? checkBan?.id ?? '',
                    );
                    return bid.length > 0
                      ? checkAnswerInFlightRef.current.has(bid)
                      : false;
                  })(),
                  activeUserCardHold:
                    heldUserCardOverlayRef.current &&
                    notificationChainAwaitingUserRef.current
                      ? heldUserCardOverlayRef.current.kind
                      : null,
                  heldKind: heldUserCardOverlayRef.current?.kind ?? null,
                  heldBanId: heldUserCardOverlayRef.current
                    ? heldUserCardBanId(heldUserCardOverlayRef.current)
                    : null,
                  checkBanId: checkBan?.id ?? checkBanRef.current?.id ?? null,
                  checkCardReady: Boolean(checkShellBanId),
                  checkShellKindWithoutBan,
                  notificationQueueShellAdvanceWaiting,
                  checkOverlayMounted,
                  shouldMountNotificationOverlayHost,
                  notificationOverlayVisible,
                  notificationHostSessionBackdrop,
                  incomingShellHydrating,
                  chainAdvancePlaceholderKind,
                  overlayQueueHeadKind: overlayQueue[0]?.kind ?? null,
                  overlayQueueHeadBanId:
                    overlayQueue[0]?.kind === 'result'
                      ? overlayQueue[0].result.id
                      : overlayQueue[0]?.kind === 'incoming' ||
                          overlayQueue[0]?.kind === 'check'
                        ? overlayQueue[0].ban.id
                        : null,
                  pendingStartupHeadKind:
                    pendingStartupInteractionsRef.current[0]?.kind ?? null,
                  pendingStartupHeadBanId: (() => {
                    const p = pendingStartupInteractionsRef.current[0];
                    if (!p) return null;
                    return p.kind === 'result'
                      ? p.result.id
                      : p.ban.id;
                  })(),
                  queueLen: overlayQueue.length,
                  pendingLen: pendingStartupInteractionsCount,
                  childrenBranch: queueShellShowsResult
                    ? 'result'
                    : notificationQueueShellDisplayKind === 'check'
                      ? checkShellBanId
                        ? 'check'
                        : 'check-without-ban'
                      : notificationQueueShellDisplayKind === 'incoming'
                        ? 'incoming'
                        : 'null',
                }}
                displayBanId={
                  queueShellShowsResult
                    ? activeResultPayload?.id ?? null
                    : notificationQueueShellDisplayKind === 'incoming'
                      ? (stableIncomingOverlayBan?.id ??
                          incomingCardDisplayBan?.id ??
                          null)
                      : null
                }
                incomingCardReady={
                  queueShellShowsResult
                    ? undefined
                    : incomingCardFullyReady || !!stableIncomingOverlayBan?.id
                }
                checkCardReady={
                  queueShellShowsResult
                    ? false
                    : Boolean(checkShellBanId)
                }
                sessionActive={notificationHostSessionBackdrop}
                advanceWaiting={notificationQueueShellAdvanceWaiting}
                contentKey={
                  queueShellShowsResult && activeResultPayload
                    ? `result:${activeResultPayload.id}`
                    : overlayQueue[0]
                      ? overlayQueueKey(overlayQueue[0])
                      : notificationQueueShellDisplayKind === 'incoming' &&
                          stableIncomingOverlayBan?.id
                        ? `incoming:${stableIncomingOverlayBan.id}`
                        : notificationQueueShellDisplayKind === 'incoming' &&
                            incomingCardDisplayBan?.id
                          ? `incoming:${incomingCardDisplayBan.id}`
                          : null
                }
              >
                {queueShellShowsResult && activeResultPayload ? (
                  <ChallengeErrorBoundary
                    name="result"
                    onRecover={() => dismissBanResult()}
                  >
                    <ResultOverlay
                      result={activeResultPayload}
                      onClose={dismissBanResult}
                      contentOnly
                    />
                  </ChallengeErrorBoundary>
                ) : notificationQueueShellDisplayKind === 'check' &&
                  !showCheckOverlayDirect &&
                  checkShellBanId ? (
                  <ChallengeErrorBoundary
                    name="check"
                    onRecover={() => clearCheckOverlay()}
                  >
                    <CheckOverlay contentOnly />
                  </ChallengeErrorBoundary>
                ) : notificationQueueShellDisplayKind === 'incoming' &&
                  (incomingCardDisplayBan ||
                    stableIncomingOverlayBan ||
                    incomingShellHydrating) ? (
                  incomingCardDisplayBan || stableIncomingOverlayBan ? (
                    <ChallengeErrorBoundary
                      name="incoming"
                      onRecover={() => dismissIncoming()}
                    >
                      <IncomingBanOverlay
                        contentOnly
                        ban={
                          stableIncomingOverlayBan ??
                          incomingCardDisplayBan ??
                          undefined
                        }
                      />
                    </ChallengeErrorBoundary>
                  ) : (
                    <div className="notification-queue-shell__advance-wait">
                      Загрузка запрета…
                    </div>
                  )
                ) : null}
              </NotificationQueueShell>
            </GlobalOverlayHost>
            ) : null}
          </>
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
