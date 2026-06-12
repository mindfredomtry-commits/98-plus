'use client';

import { InfluenceRing } from '@/components/lobby/InfluenceRing';
import { useLobbyRingIntroFill } from '@/components/instant-ban/useLobbyRingIntroFill';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './app-boot-screen.css';

type Props = {
  /** Known influence 0–100; falls back to ambient boot level when unset/zero. */
  influencePercent: number;
};

const BOOT_AMBIENT_RING_PERCENT = 68;

function resolveBootRingTarget(influencePercent: number): number {
  if (!Number.isFinite(influencePercent) || influencePercent <= 0) {
    return BOOT_AMBIENT_RING_PERCENT;
  }
  return Math.min(100, Math.max(0, influencePercent));
}

/**
 * Visual-only boot shell: dark arena + orb + influence ring while auth loading.
 * No navigation, CTA, or flow side effects.
 */
export function AppBootScreen({ influencePercent }: Props) {
  const ringTarget = resolveBootRingTarget(influencePercent);
  const { displayPercent, isFilling } = useLobbyRingIntroFill(ringTarget, {
    phase: 'idle',
    sendStarted: false,
  });

  return (
    <div
      className={`app-boot-screen lobby-screen${
        isFilling ? ' app-boot-screen--filling' : ''
      }`}
      data-app-boot-screen=""
      aria-hidden
    >
      <div className="lobby-screen__particles" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="lobby-screen__particle" />
        ))}
      </div>

      <div className="app-boot-screen__stage">
        <div
          className="lobby-screen__orb-wrap lobby-screen__orb-root"
          data-orb-root
        >
          <div className="instant-ban-arena-lobby-orb" data-arena-lobby-orb>
            <div className="instant-ban-arena-lobby-orb__stage">
              <div className="instant-ban-arena-lobby-orb__btn">
                <span className="instant-ban-arena-lobby-orb__face">
                  <span className="instant-ban-arena-lobby-orb__ring-layer instant-ban-confirm-orb-ring">
                    <InfluenceRing
                      value={displayPercent}
                      className={`instant-ban-confirm-influence-ring${
                        isFilling ? ' influence-ring--intro-filling' : ''
                      }`}
                      disableTransition={isFilling}
                    />
                  </span>
                  <span className="instant-ban-arena-lobby-orb__title-layer">
                    <span className="lobby-screen__orb" data-orb-core>
                      <span className="lobby-screen__title">98+</span>
                    </span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
