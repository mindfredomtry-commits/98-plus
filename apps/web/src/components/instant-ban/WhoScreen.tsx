'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

const WHO_DISMISS_TRACK_PX = 96;
const WHO_DISMISS_SNAP_THRESHOLD = 0.14;
const WHO_DISMISS_SCROLL_SETTLE_MS = 100;
const WHO_DISMISS_SNAP_MS = 180;
const WHO_DISMISS_COMPLETE_MS = 220;

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
  const dismissProgressRef = useRef(0);
  const maxDismissProgressRef = useRef(0);
  const snapSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const moveLoggedRef = useRef(false);
  const [dismissProgress, setDismissProgress] = useState(0);
  const [snapTransition, setSnapTransition] = useState(false);

  const readMaxScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return WHO_DISMISS_TRACK_PX;
    const max = el.scrollHeight - el.clientHeight;
    return max > 8 ? max : WHO_DISMISS_TRACK_PX;
  }, []);

  const progressFromScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return dismissProgressRef.current;
    const max = readMaxScroll();
    return Math.min(1, Math.max(0, 1 - el.scrollTop / max));
  }, [readMaxScroll]);

  const setProgress = useCallback(
    (progress: number, trackPeak = false) => {
      const clamped = Math.min(1, Math.max(0, progress));
      dismissProgressRef.current = clamped;
      if (trackPeak && gestureActiveRef.current) {
        maxDismissProgressRef.current = Math.max(
          maxDismissProgressRef.current,
          clamped,
        );
      }
      setDismissProgress(clamped);
    },
    [],
  );

  const scrollToRest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = readMaxScroll();
    setProgress(0);
    maxDismissProgressRef.current = 0;
  }, [readMaxScroll, setProgress]);

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

  useLayoutEffect(() => {
    commitRef.current = false;
    isSnappingRef.current = false;
    gestureActiveRef.current = false;
    moveLoggedRef.current = false;
    dismissProgressRef.current = 0;
    maxDismissProgressRef.current = 0;
    setSnapTransition(false);
    scrollToRest();
    whoDismissDevLog('start', { maxScroll: readMaxScroll() });
  }, [title, scrollToRest, readMaxScroll]);

  useEffect(() => {
    if (dismissing) {
      setProgress(1);
    }
  }, [dismissing, setProgress]);

  useEffect(() => {
    return () => {
      clearSnapSettleTimer();
      clearSnapAnim();
    };
  }, [clearSnapAnim, clearSnapSettleTimer]);

  const runSnapAnim = useCallback(
    (targetProgress: number, onComplete?: () => void) => {
      const el = scrollRef.current;
      if (!el) {
        setProgress(targetProgress);
        onComplete?.();
        return;
      }

      clearSnapAnim();
      isSnappingRef.current = true;
      setSnapTransition(false);
      const max = readMaxScroll();
      const startTop = el.scrollTop;
      const endTop = targetProgress >= 1 ? 0 : max;
      const startProgress = dismissProgressRef.current;
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / WHO_DISMISS_SNAP_MS);
        const eased = easeOutCubic(t);
        el.scrollTop = startTop + (endTop - startTop) * eased;
        const nextProgress =
          startProgress + (targetProgress - startProgress) * eased;
        dismissProgressRef.current = nextProgress;
        setDismissProgress(nextProgress);

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(tick);
          return;
        }

        snapAnimRef.current = null;
        isSnappingRef.current = false;
        dismissProgressRef.current = targetProgress;
        setDismissProgress(targetProgress);
        if (targetProgress <= 0) {
          scrollToRest();
        }
        onComplete?.();
      };

      snapAnimRef.current = requestAnimationFrame(tick);
    },
    [clearSnapAnim, readMaxScroll, scrollToRest, setProgress],
  );

  const snapBack = useCallback(() => {
    if (commitRef.current || dismissing) return;
    whoDismissDevLog('snap', {
      peak: maxDismissProgressRef.current,
      current: dismissProgressRef.current,
      action: 'back',
    });
    setSnapTransition(true);
    runSnapAnim(0, () => {
      setSnapTransition(false);
      scrollToRest();
    });
  }, [dismissing, runSnapAnim, scrollToRest]);

  const completeWhoDismiss = useCallback(() => {
    if (commitRef.current || dismissing) return;
    commitRef.current = true;
    whoDismissDevLog('fired', {
      peak: maxDismissProgressRef.current,
      current: dismissProgressRef.current,
    });
    setSnapTransition(true);
    runSnapAnim(1, () => {
      onDismiss();
    });
  }, [dismissing, onDismiss, runSnapAnim]);

  const evaluateSnap = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;

    const peak = maxDismissProgressRef.current;
    const current = dismissProgressRef.current;
    const decision = Math.max(peak, current);

    whoDismissDevLog('snap', {
      peak: Number(peak.toFixed(3)),
      current: Number(current.toFixed(3)),
      decision: Number(decision.toFixed(3)),
      threshold: WHO_DISMISS_SNAP_THRESHOLD,
    });

    if (decision >= WHO_DISMISS_SNAP_THRESHOLD) {
      completeWhoDismiss();
      return;
    }

    if (decision > 0.004) {
      snapBack();
    } else {
      scrollToRest();
    }
  }, [completeWhoDismiss, dismissing, scrollToRest, snapBack]);

  const scheduleSnapEvaluate = useCallback(() => {
    clearSnapSettleTimer();
    snapSettleTimerRef.current = setTimeout(() => {
      snapSettleTimerRef.current = null;
      evaluateSnap();
    }, WHO_DISMISS_SCROLL_SETTLE_MS);
  }, [clearSnapSettleTimer, evaluateSnap]);

  const onGestureEnd = useCallback(() => {
    const hadGesture =
      gestureActiveRef.current || maxDismissProgressRef.current > 0.004;
    gestureActiveRef.current = false;
    if (!hadGesture || commitRef.current || dismissing) return;
    clearSnapSettleTimer();
    evaluateSnap();
  }, [clearSnapSettleTimer, dismissing, evaluateSnap]);

  const onScroll = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;

    const progress = progressFromScroll();
    setProgress(progress, true);

    if (!moveLoggedRef.current && progress > 0.004) {
      moveLoggedRef.current = true;
      whoDismissDevLog('start', { scrollTop: scrollRef.current?.scrollTop });
    }
    whoDismissDevLog('move', {
      progress: Number(progress.toFixed(3)),
      peak: Number(maxDismissProgressRef.current.toFixed(3)),
      scrollTop: scrollRef.current?.scrollTop,
      maxScroll: readMaxScroll(),
    });

    if (gestureActiveRef.current) {
      scheduleSnapEvaluate();
    }
  }, [
    dismissing,
    progressFromScroll,
    readMaxScroll,
    scheduleSnapEvaluate,
    setProgress,
  ]);

  const onTouchStart = useCallback(() => {
    gestureActiveRef.current = true;
    maxDismissProgressRef.current = dismissProgressRef.current;
    whoDismissDevLog('start', { source: 'touch' });
  }, []);

  const sceneStyle = {
    '--who-dismiss-progress': String(dismissProgress),
  } as CSSProperties;

  return (
    <div
      className={`instant-ban-who-scene${
        dismissProgress < 0.001 ? ' instant-ban-who-scene--at-rest' : ''
      }${dismissing ? ' instant-ban-who-scene--dismissing' : ''}${
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
          onTouchEnd={onGestureEnd}
          onTouchCancel={onGestureEnd}
          onPointerUp={onGestureEnd}
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
