/** Avatar/presence startup timing — diagnostics only. */

let startupAt = 0;

export function markAvatarStartup(): void {
  if (typeof performance === 'undefined') return;
  if (startupAt === 0) startupAt = performance.now();
}

export function avatarStartupElapsedMs(): number {
  if (startupAt === 0) markAvatarStartup();
  return Math.round(performance.now() - startupAt);
}

export function logAvatarStartup(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  markAvatarStartup();
  console.log(event, { ...fields, elapsedMs: avatarStartupElapsedMs() });
}
