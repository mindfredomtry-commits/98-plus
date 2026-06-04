'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { SuccessBanCardBody } from './SuccessBanCardBody';

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  onAgain: () => void;
  onShare: () => void;
};

export function SuccessScreen({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onAgain,
  onShare,
}: Props) {
  return (
    <div className="instant-ban-success-screen">
      <div className="modal-card modal-card--incoming instant-ban-success-card instant-ban-success-card--enter">
        <div className="modal-card-body text-center">
          <SuccessBanCardBody
            senderUser={senderUser}
            selectedUser={selectedUser}
            banText={banText}
            durationMinutes={durationMinutes}
          />
        </div>
        <div className="modal-card-actions space-y-2.5">
          <button type="button" className="btn-98-primary w-full" onClick={onAgain}>
            Запретить ещё!
          </button>
          <button type="button" className="instant-ban-secondary" onClick={onShare}>
            Поделиться
          </button>
        </div>
      </div>
    </div>
  );
}
