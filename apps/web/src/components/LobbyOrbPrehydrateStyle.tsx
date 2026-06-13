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
#lobby-boot-logo-prehydrate {
  position: fixed;
  left: 50%;
  top: 45%;
  z-index: 2147483646;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translate(-50%, -50%) scale(0.15);
  transform-origin: center center;
  font-size: clamp(2.75rem, 12vw, 3.75rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  color: #ffffff;
  text-shadow:
    0 0 24px rgba(174, 92, 219, 0.9),
    0 0 48px rgba(174, 92, 219, 0.55);
  pointer-events: none;
  user-select: none;
  opacity: 1;
  visibility: visible;
}
html[data-lobby-logo-live] #lobby-boot-logo-prehydrate {
  display: none !important;
}
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
