'use client';

import type { BanResult } from '@98plus/shared';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import { shareDeepLink } from '@/lib/share';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

interface Props {
  result: BanResult;
  onClose: () => void;
}

export function ResultOverlay({ result, onClose }: Props) {
  const { openSendTo, token } = useApp();
  const { haptic } = useTelegram();

  const myDelta =
    result.viewerId === result.sender?.id
      ? result.energy?.sender
      : result.viewerId === result.receiver?.id
        ? result.energy?.receiver
        : null;

  function share() {
    haptic('light');
    shareDeepLink(
      { type: 'result', banId: result.id },
      `${result.headline}\n«${result.text}»\n\n98+`,
    );
    if (token) {
      api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.RESULT_SHARED,
          meta: { banId: result.id },
        }),
      }).catch(() => {});
    }
  }

  function counter() {
    haptic('medium');
    const u = result.opponent?.username;
    openSendTo(
      u ? `@${u}` : (result.opponent?.firstName ?? ''),
    );
    onClose();
  }

  return (
    <ModalShell open ariaLabel="Результат вызова" onClose={onClose}>
      <div className="modal-card-body text-center">
        <p className="text-2xl font-black text-glow mb-1">
          {result.headline ?? 'Результат'}
        </p>
        {result.subline ? (
          <p className="text-muted text-sm mb-5">{result.subline}</p>
        ) : (
          <div className="mb-5" />
        )}

        <div className="modal-avatars mx-auto mb-5">
          {result.sender ? <Avatar user={result.sender} /> : null}
          <span className="text-muted text-lg" aria-hidden>
            ⚡
          </span>
          {result.receiver ? <Avatar user={result.receiver} /> : null}
        </div>

        <p className="text-lg font-bold leading-snug mb-4">
          «{result.text ?? ''}»
        </p>

        {myDelta !== null && myDelta !== undefined ? (
          <p
            className={`text-2xl font-bold mb-2 ${
              myDelta < 0 ? 'text-warning' : 'text-accent'
            }`}
          >
            {myDelta > 0 ? '+' : ''}
            {myDelta} ⚡
          </p>
        ) : null}
        {result.farmSkipped ? (
          <p className="text-xs text-muted mb-4">Лимит фарма на сегодня</p>
        ) : null}
      </div>

      <div className="modal-card-actions space-y-3">
        <BigButton onClick={counter}>🚫 Запретить в ответ</BigButton>
        <BigButton variant="ghost" onClick={share}>
          Поделиться
        </BigButton>
        <button
          type="button"
          onClick={onClose}
          className="w-full text-muted text-sm py-2"
        >
          Закрыть
        </button>
      </div>
    </ModalShell>
  );
}

function Avatar({
  user,
}: {
  user: { firstName?: string | null; photoUrl?: string | null };
}) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar" aria-hidden>
      {user.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg font-bold">{letter}</span>
      )}
    </div>
  );
}
