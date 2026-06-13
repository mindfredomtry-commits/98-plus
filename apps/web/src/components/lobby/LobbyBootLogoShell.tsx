'use client';

import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import '@/components/lobby-boot-intro.css';

type Props = {
  logoScaleActive: boolean;
  logoLocked: boolean;
  onLogoScaleEnd?: () => void;
  logoScaleMs?: number;
  logoScaleDelayMs?: number;
  /** Route card/overlay is above boot — boot stays as background placeholder. */
  bootBackground?: boolean;
  /** Compose flow — hide only the 98+ logo layer, not boot ring/orb. */
  hideLobbyBootLogoOnly?: boolean;
};

/** Early boot logo — mounts before heavy InstantBanFlow paint, same anchor as arena orb. */
export function LobbyBootLogoShell({
  logoScaleActive,
  logoLocked,
  onLogoScaleEnd,
  logoScaleMs = 350,
  logoScaleDelayMs = 50,
  bootBackground = false,
  hideLobbyBootLogoOnly = false,
}: Props) {
  return (
    <div
      className={`lobby-boot-logo-shell${
        bootBackground ? ' lobby-boot-logo-shell--background' : ''
      }${hideLobbyBootLogoOnly ? ' lobby-boot-logo-shell--logo-hidden' : ''}`}
      data-lobby-boot-logo-shell
      data-hide-lobby-boot-logo-only={hideLobbyBootLogoOnly ? 'true' : undefined}
      aria-hidden
    >
      <div className="lobby-boot-logo-shell__stage">
        <LobbyPersistentLogoSlot
          key="lobby-persistent-logo"
          logoScaleActive={logoScaleActive}
          logoLocked={logoLocked}
          visible={!hideLobbyBootLogoOnly}
          logoScaleMs={logoScaleMs}
          logoScaleDelayMs={logoScaleDelayMs}
          onLogoScaleEnd={onLogoScaleEnd}
          diagContext="early-boot-shell"
        />
      </div>
    </div>
  );
}
