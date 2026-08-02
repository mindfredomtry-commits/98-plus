/**
 * Coordinator → domain port contracts.
 * Built at composition boundary; Coordinator never imports domain controllers.
 */
import type { DomainCapability } from '@/domain-capability';
import type { DomainId } from './application-owner';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';

/** CreateBan domain port — typed intents stay at this boundary. */
export type CreateBanDomainPort = {
  dispatch(intent: CreateBanUiIntent): void;
  getCapability(): DomainCapability;
};

/**
 * Registered domain ports for Phase 1.
 * Only CREATE_BAN is wired; no runtime service locator.
 */
export type ApplicationDomainPorts = {
  CREATE_BAN: CreateBanDomainPort;
};

export type DomainIntentRouter = {
  /**
   * Route a domain intent to exactly one port when domain is Current Owner.
   * Does not inspect intent payload.
   */
  routeDomainIntent(domain: DomainId, intent: CreateBanUiIntent): void;
};
