'use client';

export type Tab = 'home' | 'profile';

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Навигация">
      <div className="bottom-nav-inner">
        {(
          [
            ['home', '⚡'],
            ['profile', '👤'],
          ] as const
        ).map(([id, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`bottom-nav-item ${
              tab === id ? 'text-accent' : 'text-muted'
            }`}
          >
            <span className="leading-none select-none" aria-hidden>
              {icon}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
