/**
 * HTTP adapters for Create Ban submission and recipient loading.
 * Infrastructure only — imported by composition root, not ProductFlowSurface.
 */
import { coerceFriendList } from '@98plus/shared';
import { api } from '@/lib/api';
import { deliverDirectChallenge } from '@/lib/deliver-challenge';
import type {
  CreateBanRecipientsPort,
  CreateBanSubmissionPort,
} from './create-ban.ports';
import type { CreateBanResult } from './create-ban.types';

export type CreateBanHttpAdapterDeps = {
  getToken: () => string | null;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

function banIdFromSourceItemId(sourceItemId: string): string {
  return sourceItemId.replace(/^[^:]+:/, '');
}

export function createHttpCreateBanSubmissionPort(
  deps: CreateBanHttpAdapterDeps,
): CreateBanSubmissionPort {
  return {
    async submit(command): Promise<CreateBanResult> {
      const token = deps.getToken();
      if (!token) {
        const err = new Error('Нет авторизации') as Error & { code: string };
        err.code = 'auth';
        throw err;
      }
      await deps.onboard().catch(() => undefined);

      if (command.kind === 'REPLY') {
        const banId = banIdFromSourceItemId(command.sourceItemId);
        const res = await api<{ ban?: { id?: string }; id?: string }>(
          `/bans/${encodeURIComponent(banId)}/reply`,
          {
            method: 'POST',
            token,
            body: JSON.stringify({
              text: command.text,
              durationMinutes: command.durationMinutes,
            }),
          },
        );
        const resultId = res?.ban?.id ?? res?.id ?? command.sourceItemId;
        void deps.refreshUser().catch(() => undefined);
        return { banId: String(resultId) };
      }

      const delivered = await deliverDirectChallenge({
        token,
        text: command.text,
        durationMinutes: command.durationMinutes,
        receiverUserId: command.recipient.id,
        receiverUsername:
          command.recipient.username ?? command.recipient.firstName ?? '',
        friends: command.friends,
        directOnly: true,
      });
      void deps.refreshUser().catch(() => undefined);
      return {
        banId: delivered.ban?.id ?? `sent:${Date.now()}`,
      };
    },
  };
}

export function createHttpCreateBanRecipientsPort(
  deps: Pick<CreateBanHttpAdapterDeps, 'getToken'>,
): CreateBanRecipientsPort {
  return {
    async loadRecipients() {
      const token = deps.getToken();
      if (!token) return [];
      const res = await api<{ friends?: unknown }>('/friends', { token });
      return coerceFriendList(res.friends);
    },
  };
}
