import type { SessionState } from '@98plus/shared';
import { api } from './api';

export async function fetchSession(token: string): Promise<SessionState> {
  return api<SessionState>('/bans/session', { token });
}
