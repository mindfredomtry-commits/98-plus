'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { SuccessBanCardBody } from './SuccessBanCardBody';

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  fromPayoff?: boolean;
  onAgain: () => void;
  onReturn: () => void;
};

export function SuccessScreen({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  fromPayoff = false,
  onAgain,
  onReturn,
}: Props) {
  return (
    <>
      <div
        className={`instant-ban-success-card${
          fromPayoff ? ' instant-ban-success-card--from-payoff' : ''
        }`}
      >
        <SuccessBanCardBody
          senderUser={senderUser}
          selectedUser={selectedUser}
          banText={banText}
          durationMinutes={durationMinutes}
          contentClassName={
            fromPayoff ? '' : 'instant-ban-success-card__content--enter'
          }
        />
      </div>
      <div
        className={`instant-ban-actions instant-ban-actions--dual${
          fromPayoff ? ' instant-ban-actions--from-payoff' : ''
        }`}
      >
        <button type="button" className="btn-98-primary" onClick={onAgain}>
          ЗАПРЕТИТЬ ЕЩЁ
        </button>
        <button type="button" className="instant-ban-secondary" onClick={onReturn}>
          ВЕРНУТЬСЯ
        </button>
      </div>
    </>
  );
}
