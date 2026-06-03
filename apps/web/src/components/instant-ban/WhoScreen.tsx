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

const WHO_DISMISS_DISTANCE_PX = 120;
const WHO_DISMISS_THRESHOLD_PX = 48;
const WHO_DISMISS_SNAP_MS = 200;
const WHO_DISMISS_COMPLETE_MS = 200;

function whoDismissDevLog(
  event:
    | 'start'
    | 'move'
    | 'fired'
    | 'snap'
    | 'threshold-hit'
    | 'complete-start'
    | 'on-dismiss-call',
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const tag =
    event === 'threshold-hit'
      ? 'who-dismiss-threshold-hit'
      : event === 'complete-start'
        ? 'who-dismiss-complete-start'
        : event === 'on-dismiss-call'
          ? 'who-dismiss-on-dismiss-call'
          : `who-dismiss-${event}`;
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
  /** Must call parent setPhase('idle') — see InstantBanFlow.handleWhoDismissToLobby */
  onDismissToLobby: () => void;
};

export function WhoOverlay({
  title,
  friends,
  onSelect,
  onInviteMore,
  onDismissToLobby,
  dismissing = false,
}: WhoOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(false);
  const dismissCompletingRef = useRef(false);
  const dismissZoneGestureRef = useRef(false);
  const isSnappingRef = useRef(false);
  const touchStartYRef = useRef(0);
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

  const tryAutoComplete = useCallback((translateY: number) => {
    if (!dismissZoneGestureRef.current) return;
    if (dismissCompletingRef.current || commitRef.current) return;
    if (translateY >= WHO_DISMISS_THRESHOLD_PX) {
      whoDismissDevLog('threshold-hit', {
        translateY,
        thresholdPx: WHO_DISMISS_THRESHOLD_PX,
      });
      completeWhoDismissRef.current();
    }
  }, []);

  const applyTranslate = useCallback(
    (translateY: number, trackPeak = false) => {
      const y = Math.min(
        WHO_DISMISS_DISTANCE_PX,
        Math.max(0, translateY),
      );

      dismissTranslateRef.current = y;
      if (trackPeak) {
        maxTranslateYRef.current = Math.max(maxTranslateYRef.current, y);
      }
      setDismissTranslateY(y);
      tryAutoComplete(y);
    },
    [tryAutoComplete],
  );

  const resetGestureMetrics = useCallback(() => {
    dismissTranslateRef.current = 0;
    maxTranslateYRef.current = 0;
    setDismissTranslateY(0);
  }, []);

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
    whoDismissDevLog('start', { maxScroll: readMaxScroll() });
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
    [clearSnapAnim],
  );

  const snapBack = useCallback(() => {
    if (dismissCompletingRef.current || commitRef.current) return;
    whoDismissDevLog('snap', {
      maxTranslateY: maxTranslateYRef.current,
      currentTranslateY: dismissTranslateRef.current,
      decision: 'snap-back',
      thresholdPx: WHO_DISMISS_THRESHOLD_PX,
    });
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
    setDismissCompleting(true);
    applyTranslate(WHO_DISMISS_DISTANCE_PX, false);

    whoDismissDevLog('complete-start', {
      translateY: dismissTranslateRef.current,
    });

    clearCompleteTimer();
    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      whoDismissDevLog('on-dismiss-call', {});
      onDismissToLobby();
    }, WHO_DISMISS_COMPLETE_MS);
  }, [applyTranslate, clearCompleteTimer, onDismissToLobby]);

  useEffect(() => {
    completeWhoDismissRef.current = completeWhoDismiss;
  }, [completeWhoDismiss]);

  const onGestureEnd = useCallback(() => {
    dismissZoneGestureRef.current = false;

    if (dismissCompletingRef.current || commitRef.current) {
      return;
    }

    const peakY = maxTranslateYRef.current;

    whoDismissDevLog('snap', {
      currentTranslateY: dismissTranslateRef.current,
      maxTranslateY: peakY,
      scrollTop: scrollRef.current?.scrollTop,
      maxScroll: readMaxScroll(),
      decision: peakY >= WHO_DISMISS_THRESHOLD_PX ? 'complete' : 'snap-back',
      thresholdPx: WHO_DISMISS_THRESHOLD_PX,
    });

    if (peakY >= WHO_DISMISS_THRESHOLD_PX) {
      completeWhoDismissRef.current();
      return;
    }

    if (peakY > 6) {
      snapBack();
    } else {
      scrollToRest();
    }
  }, [readMaxScroll, snapBack, scrollToRest]);

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

    whoDismissDevLog('move', {
      source: 'scroll',
      translateY: dismissTranslateRef.current,
      peakY: maxTranslateYRef.current,
    });
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

      const nextY = Math.min(
        WHO_DISMISS_DISTANCE_PX,
        baseTranslateRef.current + dy,
      );
      applyTranslate(nextY, true);

      whoDismissDevLog('move', {
        source: 'touch',
        dy: Number(dy.toFixed(1)),
        translateY: nextY,
        peakY: maxTranslateYRef.current,
        thresholdPx: WHO_DISMISS_THRESHOLD_PX,
      });
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
        dismissTranslateY < 1 ? ' instant-ban-who-scene--at-rest' : ''
      }${dismissCompleting ? ' instant-ban-who-scene--completing' : ''}${
        snapTransition ? ' instant-ban-who-scene--snap-transition' : ''
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
