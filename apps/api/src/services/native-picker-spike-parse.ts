/** Pure users_shared normalization (no Prisma/Redis/bot). */

export type SpikeSharedUserDiag = {
  user_id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  photo?: unknown;
};

export type SpikeUsersSharedDiag = {
  request_id: number;
  users: SpikeSharedUserDiag[];
};

/**
 * Normalize Telegram users_shared for logs + persistence.
 */
export function normalizeUsersSharedPayload(
  raw: unknown,
): SpikeUsersSharedDiag | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const requestId = o.request_id;
  if (typeof requestId !== 'number') return null;
  const usersRaw = Array.isArray(o.users) ? o.users : [];
  const users: SpikeSharedUserDiag[] = usersRaw.map((u) => {
    const x = (u ?? {}) as Record<string, unknown>;
    return {
      user_id: (x.user_id as number | string) ?? 0,
      first_name: (x.first_name as string | undefined) ?? null,
      last_name: (x.last_name as string | undefined) ?? null,
      username: (x.username as string | undefined) ?? null,
      photo: x.photo ?? null,
    };
  });
  return { request_id: requestId, users };
}
