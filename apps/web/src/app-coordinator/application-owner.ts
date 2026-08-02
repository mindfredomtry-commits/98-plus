/**
 * Application owner identity — Stage 8 Phase 5.
 * DomainId names a business domain, not a screen route.
 */

export type DomainId = 'CREATE_BAN' | 'SETTINGS' | 'NOTIFICATIONS';

export type ApplicationOwner =
  | { type: 'BOOT' }
  | { type: 'DOMAIN'; domain: DomainId };

export const REGISTERED_DOMAIN_IDS: readonly DomainId[] = [
  'CREATE_BAN',
  'SETTINGS',
  'NOTIFICATIONS',
];

/** Default domain after boot / ordinary launch. */
export const DEFAULT_DOMAIN_ID: DomainId = 'CREATE_BAN';

export function isRegisteredDomainId(value: string): value is DomainId {
  return (REGISTERED_DOMAIN_IDS as readonly string[]).includes(value);
}

export function domainOwner(domain: DomainId): ApplicationOwner {
  return { type: 'DOMAIN', domain };
}

export function ownersEqual(a: ApplicationOwner, b: ApplicationOwner): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'BOOT' && b.type === 'BOOT') return true;
  return a.type === 'DOMAIN' && b.type === 'DOMAIN' && a.domain === b.domain;
}
