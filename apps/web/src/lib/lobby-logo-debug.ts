export type LobbyLogoSource = 'persistent' | 'boot' | 'arena' | 'orb-face';

export type PersistentLogoStyleSnapshot = {
  context: string;
  depth: number;
  label: string;
  transform: string;
  opacity: string;
  animation: string;
  transition: string;
};

export function scanVisibleLobbyLogoSources(
  root: ParentNode | Document = document,
): LobbyLogoSource[] {
  if (typeof document === 'undefined') return [];

  const found = new Set<LobbyLogoSource>();

  root.querySelectorAll('[data-logo-source]').forEach((node) => {
    const el = node as HTMLElement;
    const source = el.getAttribute('data-logo-source') as LobbyLogoSource | null;
    if (!source) return;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (Number.parseFloat(style.opacity) <= 0) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    found.add(source);
  });

  return [...found];
}

export function formatVisibleLogoSources(sources: LobbyLogoSource[]): string {
  return sources.length > 0 ? sources.join(',') : 'none';
}

export function logVisibleLobbyLogoSources(context: string): LobbyLogoSource[] {
  const sources = scanVisibleLobbyLogoSources();
  if (process.env.NODE_ENV === 'development') {
    console.log('[lobby-logo-sources]', context, sources);
  }
  return sources;
}

export function snapshotPersistentLogoStyles(
  context: string,
  root?: HTMLElement | null,
): PersistentLogoStyleSnapshot[] {
  if (typeof document === 'undefined') return [];

  const title =
    root?.querySelector('[data-logo-source="persistent"]') ??
    document.querySelector(
      '[data-lobby-persistent-logo] [data-logo-source="persistent"]',
    );

  if (!title) return [];

  const rows: PersistentLogoStyleSnapshot[] = [];
  let el: HTMLElement | null = title as HTMLElement;
  let depth = 0;

  while (el && depth < 8) {
    const style = getComputedStyle(el);
    const label =
      el.getAttribute('data-logo-source') ??
      el.getAttribute('data-logo-layer') ??
      (typeof el.className === 'string' && el.className ? el.className : null) ??
      el.tagName.toLowerCase();
    rows.push({
      context,
      depth,
      label,
      transform: style.transform,
      opacity: style.opacity,
      animation: style.animationName,
      transition: style.transitionProperty,
    });
    el = el.parentElement;
    depth += 1;
  }

  return rows;
}

export function logPersistentLogoComputedStyles(
  context: string,
  root?: HTMLElement | null,
): PersistentLogoStyleSnapshot[] {
  const rows = snapshotPersistentLogoStyles(context, root);
  if (process.env.NODE_ENV !== 'development' || rows.length === 0) return rows;

  const title = rows[0];
  console.log('logo transform', title.transform);
  console.log('logo opacity', title.opacity);
  console.log('[lobby-logo-diag]', context, rows);

  return rows;
}
