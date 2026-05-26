/** Keep stored avatar when incoming Telegram/API value is empty. */
export function pickStoredPhotoUrl(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  const prev = existing?.trim();
  return prev || null;
}

export function telegramInitPhotoUrl(tg: {
  photo_url?: string;
  photoUrl?: string;
}): string | null {
  const raw = tg.photo_url ?? tg.photoUrl;
  return raw?.trim() || null;
}
