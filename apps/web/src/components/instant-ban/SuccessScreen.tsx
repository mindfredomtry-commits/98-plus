'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { BigButton } from '../BigButton';
import { BanGlyph, SuccessBanCardBody } from './SuccessBanCardBody';

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
          <BigButton className="instant-ban-success-card__btn-primary" onClick={onAgain}>
            <span className="instant-ban-success-card__btn-label">
              <BanGlyph className="instant-ban-success-card__btn-glyph" />
              Запретить ещё!
            </span>
          </BigButton>
          <BigButton
            variant="ghost"
            className="instant-ban-success-card__btn-secondary"
            onClick={onShare}
          >
            Поделиться
          </BigButton>
        </div>
      </div>
    </div>
  );
}
