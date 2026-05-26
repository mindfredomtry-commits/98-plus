/** User-scoped app data is safe to render only when owner matches confirmed auth user. */
export function isUserDataScoped(
  dataOwnerUserId: string | null | undefined,
  authUserId: string | null | undefined,
  authLoading: boolean,
): boolean {
  if (authLoading) return false;
  if (!authUserId) return false;
  if (!dataOwnerUserId) return false;
  return dataOwnerUserId === authUserId;
}
