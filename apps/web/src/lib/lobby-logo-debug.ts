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

function readClassName(el: Element): string {
  const value = el.className;
  if (typeof value === 'string') return value;
  return '';
}

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

  const slot =
    root ??
    document.querySelector('[data-lobby-persistent-logo]');

  if (!slot) return [];

  const anchor = slot.querySelector('[data-logo-anchor]') as HTMLElement | null;
  const start = anchor ?? (slot.querySelector('[data-logo-source]') as HTMLElement | null);
  if (!start) return [];

  const rows: PersistentLogoStyleSnapshot[] = [];
  let el: HTMLElement | null = start;
  let depth = 0;

  while (el && depth < 8) {
    const style = getComputedStyle(el);
    const label =
      el.hasAttribute('data-logo-anchor')
        ? 'anchor'
        : el.getAttribute('data-logo-source') ??
          el.getAttribute('data-logo-layer') ??
          (readClassName(el) ? readClassName(el) : null) ??
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

  const anchor = rows.find((row) => row.label === 'anchor') ?? rows[0];
  console.log('logo transform', anchor.transform);
  console.log('logo opacity', anchor.opacity);
  console.log('[lobby-logo-diag]', context, rows);

  return rows;
}
