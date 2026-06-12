'use client';

const PARTICLE_COUNT = 10;

/** Shared lobby backdrop — grid + particles (matches InstantBanFlow / lobby-screen.css). */
export function LobbyScreenAtmosphere() {
  return (
    <>
      <div className="lobby-screen__grid" aria-hidden />
      <div className="lobby-screen__particles" aria-hidden>
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
          <span key={i} className="lobby-screen__particle" />
        ))}
      </div>
    </>
  );
}
