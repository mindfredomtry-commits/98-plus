/**
 * Critical CSS in <head> — first paint before globals.css / Tailwind / React.
 * Covers Telegram webview gray flash and square placeholder stage.
 */
const LOBBY_BOOT_SCENE_BG = `
  radial-gradient(
    ellipse 120% 80% at 50% 20%,
    rgba(108, 52, 131, 0.35),
    transparent 55%
  ),
  radial-gradient(
    ellipse 90% 60% at 50% 100%,
    rgba(59, 7, 100, 0.45),
    transparent 50%
  ),
  radial-gradient(circle at 50% 50%, #120818 0%, #050308 45%, #0f0f0f 100%)
`;

export function LobbyOrbPrehydrateStyle() {
  return (
    <style
      id="lobby-orb-prehydrate"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
html {
  margin: 0;
  min-height: 100%;
  color-scheme: dark;
  background-color: #0f0f0f;
  background-image: ${LOBBY_BOOT_SCENE_BG};
}
body {
  margin: 0;
  min-height: 100%;
  background-color: #0f0f0f;
  background-image: ${LOBBY_BOOT_SCENE_BG};
}
#lobby-boot-shell-early {
  position: fixed;
  inset: 0;
  z-index: 64;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  background-color: #0f0f0f;
  background-image: ${LOBBY_BOOT_SCENE_BG};
}
#lobby-boot-logo-prehydrate {
  position: fixed;
  left: 50%;
  top: 45%;
  z-index: 65;
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
html[data-lobby-logo-live] #lobby-boot-shell-early {
  display: none !important;
}
html[data-route-overlay-active] #lobby-boot-shell-early {
  z-index: 50;
  opacity: 0.88;
  pointer-events: none;
}
html[data-route-overlay-active] .lobby-boot-logo-shell {
  z-index: 50;
  pointer-events: none;
  opacity: 0.88;
}
html[data-route-overlay-active] .lobby-boot-logo-shell--background {
  opacity: 0.72;
}
html[data-route-overlay-active] .instant-ban-arena-send[data-boot-background='true'] {
  pointer-events: none;
}
html[data-route-overlay-active] .instant-ban-arena-send__bans-layer {
  z-index: 90;
  pointer-events: none;
}
html[data-route-overlay-active] .instant-ban-arena-send__bans-layer .instant-ban-bans-overlay,
html[data-route-overlay-active] .instant-ban-arena-send__bans-layer .instant-ban-active-ban-card-layer {
  pointer-events: auto;
}
html[data-hide-lobby-boot-logo-only] #lobby-boot-shell-early,
html[data-hide-lobby-boot-logo-only] #lobby-boot-logo-prehydrate {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
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
