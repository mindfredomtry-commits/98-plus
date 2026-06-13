/**
 * Critical CSS in <head> — runs before React/hydration paint.
 * Boot scene only — lobby orb is not pre-scaled.
 */
export function LobbyOrbPrehydrateStyle() {
  return (
    <style
      id="lobby-orb-prehydrate"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
html:not([data-app-hydrated]) [data-boot-scene] .lobby-boot-orb-scale-layer {
  transform: scale(0.15);
  transform-origin: center center;
}
html:not([data-app-hydrated]) [data-boot-scene] .instant-ban-arena-lobby-orb__ring-layer {
  visibility: hidden !important;
}
html:not([data-app-hydrated]) .lobby-persistent-logo-slot:not(.lobby-boot-logo-enter-done) .lobby-persistent-logo-anchor {
  transform: translate(-50%, -50%) scale(0.15);
  transform-origin: center center;
  opacity: 1;
  visibility: visible;
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
