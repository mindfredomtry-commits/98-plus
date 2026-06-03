'use client';

import { useCallback, useRef, type PointerEvent, type ReactNode } from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

const WHO_DISMISS_DY_MIN = 52;
const WHO_DISMISS_DX_RATIO = 1.2;

type DismissZoneProps = {
  children: ReactNode;
  onDismiss: () => void;
  dismissing?: boolean;
};

function isInteractiveDismissTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="button"], [role="link"]',
    ),
  );
}

export function WhoDismissZone({
  children,
  onDismiss,
  dismissing = false,
}: DismissZoneProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearStart = useCallback(() => {
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || dismissing) return;
    if (isInteractiveDismissTarget(e.target)) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [dismissing]);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      clearStart();
      if (!start || dismissing) return;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      const dy = e.clientY - start.y;
      const dx = e.clientX - start.x;
      if (dy > WHO_DISMISS_DY_MIN && Math.abs(dy) > Math.abs(dx) * WHO_DISMISS_DX_RATIO) {
        onDismiss();
      }
    },
    [clearStart, dismissing, onDismiss],
  );

  return (
    <div
      className={`instant-ban-who-dismiss-zone${
        dismissing ? ' instant-ban-who-dismiss-zone--dismissing' : ''
      }`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
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
