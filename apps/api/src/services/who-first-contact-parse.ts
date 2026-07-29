export type UsersSharedNorm = {
  request_id: number;
  users: Array<{
    user_id: number | string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    photo?: unknown;
  }>;
};

export function normalizeUsersShared(raw: unknown): UsersSharedNorm | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.request_id !== 'number') return null;
  const usersRaw = Array.isArray(o.users) ? o.users : [];
  if (usersRaw.length === 0) return null;
  return {
    request_id: o.request_id,
    users: usersRaw.map((u) => {
      const x = (u ?? {}) as Record<string, unknown>;
      return {
        user_id: (x.user_id as number | string) ?? 0,
        first_name: (x.first_name as string | undefined) ?? null,
        last_name: (x.last_name as string | undefined) ?? null,
        username: (x.username as string | undefined) ?? null,
        photo: x.photo ?? null,
      };
    }),
  };
}
