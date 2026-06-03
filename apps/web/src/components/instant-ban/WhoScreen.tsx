'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

const WHO_DISMISS_DISTANCE_PX = 140;
const WHO_DISMISS_THRESHOLD_PX = 64;
const WHO_DISMISS_THRESHOLD_PROGRESS = 0.4;
/** Downward flick on release (px/ms). */
const WHO_DISMISS_VELOCITY_THRESHOLD = 1.2;
const WHO_DISMISS_SNAP_MS = 160;
/** Exit to lobby after layer + dim finish animating. */
const WHO_DISMISS_EXIT_MS = 260;

function whoDismissDevLog(
  event: 'drag' | 'release' | 'complete-start' | 'on-dismiss-call',
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const tag =
    event === 'drag'
      ? 'who-dismiss-drag'
      : event === 'release'
        ? 'who-dismiss-release'
        : event === 'complete-start'
          ? 'who-dismiss-complete-start'
          : 'who-dismiss-on-dismiss-call';
  console.log(`[${tag}]`, data ?? {});
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type WhoOverlayProps = {
  title: string;
  friends: FriendCard[];
  onSelect: (friend: FriendCard) => void;
  onInviteMore: () => void;
  /** 0–1 while finger drags who layer (dims overlay/orb). */
  onDismissDragProgress: (progress: number) => void;
  onDismissExitStart: () => void;
  onDismissToLobby: () => void;
};

export function WhoOverlay({
  title,
  friends,
  onSelect,
  onInviteMore,
  onDismissDragProgress,
  onDismissExitStart,
  onDismissToLobby,
}: WhoOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(false);
  const dismissCompletingRef = useRef(false);
  const dismissZoneGestureRef = useRef(false);
  const isSnappingRef = useRef(false);
  const touchStartYRef = useRef(0);
  const lastMoveYRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const velocityYRef = useRef(0);
  const baseTranslateRef = useRef(0);
  const dismissTranslateRef = useRef(0);
  const maxTranslateYRef = useRef(0);
  const snapAnimRef = useRef<number | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeWhoDismissRef = useRef<() => void>(() => {});
  const [dismissTranslateY, setDismissTranslateY] = useState(0);
  const [snapTransition, setSnapTransition] = useState(false);
  const [dismissCompleting, setDismissCompleting] = useState(false);

  const readMaxScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return WHO_DISMISS_DISTANCE_PX;
    const max = el.scrollHeight - el.clientHeight;
    return max > 8 ? max : WHO_DISMISS_DISTANCE_PX;
  }, []);

  const progressFromTranslate = useCallback((translateY: number) => {
    return Math.min(1, Math.max(0, translateY / WHO_DISMISS_DISTANCE_PX));
  }, []);

  const progressFromScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return progressFromTranslate(dismissTranslateRef.current);
    const max = readMaxScroll();
    return Math.min(1, Math.max(0, 1 - el.scrollTop / max));
  }, [progressFromTranslate, readMaxScroll]);

  const lastDragLogAtRef = useRef(0);

  const publishDragProgress = useCallback(
    (translateY: number, logDrag = false) => {
      const progress = progressFromTranslate(translateY);
      onDismissDragProgress(progress);
      if (!logDrag) return;
      const now = performance.now();
      if (now - lastDragLogAtRef.current < 120) return;
      lastDragLogAtRef.current = now;
      whoDismissDevLog('drag', {
        translateY,
        progress,
        opacity: 1 - progress,
        dimOpacity: 1 - progress,
      });
    },
    [onDismissDragProgress, progressFromTranslate],
  );

  const applyTranslate = useCallback(
    (translateY: number, trackPeak = false, logDrag = false) => {
      const y = Math.min(
        WHO_DISMISS_DISTANCE_PX,
        Math.max(0, translateY),
      );

      dismissTranslateRef.current = y;
      if (trackPeak) {
        maxTranslateYRef.current = Math.max(maxTranslateYRef.current, y);
      }
      setDismissTranslateY(y);
      publishDragProgress(y, logDrag);
    },
    [publishDragProgress],
  );

  const resetGestureMetrics = useCallback(() => {
    dismissTranslateRef.current = 0;
    maxTranslateYRef.current = 0;
    velocityYRef.current = 0;
    setDismissTranslateY(0);
    onDismissDragProgress(0);
  }, [onDismissDragProgress]);

  const scrollToRest = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = readMaxScroll();
    }
    resetGestureMetrics();
  }, [readMaxScroll, resetGestureMetrics]);

  const clearSnapAnim = useCallback(() => {
    if (snapAnimRef.current != null) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }
  }, []);

  const clearCompleteTimer = useCallback(() => {
    if (completeTimerRef.current) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    commitRef.current = false;
    dismissCompletingRef.current = false;
    dismissZoneGestureRef.current = false;
    isSnappingRef.current = false;
    setSnapTransition(false);
    setDismissCompleting(false);
    clearCompleteTimer();
    resetGestureMetrics();
    scrollToRest();
  }, [clearCompleteTimer, readMaxScroll, resetGestureMetrics, scrollToRest, title]);

  useEffect(() => {
    return () => {
      clearSnapAnim();
      clearCompleteTimer();
    };
  }, [clearSnapAnim, clearCompleteTimer]);

  const animateTranslatePx = useCallback(
    (targetPx: number, onComplete?: () => void) => {
      clearSnapAnim();
      isSnappingRef.current = true;
      setSnapTransition(true);
      const start = dismissTranslateRef.current;
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / WHO_DISMISS_SNAP_MS);
        const eased = easeOutCubic(t);
        const y = start + (targetPx - start) * eased;
        dismissTranslateRef.current = y;
        setDismissTranslateY(y);
        publishDragProgress(y);

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(tick);
          return;
        }

        snapAnimRef.current = null;
        isSnappingRef.current = false;
        dismissTranslateRef.current = targetPx;
        setDismissTranslateY(targetPx);
        onComplete?.();
      };

      snapAnimRef.current = requestAnimationFrame(tick);
    },
    [clearSnapAnim, publishDragProgress],
  );

  const shouldCompleteOnRelease = useCallback(
    (translateY: number, velocityY: number) => {
      const progress = progressFromTranslate(translateY);
      return (
        translateY >= WHO_DISMISS_THRESHOLD_PX ||
        progress >= WHO_DISMISS_THRESHOLD_PROGRESS ||
        velocityY >= WHO_DISMISS_VELOCITY_THRESHOLD
      );
    },
    [progressFromTranslate],
  );

  const snapBack = useCallback(() => {
    if (dismissCompletingRef.current || commitRef.current) return;
    animateTranslatePx(0, () => {
      setSnapTransition(false);
      scrollToRest();
    });
  }, [animateTranslatePx, scrollToRest]);

  const completeWhoDismiss = useCallback(() => {
    if (dismissCompletingRef.current || commitRef.current) return;
    dismissCompletingRef.current = true;
    commitRef.current = true;
    dismissZoneGestureRef.current = false;
    setSnapTransition(false);
    setDismissCompleting(true);

    whoDismissDevLog('complete-start', {
      translateY: dismissTranslateRef.current,
      exitMs: WHO_DISMISS_EXIT_MS,
    });

    onDismissExitStart();

    clearCompleteTimer();
    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      whoDismissDevLog('on-dismiss-call', {});
      onDismissToLobby();
    }, WHO_DISMISS_EXIT_MS);
  }, [clearCompleteTimer, onDismissExitStart, onDismissToLobby]);

  useEffect(() => {
    completeWhoDismissRef.current = completeWhoDismiss;
  }, [completeWhoDismiss]);

  const onGestureEnd = useCallback(() => {
    dismissZoneGestureRef.current = false;

    if (dismissCompletingRef.current || commitRef.current) {
      return;
    }

    const translateY = dismissTranslateRef.current;
    const peakY = maxTranslateYRef.current;
    const velocityY = velocityYRef.current;
    const progress = progressFromTranslate(translateY);
    const complete = shouldCompleteOnRelease(translateY, velocityY);

    whoDismissDevLog('release', {
      translateY,
      maxTranslateY: peakY,
      velocityY: Number(velocityY.toFixed(2)),
      progress,
      decision: complete ? 'complete' : 'snap-back',
    });

    velocityYRef.current = 0;

    if (complete) {
      completeWhoDismissRef.current();
      return;
    }

    if (translateY > 6) {
      snapBack();
    } else {
      scrollToRest();
    }
  }, [progressFromTranslate, shouldCompleteOnRelease, snapBack, scrollToRest]);

  const onScroll = useCallback(() => {
    if (
      dismissCompletingRef.current ||
      commitRef.current ||
      isSnappingRef.current ||
      !dismissZoneGestureRef.current
    ) {
      return;
    }

    const fromScroll = progressFromScroll() * WHO_DISMISS_DISTANCE_PX;
    const merged = Math.max(dismissTranslateRef.current, fromScroll);
    applyTranslate(merged, true);
  }, [applyTranslate, progressFromScroll]);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    dismissZoneGestureRef.current = true;
    touchStartYRef.current = touch.clientY;
    baseTranslateRef.current = dismissTranslateRef.current;
    maxTranslateYRef.current = Math.max(
      maxTranslateYRef.current,
      dismissTranslateRef.current,
    );
    whoDismissDevLog('start', { source: 'touch', y: touch.clientY });
  }, []);

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (
        !dismissZoneGestureRef.current ||
        dismissCompletingRef.current ||
        commitRef.current
      ) {
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const dy = touch.clientY - touchStartYRef.current;
      if (dy <= 0) return;

      const now = performance.now();
      const dt = now - lastMoveTimeRef.current;
      if (dt > 0) {
        velocityYRef.current =
          (touch.clientY - lastMoveYRef.current) / dt;
      }
      lastMoveYRef.current = touch.clientY;
      lastMoveTimeRef.current = now;

      const nextY = Math.min(
        WHO_DISMISS_DISTANCE_PX,
        baseTranslateRef.current + dy,
      );
      applyTranslate(nextY, true, true);
    },
    [applyTranslate],
  );

  const sceneStyle = {
    '--who-dismiss-translate-y': String(dismissTranslateY),
    '--who-dismiss-progress': String(
      progressFromTranslate(dismissTranslateY),
    ),
  } as CSSProperties;

  return (
    <div
      className={`instant-ban-who-scene${
        dismissCompleting ? ' instant-ban-who-scene--completing' : ''
      }${
        !dismissCompleting && dismissTranslateY < 1
          ? ' instant-ban-who-scene--at-rest'
          : ''
      }${
        snapTransition && !dismissCompleting
          ? ' instant-ban-who-scene--snap-transition'
          : ''
      }`}
      style={sceneStyle}
    >
      <div className="instant-ban-who-scene__header">
        <div
          ref={scrollRef}
          className="instant-ban-who-dismiss-scroll-driver"
          onScroll={onScroll}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onGestureEnd}
          onTouchCancel={onGestureEnd}
          aria-hidden
        >
          <div className="instant-ban-who-dismiss-scroll-driver__track" />
          <div className="instant-ban-who-dismiss-scroll-driver__anchor" />
        </div>
        <h1 className="instant-ban-send-overlay__title">{title}</h1>
      </div>

      <div className="instant-ban-who-scene__body">
        <WhoFriendList
          friends={friends}
          onSelect={onSelect}
          onInviteMore={onInviteMore}
        />
      </div>
    </div>
  );
}

