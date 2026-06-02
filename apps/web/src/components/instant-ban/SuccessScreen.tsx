'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { SuccessBanCardBody } from './SuccessBanCardBody';

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  onAgain: () => void;
};

export function SuccessScreen({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onAgain,
}: Props) {
  return (
    <div className="instant-ban-success-screen">
      <div className="instant-ban-success-card instant-ban-success-card--enter">
        <SuccessBanCardBody
          senderUser={senderUser}
          selectedUser={selectedUser}
          banText={banText}
          durationMinutes={durationMinutes}
        />
        <button
          type="button"
          className="btn-98-primary instant-ban-success-card__again"
          onClick={onAgain}
        >
          Запретить ещё!
        </button>
      </div>
    </div>
  );
}
