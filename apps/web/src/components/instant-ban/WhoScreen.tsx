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

/** Min scrollable overflow in dismiss driver (pull-down room). */
const WHO_DISMISS_DRIVER_MIN_OVERFLOW = 96;
const WHO_DISMISS_SNAP_THRESHOLD = 0.18;
const WHO_DISMISS_SCROLL_SETTLE_MS = 48;
const WHO_DISMISS_SNAP_BACK_MS = 180;

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

type WhoDismissHeaderProps = {
  title: string;
  onDismiss: () => void;
  dismissing?: boolean;
};

export function WhoDismissHeader({
  title,
  onDismiss,
  dismissing = false,
}: WhoDismissHeaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(false);
  const isSnappingBackRef = useRef(false);
  const snapSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapBackAnimRef = useRef<number | null>(null);
  const moveLoggedRef = useRef(false);
  const [dismissProgress, setDismissProgress] = useState(0);

  const readMaxScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    return Math.max(0, el.scrollHeight - el.clientHeight);
  }, []);

  const progressFromScroll = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    if (max < WHO_DISMISS_DRIVER_MIN_OVERFLOW) return 0;
    return Math.min(1, Math.max(0, 1 - el.scrollTop / max));
  }, []);

  const scrollToRest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = readMaxScroll();
    el.scrollTop = max;
    setDismissProgress(0);
  }, [readMaxScroll]);

  const clearSnapSettleTimer = useCallback(() => {
    if (snapSettleTimerRef.current) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }
  }, []);

  const clearSnapBackAnim = useCallback(() => {
    if (snapBackAnimRef.current != null) {
      cancelAnimationFrame(snapBackAnimRef.current);
      snapBackAnimRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    commitRef.current = false;
    isSnappingBackRef.current = false;
    moveLoggedRef.current = false;
    scrollToRest();
    whoDismissDevLog('start', { maxScroll: readMaxScroll() });
  }, [title, scrollToRest, readMaxScroll]);

  useEffect(() => {
    return () => {
      clearSnapSettleTimer();
      clearSnapBackAnim();
    };
  }, [clearSnapBackAnim, clearSnapSettleTimer]);

  const runSnapBack = useCallback(() => {
    const el = scrollRef.current;
    if (!el || commitRef.current || dismissing) return;

    const max = readMaxScroll();
    const startTop = el.scrollTop;
    if (startTop >= max - 0.5) {
      scrollToRest();
      return;
    }

    clearSnapBackAnim();
    isSnappingBackRef.current = true;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / WHO_DISMISS_SNAP_BACK_MS);
      const eased = easeOutCubic(t);
      el.scrollTop = startTop + (max - startTop) * eased;
      setDismissProgress(progressFromScroll());

      if (t < 1) {
        snapBackAnimRef.current = requestAnimationFrame(tick);
        return;
      }

      snapBackAnimRef.current = null;
      isSnappingBackRef.current = false;
      scrollToRest();
    };

    snapBackAnimRef.current = requestAnimationFrame(tick);
  }, [
    clearSnapBackAnim,
    dismissing,
    progressFromScroll,
    readMaxScroll,
    scrollToRest,
  ]);

  const evaluateSnap = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingBackRef.current) return;

    const progress = progressFromScroll();
    if (progress >= WHO_DISMISS_SNAP_THRESHOLD) {
      commitRef.current = true;
      whoDismissDevLog('fired', { progress });
      onDismiss();
      return;
    }

    if (progress > 0.002) {
      runSnapBack();
    }
  }, [dismissing, onDismiss, progressFromScroll, runSnapBack]);

  const scheduleSnapEvaluate = useCallback(() => {
    clearSnapSettleTimer();
    snapSettleTimerRef.current = setTimeout(() => {
      snapSettleTimerRef.current = null;
      evaluateSnap();
    }, WHO_DISMISS_SCROLL_SETTLE_MS);
  }, [clearSnapSettleTimer, evaluateSnap]);

  const onScroll = useCallback(() => {
    if (commitRef.current || dismissing || isSnappingBackRef.current) return;

    const progress = progressFromScroll();
    setDismissProgress(progress);

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
      className={`instant-ban-who-dismiss-scene${
        dismissing ? ' instant-ban-who-dismiss-scene--dismissing' : ''
      }`}
      style={sceneStyle}
    >
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
      <div className="instant-ban-who-dismiss-layer" aria-hidden={false}>
        <h1 className="instant-ban-send-overlay__title">{title}</h1>
      </div>
    </div>
  );
}

type Props = {
  friends: FriendCard[];
  onSelect: (friend: FriendCard) => void;
  onInviteMore: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function WhoScreen({ friends, onSelect, onInviteMore }: Props) {
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
