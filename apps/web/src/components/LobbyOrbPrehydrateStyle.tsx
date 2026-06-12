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
html:not([data-app-hydrated]) .lobby-screen__orb-root .instant-ban-arena-lobby-orb__ring-layer {
  visibility: hidden !important;
}
html:not([data-app-hydrated]) .lobby-screen__orb-root .lobby-boot-orb-scale-layer {
  transform: scale(0.15);
  transform-origin: center center;
}
.lobby-boot-progress-stroke {
  stroke-dasharray: var(--ring-circumference, 871.87);
  stroke-dashoffset: var(--ring-circumference, 871.87);
  transition: none !important;
}
`,
      }}
    />
  );
}
