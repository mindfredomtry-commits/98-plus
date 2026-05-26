/** Normalize Telegram / CDN avatar URLs for <img src>. */
export function normalizeAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return null;
}

/** Warm browser cache for friend strip avatars. */
export function preloadAvatarUrls(urls: (string | null | undefined)[]): void {
  if (typeof window === 'undefined') return;
  const seen = new Set<string>();
  for (const raw of urls) {
    const src = normalizeAvatarUrl(raw);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = src;
  }
}
