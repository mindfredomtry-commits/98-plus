'use client';

import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import '@/components/lobby-boot-intro.css';

type Props = {
  logoScaleActive: boolean;
  logoLocked: boolean;
  onLogoScaleEnd?: () => void;
  /** Route card/overlay is above boot — boot stays as background placeholder. */
  bootBackground?: boolean;
  /** Compose/send flow active — hide boot logo entirely (not over What/Confirm). */
  hideVisualForCompose?: boolean;
};

/** Early boot logo — mounts before heavy InstantBanFlow paint, same anchor as arena orb. */
export function LobbyBootLogoShell({
  logoScaleActive,
  logoLocked,
  onLogoScaleEnd,
  bootBackground = false,
  hideVisualForCompose = false,
}: Props) {
  return (
    <div
      className={`lobby-boot-logo-shell${
        bootBackground ? ' lobby-boot-logo-shell--background' : ''
      }${hideVisualForCompose ? ' lobby-boot-logo-shell--compose-hidden' : ''}`}
      data-lobby-boot-logo-shell
      data-hide-boot-visual-for-compose={hideVisualForCompose ? 'true' : undefined}
      aria-hidden
    >
      <div className="lobby-boot-logo-shell__stage">
        <LobbyPersistentLogoSlot
          key="lobby-persistent-logo"
          logoScaleActive={logoScaleActive}
          logoLocked={logoLocked}
          visible={!hideVisualForCompose}
          onLogoScaleEnd={onLogoScaleEnd}
          diagContext="early-boot-shell"
        />
      </div>
    </div>
  );
}
