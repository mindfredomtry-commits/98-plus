/**
 * CreateBan → DomainCapability projection (lives outside Application Policy).
 */
import type { DomainCapability } from '@/app-coordinator/domain-capability';
import type { CreateBanState } from './create-ban.types';

export function mapCreateBanCapability(
  state: CreateBanState,
): DomainCapability {
  if (state.submission.status === 'SUBMITTING') {
    return {
      transition: 'BLOCKED',
      reason: 'SUBMISSION_IN_PROGRESS',
    };
  }
  return { transition: 'ALLOWED' };
}
