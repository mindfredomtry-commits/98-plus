'use client';

export function ArenaAmbience() {
  return (
    <div
      className="arena-ambience fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="arena-orb arena-orb-a" />
      <div className="arena-orb arena-orb-b" />
      <div className="arena-orb arena-orb-c" />
    </div>
  );
}
