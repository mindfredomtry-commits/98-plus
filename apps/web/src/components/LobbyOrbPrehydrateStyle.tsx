/**
 * Critical CSS in <head> — runs before React/hydration paint.
 * Prevents full-size lobby ring flash on cold start (Telegram WebView).
 */
export function LobbyOrbPrehydrateStyle() {
  return (
    <style
      id="lobby-orb-prehydrate"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
html {
  --boot-orb-initial-scale: 0.15;
}
html:not([data-app-hydrated]) .lobby-screen__orb-root .instant-ban-arena-lobby-orb__ring-layer {
  visibility: hidden !important;
}
html:not([data-app-hydrated]) .lobby-screen__orb-root .lobby-boot-orb-scale-layer {
  transform: scale(var(--boot-orb-initial-scale, 0.15));
  transform-origin: center center;
}
html[data-app-hydrated] .lobby-screen__orb-root:not([data-boot-intro-active]):not(.lobby-boot-intro-primed):not(.lobby-boot-intro-ring-base) .instant-ban-arena-lobby-orb__ring-layer {
  visibility: hidden !important;
}
html[data-app-hydrated] .lobby-screen__orb-root.lobby-boot-intro-primed .instant-ban-arena-lobby-orb__ring-layer,
html[data-app-hydrated] .lobby-screen__orb-root[data-boot-intro-active].lobby-boot-intro-ring-base .instant-ban-arena-lobby-orb__ring-layer {
  visibility: visible !important;
}
`,
      }}
    />
  );
}
