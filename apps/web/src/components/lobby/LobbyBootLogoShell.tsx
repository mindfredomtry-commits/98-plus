'use client';

import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import '@/components/lobby-boot-intro.css';

type Props = {
  logoScaleActive: boolean;
  logoLocked: boolean;
  onLogoScaleEnd?: () => void;
};

/** Early boot logo — mounts before heavy InstantBanFlow paint, same anchor as arena orb. */
export function LobbyBootLogoShell({
  logoScaleActive,
  logoLocked,
  onLogoScaleEnd,
}: Props) {
  return (
    <div
      className="lobby-boot-logo-shell"
      data-lobby-boot-logo-shell
      aria-hidden
    >
      <div className="lobby-boot-logo-shell__stage">
        <LobbyPersistentLogoSlot
          key="lobby-persistent-logo"
          logoScaleActive={logoScaleActive}
          logoLocked={logoLocked}
          visible
          onLogoScaleEnd={onLogoScaleEnd}
          diagContext="early-boot-shell"
        />
      </div>
    </div>
  );
}
