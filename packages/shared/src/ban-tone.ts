export const BAN_TONES = [
  'strict',
  'cute',
  'funny',
  'provocative',
  'scary',
  'romantic',
  'shame',
  'boring',
] as const;

export type BanTone = (typeof BAN_TONES)[number];

const BAN_TONE_SET = new Set<string>(BAN_TONES);

export function isBanTone(value: unknown): value is BanTone {
  return typeof value === 'string' && BAN_TONE_SET.has(value);
}

/** Coerce API/DB value to a known tone or null. */
export function normalizeBanTone(value: unknown): BanTone | null {
  return isBanTone(value) ? value : null;
}

const BAN_TONE_LABELS: Record<BanTone, string> = {
  strict: 'Строгий',
  cute: 'Милый',
  funny: 'Смешной',
  provocative: 'Провокационный',
  scary: 'Страшный',
  romantic: 'Романтичный',
  shame: 'Стыдный',
  boring: 'Скучный',
};

/** Future-ready display label — not wired to UI yet. */
export function getBanToneLabel(tone: BanTone | null | undefined): string | null {
  if (!tone) return null;
  return BAN_TONE_LABELS[tone];
}
