'use client';

/** Boot launch logo — lives outside ring scale layer, final size after logoEnter. */
export function LobbyLaunchLogo() {
  return (
    <span className="lobby-boot-logo-layer__inner instant-ban-arena-lobby-orb__title-layer">
      <span className="lobby-screen__orb" data-orb-core>
        <span className="lobby-screen__title">98+</span>
      </span>
    </span>
  );
}
