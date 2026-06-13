'use client';

import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import '@/components/lobby-boot-intro.css';

type Props = {
  logoScaleActive: boolean;
  logoLocked: boolean;
  onLogoScaleEnd?: () => void;
  /** Route card/overlay is above boot — boot stays as background placeholder. */
  bootBackground?: boolean;
};

/** Early boot logo — mounts before heavy InstantBanFlow paint, same anchor as arena orb. */
export function LobbyBootLogoShell({
  logoScaleActive,
  logoLocked,
  onLogoScaleEnd,
  bootBackground = false,
}: Props) {
  return (
    <div
      className={`lobby-boot-logo-shell${
        bootBackground ? ' lobby-boot-logo-shell--background' : ''
      }`}
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
