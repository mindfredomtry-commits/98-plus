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

/** Pull range mapped to visual translate (px). */
const WHO_DISMISS_DISTANCE_PX = 120;
/** Commit dismiss when layer moved at least this far down. */
const WHO_DISMISS_THRESHOLD_PX = 48;
const WHO_DISMISS_SCROLL_SETTLE_MS = 100;
const WHO_DISMISS_SNAP_MS = 200;
const WHO_DISMISS_COMPLETE_MS = 200;

function whoDismissDevLog(
  event: 'start' | 'move' | 'fired' | 'snap',
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log(`[who-dismiss-${event}]`, data ?? {});
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type WhoOverlayProps = {
  title: string;
  friends: FriendCard[];
  onSelect: (friend: FriendCard) => void;
  onInviteMore: () => void;
  onDismiss: () => void;
  dismissing?: boolean;
};

export function WhoOverlay({
  title,
  friends,
  onSelect,
  onInviteMore,
  onDismiss,
  dismissing = false,
}: WhoOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(false);
  const isSnappingRef = useRef(false);
  const gestureActiveRef = useRef(false);
  const touchStartYRef = useRef(0);
  const baseTranslateRef = useRef(0);
  const dismissTranslateRef = useRef(0);
  const maxTranslateYRef = useRef(0);
  const dismissProgressRef = useRef(0);
  const maxDismissProgressRef = useRef(0);
  const snapSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveLoggedRef = useRef(false);
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

  const applyTranslate = useCallback(
    (translateY: number, trackPeak = false) => {
      const y = Math.min(
        WHO_DISMISS_DISTANCE_PX,
        Math.max(0, translateY),
      );
      const progress = progressFromTranslate(y);

      dismissTranslateRef.current = y;
      dismissProgressRef.current = progress;

      if (trackPeak) {
        maxTranslateYRef.current = Math.max(maxTranslateYRef.current, y);
        maxDismissProgressRef.current = Math.max(
          maxDismissProgressRef.current,
          progress,
        );
      }

      setDismissTranslateY(y);
    },
    [progressFromTranslate],
  );

  const resetGestureMetrics = useCallback(() => {
    dismissTranslateRef.current = 0;
    maxTranslateYRef.current = 0;
    dismissProgressRef.current = 0;
    maxDismissProgressRef.current = 0;
    setDismissTranslateY(0);
  }, []);

  const scrollToRest = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = readMaxScroll();
    }
    resetGestureMetrics();
  }, [readMaxScroll, resetGestureMetrics]);

  const clearSnapSettleTimer = useCallback(() => {
    if (snapSettleTimerRef.current) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }
  }, []);

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
    isSnappingRef.current = false;
    gestureActiveRef.current = false;
    moveLoggedRef.current = false;
    setSnapTransition(false);
    setDismissCompleting(false);
    clearCompleteTimer();
    resetGestureMetrics();
    scrollToRest();
    whoDismissDevLog('start', { maxScroll: readMaxScroll() });
  }, [
    clearCompleteTimer,
    readMaxScroll,
    resetGestureMetrics,
    scrollToRest,
    title,
  ]);

  useEffect(() => {
    if (dismissing) {
      applyTranslate(WHO_DISMISS_DISTANCE_PX, false);
      setDismissCompleting(true);
    }
  }, [applyTranslate, dismissing]);

  useEffect(() => {
    return () => {
      clearSnapSettleTimer();
      clearSnapAnim();
      clearCompleteTimer();
    };
  }, [clearSnapAnim, clearCompleteTimer, clearSnapSettleTimer]);

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
        applyTranslate(y, false);

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(tick);
          return;
        }

        snapAnimRef.current = null;
        isSnappingRef.current = false;
        applyTranslate(targetPx, false);
        onComplete?.();
      };

      snapAnimRef.current = requestAnimationFrame(tick);
    },
    [applyTranslate, clearSnapAnim],
  );

  const snapBack = useCallback(() => {
    if (commitRef.current || dismissing) return;
    animateTranslatePx(0, () => {
      setSnapTransition(false);
      scrollToRest();
    });
  }, [animateTranslatePx, dismissing, scrollToRest]);

  const completeWhoDismiss = useCallback(() => {
    if (commitRef.current || dismissing) return;
    commitRef.current = true;
    setDismissCompleting(true);
    whoDismissDevLog('fired', {
      maxTranslateY: maxTranslateYRef.current,
      currentTranslateY: dismissTranslateRef.current,
    });
    animateTranslatePx(WHO_DISMISS_DISTANCE_PX, () => {
      clearCompleteTimer();
      completeTimerRef.current = setTimeout(() => {
        completeTimerRef.current = null;
        onDismiss();
      }, WHO_DISMISS_COMPLETE_MS);
    });
  }, [
    animateTranslatePx,
    clearCompleteTimer,
    dismissing,
    onDismiss,
  ]);

  const evaluateSnap = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;

    const currentTranslateY = dismissTranslateRef.current;
    const maxTranslateY = maxTranslateYRef.current;
    const decisionY = Math.max(maxTranslateY, currentTranslateY);
    const currentProgress = dismissProgressRef.current;
    const maxProgress = maxDismissProgressRef.current;
    const el = scrollRef.current;

    const decision =
      decisionY >= WHO_DISMISS_THRESHOLD_PX ? 'complete' : 'snap-back';

    whoDismissDevLog('snap', {
      currentProgress: Number(currentProgress.toFixed(3)),
      maxProgress: Number(maxProgress.toFixed(3)),
      currentTranslateY: Number(currentTranslateY.toFixed(1)),
      maxTranslateY: Number(maxTranslateY.toFixed(1)),
      scrollTop: el?.scrollTop,
      maxScroll: readMaxScroll(),
      decision,
      thresholdPx: WHO_DISMISS_THRESHOLD_PX,
      distancePx: WHO_DISMISS_DISTANCE_PX,
    });

    if (decisionY >= WHO_DISMISS_THRESHOLD_PX) {
      completeWhoDismiss();
      return;
    }

    if (decisionY > 6) {
      snapBack();
    } else {
      scrollToRest();
    }
  }, [
    completeWhoDismiss,
    dismissing,
    readMaxScroll,
    scrollToRest,
    snapBack,
  ]);

  const scheduleSnapEvaluate = useCallback(() => {
    clearSnapSettleTimer();
    snapSettleTimerRef.current = setTimeout(() => {
      snapSettleTimerRef.current = null;
      evaluateSnap();
    }, WHO_DISMISS_SCROLL_SETTLE_MS);
  }, [clearSnapSettleTimer, evaluateSnap]);

  const onGestureEnd = useCallback(() => {
    const hadGesture =
      gestureActiveRef.current || maxTranslateYRef.current > 6;
    gestureActiveRef.current = false;
    if (!hadGesture || commitRef.current || dismissing) return;
    clearSnapSettleTimer();
    evaluateSnap();
  }, [clearSnapSettleTimer, dismissing, evaluateSnap]);

  const mergeScrollIntoTranslate = useCallback(() => {
    const fromScroll = progressFromScroll() * WHO_DISMISS_DISTANCE_PX;
    const merged = Math.max(dismissTranslateRef.current, fromScroll);
    applyTranslate(merged, true);
  }, [applyTranslate, progressFromScroll]);

  const onScroll = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;
    mergeScrollIntoTranslate();

    if (!moveLoggedRef.current && dismissTranslateRef.current > 6) {
      moveLoggedRef.current = true;
      whoDismissDevLog('start', { source: 'scroll' });
    }
    whoDismissDevLog('move', {
      translateY: Number(dismissTranslateRef.current.toFixed(1)),
      peakY: Number(maxTranslateYRef.current.toFixed(1)),
      scrollTop: scrollRef.current?.scrollTop,
    });

    if (gestureActiveRef.current) {
      scheduleSnapEvaluate();
    }
  }, [
    dismissing,
    mergeScrollIntoTranslate,
    scheduleSnapEvaluate,
  ]);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    gestureActiveRef.current = true;
    touchStartYRef.current = touch.clientY;
    baseTranslateRef.current = dismissTranslateRef.current;
    maxTranslateYRef.current = Math.max(
      maxTranslateYRef.current,
      dismissTranslateRef.current,
    );
    whoDismissDevLog('start', { source: 'touch', y: touch.clientY });
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!gestureActiveRef.current || commitRef.current || dismissing) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dy = touch.clientY - touchStartYRef.current;
    if (dy <= 0) return;

    const nextY = Math.min(
      WHO_DISMISS_DISTANCE_PX,
      baseTranslateRef.current + dy,
    );
    applyTranslate(nextY, true);

    if (!moveLoggedRef.current && nextY > 6) {
      moveLoggedRef.current = true;
    }
    whoDismissDevLog('move', {
      source: 'touch',
      dy: Number(dy.toFixed(1)),
      translateY: Number(nextY.toFixed(1)),
      peakY: Number(maxTranslateYRef.current.toFixed(1)),
    });
  }, [applyTranslate, dismissing]);

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
