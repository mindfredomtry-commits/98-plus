/**
 * Settings → DomainCapability projection (outside Application Policy).
 */
import type { DomainCapability } from '@/domain-capability';
import type { SettingsState } from './settings.types';

export function mapSettingsCapability(
  _state: SettingsState,
): DomainCapability {
  void _state;
  return { transition: 'ALLOWED' };
}
