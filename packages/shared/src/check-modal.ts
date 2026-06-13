import type { BanInteraction, UserPublic } from './types';

export type CheckViewerRole = 'sender' | 'receiver';

export function getCheckViewerRole(
  viewerId: string | null | undefined,
  senderId: string,
  receiverId: string,
): CheckViewerRole | null {
  if (!viewerId) return null;
  if (viewerId === receiverId) return 'receiver';
  if (viewerId === senderId) return 'sender';
  return null;
}

export const CHECK_MODAL_TITLE: Record<CheckViewerRole, string> = {
  receiver: 'Ты выдержал(а)?',
  sender: 'Выдержал(а)?',
};

export const CHECK_MODAL_ROLE_CONTEXT: Record<CheckViewerRole, string> = {
  receiver: 'Был запрет тебе от',
  sender: 'Был твой запрет для',
};

export function getCheckModalDisplayedUser(
  ban: Pick<BanInteraction, 'sender' | 'receiver'>,
  role: CheckViewerRole,
): UserPublic {
  return role === 'receiver' ? ban.sender : ban.receiver;
}

export function getCheckModalView(
  ban: BanInteraction,
  viewerId: string | null | undefined,
): {
  role: CheckViewerRole;
  title: string;
  roleContext: string;
  displayedUser: UserPublic;
} | null {
  const role = getCheckViewerRole(
    viewerId,
    ban.sender.id,
    ban.receiver.id,
  );
  if (!role) return null;
  return {
    role,
    title: CHECK_MODAL_TITLE[role],
    roleContext: CHECK_MODAL_ROLE_CONTEXT[role],
    displayedUser: getCheckModalDisplayedUser(ban, role),
  };
}