type ListProps = {
  friends: FriendCard[];
  onSelect: (friend: FriendCard) => void;
  onInviteMore: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

function WhoFriendList({ friends, onSelect, onInviteMore }: ListProps) {
  return (
    <div className="instant-ban-who-list">
      {friends.map((friend, i) => {
        const letter = (
          friend.firstName?.[0] ??
          friend.username?.[0] ??
          '?'
        ).toUpperCase();
        return (
          <button
            key={friend.id ?? friend.userId ?? `friend:${i}`}
            type="button"
            className="instant-ban-who-item"
            onClick={() => onSelect(friend)}
          >
            <AvatarImage
              src={friendAvatarUrl(friend)}
              letter={letter}
              sizeClass="w-12 h-12"
              textClass="text-lg"
              priority
            />
            <div>
              <div className="instant-ban-who-item__name">{friendLabel(friend)}</div>
              {friend.username ? (
                <div className="instant-ban-who-item__username">@{friend.username}</div>
              ) : null}
            </div>
          </button>
        );
      })}
      <button
        type="button"
        className="instant-ban-who-item instant-ban-who-item--invite"
        onClick={onInviteMore}
      >
        <span className="instant-ban-who-item__plus" aria-hidden>
          +
        </span>
        <div className="instant-ban-who-item__name">Кому ещё запретишь?</div>
      </button>
    </div>
  );
}

/** @deprecated Use WhoOverlay */
export const WhoScreen = WhoFriendList;
