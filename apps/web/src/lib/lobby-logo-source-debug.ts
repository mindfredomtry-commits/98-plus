/** Temporary — visible in production builds until logo hiccup source is identified. */
export const LOGO_SOURCE_DEBUG_ENABLED = true;

export type LobbyLogoSource = 'persistent' | 'boot' | 'orb-face' | 'arena';

export type LogoNodeSnapshot = {
  source: LobbyLogoSource | 'parent';
  depth: number;
  tag: string;
  className: string;
  transform: string;
  opacity: string;
  animationName: string;
  display: string;
  visibility: string;
};

export type VisibleLogoSourceEntry = {
  source: LobbyLogoSource;
  element: HTMLElement;
  rect: DOMRect;
  opacity: number;
  area: number;
  chain: LogoNodeSnapshot[];
};

const SOURCE_ORDER: LobbyLogoSource[] = ['persistent', 'boot', 'orb-face', 'arena'];

let lastLogSignature = '';

function readClassName(el: Element): string {
  const value = el.className;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'baseVal' in value) {
    return String((value as { baseVal?: string }).baseVal ?? '');
  }
  return '';
}

function snapshotNode(el: HTMLElement, source: LobbyLogoSource | 'parent', depth: number): LogoNodeSnapshot {
  const style = getComputedStyle(el);
  return {
    source,
    depth,
    tag: el.tagName.toLowerCase(),
    className: readClassName(el),
    transform: style.transform,
    opacity: style.opacity,
    animationName: style.animationName,
    display: style.display,
    visibility: style.visibility,
  };
}

export function snapshotLogoParentChain(
  element: HTMLElement,
  source: LobbyLogoSource,
  maxDepth = 8,
): LogoNodeSnapshot[] {
  const rows: LogoNodeSnapshot[] = [];
  let el: HTMLElement | null = element;
  let depth = 0;

  while (el && depth < maxDepth) {
    rows.push(snapshotNode(el, depth === 0 ? source : 'parent', depth));
    el = el.parentElement;
    depth += 1;
  }

  return rows;
}

export function stampLogoDebugAttributes(chain: LogoNodeSnapshot[], rootEl: HTMLElement): void {
  chain.forEach((row, index) => {
    let node: HTMLElement | null = rootEl;
    for (let step = 0; step < index && node; step += 1) {
      node = node.parentElement;
    }
    if (!node) return;

    node.setAttribute('data-logo-debug-depth', String(row.depth));
    node.setAttribute('data-logo-debug-transform', row.transform);
    node.setAttribute('data-logo-debug-opacity', row.opacity);
    node.setAttribute('data-logo-debug-animation', row.animationName);
    node.setAttribute('data-logo-debug-display', row.display);
    node.setAttribute('data-logo-debug-visibility', row.visibility);
    node.setAttribute('data-logo-debug-class', row.className.slice(0, 120));
    if (index === 0) {
      node.setAttribute('data-logo-debug-source', row.source);
    }
  });
}

function isElementVisuallyPresent(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const opacity = Number.parseFloat(style.opacity);
  if (!Number.isFinite(opacity) || opacity <= 0.01) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  return true;
}

function collectLogoElements(root: ParentNode | Document): HTMLElement[] {
  if (typeof document === 'undefined') return [];

  const nodes = new Set<HTMLElement>();

  root.querySelectorAll('[data-logo-source]').forEach((node) => {
    nodes.add(node as HTMLElement);
  });

  root.querySelectorAll('.lobby-screen__title:not([data-logo-source])').forEach((node) => {
    const el = node as HTMLElement;
    el.setAttribute('data-logo-source', 'arena');
    nodes.add(el);
  });

  return [...nodes];
}

export function scanVisibleLogoSources(
  root: ParentNode | Document = document,
): VisibleLogoSourceEntry[] {
  if (typeof document === 'undefined') return [];

  const entries: VisibleLogoSourceEntry[] = [];

  for (const el of collectLogoElements(root)) {
    const source = el.getAttribute('data-logo-source') as LobbyLogoSource | null;
    if (!source || !SOURCE_ORDER.includes(source)) continue;
    if (!isElementVisuallyPresent(el)) continue;

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const opacity = Number.parseFloat(style.opacity);
    const chain = snapshotLogoParentChain(el, source);

    stampLogoDebugAttributes(chain, el);

    entries.push({
      source,
      element: el,
      rect,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      area: rect.width * rect.height * (Number.isFinite(opacity) ? opacity : 1),
      chain,
    });
  }

  return entries.sort((a, b) => b.area - a.area);
}

export function formatActiveLogoSources(entries: VisibleLogoSourceEntry[]): string {
  if (entries.length === 0) return 'none';
  return entries.map((entry) => entry.source).join(', ');
}

export function pickPrimaryLogoSource(entries: VisibleLogoSourceEntry[]): LobbyLogoSource | 'none' {
  return entries[0]?.source ?? 'none';
}

function buildLogSignature(context: string, entries: VisibleLogoSourceEntry[]): string {
  return JSON.stringify({
    context,
    sources: entries.map((entry) => ({
      source: entry.source,
      chain: entry.chain.map((row) => ({
        depth: row.depth,
        transform: row.transform,
        opacity: row.opacity,
        animationName: row.animationName,
        display: row.display,
        visibility: row.visibility,
        className: row.className,
      })),
    })),
  });
}

export function logLogoSourceDiagnostics(context: string, root?: ParentNode | null): VisibleLogoSourceEntry[] {
  if (!LOGO_SOURCE_DEBUG_ENABLED || typeof document === 'undefined') return [];

  const entries = scanVisibleLogoSources(root ?? document);
  const signature = buildLogSignature(context, entries);

  if (signature === lastLogSignature) return entries;
  lastLogSignature = signature;

  console.log('[logo-source-diag]', context, {
    active: formatActiveLogoSources(entries),
    primary: pickPrimaryLogoSource(entries),
    count: entries.length,
  });

  entries.forEach((entry) => {
    entry.chain.forEach((row) => {
      console.log('[logo-source-diag]', entry.source, `depth=${row.depth}`, {
        tag: row.tag,
        className: row.className,
        transform: row.transform,
        opacity: row.opacity,
        animationName: row.animationName,
        display: row.display,
        visibility: row.visibility,
      });
    });
  });

  return entries;
}

export const LOGO_SOURCE_DEBUG_COLORS: Record<LobbyLogoSource, string> = {
  persistent: '#ff3333',
  boot: '#3399ff',
  'orb-face': '#33cc66',
  arena: '#ffcc00',
};
