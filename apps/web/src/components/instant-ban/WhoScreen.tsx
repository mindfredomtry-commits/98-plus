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

/** Fixed pull-down distance in scroll-driver (px). */
const WHO_DISMISS_TRACK_PX = 96;
const WHO_DISMISS_SNAP_THRESHOLD = 0.14;
const WHO_DISMISS_SCROLL_SETTLE_MS = 48;
const WHO_DISMISS_SNAP_MS = 200;

function whoDismissDevLog(
  event: 'start' | 'move' | 'fired',
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
  const snapSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const moveLoggedRef = useRef(false);
  const [dismissProgress, setDismissProgress] = useState(0);

  const readMaxScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return WHO_DISMISS_TRACK_PX;
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? max : WHO_DISMISS_TRACK_PX;
  }, []);

  const progressFromScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const max = readMaxScroll();
    if (max < 24) return 0;
    return Math.min(1, Math.max(0, 1 - el.scrollTop / max));
  }, [readMaxScroll]);

  const applyProgressFromScroll = useCallback(() => {
    setDismissProgress(progressFromScroll());
  }, [progressFromScroll]);

  const scrollToRest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = readMaxScroll();
    setDismissProgress(0);
  }, [readMaxScroll]);

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
    moveLoggedRef.current = false;
    scrollToRest();
    whoDismissDevLog('start', { maxScroll: readMaxScroll() });
  }, [title, scrollToRest, readMaxScroll]);

  useEffect(() => {
    if (dismissing) {
      setDismissProgress(1);
    }
  }, [dismissing]);

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
        setDismissProgress(targetProgress);
        onComplete?.();
        return;
      }

      clearSnapAnim();
      isSnappingRef.current = true;
      const max = readMaxScroll();
      const startTop = el.scrollTop;
      const endTop = targetProgress >= 1 ? 0 : max;
      const startProgress = progressFromScroll();
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / WHO_DISMISS_SNAP_MS);
        const eased = easeOutCubic(t);
        el.scrollTop = startTop + (endTop - startTop) * eased;
        const nextProgress = startProgress + (targetProgress - startProgress) * eased;
        setDismissProgress(nextProgress);

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(tick);
          return;
        }

        snapAnimRef.current = null;
        isSnappingRef.current = false;
        if (targetProgress <= 0) {
          scrollToRest();
        } else {
          setDismissProgress(1);
        }
        onComplete?.();
      };

      snapAnimRef.current = requestAnimationFrame(tick);
    },
    [clearSnapAnim, progressFromScroll, readMaxScroll, scrollToRest],
  );

  const runSnapBack = useCallback(() => {
    if (commitRef.current || dismissing) return;
    runSnapAnim(0);
  }, [dismissing, runSnapAnim]);

  const runSnapDismiss = useCallback(() => {
    if (commitRef.current || dismissing) return;
    commitRef.current = true;
    whoDismissDevLog('fired', { progress: progressFromScroll() });
    runSnapAnim(1, onDismiss);
  }, [dismissing, onDismiss, progressFromScroll, runSnapAnim]);

  const evaluateSnap = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;

    const progress = progressFromScroll();
    if (progress >= WHO_DISMISS_SNAP_THRESHOLD) {
      runSnapDismiss();
      return;
    }

    if (progress > 0.004) {
      runSnapBack();
    } else {
      scrollToRest();
    }
  }, [dismissing, progressFromScroll, runSnapBack, runSnapDismiss, scrollToRest]);

  const scheduleSnapEvaluate = useCallback(() => {
    clearSnapSettleTimer();
    snapSettleTimerRef.current = setTimeout(() => {
      snapSettleTimerRef.current = null;
      evaluateSnap();
    }, WHO_DISMISS_SCROLL_SETTLE_MS);
  }, [clearSnapSettleTimer, evaluateSnap]);

  const onScroll = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingRef.current) return;

    applyProgressFromScroll();
    const progress = progressFromScroll();

    if (!moveLoggedRef.current && progress > 0.004) {
      moveLoggedRef.current = true;
      whoDismissDevLog('start', { scrollTop: scrollRef.current?.scrollTop });
    }
    whoDismissDevLog('move', {
      progress: Number(progress.toFixed(3)),
      scrollTop: scrollRef.current?.scrollTop,
      maxScroll: readMaxScroll(),
    });

    scheduleSnapEvaluate();
  }, [
    applyProgressFromScroll,
    dismissing,
    progressFromScroll,
    readMaxScroll,
    scheduleSnapEvaluate,
  ]);

  const onTouchStart = useCallback(() => {
    whoDismissDevLog('start', { source: 'touch' });
  }, []);

  const sceneStyle = {
    '--who-dismiss-progress': String(dismissProgress),
  } as CSSProperties;

  return (
    <div
      className={`instant-ban-who-scene${
        dismissing ? ' instant-ban-who-scene--dismissing' : ''
      }`}
      style={sceneStyle}
    >
      <div className="instant-ban-who-scene__header">
        <div
          ref={scrollRef}
          className="instant-ban-who-dismiss-scroll-driver"
          onScroll={onScroll}
          onTouchStart={onTouchStart}
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

/** @deprecated Use WhoOverlay — kept for re-exports if needed */
export const WhoScreen = WhoFriendList;
