import type { BanInteraction, UserPublic } from './types';
import type { BanDurationMinutes } from './constants';
import { AURA_LABELS } from './energy';

/** Visual-only preview embedded in reply start_param or auth boot — not for server decisions. */
export type ReplyStartParamPreview = {
  text: string;
  senderId?: string;
  senderName?: string;
  receiverId?: string;
};

const START_PARAM_MAX = 64;
const REPLY_PREFIX = 'rply_';
const PREVIEW_SEP = '__p_';

function minimalPreviewUser(
  id: string,
  name: string | null | undefined,
): UserPublic {
  return {
    id,
    telegramId: '',
    username: null,
    firstName: name?.trim() || '',
    avatarUrl: null,
    photoUrl: null,
    aura: 'weak',
    auraLabel: AURA_LABELS.weak,
    energyPercent: 0,
    streak: 0,
    isOnboarded: true,
  };
}

export function buildBanInteractionFromReplyPreview(
  banId: string,
  preview: ReplyStartParamPreview,
  viewerId: string,
): BanInteraction {
  const now = new Date().toISOString();
  const text = preview.text.trim();
  const senderId = preview.senderId?.trim() || 'reply-preview-sender';
  const receiverId = preview.receiverId?.trim() || viewerId;
  return {
    id: banId,
    text,
    status: 'pending',
    durationMinutes: 60 as BanDurationMinutes,
    isIncoming: receiverId === viewerId,
    createdAt: now,
    expiresAt: null,
    checkDueAt: null,
    threadId: banId,
    sender: minimalPreviewUser(senderId, preview.senderName),
    receiver: minimalPreviewUser(receiverId, null),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa !== 'function') return '';
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array | null {
  if (typeof atob !== 'function') return null;
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Compact pipe payload: text|senderId|senderName|receiverId (names/url-encoded lightly). */
export function encodeReplyStartParamPreview(
  preview: ReplyStartParamPreview,
  maxCompactLen: number,
): string | null {
  const text = preview.text.trim();
  if (!text) return null;
  const parts = [
    text,
    preview.senderId ?? '',
    preview.senderName ?? '',
    preview.receiverId ?? '',
  ];
  let compact = parts.join('|');
  if (compact.length > maxCompactLen) {
    const budget =
      maxCompactLen -
      (parts[1].length + parts[2].length + parts[3].length + 3);
    if (budget < 4) return null;
    parts[0] = text.slice(0, Math.max(1, budget));
    compact = parts.join('|');
    if (compact.length > maxCompactLen) return null;
  }
  return toBase64Url(new TextEncoder().encode(compact));
}

export function decodeReplyStartParamPreview(
  compact: string,
): ReplyStartParamPreview | null {
  if (!compact) return null;
  const bytes = fromBase64Url(compact);
  if (!bytes) return null;
  const raw = new TextDecoder().decode(bytes);
  const [text, senderId, senderName, receiverId] = raw.split('|');
  if (!text?.trim()) return null;
  return {
    text: text.trim(),
    senderId: senderId?.trim() || undefined,
    senderName: senderName?.trim() || undefined,
    receiverId: receiverId?.trim() || undefined,
  };
}

export function buildReplyStartParam(
  banId: string,
  preview?: ReplyStartParamPreview | null,
): string {
  const base = `${REPLY_PREFIX}${banId}`;
  if (!preview?.text?.trim()) return base;
  const maxCompactLen = START_PARAM_MAX - base.length - PREVIEW_SEP.length;
  if (maxCompactLen < 8) return base;
  const compact = encodeReplyStartParamPreview(preview, maxCompactLen);
  if (!compact) return base;
  const full = `${base}${PREVIEW_SEP}${compact}`;
  return full.length <= START_PARAM_MAX ? full : base;
}

export function parseReplyStartParamRest(
  rest: string,
): { banId: string; preview?: ReplyStartParamPreview } {
  const sep = rest.indexOf(PREVIEW_SEP);
  if (sep < 0) return { banId: rest };
  const banId = rest.slice(0, sep);
  const preview = decodeReplyStartParamPreview(rest.slice(sep + PREVIEW_SEP.length));
  return preview ? { banId, preview } : { banId };
}

export function replyPreviewFromBan(
  ban: Pick<BanInteraction, 'text' | 'sender' | 'receiver'>,
): ReplyStartParamPreview {
  return {
    text: ban.text,
    senderId: ban.sender.id,
    senderName: ban.sender.firstName || ban.sender.username || undefined,
    receiverId: ban.receiver.id,
  };
}
